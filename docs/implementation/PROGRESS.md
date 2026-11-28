# Progress

Updated November 27, 2026. Issues stay open. Nothing was deployed, and no production bucket was changed. All five Creators migrations are applied on the shared Almost Heard Supabase project.

## Completed in the repository

- Next.js application shell, mission page, auth screens, and responsive dashboard navigation. Issues #15 and #18.
- Supabase SSR session refresh, registration, login, logout, email callback, and password reset. New profiles are inactive. Issue #16.
- Migrations for creators, storage secrets, catalogue, recordings, media, upload intents, RLS, and transactional track and recording operations. Issues #16–#20.
- Artist, release, and song editors, including placeholders, reorder, existing-song attach, and return to a release. Issues #18–#20.
- Artist editor uses a Band / group checkbox. Unchecked stores `individual` and checked stores `band`. There is no standalone flag, band roster, or Canon relationship.
- Artwork and audio selectors stay hidden until the creator's R2 connection is healthy. Upload actions enforce the same check.
- Guided storage setup, private Cloudflare OAuth, browser verification, and single-current-audio replacement are implemented. The OAuth client was not created, no bucket was created, and `20261127210000_acc_storage_onboarding.sql` is not applied. See `docs/implementation/STORAGE-ARCHITECTURE.md`.
- Dashboard statistics, header name, sidebar current page, catalogue create buttons, form actions, and a confirmed danger zone for deletion.
- Encrypted R2 connection, presigned upload, magic-byte and checksum checks, immutable artwork keys, and audio replacement that deletes the previous object after the new submission is current. Issue #17.
- Public creator routes and `/api/creators/catalogue` that return no catalogue data. Issue #5 is not implemented; the routes fail closed on purpose.
- Automated tests for validation, membership, recordings, tracks, encryption, upload safety, migration text, and database tenant, membership, and catalogue behaviour. Issue #21 is only partly covered until the same checks run against the live project.

## Partially completed

- Publication controls render the blocker and stay disabled. The test-only service-role path exists and is off by default.
- Media upload UI is implemented. It was not run against a real R2 bucket.
- Dashboard pages require a configured Supabase project before data can be saved. Local pages render the setup state without those secrets.
- Analytics is an explicit empty page. No metrics are fabricated.
- Player pairing, billing, promotions, governance, credits, and streaming links are not built.

## Not implemented

- Genre assignment. Waiting on the website genre catalogue. See planning 04.
- Anonymous public catalogue and web playback.
- Device pairing and private player access.
- Quota enforcement.
- Featured credits. Band rosters are out of scope.
- Production deployment.

## Verification

Local checks on November 27, 2026, after the storage onboarding foundation:

- `npm.cmd run lint` passed.
- `npm.cmd run typecheck` passed.
- `npm.cmd test` passed, 29 tests. The database test applies all six SQL files on an in-process PostgreSQL database. The sixth file is not applied to the shared project.
- `npm.cmd run build` passed.

Completed on the shared Almost Heard Supabase project, as verified with the owner:

- All five migrations applied successfully, including `20261127200000_acc_drop_standalone_artist.sql`. A read-only check matched the live tables, columns, and callable `acc_` functions to those files. The live `acc_artists` table has no `standalone_artist` column. Supabase does not store the applied SQL, so a byte-for-byte comparison was not possible.
- All 12 `acc_` tables exist with RLS enabled.
- Existing Almost Heard account authentication works.
- Automatic creator profile creation works.
- Membership defaults to inactive.
- Direct membership modification is blocked.
- Operator-controlled activation works. Creator `7dfb1b3f-66fd-4ea1-b055-2c3814a5684c` was changed from inactive to active through `acc_set_membership_state`.
- The dashboard is accessible for that active creator.

No upload was run against a real R2 bucket. The agent browser reached the sign-in page and did not have a dashboard session, so the refined layout was not clicked through in that browser. The development server returned 200 for an existing signed-in artist editor while these changes compiled.

## Next steps

1. Apply `20261127210000_acc_storage_onboarding.sql`, create the private OAuth client, and run setup from the app. Do not create the bucket by hand.
2. Repeat the two-tenant checks through the Supabase API on that project.
3. Revisit genres only after the website catalogue is settled.
4. Do not enable public reads until legal and launch gates are approved.
