"use server";

import { redirect } from "next/navigation";
import {
  passwordResetAcknowledgement,
  registrationAcknowledgement,
  signInFailureMessage,
} from "@platform/auth/messages";
import { safeDashboardReturnPath } from "@platform/auth/paths";
import { isSupabaseConfigured } from "@platform/supabase/env";
import { createServerSupabaseClient } from "@platform/supabase/server";

export type AuthFormState = {
  error: string | null;
  message: string | null;
};

function emailOf(formData: FormData): string {
  return String(formData.get("email") ?? "").trim().toLowerCase();
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) {
    return { error: "Sign-in is not configured yet.", message: null };
  }
  const email = emailOf(formData);
  const password = String(formData.get("password") ?? "");
  if (!email || !email.includes("@") || password.length < 8) {
    return { error: signInFailureMessage(), message: null };
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: signInFailureMessage(), message: null };
  redirect(safeDashboardReturnPath(String(formData.get("next") ?? "")));
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) {
    return { error: "Registration is not configured yet.", message: null };
  }
  const email = emailOf(formData);
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address.", message: null };
  }
  if (password.length < 8 || password.length > 200) {
    return { error: "Use a password of at least 8 characters.", message: null };
  }
  if (displayName.length < 1 || displayName.length > 120 || /[<>]/.test(displayName)) {
    return { error: "Enter a display name without HTML.", message: null };
  }
  const origin = String(formData.get("origin") ?? "");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: origin ? `${origin}/auth/callback?next=/dashboard` : undefined,
    },
  });
  if (error || !data.user) {
    return {
      error: null,
      message: registrationAcknowledgement(),
    };
  }
  if (data.session) redirect("/dashboard");
  return { error: null, message: registrationAcknowledgement() };
}

export async function requestPasswordResetAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = emailOf(formData);
  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address.", message: null };
  }
  if (!isSupabaseConfigured()) {
    return { error: "Password reset is not configured yet.", message: null };
  }
  const origin = String(formData.get("origin") ?? "");
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: origin ? `${origin}/reset-password` : undefined,
  });
  if (error) {
    return { error: "The reset email could not be sent. Try again.", message: null };
  }
  return { error: null, message: passwordResetAcknowledgement() };
}

export async function updatePasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8 || password.length > 200) {
    return { error: "Use a password of at least 8 characters.", message: null };
  }
  if (!isSupabaseConfigured()) {
    return { error: "Password reset is not configured yet.", message: null };
  }
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return { error: "Open the reset link from your email, then choose a new password.", message: null };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "The password could not be updated.", message: null };
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
