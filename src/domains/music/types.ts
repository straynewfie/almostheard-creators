/**
 * Creator catalogue types.
 * Adapted from Almost Heard Originals music types at commit 9360529.
 * Canon fields, admin roles, and the global media library are intentionally absent.
 * Provenance: src/domains/music/types.ts and src/domains/music/promotion.ts.
 */

export const MEMBERSHIP_STATES = ["active", "inactive", "cancelled"] as const;
export type MembershipState = (typeof MEMBERSHIP_STATES)[number];

export const CATALOGUE_VISIBILITIES = ["draft", "public", "withdrawn"] as const;
export type CatalogueVisibility = (typeof CATALOGUE_VISIBILITIES)[number];

/**
 * Established release types used by Originals and the player, excluding `hatty`.
 * Hatty remains an Originals value until the owner confirms guest release options
 * (phase 1 gate E). Do not add further types here.
 */
export const CREATOR_RELEASE_TYPES = [
  "album",
  "ep",
  "single",
  "compilation",
] as const;
export type CreatorReleaseType = (typeof CREATOR_RELEASE_TYPES)[number];

export const CREATOR_RELEASE_TYPE_LABELS: Record<CreatorReleaseType, string> = {
  album: "Album",
  ep: "EP",
  single: "Single",
  compilation: "Compilation",
};

export const ARTIST_KINDS = ["individual", "band"] as const;
export type ArtistKind = (typeof ARTIST_KINDS)[number];

/** Reused from Originals. Narrowing this list is an owner decision. */
export const RECORDING_KINDS = [
  "standard",
  "demo",
  "alternate",
  "live",
  "lost",
  "guest",
] as const;
export type RecordingKind = (typeof RECORDING_KINDS)[number];

export const RECORDING_KIND_LABELS: Record<RecordingKind, string> = {
  standard: "Standard",
  demo: "Demo",
  alternate: "Alternate version",
  live: "Live recording",
  lost: "Lost recording",
  guest: "Guest feature",
};

export const MEDIA_KINDS = ["cover", "audio"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const VISIBILITY_LABELS: Record<CatalogueVisibility, string> = {
  draft: "Draft",
  public: "Published",
  withdrawn: "Withdrawn",
};

export function visibilityLabel(visibility: CatalogueVisibility): string {
  return VISIBILITY_LABELS[visibility];
}
