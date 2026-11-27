import { StorageForm } from "@components/forms/storage-form";
import { getDashboardContext } from "@domains/catalogue/context";
import { storageStatus } from "@domains/media/connection";

export default async function StoragePage() {
  const ctx = await getDashboardContext();
  if (ctx.kind !== "ready") return null;
  const status = await storageStatus(ctx.creator.id);
  return (
    <section>
      <h1 className="page-title">Storage</h1>
      <ol>
        <li>Create a Cloudflare R2 bucket that you own.</li>
        <li>Create a bucket-scoped access key.</li>
        <li>Enter the account id, bucket, and key here. The endpoint is derived from the account id.</li>
        <li>Leave the public base URL empty until public delivery is approved. Drafts never use a public URL.</li>
      </ol>
      {status ? (
        <div className="panel">
          <p>Account {status.accountId}</p>
          <p>Bucket {status.bucket}</p>
          <p>Health {status.healthStatus}{status.checkedAt ? ` · checked ${status.checkedAt}` : ""}</p>
          <p>{status.publicBaseUrl ? `Public base URL saved.` : "No public base URL."}</p>
        </div>
      ) : <p>No connection saved.</p>}
      {!ctx.storageConfigured ? <p className="banner">The server still needs its service role key and credential master key before secrets can be stored.</p> : null}
      <StorageForm canWrite={ctx.canWrite && ctx.storageConfigured} />
    </section>
  );
}
