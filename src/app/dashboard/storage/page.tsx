import Link from "next/link";
import { BrowserVerify } from "@components/forms/browser-verify";
import { StorageCleanup } from "@components/forms/storage-cleanup";
import { chooseCloudflareAccountAction, sweepStorageAction } from "@domains/media/onboarding-actions";
import { getDashboardContext } from "@domains/catalogue/context";
import { storageStatus } from "@domains/media/connection";
import { listStuckDeletions } from "@domains/media/deletions";
import { isVerifiedStorageConnection } from "@domains/media/storage-status";
import { cloudflareOAuthConfigured } from "@platform/cloudflare/oauth";
import { safeDashboardReturnPath } from "@platform/auth/paths";
import { hasServiceRoleKey } from "@platform/supabase/env";
import { createServerSupabaseClient } from "@platform/supabase/server";
import { cookies } from "next/headers";

const NOTICES: Record<string, string> = {
  state: "The authorization did not match this browser session. Start it again from this page.",
  denied: "Cloudflare authorization was cancelled. Nothing was changed.",
  platform: "The platform connection is not configured yet. Catalogue editing still works.",
  membership: "This membership cannot change storage.",
  account: "Choose one Cloudflare account on the consent screen, then start again.",
  choose: "Choose the Cloudflare account that should hold your storage.",
  paused: "Storage setup paused before it was marked ready.",
  verify: "The bucket is ready for a browser check. Uploads stay off until that check passes.",
  migration: "The storage update is waiting for the platform owner. Catalogue editing still works.",
  ready: "Storage is connected.",
};

export default async function StoragePage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string; notice?: string }>;
}) {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready") return null;
  const params = await searchParams;
  const returnTo = safeDashboardReturnPath(params.return);
  const notice = NOTICES[params.notice ?? ""] ?? null;
  const status = await storageStatus(ctx.creator.id);
  const progress = await onboardingProgress(ctx.creator.id);
  const jar = await cookies();
  const accounts = readAccounts(jar.get("ahc_cf_accounts")?.value);
  const healthy = isVerifiedStorageConnection(status?.healthStatus);
  if (ctx.canWrite && status && !progress.pendingMigration) {
    await sweepStorageAction().catch(() => undefined);
  }
  const stuck = healthy && status && hasServiceRoleKey() && !progress.pendingMigration
    ? await listStuckDeletions(ctx.creator.id, status.bucket).catch(() => [])
    : [];
  const connectHref = `/dashboard/storage/connect?return=${encodeURIComponent(returnTo)}`;

  return (
    <section>
      <p className="eyebrow">Storage</p>
      <h1 className="page-title">Set up storage</h1>
      <div className="form-section">
        <h2>Your files stay in your Cloudflare account</h2>
        <p>Almost Heard stores artwork and audio in a private R2 bucket that you own. You need a free Cloudflare account. R2 has to be turned on in that account, including its payment method. Standard storage includes a free amount each month. Deletes are free. A request past a free allowance can round up to the next million operations, so a busy catalogue can add a charge.</p>
        <p>Catalogue editing works before this is connected. Artwork and audio uploads wait until the connection is checked.</p>
        <p><a href="https://dash.cloudflare.com/sign-up">Create a Cloudflare account</a> or <a href="https://dash.cloudflare.com/login">sign in</a>. Then open <a href="https://dash.cloudflare.com/?to=/:account/r2">R2</a> and turn it on if it is not already available.</p>
      </div>
      {notice ? <p className="banner" role="status">{notice}</p> : null}
      {progress.lastError ? <p className="banner" role="status">{progress.lastError}</p> : null}
      {!ctx.storageConfigured ? <p className="banner">The server still needs its encryption keys before a connection can be saved.</p> : null}
      {progress.pendingMigration ? <p className="banner">The storage database update has not been applied yet. You can keep editing the catalogue.</p> : null}
      {healthy ? (
        <div className="panel">
          <p>Storage is connected{status ? ` to bucket ${status.bucket}` : ""}.</p>
          <Link className="button" href={returnTo}>Back to your page</Link>
        </div>
      ) : null}
      {params.notice === "choose" && accounts.length > 0 ? (
        <div className="form-section">
          <h2>Choose an account</h2>
          {accounts.map((account) => (
            <form key={account.id} action={chooseCloudflareAccountAction}>
              <input type="hidden" name="account_id" value={account.id} />
              <input type="hidden" name="return" value={returnTo} />
              <button className="primary" type="submit">Use {account.name}</button>
            </form>
          ))}
        </div>
      ) : null}
      {!healthy && progress.step === "verify" ? (
        <div className="form-section">
          <h2>Confirm the browser can upload</h2>
          <p>This sends a tiny text file from your browser to the new bucket, then removes it.</p>
          <BrowserVerify returnTo={returnTo} />
        </div>
      ) : null}
      {!healthy && progress.step === "paused" ? (
        <div className="form-section">
          <h2>Setup is paused</h2>
          <p>The bucket was not marked ready. If this happened while creating a lasting key, the platform owner has to approve another Cloudflare permission before setup can continue. That permission can create API tokens, so it is not requested automatically. Your catalogue is unchanged.</p>
          <div className="form-actions">
            <Link className="button primary" href={connectHref}>Try the connection again</Link>
          </div>
        </div>
      ) : null}
      {!healthy && progress.step !== "verify" && progress.step !== "paused" ? (
        <div className="form-section">
          <h2>Connect Cloudflare</h2>
          {cloudflareOAuthConfigured() && ctx.canWrite && ctx.storageConfigured && !progress.pendingMigration ? (
            <div className="form-actions">
              <Link className="button primary" href={connectHref}>Continue with Cloudflare</Link>
            </div>
          ) : (
            <p>The private Cloudflare connection is not ready on the server yet. You can keep editing the catalogue.</p>
          )}
        </div>
      ) : null}
      {status && !progress.pendingMigration ? (
        <div className="form-section">
          <h2>Leftover files</h2>
          <p>Replaced artwork, replaced audio, unfinished uploads, and finished temporary files in this bucket stay queued until they are removed. A file that has failed eight times stays listed. Remove leftover files tries those again. Files in a Cloudflare bucket you no longer use stay in that account and are not deleted from here.</p>
          {stuck.length > 0 ? (
            <ul>
              {stuck.map((file) => (
                <li key={file.objectKey}>{file.objectKey}{file.lastError ? ` — ${file.lastError}` : ""}</li>
              ))}
            </ul>
          ) : null}
          <StorageCleanup />
        </div>
      ) : null}
      <p><Link href={returnTo}>Return without connecting</Link></p>
    </section>
  );
}

function readAccounts(value: string | undefined): Array<{ id: string; name: string }> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Array<{ id?: string; name?: string }>;
    return parsed.flatMap((account) => (
      account.id && /^[a-f0-9]{32}$/.test(account.id)
        ? [{ id: account.id, name: (account.name || "Cloudflare account").slice(0, 80) }]
        : []
    ));
  } catch {
    return [];
  }
}

async function onboardingProgress(creatorId: string): Promise<{
  pendingMigration: boolean;
  step: string | null;
  lastError: string | null;
}> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("acc_storage_connections")
    .select("onboarding_step, last_error")
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (error) return { pendingMigration: true, step: null, lastError: null };
  return {
    pendingMigration: false,
    step: (data?.onboarding_step as string | undefined) ?? null,
    lastError: (data?.last_error as string | null | undefined) ?? null,
  };
}
