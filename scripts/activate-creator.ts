/**
 * Operator-only membership change. Requires SUPABASE_SERVICE_ROLE_KEY.
 * Usage: npx tsx scripts/activate-creator.ts user@example.com [active|inactive|cancelled]
 */
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const state = process.argv[3]?.trim() || "active";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !url || !key) {
  console.error("Provide an email and the server Supabase settings. Do not pass the key as an argument.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
if (error) {
  console.error("The user list could not be read.");
  process.exit(1);
}
const user = data.users.find((entry) => entry.email?.toLowerCase() === email);
if (!user) {
  console.error("No matching auth user was found.");
  process.exit(1);
}
const { data: creator, error: creatorError } = await admin
  .from("acc_creators")
  .select("id")
  .eq("auth_user_id", user.id)
  .maybeSingle();
if (creatorError || !creator) {
  console.error("That user has no creator profile yet.");
  process.exit(1);
}
const { error: updateError } = await admin.rpc("acc_set_membership_state", {
  p_creator_id: creator.id,
  p_state: state,
  p_test_reactivation: process.argv.includes("--test-reactivation"),
});
if (updateError) {
  console.error("Membership was not changed.");
  process.exit(1);
}
console.log(`Membership for ${email} is now ${state}.`);
