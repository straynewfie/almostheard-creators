# Owner actions

No secret values belong in this file.

Creators uses the existing Almost Heard Supabase project. It does not use a separate database. All five migrations were applied there on November 27, 2026.

## Do not do these yet

- Run any of the five migration files again.
- Deploy either Worker.
- Write to an existing production R2 bucket.
- Set `CREATORS_ALLOW_PUBLICATION` outside a private test.
- Treat signup as an active subscription.
- Delete an `auth.users` row that already has an `acc_creators` profile. The foreign key is `ON DELETE RESTRICT`, and catalogue hard deletes are blocked.

## Migration order

These files were applied on the existing project, in this order, on November 27, 2026:

1. `supabase/migrations/20261127190000_acc_identity.sql`
2. `supabase/migrations/20261127191000_acc_storage_audit_uploads.sql`
3. `supabase/migrations/20261127192000_acc_catalogue.sql`
4. `supabase/migrations/20261127193000_acc_operations.sql`
5. `supabase/migrations/20261127200000_acc_drop_standalone_artist.sql`

Do not run them again. The fifth file drops `acc_artists.standalone_artist` and its check constraint. The live artist table no longer has that column, and the application does not read or write it.

There is no down migration. Do not edit these files. A read-only check matched the live tables, columns, and callable functions to these files, and confirmed that `standalone_artist` is gone. Supabase does not store the applied SQL, so a byte-for-byte comparison was not possible.

The files expect Supabase's existing `anon`, `authenticated`, and `service_role` roles and the existing `auth.users` table. They create only `acc_` tables, `acc_` functions, and the `acc_private` schema.

## Required after the migrations, before the private dashboard works

1. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` or the future Worker secrets. Use the existing project's URL and publishable key.
2. Confirm email in the Supabase auth settings. Add the local and future Creators site URLs to the redirect allow list: `/auth/callback` and `/reset-password`.
3. After a verified user exists, activate that one creator. The script reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment or from `.env.local`. Do not pass or commit the key.

```text
npx.cmd tsx scripts/activate-creator.ts creator@example.com
npx.cmd tsx scripts/activate-creator.ts --id <creator-uuid> active
```

It calls `acc_set_membership_state` for that creator only, with `p_test_reactivation` false unless `--test-reactivation` is passed. Signup itself leaves the creator `inactive`. The email lookup checks the first 200 auth users.

## Required before uploads work

1. Set `SUPABASE_SERVICE_ROLE_KEY` only on the server.
2. Set `CREATORS_CREDENTIAL_MASTER_KEY` to a new 32-byte base64 key, and `CREATORS_CREDENTIAL_KEY_VERSION` to `1`.
3. Have the creator create their own R2 bucket and a bucket-scoped token. Enter those in Storage. The app derives `https://{accountId}.r2.cloudflarestorage.com` and does not accept another signing host.
4. Restrict bucket CORS to the dashboard origin and the methods `PUT`, `GET`, `HEAD`, and `DELETE`.
5. Keep the public base URL empty until public delivery is approved. A public custom domain does not make a prefix private.

## Business decisions still required

- Whether signup is invite-only. The database project is no longer an open choice.
- Billing provider, prices, and reactivation charges. The 60-day metadata retention rule is already agreed.
- Numeric catalogue quotas. They are not coded.
- Public media topology, maximum file sizes, and cache purge.
- Guest release types, including whether Hatty exists for creators.
- Slug and handle changes, featured credits, and streaming-link fields. Band rosters are out of scope.
- Whether a ready release publishes its songs atomically.
- Legal, moderation, and public-launch approval before any anonymous read policy.
- Player pairing expiry and device limits.
- A reviewed procedure for deleting an authentication user who also has a creator profile.

## Manual checks after the migrations are applied

- Two real users cannot read or attach each other's rows through the Supabase API.
- An inactive user can read metadata and cannot upload or preview.
- A cancelled user loses preview immediately and loses metadata reads after 60 days.
- Replacing published audio creates a new recording id, keeps the previous song duration until that recording is promoted, and then returns the song to draft.
- A failed upload leaves the previous audio object in place.
- Direct publication and media finalization RPCs as `authenticated` are denied.
