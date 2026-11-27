import assert from "node:assert/strict";
import test from "node:test";
import {
  canMutateCatalogue,
  canPreviewMedia,
  canReadMetadata,
  initialMembershipState,
  RETENTION_DAYS,
  retentionUntilFromCancellation,
} from "../src/domains/music/membership";
import { planAudioReplacement, resolvePlaybackRecording } from "../src/domains/music/recordings";
import { findTrackConflicts, moveTrack, trackShapeError } from "../src/domains/music/tracks";
import { artistDeleteBlockers, songDeleteBlockers } from "../src/domains/music/deletion";
import {
  publicationBlockers,
  publicationConfigFromEnv,
  songReadinessMissing,
} from "../src/domains/music/publication";

test("signup does not activate a creator", () => {
  assert.equal(initialMembershipState(), "inactive");
  assert.equal(canMutateCatalogue("inactive"), false);
  assert.equal(canMutateCatalogue("cancelled"), false);
  assert.equal(canMutateCatalogue("active"), true);
  assert.equal(canPreviewMedia("inactive"), false);
});

test("cancelled metadata remains readable for 60 days", () => {
  const cancelledAt = new Date("2026-01-01T00:00:00Z");
  const until = retentionUntilFromCancellation(cancelledAt);
  assert.equal(RETENTION_DAYS, 60);
  assert.equal(
    canReadMetadata({ state: "cancelled", retentionUntil: until }, new Date("2026-02-01T00:00:00Z")),
    true,
  );
  assert.equal(
    canReadMetadata({ state: "cancelled", retentionUntil: until }, new Date("2026-04-01T00:00:00Z")),
    false,
  );
});

test("audio replacement keeps a new recording id", () => {
  const plan = planAudioReplacement({
    current: {
      id: "rec-1",
      songId: "song-1",
      version: 1,
      isCurrent: true,
      firstPublishedAt: "2026-01-01T00:00:00Z",
      retiredAt: null,
    },
    songId: "song-1",
    nextId: "rec-2",
    now: "2026-02-01T00:00:00Z",
    confirmed: true,
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.created.id, "rec-2");
  assert.equal(plan.created.firstPublishedAt, null);
  assert.equal(plan.resetsPublication, true);
  assert.equal(plan.quota, "not_enforced_pending_owner_policy");
  assert.equal(resolvePlaybackRecording(plan.retired!), null);
  assert.equal(planAudioReplacement({
    current: plan.created,
    songId: "song-1",
    nextId: "rec-3",
    now: "2026-02-02T00:00:00Z",
    confirmed: false,
  }).ok, false);
});

test("tracks cannot duplicate a song or a position", () => {
  assert.equal(trackShapeError({
    discNumber: 1,
    trackNumber: 1,
    songId: "song",
    placeholderTitle: "Also",
  }), "A track is either an existing song or a placeholder title.");
  const conflict = findTrackConflicts([
    { id: "a", discNumber: 1, trackNumber: 1, songId: "song", placeholderTitle: null },
    { id: "b", discNumber: 1, trackNumber: 1, songId: null, placeholderTitle: "Intro" },
  ]);
  assert.match(conflict ?? "", /share a disc/);
  const moved = moveTrack([
    { id: "a", discNumber: 1, trackNumber: 1, songId: "s1", placeholderTitle: null },
    { id: "b", discNumber: 1, trackNumber: 2, songId: "s2", placeholderTitle: null },
  ], "b", "up");
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  assert.deepEqual(moved.tracks.map((track) => [track.id, track.trackNumber]), [
    ["b", 1],
    ["a", 2],
  ]);
});

test("deletion keeps referenced songs and artists", () => {
  assert.match(artistDeleteBlockers({ activeReleaseCount: 1, activeSongCount: 0 }) ?? "", /releases and songs/);
  assert.equal(songDeleteBlockers({ releaseAppearanceCount: 0 }), null);
});

test("publication stays disabled without the test switch", () => {
  assert.equal(publicationConfigFromEnv({}).allowPublication, false);
  assert.equal(publicationConfigFromEnv({ CREATORS_ALLOW_PUBLICATION: "true" }).allowPublication, false);
  const blockers = publicationBlockers({
    config: { allowPublication: false },
    readinessMissing: songReadinessMissing({
      title: "Song",
      slug: "song",
      primaryArtistId: "artist",
      durationMs: 1000,
      hasVerifiedAudio: true,
    }),
  });
  assert.match(blockers[0], /Publication is disabled/);
});
