/**
 * Edge-safe Supabase environment reads. Never log key material.
 */

export function supabaseConfigStatus(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  return { configured: missing.length === 0, missing };
}

export function isSupabaseConfigured(): boolean {
  return supabaseConfigStatus().configured;
}

export function getSupabaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) throw new Error("Supabase is not configured.");
  return raw.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
}

export function getSupabasePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!key) throw new Error("Supabase is not configured.");
  return key;
}

export function getSupabaseServiceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

export function hasServiceRoleKey(): boolean {
  return Boolean(getSupabaseServiceRoleKey());
}

export function credentialMasterKey(): string | null {
  return process.env.CREATORS_CREDENTIAL_MASTER_KEY?.trim() || null;
}

export function credentialKeyVersion(): number {
  const parsed = Number(process.env.CREATORS_CREDENTIAL_KEY_VERSION ?? "1");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
