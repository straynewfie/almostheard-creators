"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { artistDeleteBlockers, songDeleteBlockers } from "@domains/music/deletion";
import {
  publicationBlockers,
  publicationConfigFromEnv,
  releaseReadinessMissing,
  songReadinessMissing,
} from "@domains/music/publication";
import { moveTrack, type TrackDraft } from "@domains/music/tracks";
import {
  allocateUniqueSlug,
  cleanText,
  isUuid,
  isValidSlug,
  normalizeSlug,
  artistKindFromCheckbox,
  parseBooleanFlag,
  parseIsoDate,
  parseRecordingKind,
  parseReleaseType,
  requireText,
  TITLE_MAX,
  TEXT_MAX,
} from "@domains/music/validation";
import { getDashboardContext } from "@domains/catalogue/context";
import { emptyFormState, invalid, type FormState } from "@domains/catalogue/form-state";
import { catalogueWriteError } from "@platform/http/errors";
import { createServerSupabaseClient } from "@platform/supabase/server";
import { createServiceRoleClient } from "@platform/supabase/service-role";
import { hasServiceRoleKey } from "@platform/supabase/env";

async function writable() {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready" || !ctx.canWrite) {
    return { ok: false as const, state: invalid({}, "This account cannot edit the catalogue.") };
  }
  return { ok: true as const, ctx, supabase: await createServerSupabaseClient() };
}

function takenSlugs(
  rows: { slug: string }[] | null,
  except?: string,
): Set<string> {
  return new Set(
    (rows ?? [])
      .map((row) => row.slug)
      .filter((slug) => slug !== except),
  );
}

export async function saveArtistAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await writable();
  if (!access.ok) return access.state;
  const name = requireText(formData.get("name"), TITLE_MAX, "Name");
  const bio = cleanText(formData.get("bio"), TEXT_MAX);
  const kind = artistKindFromCheckbox(formData.get("artist_kind"));
  const fieldErrors: Record<string, string> = {};
  if (!name.ok) fieldErrors.name = name.error;
  if (!bio.ok) fieldErrors.bio = bio.error;
  if (Object.keys(fieldErrors).length || !name.ok || !bio.ok) {
    return invalid(fieldErrors);
  }
  const id = String(formData.get("id") ?? "");
  const editing = isUuid(id);
  const { data: existing } = await access.supabase
    .from("acc_artists")
    .select("slug")
    .eq("creator_id", access.ctx.creator.id)
    .is("deleted_at", null);
  let currentSlug = "";
  if (editing) {
    const { data: row } = await access.supabase
      .from("acc_artists")
      .select("slug")
      .eq("creator_id", access.ctx.creator.id)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!row) return invalid({}, "That artist is not in this catalogue.");
    currentSlug = row.slug;
  }
  const slugTouched = formData.get("slug_touched") === "1";
  const slug = slugTouched
    ? normalizeSlug(String(formData.get("slug") ?? ""))
    : editing
      ? currentSlug
      : allocateUniqueSlug(name.value, takenSlugs(existing));
  if (!isValidSlug(slug)) return invalid({ slug: "Use a lowercase slug." });
  const payload = {
    creator_id: access.ctx.creator.id,
    name: name.value,
    slug,
    bio: bio.value,
    artist_kind: kind,
    distrokid_distributed: parseBooleanFlag(formData.get("distrokid_distributed")),
  };
  const result = editing
    ? await access.supabase.from("acc_artists").update(payload).eq("creator_id", access.ctx.creator.id).eq("id", id)
    : await access.supabase.from("acc_artists").insert(payload).select("id").single();
  if (result.error) return invalid({}, catalogueWriteError(result.error));
  revalidatePath("/dashboard/music/artists");
  const nextId = editing ? id : result.data?.id;
  if (nextId) redirect(`/dashboard/music/artists/${nextId}`);
  return emptyFormState;
}

function deletionConfirmed(formData: FormData): boolean {
  return formData.get("confirm") === "on";
}

export async function deleteArtistAction(formData: FormData): Promise<void> {
  const access = await writable();
  if (!access.ok) redirect("/dashboard/music/artists");
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) redirect("/dashboard/music/artists");
  if (!deletionConfirmed(formData)) redirect(`/dashboard/music/artists/${id}?error=confirm`);
  const [songs, releases] = await Promise.all([
    access.supabase.from("acc_songs").select("id", { count: "exact", head: true }).eq("creator_id", access.ctx.creator.id).eq("primary_artist_id", id).is("deleted_at", null),
    access.supabase.from("acc_releases").select("id", { count: "exact", head: true }).eq("creator_id", access.ctx.creator.id).eq("primary_artist_id", id).is("deleted_at", null),
  ]);
  const blocker = artistDeleteBlockers({
    activeSongCount: songs.count ?? 0,
    activeReleaseCount: releases.count ?? 0,
  });
  if (blocker) redirect(`/dashboard/music/artists/${id}?error=linked`);
  const { error } = await access.supabase.rpc("acc_soft_delete_artist", { p_artist_id: id });
  if (error) redirect(`/dashboard/music/artists/${id}?error=delete`);
  revalidatePath("/dashboard/music/artists");
  redirect("/dashboard/music/artists");
}

export async function saveReleaseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await writable();
  if (!access.ok) return access.state;
  const title = requireText(formData.get("title"), TITLE_MAX, "Title");
  const description = cleanText(formData.get("description"), TEXT_MAX);
  const releaseType = parseReleaseType(formData.get("release_type"));
  const releaseDate = parseIsoDate(formData.get("release_date"));
  const primaryArtistId = String(formData.get("primary_artist_id") ?? "");
  const fieldErrors: Record<string, string> = {};
  if (!title.ok) fieldErrors.title = title.error;
  if (!description.ok) fieldErrors.description = description.error;
  if (!releaseType) fieldErrors.release_type = "Choose a release type.";
  if (!releaseDate.ok) fieldErrors.release_date = releaseDate.error;
  if (!isUuid(primaryArtistId)) fieldErrors.primary_artist_id = "Choose an artist.";
  if (Object.keys(fieldErrors).length || !title.ok || !description.ok || !releaseType || !releaseDate.ok) {
    return invalid(fieldErrors);
  }
  const id = String(formData.get("id") ?? "");
  const editing = isUuid(id);
  const { data: slugs } = await access.supabase
    .from("acc_releases")
    .select("slug")
    .eq("creator_id", access.ctx.creator.id)
    .is("deleted_at", null);
  let currentSlug = "";
  if (editing) {
    const { data: row } = await access.supabase
      .from("acc_releases")
      .select("slug")
      .eq("creator_id", access.ctx.creator.id)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!row) return invalid({}, "That release is not in this catalogue.");
    currentSlug = row.slug;
  }
  const slug = formData.get("slug_touched") === "1"
    ? normalizeSlug(String(formData.get("slug") ?? ""))
    : editing
      ? currentSlug
      : allocateUniqueSlug(title.value, takenSlugs(slugs));
  if (!isValidSlug(slug)) return invalid({ slug: "Use a lowercase slug." });
  const payload = {
    creator_id: access.ctx.creator.id,
    title: title.value,
    slug,
    description: description.value,
    primary_artist_id: primaryArtistId,
    release_type: releaseType,
    release_date: releaseDate.value,
    distrokid_distributed: parseBooleanFlag(formData.get("distrokid_distributed")),
  };
  const result = editing
    ? await access.supabase.from("acc_releases").update(payload).eq("creator_id", access.ctx.creator.id).eq("id", id)
    : await access.supabase.from("acc_releases").insert(payload).select("id").single();
  if (result.error) return invalid({}, catalogueWriteError(result.error));
  revalidatePath("/dashboard/music/releases");
  redirect(`/dashboard/music/releases/${editing ? id : result.data?.id}`);
}

export async function saveSongAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await writable();
  if (!access.ok) return access.state;
  const title = requireText(formData.get("title"), TITLE_MAX, "Title");
  const description = cleanText(formData.get("description"), TEXT_MAX);
  const primaryArtistId = String(formData.get("primary_artist_id") ?? "");
  const recordingKindRaw = String(formData.get("recording_kind") ?? "");
  const recordingKind = recordingKindRaw ? parseRecordingKind(recordingKindRaw) : null;
  const fieldErrors: Record<string, string> = {};
  if (!title.ok) fieldErrors.title = title.error;
  if (!description.ok) fieldErrors.description = description.error;
  if (!isUuid(primaryArtistId)) fieldErrors.primary_artist_id = "Choose an artist.";
  if (recordingKindRaw && !recordingKind) fieldErrors.recording_kind = "Choose a recording kind.";
  if (Object.keys(fieldErrors).length || !title.ok || !description.ok) {
    return invalid(fieldErrors);
  }
  const id = String(formData.get("id") ?? "");
  const editing = isUuid(id);
  const { data: slugs } = await access.supabase
    .from("acc_songs")
    .select("slug")
    .eq("creator_id", access.ctx.creator.id)
    .is("deleted_at", null);
  let currentSlug = "";
  if (editing) {
    const { data: row } = await access.supabase
      .from("acc_songs")
      .select("slug")
      .eq("creator_id", access.ctx.creator.id)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!row) return invalid({}, "That song is not in this catalogue.");
    currentSlug = row.slug;
  }
  const slug = formData.get("slug_touched") === "1"
    ? normalizeSlug(String(formData.get("slug") ?? ""))
    : editing
      ? currentSlug
      : allocateUniqueSlug(title.value, takenSlugs(slugs));
  if (!isValidSlug(slug)) return invalid({ slug: "Use a lowercase slug." });
  const payload = {
    creator_id: access.ctx.creator.id,
    title: title.value,
    slug,
    description: description.value,
    primary_artist_id: primaryArtistId,
    recording_kind: recordingKind,
    distrokid_distributed: parseBooleanFlag(formData.get("distrokid_distributed")),
  };
  const result = editing
    ? await access.supabase.from("acc_songs").update(payload).eq("creator_id", access.ctx.creator.id).eq("id", id)
    : await access.supabase.from("acc_songs").insert(payload).select("id").single();
  if (result.error) return invalid({}, catalogueWriteError(result.error));
  const songId = editing ? id : result.data?.id;
  const releaseId = String(formData.get("release_id") ?? "");
  const trackId = String(formData.get("track_id") ?? "");
  if (songId && isUuid(releaseId) && isUuid(trackId)) {
    const attached = await access.supabase.rpc("acc_attach_release_song", {
      p_track_id: trackId,
      p_song_id: songId,
    });
    if (!attached.error) {
      revalidatePath(`/dashboard/music/releases/${releaseId}`);
      redirect(`/dashboard/music/releases/${releaseId}`);
    }
  }
  revalidatePath("/dashboard/music/songs");
  if (songId) redirect(`/dashboard/music/songs/${songId}`);
  return emptyFormState;
}

export async function addPlaceholderAction(formData: FormData): Promise<void> {
  const access = await writable();
  const releaseId = String(formData.get("release_id") ?? "");
  if (!access.ok || !isUuid(releaseId)) redirect("/dashboard/music/releases");
  const title = requireText(formData.get("placeholder_title"), TITLE_MAX, "Title");
  if (!title.ok) redirect(`/dashboard/music/releases/${releaseId}?error=placeholder`);
  const { error } = await access.supabase.rpc("acc_add_release_placeholder", {
    p_release_id: releaseId,
    p_title: title.value,
    p_disc: 1,
  });
  if (error) redirect(`/dashboard/music/releases/${releaseId}?error=placeholder`);
  revalidatePath(`/dashboard/music/releases/${releaseId}`);
  redirect(`/dashboard/music/releases/${releaseId}`);
}

export async function moveTrackAction(formData: FormData): Promise<void> {
  const access = await writable();
  const releaseId = String(formData.get("release_id") ?? "");
  const trackId = String(formData.get("track_id") ?? "");
  const direction = formData.get("direction") === "up" ? "up" : "down";
  if (!access.ok || !isUuid(releaseId) || !isUuid(trackId)) redirect("/dashboard/music/releases");
  const { data } = await access.supabase
    .from("acc_release_tracks")
    .select("id, disc_number, track_number, song_id, placeholder_title")
    .eq("creator_id", access.ctx.creator.id)
    .eq("release_id", releaseId);
  const tracks = (data ?? []).map((row) => ({
    id: row.id as string,
    discNumber: row.disc_number as number,
    trackNumber: row.track_number as number,
    songId: (row.song_id as string | null) ?? null,
    placeholderTitle: (row.placeholder_title as string | null) ?? null,
  })) satisfies TrackDraft[];
  const next = moveTrack(tracks, trackId, direction);
  if (!next.ok) redirect(`/dashboard/music/releases/${releaseId}?error=order`);
  const { error } = await access.supabase.rpc("acc_reorder_release_tracks", {
    p_release_id: releaseId,
    p_ordered_ids: next.tracks
      .sort((a, b) => a.discNumber - b.discNumber || a.trackNumber - b.trackNumber)
      .map((track) => track.id),
  });
  if (error) redirect(`/dashboard/music/releases/${releaseId}?error=order`);
  revalidatePath(`/dashboard/music/releases/${releaseId}`);
  redirect(`/dashboard/music/releases/${releaseId}`);
}

export async function removeTrackAction(formData: FormData): Promise<void> {
  const access = await writable();
  const releaseId = String(formData.get("release_id") ?? "");
  const trackId = String(formData.get("track_id") ?? "");
  if (!access.ok || !isUuid(releaseId) || !isUuid(trackId)) redirect("/dashboard/music/releases");
  await access.supabase.rpc("acc_remove_release_track", { p_track_id: trackId });
  revalidatePath(`/dashboard/music/releases/${releaseId}`);
  redirect(`/dashboard/music/releases/${releaseId}`);
}

export async function attachExistingSongAction(formData: FormData): Promise<void> {
  const access = await writable();
  const releaseId = String(formData.get("release_id") ?? "");
  const songId = String(formData.get("song_id") ?? "");
  if (!access.ok || !isUuid(releaseId) || !isUuid(songId)) redirect("/dashboard/music/releases");
  const created = await access.supabase.rpc("acc_add_release_placeholder", {
    p_release_id: releaseId,
    p_title: "Attaching",
    p_disc: 1,
  });
  if (created.error || !created.data) {
    redirect(`/dashboard/music/releases/${releaseId}?error=attach`);
  }
  const attached = await access.supabase.rpc("acc_attach_release_song", {
    p_track_id: created.data,
    p_song_id: songId,
  });
  if (attached.error) {
    await access.supabase.rpc("acc_remove_release_track", { p_track_id: created.data });
    redirect(`/dashboard/music/releases/${releaseId}?error=attach`);
  }
  revalidatePath(`/dashboard/music/releases/${releaseId}`);
  redirect(`/dashboard/music/releases/${releaseId}`);
}

export async function deleteReleaseAction(formData: FormData): Promise<void> {
  const access = await writable();
  const id = String(formData.get("id") ?? "");
  if (!access.ok || !isUuid(id)) redirect("/dashboard/music/releases");
  if (!deletionConfirmed(formData)) redirect(`/dashboard/music/releases/${id}?error=confirm`);
  const { error } = await access.supabase.rpc("acc_soft_delete_release", { p_release_id: id });
  if (error) redirect(`/dashboard/music/releases/${id}?error=delete`);
  revalidatePath("/dashboard/music/releases");
  redirect("/dashboard/music/releases");
}

export async function deleteSongAction(formData: FormData): Promise<void> {
  const access = await writable();
  const id = String(formData.get("id") ?? "");
  if (!access.ok || !isUuid(id)) redirect("/dashboard/music/songs");
  if (!deletionConfirmed(formData)) redirect(`/dashboard/music/songs/${id}?error=confirm`);
  const { count } = await access.supabase
    .from("acc_release_tracks")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", access.ctx.creator.id)
    .eq("song_id", id);
  const blocker = songDeleteBlockers({ releaseAppearanceCount: count ?? 0 });
  if (blocker) redirect(`/dashboard/music/songs/${id}?error=linked`);
  const { error } = await access.supabase.rpc("acc_soft_delete_song", { p_song_id: id });
  if (error) redirect(`/dashboard/music/songs/${id}?error=delete`);
  revalidatePath("/dashboard/music/songs");
  redirect("/dashboard/music/songs");
}

export async function publishSongAction(formData: FormData): Promise<void> {
  const access = await writable();
  const id = String(formData.get("id") ?? "");
  if (!access.ok || !isUuid(id)) redirect("/dashboard/music/songs");
  const config = publicationConfigFromEnv(process.env);
  const { data: song } = await access.supabase
    .from("acc_songs")
    .select("id, title, slug, primary_artist_id, duration_ms")
    .eq("creator_id", access.ctx.creator.id)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const { count } = await access.supabase
    .from("acc_recordings")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", access.ctx.creator.id)
    .eq("song_id", id)
    .eq("is_current", true);
  const missing = songReadinessMissing({
    title: song?.title ?? "",
    slug: song?.slug ?? "",
    primaryArtistId: song?.primary_artist_id ?? "",
    durationMs: song?.duration_ms ?? null,
    hasVerifiedAudio: (count ?? 0) > 0,
  });
  const blockers = publicationBlockers({ config, readinessMissing: missing });
  if (blockers.length || !hasServiceRoleKey()) {
    redirect(`/dashboard/music/songs/${id}?error=publish`);
  }
  const admin = createServiceRoleClient();
  const { error } = await admin.rpc("acc_publish_song", {
    p_creator_id: access.ctx.creator.id,
    p_song_id: id,
    p_allow: true,
  });
  if (error) redirect(`/dashboard/music/songs/${id}?error=publish`);
  revalidatePath(`/dashboard/music/songs/${id}`);
  redirect(`/dashboard/music/songs/${id}`);
}

export async function releasePublicationBlockers(input: {
  tracks: { songId: string | null; placeholderTitle: string | null; songReady: boolean }[];
}): Promise<string[]> {
  return publicationBlockers({
    config: publicationConfigFromEnv(process.env),
    readinessMissing: releaseReadinessMissing(input.tracks),
  });
}

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const access = await writable();
  if (!access.ok) return access.state;
  const name = requireText(formData.get("display_name"), 120, "Display name");
  const handleRaw = String(formData.get("handle") ?? "").trim();
  const handle = handleRaw ? normalizeSlug(handleRaw, 40) : null;
  if (!name.ok) return invalid({ display_name: name.error });
  if (handle && !isValidSlug(handle, 40)) {
    return invalid({ handle: "Use a lowercase handle, or leave it empty." });
  }
  const { error } = await access.supabase
    .from("acc_creators")
    .update({ display_name: name.value, handle })
    .eq("id", access.ctx.creator.id);
  if (error) return invalid({}, catalogueWriteError(error));
  revalidatePath("/dashboard/profile");
  return { error: null, fieldErrors: {} };
}
