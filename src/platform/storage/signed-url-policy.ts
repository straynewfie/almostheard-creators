/**
 * Signed URL cache review.
 *
 * Consumers address media as `/api/media/{id}?v={revision}`. They never see
 * the object key. A replacement stores a new immutable object and a new media
 * row, so the catalogue returns a new id. The app response is
 * `cache-control: no-store` and redirects to a newly signed GET. The revision
 * is not appended to the signed R2 URL: an unsigned parameter makes R2 reject
 * the signature.
 *
 * Artwork GETs are signed with `response-cache-control: private, no-store`.
 * An already issued signed URL names the previous immutable object until
 * cleanup deletes that object. It does not serve the replacement.
 *
 * Private playback URLs last 60 minutes. Renewal is another request to the
 * media route, which signs a fresh URL. Audio replacements use a new object
 * key, so an old signature no longer addresses the current file.
 */

export const PRIVATE_PLAYBACK_SECONDS = 60 * 60;
export const ARTWORK_OBJECT_CACHE_CONTROL = "private, no-store";

export function artworkRequestPath(mediaId: string, revision: number): string {
  if (!/^[0-9a-f-]{36}$/i.test(mediaId) || !Number.isInteger(revision) || revision < 1) {
    throw new Error("Artwork address is not valid.");
  }
  return `/api/media/${mediaId}?v=${revision}`;
}
