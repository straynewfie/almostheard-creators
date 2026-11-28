import "server-only";

import { storageStatus } from "@domains/media/connection";
import {
  clearStoredSecret,
  readStoredSecret,
  saveConnectionProgress,
  storeBucketKey,
} from "@domains/media/onboarding-store";
import { dedicatedBucketName, provisionDedicatedBucket } from "@platform/cloudflare/provision";
import { hasServiceRoleKey, credentialMasterKey } from "@platform/supabase/env";
import { r2Storage } from "@platform/storage/r2-storage";
import { healthcheckObjectKey } from "@domains/music/paths";
import { runStorageHealthCheck } from "@platform/storage/upload-lifecycle";

const PAUSE: Record<"accounts" | "bucket" | "cors" | "permission" | "credential", string> = {
  accounts: "Cloudflare did not share an account. Start the connection again.",
  bucket: "The storage bucket could not be created. Nothing was marked ready.",
  cors: "The bucket exists, but browser access could not be configured. Storage is not ready.",
  permission: "A lasting bucket key could not be created with the approved permission. Storage is not ready.",
  credential: "A bucket key could not be saved. Storage is not ready.",
};

export async function finishProvisioning(input: {
  fetchImpl: typeof fetch;
  creatorId: string;
  accessToken: string;
  accountId: string;
  origin: string;
}): Promise<"verify" | "paused" | "migration" | "platform"> {
  if (!hasServiceRoleKey() || !credentialMasterKey()) return "platform";
  const existing = await storageStatus(input.creatorId);
  const bucket = existing?.bucket || dedicatedBucketName(input.creatorId);
  if (existing && existing.accountId !== input.accountId) {
    const secret = await readStoredSecret(input.creatorId);
    if (secret?.purpose === "oauth") await clearStoredSecret(input.creatorId);
    if (existing.healthStatus !== "healthy") {
      await saveConnectionProgress({
        creatorId: input.creatorId,
        accountId: existing.accountId,
        bucket: existing.bucket,
        step: "paused",
        health: existing.healthStatus === "unhealthy" ? "unhealthy" : "unknown",
        lastError: "Choose the Cloudflare account that already owns this bucket.",
      });
    }
    return "paused";
  }
  const result = await provisionDedicatedBucket({
    fetchImpl: input.fetchImpl,
    accessToken: input.accessToken,
    accountId: input.accountId,
    bucket,
    origin: input.origin,
  });
  if (!result.ok) {
    if (result.bucket && result.accountId) {
      const saved = await saveConnectionProgress({
        creatorId: input.creatorId,
        accountId: result.accountId,
        bucket: result.bucket,
        step: "paused",
        health: "unknown",
        lastError: PAUSE[result.code],
      });
      if (!saved) return "migration";
    }
    const secret = await readStoredSecret(input.creatorId);
    if (secret?.purpose === "oauth") await clearStoredSecret(input.creatorId);
    return "paused";
  }
  const stored = await storeBucketKey(input.creatorId, result.accessKeyId, result.secretAccessKey);
  if (!stored) return "platform";
  const saved = await saveConnectionProgress({
    creatorId: input.creatorId,
    accountId: result.accountId,
    bucket: result.bucket,
    step: "verify",
    health: "unknown",
    lastError: null,
  });
  if (!saved) return "migration";
  const health = await runStorageHealthCheck({
    storage: r2Storage({
      accountId: result.accountId,
      bucket: result.bucket,
      accessKeyId: result.accessKeyId,
      secretAccessKey: result.secretAccessKey,
    }),
    key: healthcheckObjectKey(crypto.randomUUID()),
  });
  if (!health.ok) {
    await saveConnectionProgress({
      creatorId: input.creatorId,
      accountId: result.accountId,
      bucket: result.bucket,
      step: "paused",
      health: "unhealthy",
      lastError: "The storage check did not pass. Storage is not ready.",
    });
    return "paused";
  }
  return "verify";
}
