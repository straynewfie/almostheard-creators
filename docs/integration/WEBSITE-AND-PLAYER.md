# Website and player integration

Observations from Originals `9360529` and the player `6058a29`. No changes were made in those repositories.

## Required before a shared catalogue

### 1. Source identity on every playable item

- Target: player and website.
- Existing implementation: player `Song.id` is the website song id. Audio is an absolute `audioUrl`. Types live in `almost-heard-player/src/catalog/types.ts`. The website public DTO is `PublicMusicSong` in `almostheard/src/domains/music/types.ts`.
- Limitation: a creator recording id is the playback identity. Using the website song id would collapse creator audio into Originals, and replacing audio would silently retarget old queues.
- Recommended change: add a catalogue source, for example `originals` or `creator`, plus `creatorId` and `recordingId`, on song and queue records.
- Reason: planning 04 and 05 say favourites and playlists must not substitute a new recording.
- Benefit: private libraries and the public player can share a queue model without mixing tenants.
- Dependencies: public catalogue rules and player issue for private libraries.
- Compatibility: existing snapshots have no source field. They should be treated as Originals.
- Owner approval: yes.
- Suggested issue: "Add catalogue source and recording identity to the player snapshot." Acceptance: an Originals song and a creator recording with different ids can both be queued; a retired recording id does not resolve to the current recording.

### 2. Do not point the player at Creators yet

- Target: player `src/catalog/remote.ts` and `src/catalog/revision.ts`, which request `/api/music/{collection}` and `/api/music/revision` on the website origin.
- Existing implementation: one base URL and four collections, including editorial playlists.
- Limitation: Creators has no public read API. `/api/creators/catalogue` returns 403 and reads no rows.
- Recommended change: keep the player on the website origin until a creator contract exists. Do not reuse `/api/music/*` on the creators host.
- Reason: anonymous policies are intentionally absent.
- Benefit: private creator audio cannot leak through the public player sync.
- Dependencies: legal launch and a source field.
- Compatibility: none if the player base URL stays on the website.
- Owner approval: yes before any base-URL change.
- Suggested issue: "Keep player catalogue sync on Originals until creator publication is approved." Acceptance: the player does not call creators.almostheard.ca for catalogue JSON.

### 3. Website public API needs a creator boundary

- Target: website `src/domains/music/data/public-catalog.ts` and `src/domains/music/api`.
- Existing implementation: public queries assume the Originals catalogue and Canon enrichment.
- Limitation: creator rows must not be unioned into those queries by id alone.
- Recommended change: when creator publication is approved, expose creator records through an explicit source filter rather than inserting them into `dcm_music_*` tables.
- Reason: tenant isolation and the Canon boundary.
- Benefit: Originals pages stay stable while creator pages can be added.
- Dependencies: public eligibility, media URLs, and moderation.
- Compatibility: current website clients ignore unknown fields, but a new required field would break them.
- Owner approval: yes.
- Suggested issue: "Define a creator-source public DTO separate from the Originals catalogue." Acceptance: creator ids are not returned by the current Originals list endpoints.

## Optional improvements

### Shared slug and visibility helpers

- Target: a future shared package, not a copy into either app.
- Existing implementation: `almostheard/src/domains/music/validation.ts` (`normalizeMusicSlug`, 120-character slug). Creators reimplemented that rule locally and recorded the commit.
- Opportunity: one package for slug, date, and visibility parsing.
- Recommended change: extract only pure helpers after both apps are stable.
- Benefit: less drift.
- Dependencies: a package location the owner accepts.
- Compatibility: low if the functions stay pure.
- Owner approval: yes before a new package.
- Suggested issue: "Extract shared catalogue validation." Acceptance: both apps import the same slug tests and Canon-only helpers stay in Originals.

### Genre catalogue

- Target: website Music Manager first, Creators second.
- Existing implementation: Originals curated list in `src/domains/music/genres.ts`. Creators has no genre column.
- Opportunity: Creators should reference the website genre ids once they exist.
- Recommended change: finish the website model, then add a creator assignment that stores those ids.
- Benefit: one vocabulary for search and the player.
- Dependencies: the website genre design.
- Compatibility: adding a column later is easier than migrating an invented creator list.
- Owner approval: the website design is in progress; Creators work waits.
- Suggested issue: "Reuse website genres in Creators." Acceptance: Creators stores website genre ids and does not invent labels.

### Signed creator media versus public URLs

- Target: player playback and website audio delivery.
- Existing implementation: the player plays `audioUrl` directly. Originals uses its own R2 delivery. Creators signs a 120-second GET for the active member only.
- Limitation: the player cannot hold a reusable public URL for private creator audio.
- Recommended change: a playback grant that returns a short-lived URL for one recording id after device authorization.
- Benefit: private listening without giving the player R2 keys.
- Dependencies: pairing issue #13. Expiry and device limits are undecided.
- Compatibility: public Originals URLs can stay absolute.
- Owner approval: yes.
- Suggested issue: "Specify the private recording playback grant." Acceptance: the player never receives R2 credentials; a cancelled creator's grant fails immediately.

## Creators behavior today

The creators app does not sync with the website or the player. Catalogue edits stay in `acc_*` tables. Public routes do not reveal whether a handle exists.
