# Progress

Updated November 27, 2026. Issues stay open. Nothing was deployed, and no production database or bucket was changed.

## Completed in the repository

- Next.js application shell, mission page, auth screens, and responsive dashboard navigation. Issues #15 and #18.
- Supabase SSR session refresh, registration, login, logout, email callback, and password reset. New profiles are inactive. Issue #16.
- Migrations for creators, storage secrets, catalogue, recordings, media, upload intents, RLS, and transactional track and recording operations. Issues #16–#20.
- Artist, release, and song editors, including placeholders, reorder, existing-song attach, and return to a release. Issues #18–#20.
- Encrypted R2 connection, presigned upload, magic-byte and checksum checks, revisioned artwork, and recording replacement that does not overwrite the previous object. Issue #17.
- Public creator routes and `/api/creators/catalogue` that return no catalogue data. Issue #5 is not implemented; the routes fail closed on purpose.
- Automated tests for validation, membership, recordings, tracks, encryption, upload safety, and migration text. Issue #21 is only partly covered.

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
- Featured credits and band rosters.
- Production deployment.

## Verification

Executed locally on November 27, 2026, without Supabase or R2 credentials:

- `npm.cmd run lint` passed.
- `npm.cmd run typecheck` passed.
- `npm.cmd test` passed, 18 tests.
- `npm.cmd run build` passed. The mission page is static. Dashboard, auth, and media routes are dynamic.

Not executed: migration replay on Postgres, two real auth users, browser login, or an upload to R2. Those need the isolated project in `docs/implementation/OWNER-ACTIONS.md`. The migration test checks SQL text only, including the absence of a genre column.

## Next steps

1. Owner provides an isolated Supabase project and applies the four migrations.
2. Activate one test creator with the operator script and walk through artist, release, song, and upload.
3. Add a live two-tenant RLS test once that database exists.
4. Revisit genres only after the website catalogue is settled.
5. Do not enable public reads until legal and launch gates are approved.
