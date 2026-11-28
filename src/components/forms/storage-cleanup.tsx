"use client";

import { useState } from "react";
import { retryStorageCleanupAction } from "@domains/media/onboarding-actions";

export function StorageCleanup() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div className="form-actions">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setPending(true);
          void retryStorageCleanupAction().then((result) => {
            setPending(false);
            setMessage(result.error ?? `Removed ${result.removed} leftover file${result.removed === 1 ? "" : "s"}.`);
          });
        }}
      >
        {pending ? "Removing…" : "Remove leftover files"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
