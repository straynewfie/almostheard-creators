import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@platform/supabase/env";

/**
 * Service role is used only after a verified user session has been checked:
 * storage secrets, verified media writes, and operator membership.
 * Never import this module from a Client Component.
 */
export function createServiceRoleClient() {
  const key = getSupabaseServiceRoleKey();
  if (!key) throw new Error("Server storage credentials are not configured.");
  return createClient(getSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
