import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const sql = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n");

test("migrations isolate tenants and omit genres", () => {
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /membership_state text not null default 'inactive'/);
  assert.match(sql, /revoke all on table public\.acc_storage_secrets from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.acc_publish_song\(uuid, uuid, boolean\) to service_role/);
  assert.doesNotMatch(sql, /grant execute on function public\.acc_publish_song[\s\S]*to authenticated/);
  assert.match(sql, /foreign key \(creator_id, primary_artist_id\)/i);
  assert.match(sql, /publication is disabled/);
  assert.equal(sql.includes("genres"), false);
  assert.equal(sql.toLowerCase().includes("policy") && sql.toLowerCase().includes("to anon"), false);
});

test("migration order is identity, storage, catalogue, operations", () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
  assert.deepEqual(names, [
    "20261127190000_acc_identity.sql",
    "20261127191000_acc_storage_audit_uploads.sql",
    "20261127192000_acc_catalogue.sql",
    "20261127193000_acc_operations.sql",
  ]);
});
