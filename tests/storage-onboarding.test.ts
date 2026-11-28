import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  cloudflareAuthorizeUrl,
  cloudflareRedirectUri,
  oauthStateMatches,
  requestedCloudflareScope,
} from "../src/platform/cloudflare/oauth";
import {
  dedicatedBucketName,
  provisionDedicatedBucket,
  r2SecretFromTokenValue,
} from "../src/platform/cloudflare/provision";
import { commitAudioReplacement } from "../src/platform/storage/upload-lifecycle";
import { createMemoryStorage } from "../src/platform/storage/memory-storage";
import {
  ARTWORK_OBJECT_CACHE_CONTROL,
  artworkRequestPath,
  PRIVATE_PLAYBACK_SECONDS,
} from "../src/platform/storage/signed-url-policy";

const creatorId = "11111111-1111-4111-8111-111111111111";
const songId = "22222222-2222-4222-8222-222222222222";
const previous = `songs/${songId}/33333333-3333-4333-8333-333333333333.mp3`;
const nextKey = `songs/${songId}/44444444-4444-4444-8444-444444444444.mp3`;

test("oauth requests only the r2 write scope and binds state", () => {
  const previousScope = process.env.CREATORS_CLOUDFLARE_OAUTH_SCOPE;
  process.env.CREATORS_CLOUDFLARE_OAUTH_SCOPE = "user.tokens.write";
  assert.throws(() => requestedCloudflareScope());
  delete process.env.CREATORS_CLOUDFLARE_OAUTH_SCOPE;
  const scope = requestedCloudflareScope();
  const state = "ab".repeat(32);
  const url = new URL(cloudflareAuthorizeUrl({
    clientId: "client-id",
    redirectUri: "http://localhost:3000/auth/cloudflare/callback",
    state,
    scope,
  }));
  assert.equal(url.searchParams.get("scope"), "workers-r2.write");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.getAll("scope").length, 1);
  assert.equal(oauthStateMatches(state, state), true);
  assert.equal(oauthStateMatches(state, `${state.slice(0, -1)}c`), false);
  assert.equal(cloudflareRedirectUri("http://localhost:3000"), "http://localhost:3000/auth/cloudflare/callback");
  assert.equal(cloudflareRedirectUri("https://evil.example"), null);
  if (previousScope === undefined) delete process.env.CREATORS_CLOUDFLARE_OAUTH_SCOPE;
  else process.env.CREATORS_CLOUDFLARE_OAUTH_SCOPE = previousScope;
});

test("a dedicated bucket name is stable for a creator", () => {
  assert.equal(dedicatedBucketName(creatorId), "almost-heard-111111111111");
  assert.equal(dedicatedBucketName(creatorId), dedicatedBucketName(creatorId));
});

test("permission failure does not create an api token", async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.endsWith("/r2/buckets")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.storageClass, "Standard");
      return new Response("{}", { status: 200 });
    }
    if (url.endsWith("/cors")) {
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.rules[0].allowed.methods, ["GET", "PUT", "HEAD", "DELETE"]);
      return new Response("{}", { status: 200 });
    }
    if (url.endsWith("/permission_groups")) return new Response("{}", { status: 403 });
    return new Response("unexpected", { status: 500 });
  };
  const result = await provisionDedicatedBucket({
    fetchImpl,
    accessToken: "setup-token",
    accountId: "a".repeat(32),
    bucket: "almost-heard-111111111111",
    origin: "http://localhost:3000",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "permission");
  assert.equal(calls.some((call) => call.startsWith("POST") && call.endsWith("/user/tokens")), false);
});

test("a minted bucket key is hashed and limited to the bucket permission", async () => {
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/r2/buckets")) return new Response("{}", { status: 200 });
    if (url.endsWith("/cors")) return new Response("{}", { status: 200 });
    if (url.endsWith("/permission_groups")) {
      return Response.json({
        success: true,
        result: [{ id: "group-1", name: "Workers R2 Storage Bucket Item Write" }],
      });
    }
    const body = JSON.parse(String(init?.body));
    assert.equal(body.policies[0].permission_groups[0].name, "Workers R2 Storage Bucket Item Write");
    assert.equal(body.policies[0].permission_groups.length, 1);
    return Response.json({ success: true, result: { id: "token-id", value: "plain-token" } });
  };
  const result = await provisionDedicatedBucket({
    fetchImpl,
    accessToken: "setup-token",
    accountId: "a".repeat(32),
    bucket: "almost-heard-111111111111",
    origin: "http://localhost:3000",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.accessKeyId, "token-id");
    assert.equal(result.secretAccessKey, createHash("sha256").update("plain-token").digest("hex"));
    assert.equal(result.secretAccessKey, r2SecretFromTokenValue("plain-token"));
  }
});

test("audio replacement keeps the current file when the new file fails", async () => {
  const storage = createMemoryStorage();
  await storage.put(previous, Uint8Array.from([1, 2, 3]), "audio/mpeg");
  storage.put = async () => {
    throw new Error("The new object was not stored.");
  };
  const failed = await commitAudioReplacement({
    storage,
    previousKey: previous,
    nextKey,
    bytes: Uint8Array.from([9]),
    mime: "audio/mpeg",
  });
  assert.equal(failed.ok, false);
  assert.deepEqual(storage.objects.get(previous)?.bytes, Uint8Array.from([1, 2, 3]));
  assert.equal(storage.objects.has(nextKey), false);
});

test("audio replacement deletes the previous file only after the new file is stored", async () => {
  const storage = createMemoryStorage();
  await storage.put(previous, Uint8Array.from([1]), "audio/mpeg");
  const replaced = await commitAudioReplacement({
    storage,
    previousKey: previous,
    nextKey,
    bytes: Uint8Array.from([9, 9]),
    mime: "audio/mpeg",
  });
  assert.deepEqual(replaced, { ok: true, previousDeleted: true });
  assert.equal(storage.objects.has(previous), false);
  assert.deepEqual(storage.objects.get(nextKey)?.bytes, Uint8Array.from([9, 9]));
});

test("artwork cache busting stays on the app url", () => {
  const artworkPath = artworkRequestPath(songId, 3);
  assert.equal(artworkPath, `/api/media/${songId}?v=3`);
  assert.equal(artworkPath.includes("X-Amz-"), false);
  assert.equal(ARTWORK_OBJECT_CACHE_CONTROL, "private, no-store");
  assert.equal(PRIVATE_PLAYBACK_SECONDS, 3600);
  const route = readFileSync(path.join(process.cwd(), "src/app/api/media/[id]/route.ts"), "utf8");
  assert.match(route, /PRIVATE_PLAYBACK_SECONDS/);
  assert.match(route, /responseCacheControl: artwork \? ARTWORK_OBJECT_CACHE_CONTROL/);
  assert.doesNotMatch(route, /[?&]v=/);
});

