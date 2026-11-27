"use client";

import { useActionState } from "react";
import { saveStorageAction, testStorageAction } from "@domains/media/storage-actions";
import { emptyFormState } from "@domains/catalogue/form-state";

export function StorageForm({ canWrite }: { canWrite: boolean }) {
  const [state, action, pending] = useActionState(saveStorageAction, emptyFormState);
  const [testState, testAction, testPending] = useActionState(testStorageAction, emptyFormState);
  return (
    <div className="form-grid">
      <form action={action} className="form-grid">
        {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
        <label>Cloudflare account id<input name="account_identifier" required autoComplete="off" disabled={!canWrite} /></label>
        <label>Bucket name<input name="bucket_name" required autoComplete="off" disabled={!canWrite} /></label>
        <label>Access key id<input name="access_key_id" required autoComplete="off" disabled={!canWrite} /></label>
        <label>Secret access key<input name="secret_access_key" type="password" required autoComplete="new-password" disabled={!canWrite} /></label>
        <label>Public base URL (optional)<input name="public_base_url" type="url" placeholder="https://" disabled={!canWrite} /></label>
        <p className="muted">Credentials stay encrypted on the server. They are not shown again and are not sent to the player.</p>
        <button className="primary" type="submit" disabled={!canWrite || pending}>{pending ? "Saving…" : "Save connection"}</button>
      </form>
      <form action={testAction}>
        {testState.error ? <p className="form-error" role="alert">{testState.error}</p> : null}
        <button className="primary" type="submit" disabled={!canWrite || testPending}>{testPending ? "Testing…" : "Test connection"}</button>
      </form>
    </div>
  );
}
