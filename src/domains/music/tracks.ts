export type TrackDraft = {
  id: string;
  discNumber: number;
  trackNumber: number;
  songId: string | null;
  placeholderTitle: string | null;
};

export function trackShapeError(track: Pick<
  TrackDraft,
  "discNumber" | "trackNumber" | "songId" | "placeholderTitle"
>): string | null {
  const placeholder = track.placeholderTitle?.trim() ?? "";
  const hasSong = Boolean(track.songId);
  const hasPlaceholder = placeholder.length > 0;
  if (hasSong === hasPlaceholder) {
    return "A track is either an existing song or a placeholder title.";
  }
  if (
    !Number.isInteger(track.discNumber) ||
    !Number.isInteger(track.trackNumber) ||
    track.discNumber < 1 ||
    track.trackNumber < 1
  ) {
    return "Disc and track numbers must be positive whole numbers.";
  }
  return null;
}

export function findTrackConflicts(tracks: readonly TrackDraft[]): string | null {
  const positions = new Set<string>();
  const songs = new Set<string>();
  for (const track of tracks) {
    const shape = trackShapeError(track);
    if (shape) return shape;
    const position = `${track.discNumber}:${track.trackNumber}`;
    if (positions.has(position)) {
      return "Two tracks cannot share a disc and position.";
    }
    positions.add(position);
    if (track.songId) {
      if (songs.has(track.songId)) {
        return "A song can appear only once on a release.";
      }
      songs.add(track.songId);
    }
  }
  return null;
}

export function reorderTracks(
  tracks: readonly TrackDraft[],
  orderedIds: readonly string[],
): { ok: true; tracks: TrackDraft[] } | { ok: false; error: string } {
  if (orderedIds.length !== tracks.length) {
    return { ok: false, error: "The track order is incomplete." };
  }
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const next: TrackDraft[] = [];
  const seen = new Set<string>();
  const positionByDisc = new Map<number, number>();
  for (const id of orderedIds) {
    const track = byId.get(id);
    if (!track || seen.has(id)) {
      return { ok: false, error: "The track order does not match this release." };
    }
    seen.add(id);
    const position = (positionByDisc.get(track.discNumber) ?? 0) + 1;
    positionByDisc.set(track.discNumber, position);
    next.push({ ...track, trackNumber: position });
  }
  const conflict = findTrackConflicts(next);
  if (conflict) return { ok: false, error: conflict };
  return { ok: true, tracks: next };
}

export function moveTrack(
  tracks: readonly TrackDraft[],
  trackId: string,
  direction: "up" | "down",
): { ok: true; tracks: TrackDraft[] } | { ok: false; error: string } {
  const current = tracks.find((track) => track.id === trackId);
  if (!current) return { ok: false, error: "That track is not on this release." };
  const sameDisc = tracks
    .filter((track) => track.discNumber === current.discNumber)
    .sort((a, b) => a.trackNumber - b.trackNumber);
  const index = sameDisc.findIndex((track) => track.id === trackId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= sameDisc.length) {
    return { ok: true, tracks: tracks.map((track) => ({ ...track })) };
  }
  const reorderedDisc = [...sameDisc];
  const [moved] = reorderedDisc.splice(index, 1);
  reorderedDisc.splice(swapWith, 0, moved);
  const discOrder = new Map(reorderedDisc.map((track, position) => [track.id, position]));
  const orderedIds = [...tracks]
    .sort((a, b) => {
      if (a.discNumber !== b.discNumber) return a.discNumber - b.discNumber;
      const aPos = discOrder.get(a.id);
      const bPos = discOrder.get(b.id);
      return (aPos ?? a.trackNumber) - (bPos ?? b.trackNumber);
    })
    .map((track) => track.id);
  return reorderTracks(tracks, orderedIds);
}
