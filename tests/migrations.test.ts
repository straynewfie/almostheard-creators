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
  assert.match(sql, /force row level security/i);
  assert.match(sql, /membership_state text not null default 'inactive'/);
  assert.match(sql, /revoke all on table public\.acc_storage_secrets from public, anon, authenticated/);
  assert.match(sql, /grant select on table public\.acc_upload_intents to authenticated/);
  assert.doesNotMatch(sql, /grant select, insert on table public\.acc_upload_intents to authenticated/);
  assert.match(sql, /upload intents are server-created/);
  assert.match(sql, /uploaded object does not match the upload intent/);
  assert.match(sql, /creator is not active/);
  assert.match(sql, /duration is derived from the current recording/);
  assert.match(sql, /tg_table_name in \('acc_releases', 'acc_songs'\)/);
  assert.match(sql, /set search_path = pg_catalog, public/);
  assert.match(sql, /grant execute on function public\.acc_publish_song\(uuid, uuid, boolean\) to service_role/);
  assert.match(sql, /grant execute on function public\.acc_create_upload_intent\(text, text, uuid, text, bigint, text, text\) to authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.acc_publish_song[\s\S]*to authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.acc_write_verified_media[\s\S]*to authenticated/);
  assert.match(sql, /foreign key \(creator_id, primary_artist_id\)/i);
  assert.match(sql, /publication is disabled/);
  assert.equal(sql.includes("genres"), false);
  assert.equal(sql.toLowerCase().includes("policy") && sql.toLowerCase().includes("to anon"), false);
});

test("creator names do not collide with Almost Heard website objects", () => {
  const websiteMigrations = path.resolve(process.cwd(), "../almost-heard/almostheard/supabase/migrations");
  const websiteSql = readdirSync(websiteMigrations)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => readFileSync(path.join(websiteMigrations, name), "utf8"))
    .join("\n");
  const names = (source: string) =>
    new Set(
      [...source.matchAll(/create (?:or replace )?function public\.([a-z0-9_]+)/gi)].map((match) => match[1])
        .concat([...source.matchAll(/create table(?: if not exists)? public\.([a-z0-9_]+)/gi)].map((match) => match[1])),
    );
  const creators = names(sql);
  const website = names(websiteSql);
  const overlap = [...creators].filter((name) => website.has(name) || name.startsWith("dcm_") || name.startsWith("dcf_"));
  assert.deepEqual(overlap, []);
  assert.equal([...website].some((name) => name.startsWith("acc_")), false);
  assert.equal(websiteSql.includes("acc_private"), false);
  assert.doesNotMatch(sql, /create trigger[\s\S]{0,80}on auth\.users/i);
});

test("migration order keeps the applied files ahead of the standalone drop", () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
  assert.deepEqual(names, [
    "20261127190000_acc_identity.sql",
    "20261127191000_acc_storage_audit_uploads.sql",
    "20261127192000_acc_catalogue.sql",
    "20261127193000_acc_operations.sql",
    "20261127200000_acc_drop_standalone_artist.sql",
  ]);
});
