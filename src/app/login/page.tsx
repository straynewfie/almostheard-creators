import type { Metadata } from "next";
import { AuthForm } from "@components/forms/auth-forms";
import { signInAction } from "@platform/auth/actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="shell section">
      <p className="eyebrow">Creator access</p>
      <h1>Sign in</h1>
      <p className="muted">Accounts stay private. Signing in does not publish music or start a subscription.</p>
      <AuthForm
        action={signInAction}
        submitLabel="Sign in"
        fields={["email", "password"]}
        nextPath={next}
        alternate={{ href: "/register", label: "Create an account" }}
        extra={{ href: "/reset-password", label: "Forgot password" }}
      />
    </main>
  );
}
