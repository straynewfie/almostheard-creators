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

test("historical upload keys survive the storage onboarding migration", async () => {
  const client = await openDatabase();
  try {
    await resetDatabase(client);
    const directory = path.join(process.cwd(), "supabase", "migrations");
    const earlier = [
      "20261127190000_acc_identity.sql",
      "20261127191000_acc_storage_audit_uploads.sql",
      "20261127192000_acc_catalogue.sql",
      "20261127193000_acc_operations.sql",
      "20261127200000_acc_drop_standalone_artist.sql",
    ];
    for (const file of earlier) {
      await client.query(readFileSync(path.join(directory, file), "utf8"));
    }
    await client.query("insert into auth.users (id, email) values ($1, $2)", [userA, "a@example.com"]);
    await assumeRole(client, "authenticated", userA);
    const creator = await one(client, "select public.acc_ensure_creator_profile('Creator A') as id");
    await assumeRole(client, "service_role", userA);
    await client.query("select public.acc_set_membership_state($1, 'active', false)", [creator]);
    await assumeRole(client, "authenticated", userA);
    const artist = await one(
      client,
      "insert into public.acc_artists (creator_id, slug, name) values ($1, 'artist-a', 'Artist A') returning id",
      [creator],
    );
    const song = await one(
      client,
      "insert into public.acc_songs (creator_id, slug, title, primary_artist_id) values ($1, 'song-a', 'Song A', $2) returning id",
      [creator, artist],
    );
    const recording = await one(
      client,
      "insert into public.acc_recordings (creator_id, song_id) values ($1, $2) returning id",
      [creator, song],
    );
    const finalizedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const pendingId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const oldAudio = `recordings/${recording}/audio.mp3`;
    const oldCover = `artists/${artist}/cover/1.webp`;
    await client.query("reset role");
    await client.query("alter table public.acc_upload_intents disable trigger acc_upload_intents_protect");
    await client.query(
      `insert into public.acc_upload_intents (
        creator_id, id, kind, recording_id, staging_key, object_key,
        expected_mime, expected_bytes, expected_checksum_sha256, expires_at, state, idempotency_key
      ) values (
        $1, $2, 'audio', $3, $4, $5, 'audio/mpeg', 1000, $6, now(), 'finalized', 'historical-audio'
      )`,
      [creator, finalizedId, recording, `staging/${finalizedId}/object`, oldAudio, checksum],
    );
    await client.query(
      `insert into public.acc_upload_intents (
        creator_id, id, kind, artist_id, staging_key, object_key,
        expected_mime, expected_bytes, expected_checksum_sha256, expires_at, state, idempotency_key
      ) values (
        $1, $2, 'cover', $3, $4, $5, 'image/webp', 1000, $6, now() + interval '1 hour', 'pending', 'historical-cover'
      )`,
      [creator, pendingId, artist, `staging/${pendingId}/object`, oldCover, checksum],
    );
    await client.query("alter table public.acc_upload_intents enable trigger acc_upload_intents_protect");
    await client.query(readFileSync(path.join(directory, "20261127210000_acc_storage_onboarding.sql"), "utf8"));
    assert.equal(
      await one(client, "select object_key as id from public.acc_upload_intents where id = $1", [finalizedId]),
      oldAudio,
    );
    assert.equal(
      await one(client, "select state as id from public.acc_upload_intents where id = $1", [finalizedId]),
      "finalized",
    );
    assert.equal(
      await one(client, "select object_key as id from public.acc_upload_intents where id = $1", [pendingId]),
      oldCover,
    );
    assert.equal(
      await one(client, "select state as id from public.acc_upload_intents where id = $1", [pendingId]),
      "expired",
    );
    await assumeRole(client, "service_role");
    await client.query(
      `insert into public.acc_storage_connections (creator_id, account_identifier, bucket_name, health_status)
       values ($1, $2, 'creator-audio', 'healthy')`,
      [creator, "a".repeat(32)],
    );
    await assumeRole(client, "authenticated", userA);
    const fresh = await one(
      client,
      `select public.acc_create_upload_intent(
        'audio', 'recording', $1::uuid, 'audio/mpeg', 1000, $2, 'fresh-audio-key'
      ) as id`,
      [recording, checksum],
    );
    assert.equal(
      await one(client, "select object_key as id from public.acc_upload_intents where id = $1", [fresh]),
      `songs/${song}/${recording}.mp3`,
    );
  } finally {
    await client.end();
  }
});

test("storage cleanup leases, artwork bucket, and exhausted retries", async () => {
  const client = await openDatabase();
  try {
    await resetDatabase(client);
    await applyMigrations(client);
    await client.query("insert into auth.users (id, email) values ($1, $2)", [userA, "a@example.com"]);
    await assumeRole(client, "authenticated", userA);
    const creator = await one(client, "select public.acc_ensure_creator_profile('Creator A') as id");
    await assumeRole(client, "service_role", userA);
    await client.query("select public.acc_set_membership_state($1, 'active', false)", [creator]);
    await client.query(
      `insert into public.acc_storage_connections (creator_id, account_identifier, bucket_name, health_status)
       values ($1, $2, 'creator-audio', 'healthy')`,
      [creator, "a".repeat(32)],
    );
    await assumeRole(client, "authenticated", userA);
    const artist = await one(
      client,
      "insert into public.acc_artists (creator_id, slug, name) values ($1, 'artist-a', 'Artist A') returning id",
      [creator],
    );
    const intent = await one(
      client,
      `select public.acc_create_upload_intent(
        'cover', 'artist', $1::uuid, 'image/png', 800, $2, 'cover-lease-key1'
      ) as id`,
      [artist, checksum],
    );
    const artworkKey = await one(
      client,
      "select object_key as id from public.acc_upload_intents where id = $1",
      [intent],
    );
    await assumeRole(client, "service_role");
    await client.query(
      `insert into public.acc_storage_deletions (
        creator_id, bucket_name, object_key, removal_granted, lease_token, next_attempt_at
      ) values ($1, 'creator-audio', $2, true, gen_random_uuid(), now() + interval '10 minutes')`,
      [creator, artworkKey],
    );
    await expectError(
      client,
      `select public.acc_write_verified_media(
        $1::uuid, $2::uuid, $3, 800, 'image/webp', null, 'creator-audio', null, $3, 800
      )`,
      [creator, intent, checksum],
      /reserved for removal/,
    );
    await client.query(
      "update public.acc_storage_deletions set removal_granted = false where creator_id = $1 and object_key = $2",
      [creator, artworkKey],
    );
    await client.query(
      `select public.acc_write_verified_media(
        $1::uuid, $2::uuid, $3, 800, 'image/webp', null, 'creator-audio', null, $3, 800
      )`,
      [creator, intent, checksum],
    );
    assert.equal(
      await one(
        client,
        "select count(*)::int as id from public.acc_storage_deletions where creator_id = $1 and object_key = $2",
        [creator, artworkKey],
      ),
      0,
    );
    assert.equal(
      await one(
        client,
        "select count(*)::int as id from public.acc_media where creator_id = $1 and object_key = $2 and is_current",
        [creator, artworkKey],
      ),
      1,
    );
    await client.query(
      "insert into public.acc_storage_deletions (creator_id, bucket_name, object_key) values ($1, 'creator-audio', $2)",
      [creator, artworkKey],
    );
    const currentClaim = await client.query("select object_key from public.acc_claim_storage_deletions($1)", [creator]);
    assert.equal(currentClaim.rows.some((row) => row.object_key === artworkKey), false);
    assert.equal(
      await one(
        client,
        "select count(*)::int as id from public.acc_storage_deletions where creator_id = $1 and object_key = $2",
        [creator, artworkKey],
      ),
      0,
    );

    await client.query(
      "insert into public.acc_storage_deletions (creator_id, bucket_name, object_key) values ($1, 'creator-audio', 'staging/grant-check-object')",
      [creator],
    );
    const leased = await client.query(
      "select object_key, lease_token from public.acc_claim_storage_deletions($1)",
      [creator],
    );
    assert.equal(leased.rows.length, 1);
    assert.equal(leased.rows[0].object_key, "staging/grant-check-object");
    const again = await client.query("select object_key from public.acc_claim_storage_deletions($1)", [creator]);
    assert.equal(again.rows.length, 0);
    const otherArtist = await one(
      client,
      "insert into public.acc_artists (creator_id, slug, name) values ($1, 'artist-b', 'Artist B') returning id",
      [creator],
    );
    await client.query(
      `with cfg as (select set_config('acc.media_finalize', 'on', true) as ready)
       insert into public.acc_media (
         creator_id, artist_id, kind, bucket, object_key, byte_size, mime_type,
         checksum_sha256, verification_state, verified_at, is_current
       )
       select $1, $2, 'cover', 'creator-audio', 'staging/grant-check-object', 10, 'image/webp',
         $3, 'verified', now(), true
       where (select ready from cfg) = 'on'`,
      [creator, otherArtist, checksum],
    );
    const granted = await one(
      client,
      "select public.acc_grant_storage_deletion($1, 'creator-audio', 'staging/grant-check-object', $2) as id",
      [creator, leased.rows[0].lease_token],
    );
    assert.equal(granted, false);
    assert.equal(
      await one(
        client,
        "select count(*)::int as id from public.acc_storage_deletions where object_key = 'staging/grant-check-object'",
        [],
      ),
      0,
    );

    await client.query(
      `insert into public.acc_storage_deletions (creator_id, bucket_name, object_key, attempts)
       values ($1, 'creator-audio', 'staging/exhausted-object', 8),
              ($1, 'old-bucket', 'staging/other-bucket-object', 8)`,
      [creator],
    );
    const hidden = await client.query("select object_key from public.acc_claim_storage_deletions($1)", [creator]);
    assert.equal(hidden.rows.some((row) => row.object_key === "staging/exhausted-object"), false);
    const listed = await client.query(
      "select object_key, attempts from public.acc_list_storage_deletions($1)",
      [creator],
    );
    assert.equal(listed.rows.some((row) => row.object_key === "staging/exhausted-object" && row.attempts === 8), true);
    const reopened = await one(
      client,
      "select public.acc_reopen_storage_deletions($1, 'creator-audio') as id",
      [creator],
    );
    assert.equal(reopened, 1);
    assert.equal(
      await one(
        client,
        "select attempts::int as id from public.acc_storage_deletions where object_key = 'staging/other-bucket-object'",
        [],
      ),
      8,
    );

  } finally {
    await client.end();
  }
});

test("immutable artwork replacement keeps one current image", async () => {
  const client = await openDatabase();
  try {
    await resetDatabase(client);
    await applyMigrations(client);
    await client.query(
      "insert into auth.users (id, email) values ($1, $2), ($3, $4)",
      [userA, "a@example.com", userB, "b@example.com"],
    );
    await assumeRole(client, "authenticated", userA);
    const creator = await one(client, "select public.acc_ensure_creator_profile('Creator A') as id");
    await assumeRole(client, "authenticated", userB);
    const other = await one(client, "select public.acc_ensure_creator_profile('Creator B') as id");
    await assumeRole(client, "service_role");
    await client.query("select public.acc_set_membership_state($1, 'active', false)", [creator]);
    await client.query("select public.acc_set_membership_state($1, 'active', false)", [other]);
    await client.query(
      `insert into public.acc_storage_connections (creator_id, account_identifier, bucket_name, health_status)
       values ($1, $2, 'creator-audio', 'healthy')`,
      [creator, "a".repeat(32)],
    );
    await assumeRole(client, "authenticated", userA);
    const artist = await one(
      client,
      "insert into public.acc_artists (creator_id, slug, name) values ($1, 'artist-a', 'Artist A') returning id",
      [creator],
    );
    const song = await one(
      client,
      "insert into public.acc_songs (creator_id, slug, title, primary_artist_id) values ($1, 'song-a', 'Song A', $2) returning id",
      [creator, artist],
    );
    await assumeRole(client, "authenticated", userB);
    await expectError(
      client,
      "select public.acc_create_upload_intent('cover', 'artist', $1::uuid, 'image/png', 800, $2, 'cross-creator-cover')",
      [artist, checksum],
      /not in this catalogue|not available/,
    );
    await assumeRole(client, "authenticated", userA);
    const first = await one(
      client,
      `select public.acc_create_upload_intent(
        'cover', 'artist', $1::uuid, 'image/png', 800, $2, 'cover-first-0001'
      ) as id`,
      [artist, checksum],
    );
    const secondIntent = await one(
      client,
      `select public.acc_create_upload_intent(
        'cover', 'artist', $1::uuid, 'image/png', 900, $2, 'cover-second-001'
      ) as id`,
      [artist, checksum],
    );
    const firstKey = String(await one(client, "select object_key as id from public.acc_upload_intents where id = $1", [first]));
    const secondKey = String(await one(client, "select object_key as id from public.acc_upload_intents where id = $1", [secondIntent]));
    assert.equal(firstKey, `artists/${artist}/${first}.webp`);
    assert.equal(secondKey, `artists/${artist}/${secondIntent}.webp`);
    assert.notEqual(firstKey, secondKey);
    const visibilityBefore = await one(client, "select visibility as id from public.acc_songs where id = $1", [song]);
    await assumeRole(client, "service_role");
    await expectError(
      client,
      `select public.acc_write_verified_media(
        $1::uuid, $2::uuid, $3, 800, 'image/webp', null, 'creator-audio', null, $3, 799
      )`,
      [creator, first, checksum],
      /does not match the upload intent/,
    );
    assert.equal(
      await one(client, "select count(*)::int as id from public.acc_media where artist_id = $1", [artist]),
      0,
    );
    await client.query(
      `select public.acc_write_verified_media(
        $1::uuid, $2::uuid, $3, 800, 'image/webp', null, 'creator-audio', null, $3, 800
      )`,
      [creator, first, checksum],
    );
    assert.equal(
      await one(
        client,
        "select count(*)::int as id from public.acc_media where artist_id = $1 and is_current",
        [artist],
      ),
      1,
    );
    assert.equal(
      await one(
        client,
        "select count(*)::int as id from public.acc_storage_deletions where creator_id = $1 and object_key = $2",
        [creator, firstKey],
      ),
      0,
    );
    await expectError(
      client,
      `select public.acc_write_verified_media(
        $1::uuid, $2::uuid, $3, 900, 'image/webp', null, 'creator-audio', null, $3, 1
      )`,
      [creator, secondIntent, checksum],
      /does not match the upload intent/,
    );
    assert.equal(
      await one(
        client,
        "select object_key as id from public.acc_media where artist_id = $1 and is_current",
        [artist],
      ),
      firstKey,
    );
    await expectError(
      client,
      `with cfg as (select set_config('acc.media_finalize', 'on', true) as ready)
       insert into public.acc_media (
         creator_id, artist_id, kind, bucket, object_key, byte_size, mime_type,
         checksum_sha256, verification_state, verified_at, is_current
       )
       select $1, $2, 'cover', 'creator-audio', $3, 10, 'image/webp', $4, 'verified', now(), true
       where (select ready from cfg) = 'on'`,
      [creator, artist, `artists/${artist}/99999999-9999-4999-8999-999999999999.webp`, checksum],
      /duplicate key|unique|acc_media_current_artist_cover/,
    );
    await client.query(
      `select public.acc_write_verified_media(
        $1::uuid, $2::uuid, $3, 900, 'image/webp', null, 'creator-audio', null, $3, 900
      )`,
      [creator, secondIntent, checksum],
    );
    assert.equal(
      await one(
        client,
        "select count(*)::int as id from public.acc_media where artist_id = $1 and is_current",
        [artist],
      ),
      1,
    );
    assert.equal(
      await one(
        client,
        "select object_key as id from public.acc_media where artist_id = $1 and is_current",
        [artist],
      ),
      secondKey,
    );
    assert.equal(
      await one(
        client,
        "select count(*)::int as id from public.acc_storage_deletions where creator_id = $1 and bucket_name = 'creator-audio' and object_key = $2",
        [creator, firstKey],
      ),
      1,
    );
    assert.equal(
      await one(
        client,
        "select count(*)::int as id from public.acc_storage_deletions where creator_id = $1 and object_key = $2",
        [creator, secondKey],
      ),
      0,
    );
    assert.equal(await one(client, "select visibility as id from public.acc_songs where id = $1", [song]), visibilityBefore);
    await client.query(
      "insert into public.acc_storage_deletions (creator_id, bucket_name, object_key) values ($1, 'other-bucket', $2)",
      [creator, firstKey],
    );
    const claimed = await client.query("select bucket_name, object_key from public.acc_claim_storage_deletions($1)", [creator]);
    assert.equal(claimed.rows.some((row) => row.object_key === secondKey), false);
    assert.equal(claimed.rows.some((row) => row.bucket_name === "other-bucket"), false);
    assert.equal(claimed.rows.some((row) => row.object_key === firstKey && row.bucket_name === "creator-audio"), true);
    await client.query(
      "select public.acc_queue_storage_deletion($1, 'creator-audio', $2, 'The obsolete artwork is still present.')",
      [creator, firstKey],
    );
    assert.equal(
      await one(
        client,
        "select count(*)::int as id from public.acc_storage_deletions where creator_id = $1 and bucket_name = 'creator-audio' and object_key = $2",
        [creator, firstKey],
      ),
      1,
    );
    await assumeRole(client, "authenticated", userA);
    const abandonedArtist = await one(
      client,
      "insert into public.acc_artists (creator_id, slug, name) values ($1, 'artist-b', 'Artist B') returning id",
      [creator],
    );
    await assumeRole(client, "authenticated", userA);
    const abandoned = await one(
      client,
      `select public.acc_create_upload_intent(
        'cover', 'artist', $1::uuid, 'image/png', 800, $2, 'cover-abandoned-1'
      ) as id`,
      [abandonedArtist, checksum],
    );
    const abandonedKey = String(await one(client, "select object_key as id from public.acc_upload_intents where id = $1", [abandoned]));
    await client.query("reset role");
    await client.query("alter table public.acc_upload_intents disable trigger acc_upload_intents_protect");
    await client.query("update public.acc_upload_intents set expires_at = now() - interval '1 minute' where id = $1", [abandoned]);
    await client.query("alter table public.acc_upload_intents enable trigger acc_upload_intents_protect");
    await assumeRole(client, "service_role");
    await client.query("select public.acc_queue_finished_staging($1, 'creator-audio')", [creator]);
    assert.equal(
      await one(
        client,
        "select count(*)::int as id from public.acc_storage_deletions where creator_id = $1 and bucket_name = 'creator-audio' and object_key = $2",
        [creator, abandonedKey],
      ),
      1,
    );
    assert.equal(
      await one(
        client,
        "select count(*)::int as id from public.acc_storage_deletions where creator_id = $1 and object_key = $2",
        [creator, secondKey],
      ),
      0,
    );
    assert.equal(await one(client, "select to_regclass('public.acc_artwork_restores')::text as id"), null);
    await expectError(
      client,
      "select public.acc_queue_storage_deletion($1, 'other-bucket', $2, 'wrong bucket')",
      [creator, firstKey],
      /does not match this creator/,
    );
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
    "20261127210000_acc_storage_onboarding.sql",
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
  const deletions = await client.query(
    "select has_table_privilege('authenticated', 'public.acc_storage_deletions', 'SELECT') as allowed",
  );
  assert.equal(deletions.rows[0].allowed, false);
  const queue = await client.query(
    "select has_function_privilege('authenticated', 'public.acc_queue_storage_deletion(uuid,text,text,text)', 'EXECUTE') as allowed",
  );
  assert.equal(queue.rows[0].allowed, false);
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
  await expectError(
    client,
    `select public.acc_create_upload_intent(
      'cover', 'artist', $1::uuid, 'image/png', 800, $2, 'cover-before-storage'
    )`,
    [artist, checksum],
    /storage is not ready/,
  );
  await assumeRole(client, "service_role");
  await client.query(
    `insert into public.acc_storage_connections (creator_id, account_identifier, bucket_name, health_status)
     values ($1, $2, 'creator-audio', 'unknown')`,
    [creatorA, "a".repeat(32)],
  );
  await assumeRole(client, "authenticated", userA);
  await expectError(
    client,
    `select public.acc_create_upload_intent(
      'cover', 'artist', $1::uuid, 'image/png', 800, $2, 'cover-before-healthy'
    )`,
    [artist, checksum],
    /storage is not ready/,
  );
  await assumeRole(client, "service_role");
  await client.query(
    "update public.acc_storage_connections set health_status = 'healthy' where creator_id = $1",
    [creatorA],
  );
  await assumeRole(client, "authenticated", userA);
  const coverIntent = await one(
    client,
    `select public.acc_create_upload_intent(
      'cover', 'artist', $1::uuid, 'image/png', 800, $2, 'cover-intent-0001'
    ) as id`,
    [artist, checksum],
  );
  const coverKey = await one(client, "select object_key as id from public.acc_upload_intents where id = $1", [coverIntent]);
  assert.equal(coverKey, `artists/${artist}/${coverIntent}.webp`);
  const secondCover = await one(
    client,
    "select public.acc_create_upload_intent('cover', 'artist', $1::uuid, 'image/png', 800, $2, 'cover-intent-0002') as id",
    [artist, checksum],
  );
  const secondCoverKey = await one(client, "select object_key as id from public.acc_upload_intents where id = $1", [secondCover]);
  assert.equal(secondCoverKey, `artists/${artist}/${secondCover}.webp`);
  assert.notEqual(coverKey, secondCoverKey);
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
  assert.equal(storedKey, `songs/${song}/${recording}.mp3`);
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
    /not in this catalogue|not available/,
  );

  await assumeRole(client, "service_role");
  await client.query(
    "update public.acc_storage_connections set health_status = 'unknown' where creator_id = $1",
    [creatorA],
  );
  await expectError(
    client,
    `select public.acc_write_verified_media(
      $1::uuid, $2::uuid, $3, 1200, 'audio/mpeg', null, 'creator-audio', 180000, $3, 1200
    )`,
    [creatorA, intent, checksum],
    /storage is not ready/,
  );
  await client.query(
    "update public.acc_storage_connections set health_status = 'healthy' where creator_id = $1",
    [creatorA],
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
  await assumeRole(client, "service_role");
  const queuedBeforeRecovery = await one(
    client,
    "select count(*)::int as id from public.acc_storage_deletions where creator_id = $1",
    [creatorA],
  );
  await assumeRole(client, "authenticated", userA);
  assert.equal(queuedBeforeRecovery, 0);
  await client.query("select public.acc_retire_replaced_audio($1)", [replacement]);
  await assumeRole(client, "service_role");
  assert.equal(
    await one(
      client,
      "select count(*)::int as id from public.acc_storage_deletions where creator_id = $1 and object_key = $2 and bucket_name = 'creator-audio'",
      [creatorA, `songs/${song}/${recording}.mp3`],
    ),
    1,
  );
  assert.equal(
    await one(
      client,
      "select count(*)::int as id from public.acc_storage_deletions where creator_id = $1 and object_key = $2",
      [creatorA, `songs/${song}/${replacement}.mp3`],
    ),
    0,
  );
  await client.query("delete from public.acc_storage_deletions where creator_id = $1", [creatorA]);
  await client.query(
    `with cfg as (select set_config('acc.media_finalize', 'on', true) as ready)
     update public.acc_media
     set is_current = true
     where recording_id = $1
       and (select ready from cfg) = 'on'`,
    [recording],
  );
  await assumeRole(client, "authenticated", userA);
  await client.query("select public.acc_recover_obsolete_audio($1)", [creatorA]);
  await assumeRole(client, "service_role");
  const queuedOldAudio = await one(
    client,
    "select count(*)::int as id from public.acc_storage_deletions where creator_id = $1 and object_key = $2 and bucket_name = 'creator-audio'",
    [creatorA, `songs/${song}/${recording}.mp3`],
  );
  assert.equal(queuedOldAudio, 1);
  assert.equal(
    await one(client, "select count(*)::int as id from public.acc_media where recording_id = $1 and is_current", [recording]),
    0,
  );
  assert.equal(
    await one(client, "select count(*)::int as id from public.acc_media where recording_id = $1 and is_current", [replacement]),
    1,
  );
  await assumeRole(client, "service_role");
  await client.query(
    `insert into public.acc_storage_deletions (creator_id, bucket_name, object_key)
     values ($1, 'creator-audio', $2), ($1, 'other-bucket-name', $3)`,
    [creatorA, `songs/${song}/${replacement}.mp3`, `songs/${song}/${recording}.mp3`],
  );
  const claimed = await client.query("select object_key from public.acc_claim_storage_deletions($1)", [creatorA]);
  const claimedKeys = claimed.rows.map((row) => row.object_key);
  assert.equal(claimedKeys.includes(`songs/${song}/${replacement}.mp3`), false);
  assert.equal(claimedKeys.includes(`songs/${song}/${recording}.mp3`), true);
  assert.equal(
    await one(
      client,
      "select count(*)::int as id from public.acc_storage_deletions where creator_id = $1 and bucket_name = 'creator-audio' and object_key = $2",
      [creatorA, `songs/${song}/${replacement}.mp3`],
    ),
    0,
  );
  assert.equal(
    await one(
      client,
      "select count(*)::int as id from public.acc_storage_deletions where creator_id = $1 and bucket_name = 'other-bucket-name'",
      [creatorA],
    ),
    1,
  );
  await expectError(
    client,
    "select public.acc_queue_storage_deletion($1, 'creator-audio', $2, 'do not delete current audio')",
    [creatorA, `songs/${song}/${replacement}.mp3`],
    /current media cannot be queued/,
  );
  await assumeRole(client, "authenticated", userA);

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
