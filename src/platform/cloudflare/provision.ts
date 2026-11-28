/**
 * Bucket, CORS, and bucket-key requests. These call shapes follow Cloudflare's
 * published APIs. The private test still has to prove them against a live account.
 * This module never asks for API token write.
 */

import { createHash } from "node:crypto";

export type CloudflareAccount = { id: string; name: string };

export type ProvisionResult =
  | {
      ok: true;
      accountId: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
    }
  | {
      ok: false;
      code: "accounts" | "bucket" | "cors" | "permission" | "credential";
      accountId?: string;
      bucket?: string;
    };

type FetchLike = typeof fetch;

export function dedicatedBucketName(creatorId: string): string {
  const compact = creatorId.replace(/-/g, "").toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(compact)) {
    throw new Error("The creator id is not valid.");
  }
  return `almost-heard-${compact.slice(0, 12)}`;
}

export function r2SecretFromTokenValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function corsRules(origin: string): { rules: unknown[] } {
  return {
    rules: [
      {
        allowed: {
          origins: [origin],
          methods: ["GET", "PUT", "HEAD", "DELETE"],
          headers: ["content-type"],
        },
        exposeHeaders: ["etag"],
        maxAgeSeconds: 3600,
      },
    ],
  };
}

export function bucketResourceName(accountId: string, bucket: string): string {
  return `com.cloudflare.edge.r2.bucket.${accountId}_default_${bucket}`;
}

export async function listCloudflareAccounts(input: {
  fetchImpl: FetchLike;
  accessToken: string;
}): Promise<{ accounts: CloudflareAccount[] } | { error: true }> {
  const response = await input.fetchImpl("https://api.cloudflare.com/client/v4/accounts?per_page=20", {
    headers: { authorization: `Bearer ${input.accessToken}` },
  });
  if (!response.ok) return { error: true };
  const payload = (await response.json()) as {
    success?: boolean;
    result?: Array<{ id?: string; name?: string }>;
  };
  if (!payload.success || !Array.isArray(payload.result)) return { error: true };
  const accounts = payload.result.flatMap((account) => {
    if (!account.id || !/^[a-f0-9]{32}$/i.test(account.id)) return [];
    return [{ id: account.id.toLowerCase(), name: account.name?.slice(0, 80) || "Cloudflare account" }];
  });
  return { accounts };
}

export async function provisionDedicatedBucket(input: {
  fetchImpl: FetchLike;
  accessToken: string;
  accountId: string;
  bucket: string;
  origin: string;
}): Promise<ProvisionResult> {
  const headers = {
    authorization: `Bearer ${input.accessToken}`,
    "content-type": "application/json",
  };
  const created = await input.fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/r2/buckets`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ name: input.bucket, storageClass: "Standard" }),
    },
  );
  if (!created.ok && created.status !== 409) {
    return { ok: false, code: "bucket", accountId: input.accountId };
  }
  const cors = await input.fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/r2/buckets/${input.bucket}/cors`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify(corsRules(input.origin)),
    },
  );
  if (!cors.ok) {
    return { ok: false, code: "cors", accountId: input.accountId, bucket: input.bucket };
  }
  const groups = await input.fetchImpl("https://api.cloudflare.com/client/v4/user/tokens/permission_groups", {
    headers: { authorization: `Bearer ${input.accessToken}` },
  });
  if (groups.status === 403 || groups.status === 401) {
    return { ok: false, code: "permission", accountId: input.accountId, bucket: input.bucket };
  }
  if (!groups.ok) {
    return { ok: false, code: "credential", accountId: input.accountId, bucket: input.bucket };
  }
  const listed = (await groups.json()) as {
    success?: boolean;
    result?: Array<{ id?: string; name?: string }>;
  };
  const group = listed.result?.find((item) => item.name === "Workers R2 Storage Bucket Item Write");
  if (!listed.success || !group?.id) {
    return { ok: false, code: "permission", accountId: input.accountId, bucket: input.bucket };
  }
  const minted = await input.fetchImpl("https://api.cloudflare.com/client/v4/user/tokens", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: `Almost Heard ${input.bucket}`.slice(0, 80),
      policies: [
        {
          effect: "allow",
          resources: {
            [`com.cloudflare.api.account.${input.accountId}`]: "*",
            [bucketResourceName(input.accountId, input.bucket)]: "*",
          },
          permission_groups: [{ id: group.id, name: group.name }],
        },
      ],
    }),
  });
  if (minted.status === 403 || minted.status === 401) {
    return { ok: false, code: "permission", accountId: input.accountId, bucket: input.bucket };
  }
  if (!minted.ok) {
    return { ok: false, code: "credential", accountId: input.accountId, bucket: input.bucket };
  }
  const token = (await minted.json()) as {
    success?: boolean;
    result?: { id?: string; value?: string };
  };
  if (!token.success || !token.result?.id || !token.result.value) {
    return { ok: false, code: "credential", accountId: input.accountId, bucket: input.bucket };
  }
  return {
    ok: true,
    accountId: input.accountId,
    bucket: input.bucket,
    accessKeyId: token.result.id,
    secretAccessKey: r2SecretFromTokenValue(token.result.value),
  };
}
