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

## New migration, review then apply

`supabase/migrations/20261127210000_acc_storage_onboarding.sql` is not applied. Apply it on the shared project when you are ready to test storage setup. Do not edit the five applied files, and do not run them again.

The new object-key check is `NOT VALID`. Do not validate it. A finalized row may still use an older key, and that row is left as stored. If the file fails because an existing pending upload still uses an older object key, stop and report that. Do not delete those rows as part of this step.

Until this file is applied, the storage screen reports that the database update is waiting. Catalogue editing continues to work.

## Private Cloudflare OAuth client

Do this once, on the Almost Heard Cloudflare account. Leave the client private. Do not create a creator bucket. The app creates the bucket during the test.

1. Open [https://dash.cloudflare.com](https://dash.cloudflare.com) and sign in as a member of the Almost Heard account.
2. Select the Almost Heard account.
3. Open **Manage Account**, then **OAuth clients**.
4. Select **Create**.
5. Use these values:
   - Client name: `Almost Heard Creators`
   - Response type: `code`
   - Grant type: `authorization_code` only. Do not enable a refresh token.
   - Token endpoint auth method: `client_secret_post`
   - Redirect URL: `http://localhost:3000/auth/cloudflare/callback`
6. Do not add `https://creators.almostheard.ca/auth/cloudflare/callback`. That host is still the static Coming Soon Worker. It has no OAuth callback. Adding it does not test the app and can send the code to the public site.
7. If the form rejects `http://localhost:3000`, stop and report that. Do not deploy the Next app over the Coming Soon Worker to get an HTTPS callback.
8. On the scope step, select **Workers R2 Storage Write** only. The app requests the scope id `workers-r2.write`. If the dashboard shows a different id for that same permission, put that id in `CREATORS_CLOUDFLARE_OAUTH_SCOPE`. Do not add **API Tokens Write**, `offline_access`, or any scope whose name contains "token".
9. Do not set a client URL, logo, or DNS TXT record. Do not change the client from private to public. Public cannot be undone.
10. Create the client. Copy the client id and client secret into `.env.local`. Never commit them.

```text
CREATORS_CLOUDFLARE_OAUTH_CLIENT_ID=
CREATORS_CLOUDFLARE_OAUTH_CLIENT_SECRET=
```

`CREATORS_CLOUDFLARE_OAUTH_SCOPE` stays empty unless step 8 requires the dashboard's exact scope id.

## Local test without replacing the Coming Soon site

The public site and the Next app are separate. The Worker in `wrangler.jsonc` serves `public/` at `creators.almostheard.ca`. The OAuth test uses the Next development server and does not deploy that Worker.

1. Apply the new migration.
2. Confirm `.env.local` has the Supabase values, the service-role key, the credential master key, and the two OAuth values above.
3. From this repository, run `npm.cmd run dev`.
4. Open `http://localhost:3000` and sign in as an active creator. The Cloudflare user who approves the consent screen must be a member of the Almost Heard account, because a private client can only be authorized by that account.
5. Open **Set up storage**. Do not create a bucket in the Cloudflare dashboard.
6. Choose **Continue with Cloudflare**, approve the consent screen, and select the Almost Heard account.
7. The app should create a bucket named `almost-heard-` plus twelve characters, set browser upload rules, and then either ask for **Confirm browser upload** or pause.
8. If it pauses because a lasting key could not be created, leave the client unchanged and use the permission note below. Do not add a scope during the same sitting.
9. After a key exists, confirm the browser upload. Only then should storage become healthy and return you to the page that started setup.
10. Revoke the OAuth grant from the Cloudflare profile page and retry a catalogue upload. The stored bucket key should still work. That result is not confirmed until this test is done.

## If a lasting key cannot be created

The app asks only for Workers R2 Storage Write. Creating a permanent S3 key is a user API token. Cloudflare's token API documents a different permission, **API Tokens Write**. That permission is not requested.

What it would allow: creating, listing, and revoking API tokens for the user who approved the consent screen. A token policy can be limited to one bucket, but the permission itself is not limited to R2. A stolen client secret plus this scope could create tokens in that user's account.

Alternative that does not add the scope: after the pause, approve a one-time screen where the creator pastes an Object Read & Write key for the bucket the app already named. That screen is not built. It needs its own approval.

Do not enable either option until the private test shows the refusal and you choose one.

## Required before uploads work

1. Set `SUPABASE_SERVICE_ROLE_KEY` only on the server.
2. Set `CREATORS_CREDENTIAL_MASTER_KEY` to a new 32-byte base64 key, and `CREATORS_CREDENTIAL_KEY_VERSION` to `1`.
3. Apply the new storage migration and complete the OAuth test above. Do not create the creator bucket by hand.
4. Keep the public base URL empty until public delivery is approved. A public custom domain does not make a prefix private.

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
