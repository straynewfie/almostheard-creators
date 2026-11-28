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

## Shared Supabase project

Creators uses the existing Almost Heard Supabase project, not a second database. The decision was recorded on November 27, 2026. Tables and functions are prefixed `acc_`, with helper functions in `acc_private`, so they sit beside `dcm_`, `dcf_`, `dcs_`, `admin_profiles`, and `provider_profiles`. Both apps reference `auth.users`. Creators does not replace website functions, policies, or triggers. All five migrations were applied to that project on November 27, 2026.

## Artists are independent

A creator artist is one catalogue row. The Band / group checkbox writes the existing `artist_kind` values `band` and `individual`. There is no band roster and no relationship to another artist or to Canon. The `standalone_artist` column only existed to force individuals to stay standalone and to let bands opt out. Nothing else references it. `supabase/migrations/20261127200000_acc_drop_standalone_artist.sql` dropped the check constraint and the column. That file is applied. The live `acc_artists` table has no `standalone_artist` column.

## Uploads follow a verified storage connection

Artwork and audio controls render only when the creator's R2 connection has `health_status = healthy`. Saving credentials without a successful connection test leaves the status `unknown`, which is not enough. The upload actions call the same check before creating an intent or finalizing a file.

## Genres are deferred

The website and Music Manager are defining a shared genre catalogue. Creators has no genre column, validation, or assignment control. Song metadata otherwise continues. See `docs/planning/04-Music-Manager.md`.

## Artwork and audio paths

Artwork keys are `artists|releases|songs/{id}.webp`. The revision is `?v=` on `/api/media/{id}`, not on the signed R2 URL. Audio keys are `songs/{songId}/{submissionId}.mp3`. The previous audio object is deleted after the new submission is current, or queued when the delete fails. `acc_recordings` remains the submission id, not a playable history. Private playback URLs last 60 minutes and are renewed by requesting the media route again. The database change is `supabase/migrations/20261127210000_acc_storage_onboarding.sql`. It is not applied to the shared project.

## Public catalogue fails closed

There is no anonymous read policy. `/creators` and `/api/creators/catalogue` do not query the database. Handles are not probed. Publication to `public` is rejected unless `acc.allow_publication` is set inside `acc_publish_song`, which only `service_role` can call, and the app calls it only when `CREATORS_ALLOW_PUBLICATION=1`.

## Release types

The creator check constraint is `album`, `ep`, `single`, and `compilation`. Hatty remains an Originals value until gate E confirms guest release options.

## Quotas and credits

Proposed prices and catalogue allowances are not enforced. Featured credits and streaming-link fields are omitted until their contracts are approved. Band membership is not a Creators feature. DistroKid is a boolean flag only.

## Upload and duration integrity

Artwork object keys are immutable: `artists/{artistId}/{uploadId}.webp`, `releases/{releaseId}/{uploadId}.webp`, and `songs/{songId}/{uploadId}.webp`. The upload id is the upload intent id. A replacement stores a new object, switches the current media row, and queues the previous object. It does not change the song, its submission, publication, or engagement. There is no artwork backup or version history. Audio stays `songs/{songId}/{submissionId}.mp3` and still deletes the previous file only after the new submission is current.

Authenticated clients cannot insert `acc_upload_intents`. `acc_create_upload_intent` checks the active membership, parent, MIME type, size, and checksum, then the database assigns the object key, staging key, and a 15-minute expiry. `acc_write_verified_media` runs only as `service_role`, requires the creator to still be active, and requires the measured source checksum and size to match that intent. Audio must also match the stored checksum, size, and `audio/mpeg` type. Artwork is converted to WebP, so the stored checksum can differ; the database still checks the source against the intent and requires the stored object to be WebP inside the technical size bound. A replacement recording stores its duration on the recording. The song duration changes when that recording becomes current.

## Verification limits

The migration files were applied in order on an in-process PostgreSQL database and the security test covered two tenants, inactive membership, upload intents, finalization, and recording replacement. That run did not use the live Supabase project. A later read-only check compared the live shared-project schema with the five migration files: all 12 `acc_` tables and their columns match, the callable `acc_` functions are exposed, and `standalone_artist` is absent. Supabase does not keep the applied SQL text, so a byte-for-byte comparison was not possible. Authenticated browser flows were not executed against Supabase or R2. Domain rules, encryption, upload compensation, and the production `next build` from the foundation commit were executed locally. Lint, typecheck, and the test suite were run again after this review.
