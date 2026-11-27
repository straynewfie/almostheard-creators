# Almost Heard Player and private creator library

Private playback is a membership benefit; public playback is an earned achievement. Introduce private access before promotions and governance.

## Pairing
Creator opens dashboard, selects Connect a Player, generates temporary single-use code, enters it in player settings. Exchange code for scoped revocable device credentials, securely stored. Dashboard lists and revokes devices. No account password or R2 credentials entered in player. Device limits, code expiry and credential lifetime TBD.

## My Music
Connected creator can browse their own published songs, artists and releases regardless of promotion status, and use personal playlists and queues. Private library is not public discovery. Draft playback remains undecided. Public player contains Originals and promoted guest recordings; distinguish catalogue classification and avoid duplicate identities for promoted recordings also present in My Music.

## Cancellation
Immediately revoke private connections and authorization server-side; remove private playback access even via saved playlists and queues. Retention of metadata does not extend access. Promoted songs follow public retention rules. Reactivation requires pairing again. Already buffered/downloaded audio cannot reliably be revoked instantly; design caching and authorization accordingly.

## Analytics
Report authenticated playback context so server identifies self-listening by ownership, whether played privately or publicly. Apply reduced promotion weight and anti-abuse controls (see 06). Private access alone does not confer public promotion.

## Dependencies
Core player must have reliable sequential playback, queues and catalogue sync. Coordinate API contracts with Creators. Public guest catalogue integration can follow private access. Exact UI, offline behavior and synchronization policies TBD.
