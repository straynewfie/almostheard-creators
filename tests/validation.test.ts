import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateUniqueSlug,
  isValidSlug,
  normalizeSlug,
  artistKindFromCheckbox,
  parseIsoDate,
  parseReleaseType,
  requireText,
} from "../src/domains/music/validation";
import { isVerifiedStorageConnection } from "../src/domains/media/storage-status";

test("slug rules match the Originals shape", () => {
  assert.equal(normalizeSlug("  My Artist!! "), "my-artist");
  assert.equal(isValidSlug("my-artist"), true);
  assert.equal(isValidSlug("-nope"), false);
  assert.equal(allocateUniqueSlug("Song", new Set(["song"])), "song-2");
});

test("hatty is not a creator release type", () => {
  assert.equal(parseReleaseType("hatty"), null);
  assert.equal(parseReleaseType("album"), "album");
});

test("band checkbox keeps the existing artist kinds", () => {
  assert.equal(artistKindFromCheckbox("band"), "band");
  assert.equal(artistKindFromCheckbox(null), "individual");
  assert.equal(artistKindFromCheckbox("orchestra"), "individual");
});

test("uploads require a healthy storage connection", () => {
  assert.equal(isVerifiedStorageConnection("healthy"), true);
  assert.equal(isVerifiedStorageConnection("unknown"), false);
  assert.equal(isVerifiedStorageConnection("unhealthy"), false);
  assert.equal(isVerifiedStorageConnection(null), false);
});

test("text rejects html and empty required values", () => {
  assert.equal(requireText("  ", 20, "Name").ok, false);
  assert.equal(requireText("<b>no</b>", 20, "Name").ok, false);
  assert.deepEqual(parseIsoDate("2026-02-31"), {
    ok: false,
    error: "That date is not valid.",
  });
});
