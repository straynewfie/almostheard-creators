/**
 * Publication stays fail-closed.
 * CREATORS_ALLOW_PUBLICATION=1 is a test switch and is never a production default.
 * Numeric quotas are not applied: pricing allowances are still proposals.
 */

export type PublicationConfig = {
  allowPublication: boolean;
};

export function publicationConfigFromEnv(
  env: Record<string, string | undefined>,
): PublicationConfig {
  return { allowPublication: env.CREATORS_ALLOW_PUBLICATION === "1" };
}

export function publicationBlockers(input: {
  config: PublicationConfig;
  readinessMissing: readonly string[];
}): string[] {
  const blockers: string[] = [];
  if (!input.config.allowPublication) {
    blockers.push(
      "Publication is disabled until public launch, legal readiness, and the remaining catalogue rules are approved.",
    );
  }
  blockers.push(...input.readinessMissing);
  return blockers;
}

export type SongReadinessInput = {
  title: string;
  slug: string;
  primaryArtistId: string;
  durationMs: number | null;
  hasVerifiedAudio: boolean;
};

export function songReadinessMissing(song: SongReadinessInput): string[] {
  const missing: string[] = [];
  if (!song.title.trim()) missing.push("Add a title.");
  if (!song.slug.trim()) missing.push("Add a slug.");
  if (!song.primaryArtistId) missing.push("Choose a primary artist.");
  if (!song.hasVerifiedAudio) missing.push("Upload a verified MP3.");
  if (song.durationMs == null || song.durationMs <= 0) {
    missing.push("Duration must come from the verified audio.");
  }
  return missing;
}

export type ReleaseTrackReadiness = {
  songId: string | null;
  placeholderTitle: string | null;
  songReady: boolean;
};

/**
 * Reports whether every track is a completed song.
 * Whether those songs publish atomically with the release is unresolved (gate E),
 * so this does not publish anything.
 */
export function releaseReadinessMissing(
  tracks: readonly ReleaseTrackReadiness[],
): string[] {
  if (tracks.length === 0) {
    return ["Add at least one track."];
  }
  const missing: string[] = [];
  tracks.forEach((track, index) => {
    const label = `Track ${index + 1}`;
    if (!track.songId) {
      missing.push(
        `${label} is still a placeholder${
          track.placeholderTitle ? ` (${track.placeholderTitle})` : ""
        }.`,
      );
      return;
    }
    if (!track.songReady) {
      missing.push(`${label} is not ready to publish.`);
    }
  });
  if (missing.length === 0) {
    missing.push(
      "Release publication is held: it is undecided whether ready songs publish with the release or must already be published.",
    );
  }
  return missing;
}
