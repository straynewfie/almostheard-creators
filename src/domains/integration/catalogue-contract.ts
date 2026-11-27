/**
 * Boundary notes for a future player/website catalogue.
 * This module does not serve either application's API.
 * Player catalogue types were read from almost-heard-player src/catalog/types.ts
 * at commit 6058a29. Website public song DTOs were read from Originals at 9360529.
 */

export const CREATORS_PUBLIC_CATALOGUE_STATUS = "disabled" as const;

export type PlaybackIdentity = {
  /** Future queues and favourites address this id, including after retirement. */
  recordingId: string;
  songId: string;
  creatorId: string;
};

/**
 * The player currently stores website song ids and absolute audio URLs.
 * A creator recording cannot be copied into that song id without a source field.
 */
export function playbackIdentityIsDistinctFromWebsiteSong(input: {
  websiteSongId: string;
  recordingId: string;
}): boolean {
  return input.websiteSongId !== input.recordingId;
}

export function publicCatalogueDisabledBody(): {
  error: "public_catalogue_disabled";
} {
  return { error: "public_catalogue_disabled" };
}
