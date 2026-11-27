/**
 * Input limits and slug rules.
 * Slug shape and the 120-character cap are reused from Originals
 * src/domains/music/validation.ts (commit 9360529).
 * Other bounds are technical review limits, not membership quotas.
 */

import {
  ARTIST_KINDS,
  CATALOGUE_VISIBILITIES,
  CREATOR_RELEASE_TYPES,
  RECORDING_KINDS,
  type ArtistKind,
  type CatalogueVisibility,
  type CreatorReleaseType,
  type RecordingKind,
} from "@domains/music/types";

export const SLUG_MAX = 120;
export const HANDLE_MAX = 40;
export const TITLE_MAX = 200;
export const TEXT_MAX = 4000;
export const TECHNICAL_AUDIO_MAX_BYTES = 50 * 1024 * 1024;
export const TECHNICAL_COVER_MAX_BYTES = 15 * 1024 * 1024;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeSlug(raw: string, max = SLUG_MAX): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

export function isValidSlug(slug: string, max = SLUG_MAX): boolean {
  return slug.length >= 1 && slug.length <= max && SLUG_RE.test(slug);
}

export function allocateUniqueSlug(
  desired: string,
  taken: ReadonlySet<string>,
  options?: { exclude?: string | null; max?: number },
): string {
  const max = options?.max ?? SLUG_MAX;
  const exclude = options?.exclude?.trim().toLowerCase() || null;
  const base = normalizeSlug(desired, max) || "item";
  const isFree = (candidate: string) =>
    candidate === exclude || !taken.has(candidate);
  if (isValidSlug(base, max) && isFree(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, max - suffix.length)}${suffix}`;
    if (isValidSlug(candidate, max) && isFree(candidate)) return candidate;
  }
  throw new Error("Could not allocate a unique slug.");
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function parseVisibility(value: unknown): CatalogueVisibility | null {
  if (
    typeof value === "string" &&
    (CATALOGUE_VISIBILITIES as readonly string[]).includes(value)
  ) {
    return value as CatalogueVisibility;
  }
  return null;
}

export function parseReleaseType(value: unknown): CreatorReleaseType | null {
  if (
    typeof value === "string" &&
    (CREATOR_RELEASE_TYPES as readonly string[]).includes(value)
  ) {
    return value as CreatorReleaseType;
  }
  return null;
}

export function parseArtistKind(value: unknown): ArtistKind | null {
  if (
    typeof value === "string" &&
    (ARTIST_KINDS as readonly string[]).includes(value)
  ) {
    return value as ArtistKind;
  }
  return null;
}

export function parseRecordingKind(value: unknown): RecordingKind | null {
  if (value == null || value === "") return null;
  if (
    typeof value === "string" &&
    (RECORDING_KINDS as readonly string[]).includes(value)
  ) {
    return value as RecordingKind;
  }
  return null;
}

export function cleanText(
  value: unknown,
  max: number,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  const text = String(value).replace(/\r\n/g, "\n").trim();
  if (!text) return { ok: true, value: null };
  if (text.length > max) {
    return { ok: false, error: `Must be ${max} characters or fewer.` };
  }
  if (/[<>]/.test(text)) {
    return { ok: false, error: "HTML is not allowed." };
  }
  return { ok: true, value: text };
}

export function requireText(
  value: unknown,
  max: number,
  label: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const cleaned = cleanText(value, max);
  if (!cleaned.ok) return cleaned;
  if (!cleaned.value) return { ok: false, error: `${label} is required.` };
  return { ok: true, value: cleaned.value };
}

export function parseIsoDate(
  value: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value == null || String(value).trim() === "") {
    return { ok: true, value: null };
  }
  const text = String(value).trim();
  if (!DATE_RE.test(text)) {
    return { ok: false, error: "Use a YYYY-MM-DD date." };
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    return { ok: false, error: "That date is not valid." };
  }
  return { ok: true, value: text };
}

export function parseBooleanFlag(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1";
}
