# Dashboard, Music Manager and public site

Private dashboard sections: Overview, Music Manager, Analytics, Storage, Account. Public site: Home, Creators, Artists, Releases, Songs, web player. No fictional Canon or behind-the-scenes features for guests.

## Artists

As of November 27, 2026, every Creators artist is an independent catalogue entity. The editor uses one checkbox, Band / group. Unchecked stores `individual`. Checked stores `band`. Those remain the only `artist_kind` values. Creators does not manage band members, individual-to-band links, or Canon-style character relationships. The `standalone_artist` column was removed by `20261127200000_acc_drop_standalone_artist.sql`, which is applied on the shared project.

## Genre catalogue dependency

As of November 27, 2026, genre management is being designed in the Almost Heard website and Music Manager. Creators must not build a separate genre list, database column, management screen, or artist/song genre assignment. When the website genre catalogue, conventions, and architecture are established, Creators should reuse that system. Other catalogue work continues without genres.

## Integrated editing
Artist, release and song forms manage metadata and artwork/audio directly. Convert cover art to WebP. Release editor supports existing songs or new placeholders; Add/Edit Song returns to the release workflow. Keep release in draft until all required tracks are complete. Store audio once, not duplicated per release. Validate quotas, media readiness and ownership before publishing.

## Public identity
Proposed personalized URLs: creators.almostheard.ca/<creator-handle>/<artist-slug>. Stable internal IDs independent of display names. Provide external streaming links where available, sharing tools and promotional cards/badges as features mature. Exact URL and slug-change policy TBD.

## Recording replacement
Any replacement of published audio starts over. It creates a new submission identity, resets plays, likes, endorsements, rankings, promotion status, and publication, and requires republication. A new publication date is assigned when it is republished. Publication allowances are consumed again only under the approved publication policy, which is still open. No remaster exception. The creator must confirm the replacement. Favourites and playlists must not silently follow the new submission. Song metadata and release associations stay. The previous audio file is deleted after the new file validates. Audit history may remain without the audio bytes. There is no creator-facing recording history or restore. The app deletes the previous audio file after the new submission is current. The live bucket test has not been run. See `docs/implementation/STORAGE-ARCHITECTURE.md`.
