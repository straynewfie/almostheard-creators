"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@domains/catalogue/actions";
import { emptyFormState } from "@domains/catalogue/form-state";

export function ProfileForm({
  displayName,
  handle,
  canWrite,
}: {
  displayName: string;
  handle: string | null;
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(updateProfileAction, emptyFormState);
  return (
    <form action={action} className="form-grid">
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <label>Display name<input name="display_name" required maxLength={120} defaultValue={displayName} disabled={!canWrite} /></label>
      <label>Handle<input name="handle" maxLength={40} defaultValue={handle ?? ""} disabled={!canWrite} /></label>
      <p className="muted">A handle is stored for a future public address. Public creator pages are not open, so the handle is not listed.</p>
      <div className="form-actions">
        <button className="primary" type="submit" disabled={!canWrite || pending}>{pending ? "Saving…" : "Save profile"}</button>
      </div>
    </form>
  );
}
