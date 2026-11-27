/**
 * Recording identity. Playback and favourites must keep the recording id.
 * Replacing audio creates a new id and never rewrites the retired one.
 */

export type RecordingIdentity = {
  id: string;
  songId: string;
  version: number;
  isCurrent: boolean;
  firstPublishedAt: string | null;
  retiredAt: string | null;
};

export type ReplacementPlan =
  | {
      ok: true;
      retired: RecordingIdentity | null;
      created: RecordingIdentity;
      quota: "not_enforced_pending_owner_policy";
      resetsPublication: boolean;
    }
  | { ok: false; error: string };

export function planAudioReplacement(input: {
  current: RecordingIdentity | null;
  songId: string;
  nextId: string;
  now: string;
  confirmed: boolean;
}): ReplacementPlan {
  if (!input.confirmed) {
    return {
      ok: false,
      error: "Replacing audio requires an explicit confirmation.",
    };
  }
  if (!input.nextId || input.nextId === input.current?.id) {
    return { ok: false, error: "Replacement uses a new recording id." };
  }
  if (!input.current) {
    return {
      ok: true,
      retired: null,
      created: {
        id: input.nextId,
        songId: input.songId,
        version: 1,
        isCurrent: false,
        firstPublishedAt: null,
        retiredAt: null,
      },
      quota: "not_enforced_pending_owner_policy",
      resetsPublication: false,
    };
  }
  if (!input.current.isCurrent || input.current.retiredAt) {
    return {
      ok: false,
      error: "Only the current recording can be replaced.",
    };
  }
  const wasPublished = input.current.firstPublishedAt != null;
  return {
    ok: true,
    retired: {
      ...input.current,
      isCurrent: false,
      retiredAt: input.now,
    },
    created: {
      id: input.nextId,
      songId: input.current.songId,
      version: input.current.version + 1,
      isCurrent: false,
      firstPublishedAt: null,
      retiredAt: null,
    },
    quota: "not_enforced_pending_owner_policy",
    resetsPublication: wasPublished,
  };
}

/** Retired ids stay retired. Callers must not substitute the current recording. */
export function resolvePlaybackRecording(
  requested: RecordingIdentity,
): RecordingIdentity | null {
  if (requested.retiredAt) return null;
  return requested;
}
