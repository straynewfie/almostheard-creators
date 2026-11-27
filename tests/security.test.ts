import assert from "node:assert/strict";
import test from "node:test";
import { encryptSecret, decryptSecret, masterKeyFromBase64, redactSecrets, sha256Hex } from "../src/platform/crypto/credentials";
import { assertPublicHttpsUrl, isValidBucketName, r2EndpointForAccount } from "../src/platform/storage/endpoint";
import { looksLikeMp3, looksLikeWebp } from "../src/platform/media/inspect";
import { createMemoryStorage } from "../src/platform/storage/memory-storage";
import { finalizeVerifiedUpload, runStorageHealthCheck } from "../src/platform/storage/upload-lifecycle";
import { audioObjectKey, coverObjectKey } from "../src/domains/music/paths";
import { safeDashboardReturnPath } from "../src/platform/auth/paths";
import { isTrustedMutationOrigin } from "../src/platform/http/origin";
import { catalogueWriteError } from "../src/platform/http/errors";
import { assertSameCreator } from "../src/platform/auth/tenant";
import { registrationAcknowledgement } from "../src/platform/auth/messages";
import { publicCatalogueDisabledBody } from "../src/domains/integration/catalogue-contract";

const recordingId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

test("credentials round-trip and redact", () => {
  const key = masterKeyFromBase64(Buffer.alloc(32, 7).toString("base64"));
  const encrypted = encryptSecret("secret-value", key, 1);
  assert.equal(decryptSecret(encrypted, key), "secret-value");
  assert.equal(JSON.stringify(encrypted).includes("secret-value"), false);
  assert.deepEqual(redactSecrets({ secretAccessKey: "abc", name: "bucket" }), {
    secretAccessKey: "[redacted]",
    name: "bucket",
  });
  assert.throws(() => decryptSecret(encrypted, masterKeyFromBase64(Buffer.alloc(32, 8).toString("base64"))));
});

test("r2 endpoint is derived and private hosts are rejected", () => {
  assert.equal(
    r2EndpointForAccount("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    "https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com",
  );
  assert.throws(() => r2EndpointForAccount("https://evil.example"));
  assert.throws(() => assertPublicHttpsUrl("http://cdn.example.com/art"));
  assert.throws(() => assertPublicHttpsUrl("https://127.0.0.1/art"));
  assert.throws(() => assertPublicHttpsUrl("https://10.1.1.1/art"));
  assert.equal(assertPublicHttpsUrl("https://media.example.com/art").hostname, "media.example.com");
  assert.equal(isValidBucketName("creator-audio"), true);
});

test("upload finalization refuses a bad checksum and keeps the current object", async () => {
  const storage = createMemoryStorage();
  const bytes = Uint8Array.from([0xff, 0xfb, 0x90, 0x00]);
  await storage.put("staging/1/object", bytes, "audio/mpeg");
  await storage.put("recordings/current/audio.mp3", Uint8Array.from([1, 2, 3]), "audio/mpeg");
  const intent = {
    id: "1",
    state: "pending" as const,
    expiresAt: "2099-01-01T00:00:00Z",
    stagingKey: "staging/1/object",
    objectKey: "recordings/current/audio.mp3",
    expectedBytes: bytes.byteLength,
    expectedMime: "audio/mpeg",
    expectedChecksumSha256: sha256Hex(bytes),
  };
  const blocked = await finalizeVerifiedUpload({
    intent,
    storage,
    now: new Date("2026-01-01T00:00:00Z"),
    matchesMagic: () => true,
  });
  assert.equal(blocked.ok, false);
  assert.deepEqual(storage.objects.get("recordings/current/audio.mp3")?.bytes, Uint8Array.from([1, 2, 3]));
});

test("health check deletes only its own key", async () => {
  const storage = createMemoryStorage();
  await storage.put("keep/me", Uint8Array.from([9]), "text/plain");
  const result = await runStorageHealthCheck({ storage, key: "healthcheck/one.txt" });
  assert.equal(result.ok, true);
  assert.equal(storage.objects.has("healthcheck/one.txt"), false);
  assert.equal(storage.objects.has("keep/me"), true);
});

test("object keys use stable ids and artwork revisions", () => {
  assert.equal(audioObjectKey(recordingId), `recordings/${recordingId}/audio.mp3`);
  assert.equal(coverObjectKey("songs", recordingId, 2), `songs/${recordingId}/cover/2.webp`);
  assert.throws(() => coverObjectKey("songs", "slug-name", 1));
});

test("auth redirects and tenant checks stay inside the creator boundary", () => {
  assert.equal(safeDashboardReturnPath("https://evil.example"), "/dashboard");
  assert.equal(safeDashboardReturnPath("//evil.example"), "/dashboard");
  assert.equal(safeDashboardReturnPath("/dashboard/music/songs"), "/dashboard/music/songs");
  assert.equal(isTrustedMutationOrigin("https://creators.almostheard.ca", ["https://creators.almostheard.ca"]), true);
  assert.equal(isTrustedMutationOrigin("https://evil.example", ["https://creators.almostheard.ca"]), false);
  assert.doesNotThrow(() => assertSameCreator(recordingId, recordingId));
  assert.throws(() => assertSameCreator(recordingId, otherId));
  assert.equal(catalogueWriteError({ code: "23505" }), "That value is already in use.");
  assert.equal(catalogueWriteError({ message: "relation acc_secrets" }), "The change could not be saved.");
  assert.match(registrationAcknowledgement(), /inactive/);
  assert.deepEqual(publicCatalogueDisabledBody(), { error: "public_catalogue_disabled" });
});

test("mp3 and webp magic bytes are required", () => {
  assert.equal(looksLikeMp3(Uint8Array.from([0x49, 0x44, 0x33])), true);
  assert.equal(looksLikeMp3(Uint8Array.from([0x00, 0x00, 0x00])), false);
  const webp = new Uint8Array(12);
  webp.set([82, 73, 70, 70], 0);
  webp.set([87, 69, 66, 80], 8);
  assert.equal(looksLikeWebp(webp), true);
});
