/**
 * Upload finalization against a storage port.
 * A failed promotion deletes the staging object only.
 * The current object key is never deleted here.
 */

import { sha256Hex } from "@platform/crypto/credentials";

export type ObjectHead = {
  byteSize: number;
  contentType: string | null;
  etag: string | null;
};

export type ObjectStorage = {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  head(key: string): Promise<ObjectHead | null>;
  get(key: string): Promise<Uint8Array | null>;
  copy(fromKey: string, toKey: string): Promise<void>;
  delete(key: string): Promise<void>;
};

export type UploadIntentRecord = {
  id: string;
  state: "pending" | "uploaded" | "finalized" | "failed" | "expired";
  expiresAt: string;
  stagingKey: string;
  objectKey: string;
  expectedBytes: number;
  expectedMime: string;
  expectedChecksumSha256: string;
};

export type FinalizeResult =
  | {
      ok: true;
      intent: UploadIntentRecord;
      byteSize: number;
      checksumSha256: string;
      etag: string | null;
      mimeType: string;
    }
  | { ok: false; intent: UploadIntentRecord; error: string };

function failed(intent: UploadIntentRecord, error: string): FinalizeResult {
  return { ok: false, intent: { ...intent, state: "failed" }, error };
}

export async function finalizeVerifiedUpload(input: {
  intent: UploadIntentRecord;
  storage: ObjectStorage;
  now: Date;
  matchesMagic: (bytes: Uint8Array, mime: string) => boolean;
}): Promise<FinalizeResult> {
  const { intent, storage } = input;
  if (intent.state === "finalized") return failed(intent, "This upload is already finished.");
  if (new Date(intent.expiresAt).getTime() <= input.now.getTime()) {
    return {
      ok: false,
      intent: { ...intent, state: "expired" },
      error: "This upload has expired.",
    };
  }
  const head = await storage.head(intent.stagingKey);
  if (!head) return failed(intent, "The uploaded file could not be found.");
  if (head.byteSize !== intent.expectedBytes) {
    return failed(intent, "The uploaded file size does not match.");
  }
  const bytes = await storage.get(intent.stagingKey);
  if (!bytes) return failed(intent, "The uploaded file could not be read.");
  if (bytes.byteLength !== intent.expectedBytes) {
    return failed(intent, "The uploaded file size does not match.");
  }
  const checksum = sha256Hex(bytes);
  if (checksum !== intent.expectedChecksumSha256.toLowerCase()) {
    return failed(intent, "The uploaded file checksum does not match.");
  }
  if (!input.matchesMagic(bytes, intent.expectedMime)) {
    return failed(intent, "The uploaded file content is not an accepted type.");
  }
  if (intent.objectKey === intent.stagingKey) {
    return failed(intent, "The upload destination is not valid.");
  }
  const existing = await storage.head(intent.objectKey);
  if (existing) {
    return failed(intent, "The destination already has a file. It was left in place.");
  }
  try {
    await storage.copy(intent.stagingKey, intent.objectKey);
  } catch {
    return failed(intent, "The verified file could not be stored.");
  }
  await storage.delete(intent.stagingKey).catch(() => undefined);
  return {
    ok: true,
    intent: { ...intent, state: "finalized" },
    byteSize: bytes.byteLength,
    checksumSha256: checksum,
    etag: head.etag,
    mimeType: intent.expectedMime,
  };
}

export async function runStorageHealthCheck(input: {
  storage: ObjectStorage;
  key: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = new TextEncoder().encode("almost-heard-creators-healthcheck");
  const before = await input.storage.head(input.key);
  if (before) {
    return { ok: false, error: "The health-check object already existed." };
  }
  try {
    await input.storage.put(input.key, body, "text/plain");
    const head = await input.storage.head(input.key);
    const stored = head && head.byteSize === body.byteLength ? await input.storage.get(input.key) : null;
    const copyKey = `${input.key}.copy`;
    if (stored && stored.byteLength === body.byteLength) {
      await input.storage.copy(input.key, copyKey);
    }
    const copied = await input.storage.get(copyKey);
    await input.storage.delete(input.key);
    await input.storage.delete(copyKey);
    if (!head || !stored || !copied || copied.byteLength !== body.byteLength) {
      return { ok: false, error: "The health check could not be confirmed." };
    }
    if (await input.storage.head(input.key)) {
      return { ok: false, error: "The health check could not be removed." };
    }
    return { ok: true };
  } catch {
    await input.storage.delete(input.key).catch(() => undefined);
    await input.storage.delete(`${input.key}.copy`).catch(() => undefined);
    return { ok: false, error: "The storage connection could not be reached." };
  }
}

export async function commitAudioReplacement(input: {
  storage: ObjectStorage;
  previousKey: string | null;
  nextKey: string;
  bytes: Uint8Array;
  mime: string;
}): Promise<{ ok: true; previousDeleted: boolean } | { ok: false; error: string }> {
  if (!input.previousKey || input.previousKey === input.nextKey) {
    return { ok: false, error: "The replacement destination is not a new submission." };
  }
  const existing = await input.storage.head(input.nextKey);
  if (existing) {
    return { ok: false, error: "The destination already has a file. The current file was left in place." };
  }
  try {
    await input.storage.put(input.nextKey, input.bytes, input.mime);
    const head = await input.storage.head(input.nextKey);
    if (!head || head.byteSize !== input.bytes.byteLength) {
      return { ok: false, error: "The replacement could not be confirmed. The current file was left in place." };
    }
  } catch {
    return { ok: false, error: "The replacement could not be stored. The current file was left in place." };
  }
  try {
    await input.storage.delete(input.previousKey);
    const gone = await input.storage.head(input.previousKey);
    if (gone) return { ok: true, previousDeleted: false };
    return { ok: true, previousDeleted: true };
  } catch {
    return { ok: true, previousDeleted: false };
  }
}
