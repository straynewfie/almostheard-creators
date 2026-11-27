# Owner actions

No secret values belong in this file.

## Do not do these yet

- Deploy either Worker.
- Apply migrations to the Originals Supabase project or any production database.
- Write to an existing production R2 bucket.
- Set `CREATORS_ALLOW_PUBLICATION` outside a private test.
- Treat signup as an active subscription.

## Required before the private dashboard works

1. Create an isolated Supabase project, or an isolated schema the owner has explicitly approved. Placement is still gate A.
2. Apply `supabase/migrations` in filename order.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` or the future Worker secrets.
4. Confirm email in the Supabase auth settings. Add the local and future site URLs to the redirect allow list: `/auth/callback` and `/reset-password`.
5. After a verified user exists, run `npx.cmd tsx scripts/activate-creator.ts <email>` with `SUPABASE_SERVICE_ROLE_KEY` present in the environment. Do not commit that key.

## Required before uploads work

1. Set `SUPABASE_SERVICE_ROLE_KEY` only on the server.
2. Set `CREATORS_CREDENTIAL_MASTER_KEY` to a new 32-byte base64 key, and `CREATORS_CREDENTIAL_KEY_VERSION` to `1`.
3. Have the creator create their own R2 bucket and a bucket-scoped token. Enter those in Storage. The app derives `https://{accountId}.r2.cloudflarestorage.com` and does not accept another signing host.
4. Restrict bucket CORS to the dashboard origin and the methods `PUT`, `GET`, `HEAD`, and `DELETE`.
5. Keep the public base URL empty until public delivery is approved. A public custom domain does not make a prefix private.

## Business decisions still required

- Where production data lives, and whether signup is invite-only.
- Billing provider, prices, and reactivation charges. The 60-day metadata retention rule is already agreed.
- Numeric catalogue quotas. They are not coded.
- Public media topology, maximum file sizes, and cache purge.
- Guest release types, including whether Hatty exists for creators.
- Slug and handle changes, featured credits, band rosters, and streaming-link fields.
- Whether a ready release publishes its songs atomically.
- Legal, moderation, and public-launch approval before any anonymous read policy.
- Player pairing expiry and device limits.

## Manual checks after infrastructure exists

- Two real users cannot read or attach each other's rows through the Supabase API.
- An inactive user can read metadata and cannot upload or preview.
- A cancelled user loses preview immediately and loses metadata reads after 60 days.
- Replacing published audio creates a new recording id and returns the song to draft.
- A failed upload leaves the previous audio object in place.
- Direct publication RPC as `authenticated` is denied.
