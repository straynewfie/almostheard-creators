import "server-only";

import { createServerSupabaseClient } from "@platform/supabase/server";

export type ArtistListRow = {
  id: string;
  slug: string;
  name: string;
  artist_kind: string;
  visibility: string;
  updated_at: string;
};

export type ReleaseListRow = {
  id: string;
  slug: string;
  title: string;
  release_type: string;
  visibility: string;
  updated_at: string;
  primary_artist_id: string;
};

export type SongListRow = {
  id: string;
  slug: string;
  title: string;
  visibility: string;
  updated_at: string;
  primary_artist_id: string;
  duration_ms: number | null;
};

async function client() {
  return createServerSupabaseClient();
}

export async function listArtists(creatorId: string): Promise<ArtistListRow[]> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("acc_artists")
    .select("id, slug, name, artist_kind, visibility, updated_at")
    .eq("creator_id", creatorId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw new Error("load_failed");
  return (data ?? []) as ArtistListRow[];
}

export async function listReleases(creatorId: string): Promise<ReleaseListRow[]> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("acc_releases")
    .select("id, slug, title, release_type, visibility, updated_at, primary_artist_id")
    .eq("creator_id", creatorId)
    .is("deleted_at", null)
    .order("title", { ascending: true });
  if (error) throw new Error("load_failed");
  return (data ?? []) as ReleaseListRow[];
}

export async function listSongs(creatorId: string): Promise<SongListRow[]> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("acc_songs")
    .select("id, slug, title, visibility, updated_at, primary_artist_id, duration_ms")
    .eq("creator_id", creatorId)
    .is("deleted_at", null)
    .order("title", { ascending: true });
  if (error) throw new Error("load_failed");
  return (data ?? []) as SongListRow[];
}

export async function catalogueCounts(creatorId: string): Promise<{
  artists: number;
  releases: number;
  songs: number;
  drafts: number;
}> {
  const [artists, releases, songs] = await Promise.all([
    listArtists(creatorId),
    listReleases(creatorId),
    listSongs(creatorId),
  ]);
  const drafts = [...artists, ...releases, ...songs].filter(
    (row) => row.visibility === "draft",
  ).length;
  return {
    artists: artists.length,
    releases: releases.length,
    songs: songs.length,
    drafts,
  };
}
