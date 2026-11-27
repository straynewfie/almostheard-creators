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
Any replacement of published audio starts over: new recording identity, zero plays/likes/endorsements, new publication date, lost promotion and eligibility, consumes publication quota. No remaster exception. Permanent warning and explicit confirmation in Music Manager. Old favourites and playlists must not silently substitute the new recording. Preserve audit history separately; detect external storage changes. Metadata-only corrections are distinct from audio replacement.
