import "server-only";

import { parseBuffer } from "music-metadata";
import sharp from "sharp";

export async function readMp3DurationMs(bytes: Uint8Array): Promise<number | null> {
  try {
    const metadata = await parseBuffer(Buffer.from(bytes), {
      mimeType: "audio/mpeg",
      size: bytes.byteLength,
    });
    const duration = metadata.format.duration;
    if (!duration || !Number.isFinite(duration) || duration <= 0) return null;
    return Math.round(duration * 1000);
  } catch {
    return null;
  }
}

export async function convertImageToWebp(bytes: Uint8Array): Promise<Uint8Array> {
  const output = await sharp(Buffer.from(bytes), { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 3000, height: 3000, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  return new Uint8Array(output);
}
