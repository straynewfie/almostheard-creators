"use server";

import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@domains/catalogue/context";
import { loadConnection } from "@domains/media/connection";
import { isVerifiedStorageConnection } from "@domains/media/storage-status";
import { stagingObjectKey, type CoverParent } from "@domains/music/paths";
import { isUuid, TECHNICAL_AUDIO_MAX_BYTES, TECHNICAL_COVER_MAX_BYTES } from "@domains/music/validation";
import { sha256Hex } from "@platform/crypto/credentials";
import { inspectCover, inspectMp3, looksLikeMp3, MP3_MIME } from "@platform/media/inspect";
import { convertImageToWebp, readMp3DurationMs } from "@platform/media/transform";
import { hasServiceRoleKey } from "@platform/supabase/env";
import { createServerSupabaseClient } from "@platform/supabase/server";
import { createServiceRoleClient } from "@platform/supabase/service-role";
import { presignPut, r2Storage } from "@platform/storage/r2-storage";

export type UploadTicket = {
  error: string | null;
  intentId?: string;
  uploadUrl?: string;
  contentType?: string;
};

const CHECKSUM_RE = /^[a-f0-9]{64}$/;

async function activeCreator() {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready" || !ctx.canWrite || !hasServiceRoleKey()) {
    return null;
  }
  const loaded = await loadConnection(ctx.creator.id);
  if (!loaded || !isVerifiedStorageConnection(loaded.healthStatus)) return null;
  return ctx;
}

export async function createAudioUploadAction(formData: FormData): Promise<UploadTicket> {
  const ctx = await activeCreator();
  const songId = String(formData.get("song_id") ?? "");
  const bytes = Number(formData.get("byte_size") ?? 0);
  const checksum = String(formData.get("checksum") ?? "").toLowerCase();
  const confirmed = formData.get("confirm_replacement") === "1";
  if (!ctx || !isUuid(songId) || !CHECKSUM_RE.test(checksum) || bytes < 1 || bytes > TECHNICAL_AUDIO_MAX_BYTES) {
    return { error: "The audio upload could not be started." };
  }
  const supabase = await createServerSupabaseClient();
  const { data: song } = await supabase
    .from("acc_songs")
    .select("id")
    .eq("creator_id", ctx.creator.id)
    .eq("id", songId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!song) return { error: "That song is not in this catalogue." };
  const { count } = await supabase
    .from("acc_recordings")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", ctx.creator.id)
    .eq("song_id", songId)
    .eq("is_current", true);
  if ((count ?? 0) > 0 && !confirmed) {
    return { error: "Replacing audio requires the confirmation checkbox." };
  }
  const { data: recording, error: recordingError } = await supabase
    .from("acc_recordings")
    .insert({
      creator_id: ctx.creator.id,
      song_id: songId,
    })
    .select("id")
    .single();
  if (recordingError || !recording) return { error: "The recording could not be prepared." };
  return createIntent({
    creatorId: ctx.creator.id,
    kind: "audio",
    parent: "recording",
    parentId: recording.id,
    mime: MP3_MIME,
    bytes,
    checksum,
    idempotencyKey: String(formData.get("idempotency_key") ?? recording.id),
  });
}

export async function createCoverUploadAction(formData: FormData): Promise<UploadTicket> {
  const ctx = await activeCreator();
  const parent = String(formData.get("parent") ?? "");
  const parentId = String(formData.get("parent_id") ?? "");
  const bytes = Number(formData.get("byte_size") ?? 0);
  const checksum = String(formData.get("checksum") ?? "").toLowerCase();
  const mime = normalizeImageMime(String(formData.get("mime") ?? ""));
  if (
    !ctx ||
    !isCoverParent(parent) ||
    !isUuid(parentId) ||
    !mime ||
    !CHECKSUM_RE.test(checksum) ||
    bytes < 1 ||
    bytes > TECHNICAL_COVER_MAX_BYTES
  ) {
    return { error: "The artwork upload could not be started." };
  }
  const supabase = await createServerSupabaseClient();
  const table = parent === "artists" ? "acc_artists" : parent === "releases" ? "acc_releases" : "acc_songs";
  const { data: row } = await supabase
    .from(table)
    .select("id")
    .eq("creator_id", ctx.creator.id)
    .eq("id", parentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return { error: "That item is not in this catalogue." };
  return createIntent({
    creatorId: ctx.creator.id,
    kind: "cover",
    parent: parent === "artists" ? "artist" : parent === "releases" ? "release" : "song",
    parentId,
    mime,
    bytes,
    checksum,
    idempotencyKey: String(formData.get("idempotency_key") ?? crypto.randomUUID()),
  });
}

export async function finalizeUploadAction(formData: FormData): Promise<{ error: string | null }> {
  const ctx = await activeCreator();
  const intentId = String(formData.get("intent_id") ?? "");
  if (!ctx || !isUuid(intentId)) return { error: "The upload could not be finished." };
  const supabase = await createServerSupabaseClient();
  const { data: intent } = await supabase
    .from("acc_upload_intents")
    .select("id, kind, recording_id, song_id, artist_id, release_id, staging_key, object_key, expected_bytes, expected_checksum_sha256, expected_mime, state, expires_at")
    .eq("creator_id", ctx.creator.id)
    .eq("id", intentId)
    .maybeSingle();
  if (!intent || intent.state !== "pending" || new Date(intent.expires_at).getTime() <= Date.now()) {
    return { error: "This upload has expired. Try again." };
  }
  const loaded = await loadConnection(ctx.creator.id);
  if (!loaded || !isVerifiedStorageConnection(loaded.healthStatus)) {
    return { error: "Connect your Cloudflare R2 storage before uploading." };
  }
  const storage = r2Storage(loaded.connection);
  const staged = await storage.get(intent.staging_key);
  if (!staged || staged.byteLength !== intent.expected_bytes) {
    return { error: "The uploaded file could not be verified." };
  }
  if (sha256Hex(staged) !== intent.expected_checksum_sha256) {
    return { error: "The uploaded file could not be verified." };
  }
  let stored = staged;
  let mime = intent.expected_mime as string;
  let durationMs: number | null = null;
  try {
    if (intent.kind === "audio") {
      const inspected = await inspectMp3(staged, readMp3DurationMs, sha256Hex, TECHNICAL_AUDIO_MAX_BYTES);
      if (!looksLikeMp3(staged)) return { error: "The audio file must be an MP3." };
      mime = inspected.mimeType;
      durationMs = inspected.durationMs;
      stored = staged;
    } else {
      const inspected = await inspectCover(staged, convertImageToWebp, sha256Hex, TECHNICAL_COVER_MAX_BYTES);
      stored = inspected.bytes;
      mime = inspected.mimeType;
    }
  } catch {
    return { error: "The uploaded file could not be processed." };
  }
  const existing = await storage.head(intent.object_key);
  if (existing) return { error: "That file is already stored and was left unchanged." };
  try {
    await storage.put(intent.object_key, stored, mime);
    await storage.delete(intent.staging_key);
  } catch {
    return { error: "The verified file could not be stored." };
  }
  const admin = createServiceRoleClient();
  const { error } = await admin.rpc("acc_write_verified_media", {
    p_creator_id: ctx.creator.id,
    p_intent_id: intent.id,
    p_checksum: sha256Hex(stored),
    p_bytes: stored.byteLength,
    p_mime: mime,
    p_etag: null,
    p_bucket: loaded.bucket,
    p_duration_ms: durationMs,
    p_source_checksum: sha256Hex(staged),
    p_source_bytes: staged.byteLength,
  });
  if (error) return { error: "The catalogue could not record the verified file." };
  if (intent.kind === "audio" && intent.recording_id) {
    const songId = await songIdForRecording(ctx.creator.id, intent.recording_id);
    const currentForSong = songId
      ? await supabase
          .from("acc_recordings")
          .select("id", { count: "exact", head: true })
          .eq("creator_id", ctx.creator.id)
          .eq("song_id", songId)
          .eq("is_current", true)
      : { count: 0 };
    if ((currentForSong.count ?? 0) === 0 || formData.get("confirm_replacement") === "1") {
      await supabase.rpc("acc_promote_recording", {
        p_recording_id: intent.recording_id,
        p_confirmed: true,
      });
    }
  }
  revalidatePath("/dashboard");
  return { error: null };
}

async function songIdForRecording(creatorId: string, recordingId: string): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("acc_recordings")
    .select("song_id")
    .eq("creator_id", creatorId)
    .eq("id", recordingId)
    .maybeSingle();
  return (data?.song_id as string | undefined) ?? null;
}

async function createIntent(input: {
  creatorId: string;
  kind: "audio" | "cover";
  parent: "recording" | "artist" | "release" | "song";
  parentId: string;
  mime: string;
  bytes: number;
  checksum: string;
  idempotencyKey: string;
}): Promise<UploadTicket> {
  const loaded = await loadConnection(input.creatorId);
  if (!loaded || !isVerifiedStorageConnection(loaded.healthStatus)) {
    return { error: "Connect your Cloudflare R2 storage before uploading." };
  }
  const supabase = await createServerSupabaseClient();
  const created = await supabase.rpc("acc_create_upload_intent", {
    p_kind: input.kind,
    p_parent: input.parent,
    p_parent_id: input.parentId,
    p_mime: input.mime,
    p_bytes: input.bytes,
    p_checksum: input.checksum,
    p_idempotency_key: input.idempotencyKey,
  });
  const id = typeof created.data === "string" ? created.data : null;
  if (created.error || !id) return { error: "The upload could not be started." };
  try {
    const uploadUrl = await presignPut({
      connection: loaded.connection,
      key: stagingObjectKey(id),
      contentType: input.mime,
      expiresIn: 120,
    });
    return { error: null, intentId: id, uploadUrl, contentType: input.mime };
  } catch {
    return { error: "The upload could not be started." };
  }
}

function isCoverParent(value: string): value is CoverParent {
  return value === "artists" || value === "releases" || value === "songs";
}

function normalizeImageMime(value: string): string | null {
  const mime = value.toLowerCase();
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") return mime;
  return null;
}
