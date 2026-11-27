/**
 * Magic-byte checks. Browser-declared MIME types are not trusted.
 * Audio duration is injected so tests do not need a real MP3 parser.
 */

export const MP3_MIME = "audio/mpeg";
export const WEBP_MIME = "image/webp";

export function looksLikeMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

export function looksLikeWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  return riff === "RIFF" && webp === "WEBP";
}

export function looksLikeConvertibleImage(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  const png =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return png || jpeg || looksLikeWebp(bytes);
}

export type AudioInspection = {
  mimeType: typeof MP3_MIME;
  byteSize: number;
  checksumSha256: string;
  durationMs: number;
};

export async function inspectMp3(
  bytes: Uint8Array,
  parseDurationMs: (bytes: Uint8Array) => Promise<number | null>,
  checksum: (bytes: Uint8Array) => string,
  maxBytes: number,
): Promise<AudioInspection> {
  if (bytes.byteLength < 1 || bytes.byteLength > maxBytes) {
    throw new Error("The audio file is outside the supported size.");
  }
  if (!looksLikeMp3(bytes)) {
    throw new Error("The audio file must be an MP3.");
  }
  const durationMs = await parseDurationMs(bytes);
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("The audio duration could not be read.");
  }
  return {
    mimeType: MP3_MIME,
    byteSize: bytes.byteLength,
    checksumSha256: checksum(bytes),
    durationMs: Math.round(durationMs),
  };
}

export async function inspectCover(
  bytes: Uint8Array,
  convertToWebp: (bytes: Uint8Array) => Promise<Uint8Array>,
  checksum: (bytes: Uint8Array) => string,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; checksumSha256: string; mimeType: typeof WEBP_MIME }> {
  if (bytes.byteLength < 1 || bytes.byteLength > maxBytes) {
    throw new Error("The image is outside the supported size.");
  }
  if (!looksLikeConvertibleImage(bytes)) {
    throw new Error("Artwork must be a WebP, PNG, or JPEG image.");
  }
  const webp = looksLikeWebp(bytes) ? bytes : await convertToWebp(bytes);
  if (!looksLikeWebp(webp) || webp.byteLength < 1 || webp.byteLength > maxBytes) {
    throw new Error("Artwork could not be converted to WebP.");
  }
  return {
    bytes: webp,
    checksumSha256: checksum(webp),
    mimeType: WEBP_MIME,
  };
}
