import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const databaseUrl = process.env.CREATORS_TEST_DATABASE_URL;
const checksum = "ab".repeat(32);

type SqlClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
};
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const userC = "33333333-3333-4333-8333-333333333333";

test("database security, tenancy, and catalogue operations", async () => {
  const client = await openDatabase();
  try {
    await resetDatabase(client);
    await applyMigrations(client);
    await reviewPrivileges(client);
    await reviewBehaviour(client);
  } finally {
    await client.end();
  }
});

async function openDatabase(): Promise<SqlClient> {
  if (databaseUrl) {
    if (!databaseUrl.includes("creators_migration_review")) {
      throw new Error("Refusing to run review SQL unless the database name is creators_migration_review.");
    }
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    return client;
  }
  const memory = new PGlite();
  return {
    async query(sql: string, values?: unknown[]) {
      if (values && values.length > 0) {
        const result = await memory.query(sql, values);
        return { rows: result.rows as Record<string, unknown>[] };
      }
      if (sql.includes(";")) {
        await memory.exec(sql);
        return { rows: [] };
      }
      const result = await memory.query(sql);
      return { rows: result.rows as Record<string, unknown>[] };
    },
    end: () => memory.close(),
  };
}

async function resetDatabase(client: SqlClient): Promise<void> {
  await client.query(`
    drop schema if exists acc_private cascade;
    drop schema if exists auth cascade;
    drop schema if exists public cascade;
    create schema public;
    create schema auth;
    create table auth.users (id uuid primary key, email text unique);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
    grant usage on schema auth to public;
  `);
  await client.query(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
      end if;
    end $$;
    grant usage on schema auth to anon, authenticated, service_role;
  `);
}

async function applyMigrations(client: SqlClient): Promise<void> {
  const directory = path.join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
  assert.deepEqual(files, [
    "20261127190000_acc_identity.sql",
    "20261127191000_acc_storage_audit_uploads.sql",
    "20261127192000_acc_catalogue.sql",
    "20261127193000_acc_operations.sql",
    "20261127200000_acc_drop_standalone_artist.sql",
  ]);
  for (const file of files) {
    await client.query(readFileSync(path.join(directory, file), "utf8"));
  }
}

async function reviewPrivileges(client: SqlClient): Promise<void> {
  await expectPrivilege(client, "authenticated", "public.acc_upload_intents", "INSERT", false);
  await expectPrivilege(client, "authenticated", "public.acc_media", "INSERT", false);
  await expectPrivilege(client, "authenticated", "public.acc_storage_secrets", "SELECT", false);
  await expectPrivilege(client, "anon", "public.acc_artists", "SELECT", false);
  await expectPrivilege(client, "authenticated", "public.acc_songs", "UPDATE", false);
  const title = await client.query(
    "select has_column_privilege('authenticated', 'public.acc_songs', 'title', 'UPDATE') as allowed",
  );
  assert.equal(title.rows[0].allowed, true);
  const duration = await client.query(
    "select has_column_privilege('authenticated', 'public.acc_songs', 'duration_ms', 'UPDATE') as allowed",
  );
  assert.equal(duration.rows[0].allowed, false);
  const publish = await client.query(
    "select has_function_privilege('authenticated', 'public.acc_publish_song(uuid,uuid,boolean)', 'EXECUTE') as allowed",
  );
  assert.equal(publish.rows[0].allowed, false);
  const finalize = await client.query(
    "select has_function_privilege('authenticated', 'public.acc_write_verified_media(uuid,uuid,text,bigint,text,text,text,integer,text,bigint)', 'EXECUTE') as allowed",
  );
  assert.equal(finalize.rows[0].allowed, false);
  const intent = await client.query(
    "select has_function_privilege('authenticated', 'public.acc_create_upload_intent(text,text,uuid,text,bigint,text,text)', 'EXECUTE') as allowed",
  );
  assert.equal(intent.rows[0].allowed, true);
}

async function reviewBehaviour(client: SqlClient): Promise<void> {
  await client.query("insert into auth.users (id, email) values ($1, $2), ($3, $4), ($5, $6)", [
    userA, "a@example.com", userB, "b@example.com", userC, "c@example.com",
  ]);
  await assumeRole(client, "authenticated", userA);
  const creatorA = await one(client, "select public.acc_ensure_creator_profile('Creator A') as id");
  await assumeRole(client, "authenticated", userB);
  const creatorB = await one(client, "select public.acc_ensure_creator_profile('Creator B') as id");
  await assumeRole(client, "authenticated", userC);
  const creatorC = await one(client, "select public.acc_ensure_creator_profile('Creator C') as id");

  await assumeRole(client, "service_role", userA);
  await client.query("select public.acc_set_membership_state($1, 'active', false)", [creatorA]);
  await client.query("select public.acc_set_membership_state($1, 'active', false)", [creatorB]);
  await assumeRole(client, "authenticated", userC);
  await expectError(
    client,
    "select public.acc_set_membership_state($1, 'active', false)",
    [creatorC],
    /operator-only|permission denied/,
  );

  await assumeRole(client, "authenticated", userA);
  const artist = await one(
    client,
    `insert into public.acc_artists (creator_id, slug, name)
     values ($1, 'artist-a', 'Artist A') returning id`,
    [creatorA],
  );
  await client.query("update public.acc_artists set name = 'Artist A renamed' where id = $1", [artist]);
  const renamed = await one(client, "select name from public.acc_artists where id = $1", [artist]);
  assert.equal(renamed, "Artist A renamed");
  const coverIntent = await one(
    client,
    `select public.acc_create_upload_intent(
      'cover', 'artist', $1::uuid, 'image/png', 800, $2, 'cover-intent-0001'
    ) as id`,
    [artist, checksum],
  );
  const coverKey = await one(client, "select object_key as id from public.acc_upload_intents where id = $1", [coverIntent]);
  assert.equal(coverKey, `artists/${artist}/cover/1.webp`);
  await expectError(
    client,
    "update public.acc_artists set visibility = 'public' where id = $1",
    [artist],
    /permission denied|publication is disabled|server-controlled/,
  );
  await expectError(
    client,
    "update public.acc_creators set membership_state = 'active' where id = $1",
    [creatorA],
    /permission denied|server-controlled/,
  );

  await assumeRole(client, "authenticated", userB);
  const visibleToB = await one(
    client,
    "select count(*)::int as id from public.acc_artists where id = $1",
    [artist],
  );
  assert.equal(visibleToB, 0);
  await expectError(
    client,
    "insert into public.acc_artists (creator_id, slug, name) values ($1, 'stolen', 'Stolen')",
    [creatorA],
    /row-level security|permission denied|42501/,
  );

  await assumeRole(client, "authenticated", userC);
  const ownProfile = await one(client, "select count(*)::int as id from public.acc_creators where id = $1", [creatorC]);
  assert.equal(ownProfile, 1);
  await expectError(
    client,
    "insert into public.acc_artists (creator_id, slug, name) values ($1, 'inactive', 'Inactive')",
    [creatorC],
    /row-level security|permission denied/,
  );

  await assumeRole(client, "authenticated", userA);
  const song = await one(
    client,
    `insert into public.acc_songs (creator_id, slug, title, primary_artist_id)
     values ($1, 'song-a', 'Song A', $2) returning id`,
    [creatorA, artist],
  );
  await expectError(
    client,
    "update public.acc_songs set duration_ms = 1000 where id = $1",
    [song],
    /permission denied/,
  );
  const recording = await one(
    client,
    "insert into public.acc_recordings (creator_id, song_id) values ($1, $2) returning id",
    [creatorA, song],
  );
  const version = await one(client, "select version::int as id from public.acc_recordings where id = $1", [recording]);
  assert.equal(version, 1);
  await expectError(
    client,
    `insert into public.acc_upload_intents (
      creator_id, id, kind, recording_id, staging_key, object_key, expected_mime,
      expected_bytes, expected_checksum_sha256, expires_at, idempotency_key
    ) values (
      $1, gen_random_uuid(), 'audio', $2, 'staging/x/object', 'recordings/x/audio.mp3',
      'audio/mpeg', 10, $3, now() + interval '1 hour', 'direct-insert-key'
    )`,
    [creatorA, recording, checksum],
    /permission denied|server-created/,
  );
  const intent = await one(
    client,
    `select public.acc_create_upload_intent(
      'audio', 'recording', $1::uuid, 'audio/mpeg', 1200, $2, 'audio-intent-0001'
    ) as id`,
    [recording, checksum],
  );
  const storedKey = await one(client, "select object_key as id from public.acc_upload_intents where id = $1", [intent]);
  assert.equal(storedKey, `recordings/${recording}/audio.mp3`);
  await expectError(
    client,
    "select public.acc_create_upload_intent('audio', 'recording', $1::uuid, 'text/plain', 1200, $2, 'bad-mime-key')",
    [recording, checksum],
    /not valid|check constraint|audio upload/,
  );

  await assumeRole(client, "authenticated", userB);
  await expectError(
    client,
    "select public.acc_create_upload_intent('audio', 'recording', $1::uuid, 'audio/mpeg', 1200, $2, 'cross-tenant-key')",
    [recording, checksum],
    /not in this catalogue|not available|42501/,
  );

  await assumeRole(client, "service_role");
  await client.query(
    `insert into public.acc_storage_connections (creator_id, account_identifier, bucket_name)
     values ($1, $2, 'creator-audio')`,
    [creatorA, "a".repeat(32)],
  );
  await expectError(
    client,
    `select public.acc_write_verified_media(
      $1::uuid, $2::uuid, $3, 1200, 'audio/mpeg', null, 'creator-audio', 180000, $4, 999
    )`,
    [creatorA, intent, checksum, checksum],
    /does not match the upload intent/,
  );
  await client.query(
    `select public.acc_write_verified_media(
      $1::uuid, $2::uuid, $3, 1200, 'audio/mpeg', null, 'creator-audio', 180000, $3, 1200
    )`,
    [creatorA, intent, checksum],
  );
  const durationBeforeCurrent = await client.query(
    "select song.duration_ms as song_duration, recording.duration_ms as recording_duration from public.acc_songs song join public.acc_recordings recording on recording.song_id = song.id where recording.id = $1",
    [recording],
  );
  assert.equal(durationBeforeCurrent.rows[0].song_duration, null);
  assert.equal(durationBeforeCurrent.rows[0].recording_duration, 180000);

  await assumeRole(client, "authenticated", userA);
  await client.query("select public.acc_promote_recording($1, true)", [recording]);
  assert.equal(await one(client, "select duration_ms::int as id from public.acc_songs where id = $1", [song]), 180000);

  await assumeRole(client, "service_role");
  await client.query("select public.acc_publish_song($1, $2, true)", [creatorA, song]);

  await assumeRole(client, "authenticated", userA);
  const replacement = await one(
    client,
    "insert into public.acc_recordings (creator_id, song_id) values ($1, $2) returning id",
    [creatorA, song],
  );
  const replacementIntent = await one(
    client,
    `select public.acc_create_upload_intent(
      'audio', 'recording', $1::uuid, 'audio/mpeg', 1400, $2, 'audio-intent-0002'
    ) as id`,
    [replacement, checksum],
  );
  await assumeRole(client, "service_role");
  await client.query(
    `select public.acc_write_verified_media(
      $1::uuid, $2::uuid, $3, 1400, 'audio/mpeg', null, 'creator-audio', 240000, $3, 1400
    )`,
    [creatorA, replacementIntent, checksum],
  );
  const duringReplacement = await client.query(
    "select duration_ms::int as duration, visibility from public.acc_songs where id = $1",
    [song],
  );
  assert.equal(duringReplacement.rows[0].duration, 180000);
  assert.equal(duringReplacement.rows[0].visibility, "public");

  await assumeRole(client, "authenticated", userA);
  await client.query("select public.acc_promote_recording($1, true)", [replacement]);
  const afterReplacement = await client.query(
    "select duration_ms::int as duration, visibility from public.acc_songs where id = $1",
    [song],
  );
  assert.equal(afterReplacement.rows[0].duration, 240000);
  assert.equal(afterReplacement.rows[0].visibility, "draft");

  const retired = await one(
    client,
    "select (retired_at is not null)::int as id from public.acc_recordings where id = $1",
    [recording],
  );
  assert.equal(retired, 1);

  const expiring = await one(
    client,
    "insert into public.acc_recordings (creator_id, song_id) values ($1, $2) returning id",
    [creatorA, song],
  );
  const expiringIntent = await one(
    client,
    `select public.acc_create_upload_intent(
      'audio', 'recording', $1::uuid, 'audio/mpeg', 1000, $2, 'audio-intent-expire'
    ) as id`,
    [expiring, checksum],
  );
  await client.query("reset role");
  await client.query("alter table public.acc_upload_intents disable trigger acc_upload_intents_protect");
  await client.query(
    "update public.acc_upload_intents set expires_at = now() - interval '1 minute' where id = $1",
    [expiringIntent],
  );
  await client.query("alter table public.acc_upload_intents enable trigger acc_upload_intents_protect");
  await assumeRole(client, "service_role");
  await expectError(
    client,
    `select public.acc_write_verified_media(
      $1::uuid, $2::uuid, $3, 1000, 'audio/mpeg', null, 'creator-audio', 1000, $3, 1000
    )`,
    [creatorA, expiringIntent, checksum],
    /cannot be finalized/,
  );

  await assumeRole(client, "authenticated", userA);
  const inactiveRecording = await one(
    client,
    "insert into public.acc_recordings (creator_id, song_id) values ($1, $2) returning id",
    [creatorA, song],
  );
  const inactiveIntent = await one(
    client,
    `select public.acc_create_upload_intent(
      'audio', 'recording', $1::uuid, 'audio/mpeg', 1000, $2, 'audio-intent-inactive'
    ) as id`,
    [inactiveRecording, checksum],
  );
  await assumeRole(client, "service_role");
  await client.query("select public.acc_set_membership_state($1, 'inactive', false)", [creatorA]);
  await expectError(
    client,
    `select public.acc_write_verified_media(
      $1::uuid, $2::uuid, $3, 1000, 'audio/mpeg', null, 'creator-audio', 1000, $3, 1000
    )`,
    [creatorA, inactiveIntent, checksum],
    /not active/,
  );
  await client.query("select public.acc_set_membership_state($1, 'active', false)", [creatorA]);
  await assumeRole(client, "authenticated", userA);

  const release = await one(
    client,
    `insert into public.acc_releases (
      creator_id, slug, title, primary_artist_id, release_type
    ) values ($1, 'release-a', 'Release A', $2, 'single') returning id`,
    [creatorA, artist],
  );
  const track = await one(
    client,
    "select public.acc_add_release_placeholder($1, 'Placeholder', 1) as id",
    [release],
  );
  await client.query("select public.acc_attach_release_song($1, $2)", [track, song]);
  await expectError(client, "select public.acc_soft_delete_song($1)", [song], /remove this song/);
  await client.query("select public.acc_remove_release_track($1)", [track]);
  await client.query("select public.acc_soft_delete_song($1)", [song]);
  await client.query("select public.acc_soft_delete_release($1)", [release]);
  await client.query("select public.acc_soft_delete_artist($1)", [artist]);

  await assumeRole(client, "authenticated", userB);
  await expectError(
    client,
    "select public.acc_remove_release_track($1)",
    [track],
    /track not found|42501/,
  );

  await assumeRole(client, "anon");
  await expectError(client, "select count(*) from public.acc_artists", [], /permission denied/);
}

async function expectPrivilege(
  client: SqlClient,
  role: string,
  table: string,
  privilege: string,
  allowed: boolean,
): Promise<void> {
  const result = await client.query("select has_table_privilege($1, $2, $3) as allowed", [role, table, privilege]);
  assert.equal(result.rows[0].allowed, allowed);
}

async function assumeRole(client: SqlClient, role: "anon" | "authenticated" | "service_role", uid = ""): Promise<void> {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await client.query("select set_config('request.jwt.claim.role', $1, false)", [role]);
  await client.query(`set role ${role}`);
}

async function one(client: SqlClient, sql: string, values: unknown[] = []): Promise<string | number> {
  const result = await client.query(sql, values);
  const row = result.rows[0] as Record<string, string | number>;
  const value = row.id ?? row.name ?? Object.values(row)[0];
  return value;
}

async function expectError(client: SqlClient, sql: string, values: unknown[], pattern: RegExp): Promise<void> {
  await assert.rejects(client.query(sql, values), (error: Error) => {
    assert.match(error.message, pattern);
    return true;
  });
}
