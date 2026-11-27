"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthFormState } from "@platform/auth/actions";

const initial: AuthFormState = { error: null, message: null };

export function AuthForm({
  action,
  submitLabel,
  fields,
  nextPath,
  origin,
  alternate,
  extra,
}: {
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  submitLabel: string;
  fields: Array<"display_name" | "email" | "password">;
  nextPath?: string;
  origin?: string;
  alternate?: { href: string; label: string };
  extra?: { href: string; label: string };
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="form-grid">
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {state.message ? <p role="status">{state.message}</p> : null}
      {fields.includes("display_name") ? (
        <label>Display name<input name="display_name" required maxLength={120} autoComplete="nickname" /></label>
      ) : null}
      {fields.includes("email") ? (
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
      ) : null}
      {fields.includes("password") ? (
        <label>Password<input name="password" type="password" required minLength={8} autoComplete="current-password" /></label>
      ) : null}
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
      {origin ? <input type="hidden" name="origin" value={origin} /> : null}
      <button className="primary" type="submit" disabled={pending}>{pending ? "Working…" : submitLabel}</button>
      {alternate ? <Link href={alternate.href}>{alternate.label}</Link> : null}
      {extra ? <Link href={extra.href}>{extra.label}</Link> : null}
    </form>
  );
}
