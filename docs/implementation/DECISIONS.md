# Implementation decisions

Recorded during the November 27, 2026 foundation. These are technical choices, not new business policy.

## Reference versions

Originals was read at `9360529` (`C:\Users\Geoff\Projects\almost-heard\almostheard`). The player was read at `6058a29`. Neither repository was modified.

Reused ideas: Next 16.2.10, React 19.2.4, Tailwind 4, Supabase SSR cookies, OpenNext middleware filename, slug rules, release-type vocabulary except Hatty, recording-kind labels, R2 S3 client settings (`region: auto`, path-style, account endpoint), and the dark Almost Heard Creators palette.

Not copied: Originals admin roles, Canon fields, the global media library, production secrets, and the Originals schema.

## Static Worker stays in place

`wrangler.jsonc` still publishes `public/` with no build. The Next.js app is developed separately. `wrangler.app.jsonc` is not the live Worker. Switching the custom domain requires an explicit owner decision.

## Membership starts inactive

`acc_ensure_creator_profile` inserts `inactive`. Signup, email verification, and login do not grant writes or media preview. Activation is `acc_set_membership_state`, executable by `service_role` only. Reactivation from `cancelled` to `active` fails unless the caller passes the test flag, because billing is unresolved. The 60-day retention window is the agreed rule from planning 02.

## Service role is narrow

Ordinary artist, release, and song edits use the signed-in user and RLS. The service role is used only to store and read encrypted R2 secrets, to write verified media, and to change membership. Those functions are not granted to `authenticated`, because a browser client could otherwise skip byte verification or publish directly.

## Genres are deferred

The website and Music Manager are defining a shared genre catalogue. Creators has no genre column, validation, or assignment control. Song metadata otherwise continues. See `docs/planning/04-Music-Manager.md`.

## Artwork revisions do not overwrite

Planning 09 proposed one `cover.webp` per entity. This foundation writes `artists|releases|songs/{id}/cover/{revision}.webp` and flips `is_current` only after verification. A failed replacement leaves the previous object. Audio uses `recordings/{recordingId}/audio.mp3`, so a new recording never overwrites the previous file.

## Public catalogue fails closed

There is no anonymous read policy. `/creators` and `/api/creators/catalogue` do not query the database. Handles are not probed. Publication to `public` is rejected unless `acc.allow_publication` is set inside `acc_publish_song`, which only `service_role` can call, and the app calls it only when `CREATORS_ALLOW_PUBLICATION=1`.

## Release types

The creator check constraint is `album`, `ep`, `single`, and `compilation`. Hatty remains an Originals value until gate E confirms guest release options.

## Quotas and credits

Proposed prices and catalogue allowances are not enforced. Featured credits, band membership, and streaming-link fields are omitted until their contracts are approved. DistroKid is a boolean flag only.

## Verification limits

The SQL contract test reads migration text. It does not prove a live Postgres policy. Authenticated UI flows were not executed against a real Supabase project in this session. Domain rules, encryption, upload compensation, and the production `next build` are executed locally.
