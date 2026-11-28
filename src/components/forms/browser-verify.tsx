"use client";

import { useState } from "react";
import { confirmBrowserCheckAction, startBrowserCheckAction } from "@domains/media/onboarding-actions";

export function BrowserVerify({ returnTo }: { returnTo: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setError(null);
    const ticket = await startBrowserCheckAction();
    if (ticket.error || !ticket.uploadUrl) {
      setPending(false);
      setError(ticket.error ?? "The browser check could not be started.");
      return;
    }
    const uploaded = await fetch(ticket.uploadUrl, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body: "ok",
    });
    if (!uploaded.ok) {
      setPending(false);
      setError("The browser could not reach your storage. Check that you are on the same site you authorized.");
      return;
    }
    const result = await confirmBrowserCheckAction(returnTo);
    if (result?.error) {
      setPending(false);
      setError(result.error);
    }
  }

  return (
    <div className="form-actions">
      <button className="primary" type="button" disabled={pending} onClick={() => void run()}>
        {pending ? "Checking…" : "Confirm browser upload"}
      </button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  );
}
