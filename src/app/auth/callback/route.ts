import { NextResponse } from "next/server";
import { safeDashboardReturnPath } from "@platform/auth/paths";
import { isSupabaseConfigured } from "@platform/supabase/env";
import { createServerSupabaseClient } from "@platform/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeDashboardReturnPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  if (code && isSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
