import "server-only";

import { getDashboardContext } from "@domains/catalogue/context";
import { decryptSecret, masterKeyFromBase64 } from "@platform/crypto/credentials";
import { assertSameCreator } from "@platform/auth/tenant";
import { isVerifiedStorageConnection } from "@domains/media/storage-status";
import { credentialMasterKey } from "@platform/supabase/env";
import { createServerSupabaseClient } from "@platform/supabase/server";
import { createServiceRoleClient } from "@platform/supabase/service-role";

export type StorageStatus = {
  accountId: string;
  bucket: string;
  publicBaseUrl: string | null;
  healthStatus: string;
  checkedAt: string | null;
};

export { isVerifiedStorageConnection };

export type LoadedConnection = StorageStatus & {
  connection: {
    accountId: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
};

export async function storageStatus(creatorId: string): Promise<StorageStatus | null> {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready" || !ctx.canRead) return null;
  assertSameCreator(ctx.creator.id, creatorId);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("acc_storage_connections")
    .select("account_identifier, bucket_name, public_base_url, health_status, checked_at")
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (!data) return null;
  return {
    accountId: data.account_identifier,
    bucket: data.bucket_name,
    publicBaseUrl: data.public_base_url,
    healthStatus: data.health_status,
    checkedAt: data.checked_at,
  };
}

/** Decrypts credentials for the signed-in creator. Server only. */
export async function loadConnection(creatorId: string): Promise<LoadedConnection | null> {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready" || !ctx.canPreview) return null;
  assertSameCreator(ctx.creator.id, creatorId);
  const status = await storageStatus(creatorId);
  if (!status || !credentialMasterKey()) return null;
  const admin = createServiceRoleClient();
  const { data: secret } = await admin
    .from("acc_storage_secrets")
    .select("ciphertext, nonce, auth_tag, key_version")
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (!secret) return null;
  try {
    const plaintext = decryptSecret(
      {
        ciphertext: decodeBytea(secret.ciphertext),
        nonce: decodeBytea(secret.nonce),
        tag: decodeBytea(secret.auth_tag),
        keyVersion: secret.key_version,
      },
      masterKeyFromBase64(credentialMasterKey() as string),
    );
    const parsed = JSON.parse(plaintext) as {
      accessKeyId?: string;
      secretAccessKey?: string;
    };
    if (!parsed.accessKeyId || !parsed.secretAccessKey) return null;
    return {
      ...status,
      connection: {
        accountId: status.accountId,
        bucket: status.bucket,
        accessKeyId: parsed.accessKeyId,
        secretAccessKey: parsed.secretAccessKey,
      },
    };
  } catch {
    return null;
  }
}

function decodeBytea(value: unknown): Buffer {
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value !== "string") throw new Error("credential_encoding");
  if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
  return Buffer.from(value, "base64");
}
