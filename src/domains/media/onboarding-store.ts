import "server-only";

import { encryptSecret, decryptSecret, masterKeyFromBase64 } from "@platform/crypto/credentials";
import { credentialKeyVersion, credentialMasterKey } from "@platform/supabase/env";
import { createServiceRoleClient } from "@platform/supabase/service-role";

function bytea(value: Buffer): string {
  return `\\x${value.toString("hex")}`;
}

function decodeBytea(value: string | Buffer): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
  return Buffer.from(value, "base64");
}

type StoredSecret =
  | { purpose: "oauth"; accessToken: string; expiresAt: string }
  | { purpose: "r2"; accessKeyId: string; secretAccessKey: string };

function master() {
  const value = credentialMasterKey();
  if (!value) return null;
  return masterKeyFromBase64(value);
}

async function writeSecret(creatorId: string, payload: StoredSecret): Promise<boolean> {
  const key = master();
  if (!key) return false;
  const encrypted = encryptSecret(JSON.stringify(payload), key, credentialKeyVersion());
  if (encrypted.ciphertext.byteLength > 4096) return false;
  const admin = createServiceRoleClient();
  const { error } = await admin.from("acc_storage_secrets").upsert({
    creator_id: creatorId,
    ciphertext: bytea(encrypted.ciphertext),
    nonce: bytea(encrypted.nonce),
    auth_tag: bytea(encrypted.tag),
    key_version: encrypted.keyVersion,
  });
  return !error;
}

export async function readStoredSecret(creatorId: string): Promise<StoredSecret | null> {
  const key = master();
  if (!key) return null;
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("acc_storage_secrets")
    .select("ciphertext, nonce, auth_tag, key_version")
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (!data) return null;
  try {
    const plaintext = decryptSecret(
      {
        ciphertext: decodeBytea(data.ciphertext),
        nonce: decodeBytea(data.nonce),
        tag: decodeBytea(data.auth_tag),
        keyVersion: data.key_version,
      },
      key,
    );
    const parsed = JSON.parse(plaintext) as StoredSecret;
    if (parsed.purpose === "oauth" && parsed.accessToken && parsed.expiresAt) return parsed;
    if (parsed.purpose === "r2" && parsed.accessKeyId && parsed.secretAccessKey) return parsed;
    if ("accessKeyId" in parsed && parsed.accessKeyId && "secretAccessKey" in parsed && parsed.secretAccessKey) {
      return { purpose: "r2", accessKeyId: parsed.accessKeyId, secretAccessKey: parsed.secretAccessKey };
    }
    return null;
  } catch {
    return null;
  }
}

export async function storeOauthGrant(creatorId: string, accessToken: string): Promise<boolean> {
  return writeSecret(creatorId, {
    purpose: "oauth",
    accessToken,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
}

export async function storeBucketKey(
  creatorId: string,
  accessKeyId: string,
  secretAccessKey: string,
): Promise<boolean> {
  return writeSecret(creatorId, { purpose: "r2", accessKeyId, secretAccessKey });
}

export async function clearStoredSecret(creatorId: string): Promise<void> {
  const admin = createServiceRoleClient();
  await admin.from("acc_storage_secrets").delete().eq("creator_id", creatorId);
}

export async function saveConnectionProgress(input: {
  creatorId: string;
  accountId: string;
  bucket: string;
  step: "bucket" | "cors" | "credential" | "verify" | "ready" | "paused";
  health: "unknown" | "healthy" | "unhealthy";
  lastError: string | null;
  browserVerified?: boolean;
}): Promise<boolean> {
  const admin = createServiceRoleClient();
  const row: Record<string, string | null> = {
    creator_id: input.creatorId,
    account_identifier: input.accountId,
    bucket_name: input.bucket,
    health_status: input.health,
    checked_at: input.health === "unknown" ? null : new Date().toISOString(),
    onboarding_step: input.step,
    last_error: input.lastError,
  };
  if (input.browserVerified) row.browser_verified_at = new Date().toISOString();
  const { error } = await admin.from("acc_storage_connections").upsert(row);
  return !error;
}
