/**
 * Operator-only membership change. Reads NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY from the environment or from .env.local.
 * The key is never accepted as an argument and is never printed.
 *
 * Usage:
 *   npx.cmd tsx scripts/activate-creator.ts user@example.com [active|inactive|cancelled]
 *   npx.cmd tsx scripts/activate-creator.ts --id <creator-uuid> [active|inactive|cancelled]
 *
 * Cancelled to active fails unless --test-reactivation is passed deliberately.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

loadLocalEnv(resolve(process.cwd(), ".env.local"));

const testReactivation = process.argv.includes("--test-reactivation");
const args = process.argv.slice(2).filter((arg) => arg !== "--test-reactivation");
const idFlag = args.indexOf("--id");
const creatorArgument = idFlag >= 0 ? args[idFlag + 1]?.trim() : "";
const email = idFlag >= 0 ? "" : args[0]?.trim().toLowerCase() ?? "";
const state = (idFlag >= 0 ? args[idFlag + 2] : args[1])?.trim() || "active";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if ((!email && !creatorArgument) || !url || !key) {
  console.error("Provide an email or --id, and the server Supabase settings. Do not pass the key as an argument.");
  process.exit(1);
}
if (!["active", "inactive", "cancelled"].includes(state)) {
  console.error("Membership state must be active, inactive, or cancelled.");
  process.exit(1);
}
if (creatorArgument && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(creatorArgument)) {
  console.error("The creator id is not a UUID.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main(): Promise<void> {
  const creatorId = creatorArgument || (await creatorIdForEmail(email));
  const before = await readMembership(creatorId);
  const { error: updateError } = await admin.rpc("acc_set_membership_state", {
    p_creator_id: creatorId,
    p_state: state,
    p_test_reactivation: testReactivation,
  });
  if (updateError) {
    console.error("Membership was not changed.");
    process.exit(1);
  }
  const after = await readMembership(creatorId);
  if (after.membership_state !== state) {
    console.error(`Membership remained ${after.membership_state}.`);
    process.exit(1);
  }
  console.log(
    `Creator ${creatorId} changed from ${before.membership_state} to ${after.membership_state}.`,
  );
}

void main();

async function creatorIdForEmail(address: string): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    console.error("The user list could not be read.");
    process.exit(1);
  }
  const user = data.users.find((entry) => entry.email?.toLowerCase() === address);
  if (!user) {
    console.error("No matching auth user was found in the first 200 accounts.");
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
  return creator.id as string;
}

async function readMembership(id: string): Promise<{ membership_state: string }> {
  const { data, error } = await admin
    .from("acc_creators")
    .select("id, membership_state")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    console.error("That creator profile was not found.");
    process.exit(1);
  }
  return { membership_state: data.membership_state as string };
}

function loadLocalEnv(file: string): void {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const name = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[name] === undefined) process.env[name] = value;
  }
}
