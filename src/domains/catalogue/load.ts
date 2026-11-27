import "server-only";

import { createServerSupabaseClient } from "@platform/supabase/server";
import { isUuid } from "@domains/music/validation";

async function db() {
  return createServerSupabaseClient();
}

export async function loadArtist(creatorId: string, id: string) {
  if (!isUuid(id)) return null;
  const supabase = await db();
  const { data } = await supabase
    .from("acc_artists")
    .select("id, slug, name, bio, artist_kind, distrokid_distributed, visibility")
    .eq("creator_id", creatorId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

export async function loadRelease(creatorId: string, id: string) {
  if (!isUuid(id)) return null;
  const supabase = await db();
  const { data } = await supabase
    .from("acc_releases")
    .select("id, slug, title, description, primary_artist_id, release_type, release_date, distrokid_distributed, visibility")
    .eq("creator_id", creatorId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

export async function loadSong(creatorId: string, id: string) {
  if (!isUuid(id)) return null;
  const supabase = await db();
  const { data } = await supabase
    .from("acc_songs")
    .select("id, slug, title, description, primary_artist_id, duration_ms, recording_kind, distrokid_distributed, visibility")
    .eq("creator_id", creatorId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

export async function loadTracks(creatorId: string, releaseId: string) {
  const supabase = await db();
  const { data } = await supabase
    .from("acc_release_tracks")
    .select("id, disc_number, track_number, song_id, placeholder_title")
    .eq("creator_id", creatorId)
    .eq("release_id", releaseId)
    .order("disc_number", { ascending: true })
    .order("track_number", { ascending: true });
  return data ?? [];
}

export async function currentCover(
  creatorId: string,
  parent: "artist_id" | "release_id" | "song_id",
  id: string,
) {
  const supabase = await db();
  const { data } = await supabase
    .from("acc_media")
    .select("id, revision")
    .eq("creator_id", creatorId)
    .eq(parent, id)
    .eq("kind", "cover")
    .eq("is_current", true)
    .eq("verification_state", "verified")
    .maybeSingle();
  return data;
}

export async function currentRecording(creatorId: string, songId: string) {
  const supabase = await db();
  const { data: recording } = await supabase
    .from("acc_recordings")
    .select("id, version")
    .eq("creator_id", creatorId)
    .eq("song_id", songId)
    .eq("is_current", true)
    .maybeSingle();
  if (!recording) return null;
  const { data: media } = await supabase
    .from("acc_media")
    .select("id")
    .eq("creator_id", creatorId)
    .eq("recording_id", recording.id)
    .eq("kind", "audio")
    .eq("is_current", true)
    .eq("verification_state", "verified")
    .maybeSingle();
  return { ...recording, mediaId: media?.id ?? null };
}
