import type { Metadata } from "next";
import { headers } from "next/headers";
import { AuthForm } from "@components/forms/auth-forms";
import { requestPasswordResetAction, updatePasswordAction } from "@platform/auth/actions";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage() {
  const headerStore = await headers();
  const host = headerStore.get("host");
  const origin = host ? `${host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https"}://${host}` : "";
  return (
    <main className="shell section">
      <p className="eyebrow">Creator access</p>
      <h1>Reset password</h1>
      <AuthForm
        action={requestPasswordResetAction}
        submitLabel="Send reset email"
        fields={["email"]}
        origin={origin}
        alternate={{ href: "/login", label: "Return to sign in" }}
      />
      <h2>Choose a new password</h2>
      <p className="muted">Use this after you open the link in the reset email.</p>
      <AuthForm action={updatePasswordAction} submitLabel="Update password" fields={["password"]} />
    </main>
  );
}
