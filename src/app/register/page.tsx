import type { Metadata } from "next";
import { headers } from "next/headers";
import { AuthForm } from "@components/forms/auth-forms";
import { registerAction } from "@platform/auth/actions";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  const headerStore = await headers();
  const host = headerStore.get("host");
  const origin = host ? `${host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https"}://${host}` : "";
  return (
    <main className="shell section">
      <p className="eyebrow">Creator access</p>
      <h1>Create an account</h1>
      <p className="muted">A new account is inactive until an operator activates it. This does not start a subscription, and billing is not available.</p>
      <AuthForm
        action={registerAction}
        submitLabel="Create account"
        fields={["display_name", "email", "password"]}
        origin={origin}
        alternate={{ href: "/login", label: "Already have an account" }}
      />
    </main>
  );
}
