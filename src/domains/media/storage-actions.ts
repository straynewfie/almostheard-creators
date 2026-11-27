"use server";

import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@domains/catalogue/context";
import { invalid, type FormState } from "@domains/catalogue/form-state";
import { encryptSecret, masterKeyFromBase64 } from "@platform/crypto/credentials";
import { assertSameCreator } from "@platform/auth/tenant";
import {
  credentialKeyVersion,
  credentialMasterKey,
  hasServiceRoleKey,
} from "@platform/supabase/env";
import { createServiceRoleClient } from "@platform/supabase/service-role";
import {
  assertPublicHttpsUrl,
  isValidBucketName,
  r2EndpointForAccount,
} from "@platform/storage/endpoint";
import { r2Storage } from "@platform/storage/r2-storage";
import { runStorageHealthCheck } from "@platform/storage/upload-lifecycle";
import { loadConnection } from "@domains/media/connection";
import { healthcheckObjectKey } from "@domains/music/paths";

function bytea(value: Buffer): string {
  return `\\x${value.toString("hex")}`;
}

export async function saveStorageAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready" || !ctx.canWrite) {
    return invalid({}, "This account cannot change storage.");
  }
  if (!hasServiceRoleKey() || !credentialMasterKey()) {
    return invalid({}, "Server storage encryption is not configured.");
  }
  const accountId = String(formData.get("account_identifier") ?? "").trim();
  const bucket = String(formData.get("bucket_name") ?? "").trim();
  const accessKeyId = String(formData.get("access_key_id") ?? "").trim();
  const secret = String(formData.get("secret_access_key") ?? "");
  const publicBase = String(formData.get("public_base_url") ?? "").trim();
  try {
    r2EndpointForAccount(accountId);
  } catch {
    return invalid({ account_identifier: "Enter the 32-character Cloudflare account id." });
  }
  if (!isValidBucketName(bucket)) {
    return invalid({ bucket_name: "Enter a valid bucket name." });
  }
  if (accessKeyId.length < 8 || accessKeyId.length > 200 || secret.length < 8) {
    return invalid({}, "Enter the bucket access key and secret.");
  }
  let publicBaseUrl: string | null = null;
  if (publicBase) {
    try {
      publicBaseUrl = assertPublicHttpsUrl(publicBase).toString().replace(/\/$/, "");
    } catch {
      return invalid({ public_base_url: "Enter a public https URL, or leave it empty." });
    }
  }
  assertSameCreator(ctx.creator.id, ctx.creator.id);
  const encrypted = encryptSecret(
    JSON.stringify({ accessKeyId, secretAccessKey: secret }),
    masterKeyFromBase64(credentialMasterKey() as string),
    credentialKeyVersion(),
  );
  const admin = createServiceRoleClient();
  const connection = await admin.from("acc_storage_connections").upsert({
    creator_id: ctx.creator.id,
    account_identifier: accountId.toLowerCase(),
    bucket_name: bucket,
    public_base_url: publicBaseUrl,
    health_status: "unknown",
    checked_at: null,
  });
  if (connection.error) return invalid({}, "The storage connection could not be saved.");
  const secrets = await admin.from("acc_storage_secrets").upsert({
    creator_id: ctx.creator.id,
    ciphertext: bytea(encrypted.ciphertext),
    nonce: bytea(encrypted.nonce),
    auth_tag: bytea(encrypted.tag),
    key_version: encrypted.keyVersion,
  });
  if (secrets.error) return invalid({}, "The storage credentials could not be saved.");
  revalidatePath("/dashboard/storage");
  return { error: null, fieldErrors: {} };
}

export async function testStorageAction(
  previous: FormState,
): Promise<FormState> {
  void previous;
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready" || !ctx.canWrite) {
    return invalid({}, "This account cannot test storage.");
  }
  if (!hasServiceRoleKey() || !credentialMasterKey()) {
    return invalid({}, "Server storage encryption is not configured.");
  }
  const loaded = await loadConnection(ctx.creator.id);
  if (!loaded) return invalid({}, "Save a storage connection first.");
  const key = healthcheckObjectKey(crypto.randomUUID());
  const result = await runStorageHealthCheck({
    storage: r2Storage(loaded.connection),
    key,
  });
  const admin = createServiceRoleClient();
  await admin
    .from("acc_storage_connections")
    .update({
      health_status: result.ok ? "healthy" : "unhealthy",
      checked_at: new Date().toISOString(),
    })
    .eq("creator_id", ctx.creator.id);
  revalidatePath("/dashboard/storage");
  return result.ok
    ? { error: null, fieldErrors: {} }
    : invalid({}, "The storage connection could not be confirmed.");
}
