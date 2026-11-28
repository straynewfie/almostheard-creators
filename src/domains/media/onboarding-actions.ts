"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDashboardContext } from "@domains/catalogue/context";
import { loadConnection } from "@domains/media/connection";
import { isVerifiedStorageConnection } from "@domains/media/storage-status";
import { recoverInterruptedStorage } from "@domains/media/recovery";
import { createServiceRoleClient } from "@platform/supabase/service-role";
import { finishProvisioning } from "@domains/media/onboarding-flow";
import { readStoredSecret, saveConnectionProgress } from "@domains/media/onboarding-store";
import { browserHealthObjectKey } from "@domains/music/paths";
import { safeDashboardReturnPath } from "@platform/auth/paths";
import { cloudflareRedirectUri } from "@platform/cloudflare/oauth";
import { presignPut } from "@platform/storage/r2-storage";
import { r2Storage } from "@platform/storage/r2-storage";

function readAccountIds(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Array<{ id?: string }>;
    return parsed.flatMap((account) => (
      account.id && /^[a-f0-9]{32}$/.test(account.id) ? [account.id] : []
    ));
  } catch {
    return [];
  }
}

export async function chooseCloudflareAccountAction(formData: FormData): Promise<void> {
  const ctx = await getDashboardContext();
  const accountId = String(formData.get("account_id") ?? "").toLowerCase();
  const returnTo = safeDashboardReturnPath(String(formData.get("return") ?? ""));
  if (ctx.kind !== "ready" || !ctx.canWrite || !/^[a-f0-9]{32}$/.test(accountId)) {
    redirect(`/dashboard/storage?return=${encodeURIComponent(returnTo)}&notice=state`);
  }
  const jar = await cookies();
  const allowed = readAccountIds(jar.get("ahc_cf_accounts")?.value);
  if (!allowed.includes(accountId)) {
    redirect(`/dashboard/storage?return=${encodeURIComponent(returnTo)}&notice=state`);
  }
  const secret = await readStoredSecret(ctx.creator.id);
  if (!secret || secret.purpose !== "oauth" || new Date(secret.expiresAt).getTime() <= Date.now()) {
    redirect(`/dashboard/storage?return=${encodeURIComponent(returnTo)}&notice=account`);
  }
  const headerList = await headers();
  const origin = `${headerList.get("x-forwarded-proto") ?? "http"}://${headerList.get("host") ?? ""}`;
  if (!cloudflareRedirectUri(origin)) {
    redirect(`/dashboard/storage?return=${encodeURIComponent(returnTo)}&notice=state`);
  }
  const outcome = await finishProvisioning({
    fetchImpl: fetch,
    creatorId: ctx.creator.id,
    accessToken: secret.accessToken,
    accountId,
    origin,
  });
  jar.delete("ahc_cf_accounts");
  redirect(`/dashboard/storage?return=${encodeURIComponent(returnTo)}&notice=${outcome}`);
}

export async function startBrowserCheckAction(): Promise<{ error: string | null; uploadUrl?: string }> {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready" || !ctx.canWrite) {
    return { error: "This account cannot check storage." };
  }
  const loaded = await loadConnection(ctx.creator.id);
  if (!loaded) return { error: "Storage is not ready to check." };
  const nonce = randomUUID();
  const jar = await cookies();
  jar.set("ahc_cf_browser", nonce, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  try {
    const uploadUrl = await presignPut({
      connection: loaded.connection,
      key: browserHealthObjectKey(nonce),
      contentType: "text/plain",
      expiresIn: 120,
    });
    return { error: null, uploadUrl };
  } catch {
    return { error: "The browser check could not be started." };
  }
}

export async function confirmBrowserCheckAction(returnTo: string): Promise<{ error: string | null }> {
  const ctx = await getDashboardContext();
  const safeReturn = safeDashboardReturnPath(returnTo);
  if (ctx.kind !== "ready" || !ctx.canWrite) return { error: "This account cannot check storage." };
  const jar = await cookies();
  const nonce = jar.get("ahc_cf_browser")?.value ?? "";
  const loaded = await loadConnection(ctx.creator.id);
  if (!loaded || !/^[0-9a-f-]{36}$/i.test(nonce)) {
    return { error: "The browser check expired. Try it again." };
  }
  const storage = r2Storage(loaded.connection);
  const key = browserHealthObjectKey(nonce);
  const bytes = await storage.get(key);
  const text = bytes ? new TextDecoder().decode(bytes) : "";
  await storage.delete(key).catch(() => undefined);
  jar.delete("ahc_cf_browser");
  if (text !== "ok") return { error: "The browser could not store a file in your bucket." };
  const saved = await saveConnectionProgress({
    creatorId: ctx.creator.id,
    accountId: loaded.accountId,
    bucket: loaded.bucket,
    step: "ready",
    health: "healthy",
    lastError: null,
    browserVerified: true,
  });
  if (!saved) return { error: "The storage check passed, but it could not be recorded." };
  redirect(`${safeReturn}${safeReturn.includes("?") ? "&" : "?"}storage=ready`);
}

export async function sweepStorageAction(): Promise<void> {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready" || !ctx.canWrite) return;
  const loaded = await loadConnection(ctx.creator.id);
  if (!loaded || !isVerifiedStorageConnection(loaded.healthStatus)) return;
  await recoverInterruptedStorage(ctx.creator.id, loaded.bucket, r2Storage(loaded.connection));
}

export async function retryStorageCleanupAction(): Promise<{ error: string | null; removed: number }> {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready" || !ctx.canWrite) return { error: "This account cannot clean storage.", removed: 0 };
  const loaded = await loadConnection(ctx.creator.id);
  if (!loaded || !isVerifiedStorageConnection(loaded.healthStatus)) {
    return { error: "Storage is not ready to clean.", removed: 0 };
  }
  const admin = createServiceRoleClient();
  await admin.rpc("acc_reopen_storage_deletions", {
    p_creator_id: ctx.creator.id,
    p_bucket: loaded.bucket,
  });
  const removed = await recoverInterruptedStorage(ctx.creator.id, loaded.bucket, r2Storage(loaded.connection));
  return { error: null, removed };
}
