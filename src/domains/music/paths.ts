/**
 * Object keys. Cover revisions are distinct objects so a failed replacement
 * cannot overwrite the current artwork. Audio uses the immutable recording id.
 * These differ from the single cover.webp path proposed in planning 09; see DECISIONS.
 */

import { isUuid } from "@domains/music/validation";

export type CoverParent = "artists" | "releases" | "songs";

function assertId(id: string, label: string): string {
  const value = id.trim();
  if (!isUuid(value)) throw new Error(`${label} must be a stable id.`);
  return value;
}

export function coverObjectKey(
  parent: CoverParent,
  id: string,
  revision: number,
): string {
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error("Artwork revision must be a positive whole number.");
  }
  return `${parent}/${assertId(id, "Catalogue id")}/cover/${revision}.webp`;
}

export function audioObjectKey(recordingId: string): string {
  return `recordings/${assertId(recordingId, "Recording id")}/audio.mp3`;
}

export function stagingObjectKey(intentId: string): string {
  return `staging/${assertId(intentId, "Upload id")}/object`;
}

export function healthcheckObjectKey(nonce: string): string {
  return `healthcheck/${assertId(nonce, "Health check id")}.txt`;
}
