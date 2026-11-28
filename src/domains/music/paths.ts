/**
 * Object keys. Artwork and audio are immutable.
 * A replacement stores a new object and switches the current catalogue reference.
 * The upload id is the upload intent id. The submission id is the recording id.
 */

import { isUuid } from "@domains/music/validation";

export type CoverParent = "artists" | "releases" | "songs";

function assertId(id: string, label: string): string {
  const value = id.trim();
  if (!isUuid(value)) throw new Error(`${label} must be a stable id.`);
  return value;
}

export function coverObjectKey(parent: CoverParent, entityId: string, uploadId: string): string {
  return `${parent}/${assertId(entityId, "Catalogue id")}/${assertId(uploadId, "Upload id")}.webp`;
}

export function audioObjectKey(songId: string, submissionId: string): string {
  return `songs/${assertId(songId, "Song id")}/${assertId(submissionId, "Submission id")}.mp3`;
}

export function stagingObjectKey(intentId: string): string {
  return `staging/${assertId(intentId, "Upload id")}/object`;
}

export function healthcheckObjectKey(nonce: string): string {
  return `healthcheck/${assertId(nonce, "Health check id")}.txt`;
}

export function browserHealthObjectKey(nonce: string): string {
  return `health/${assertId(nonce, "Browser check id")}.txt`;
}
