# Creator storage architecture

Recorded November 27, 2026. The guided onboarding foundation, private OAuth flow, verification gates, and single-audio replacement are implemented in the app. No Cloudflare resource was created, the OAuth client was not made public, and the new migration has not been applied to the shared database. Confirmed Cloudflare behavior and live-unverified assumptions stay in separate sections below.

The canonical product rules are:

- The creator owns the Cloudflare account, the R2 bucket, and the media files.
- Almost Heard stores the catalogue and the media references.
- Catalogue registration and editing work without storage.
- Artwork and audio uploads require a verified healthy connection.
- Each song has one current audio file. Replacing it is a new submission. The previous file is deleted after the new file is valid.
- Clients never receive R2 credentials or build object keys themselves.

## Current implementation

`/dashboard/storage` is the guided setup screen. It explains ownership and Standard R2 cost, then starts a private OAuth authorization. The technical key form is no longer the primary screen. Catalogue editing stays available. Upload controls stay hidden until health is `healthy`, and the upload actions repeat that check.

The connect route stores a random state, the signed-in user, and the return path in http-only cookies. The callback rejects a missing or mismatched state, a different user, and any redirect origin other than local development, `https://creators.almostheard.ca`, or an extra https origin in `CREATORS_ALLOWED_ORIGINS`. The access token is used for that setup request and is not kept, except for a ten-minute encrypted grant when the consent covers more than one account. It is not used as an S3 key.

Bucket creation, CORS, and a bucket-scoped key are requested with the R2 write scope only. If Cloudflare refuses the key, the connection is saved as paused and is not marked healthy. The screen does not ask the creator to paste a key. API Tokens Write is not requested.

Server verification puts, reads, copies, and deletes a `healthcheck/{id}.txt` object. The browser check then uploads `health/{id}.txt` and the server reads and deletes it. Only that browser check sets `healthy`. A retry uses the bucket name already stored on the connection.

Audio replacement writes the new submission first. The previous object is deleted only after the new submission is current. A failed delete is queued in `acc_storage_deletions`. Artwork is stored under a new object key on every upload. The catalogue address stays `/api/media/{id}?v={revision}`. The upload confirmation says the previous audio file is deleted after the new file is verified.

## Cloudflare feasibility

Official docs checked on November 27, 2026:

- [Create an OAuth client](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/)
- [Authorize an application](https://developers.cloudflare.com/fundamentals/oauth/authorizing-an-application/)
- [List OAuth scopes](https://developers.cloudflare.com/api/resources/iam/subresources/oauth_scopes/methods/list/)
- [R2 get started](https://developers.cloudflare.com/r2/get-started/)
- [R2 authentication](https://developers.cloudflare.com/r2/api/tokens/)
- [Create bucket](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/methods/create/)
- [Set bucket CORS](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/cors/methods/update/)
- [Create a token](https://developers.cloudflare.com/api/resources/user/subresources/tokens/methods/create/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Temporary credentials](https://developers.cloudflare.com/r2/api/s3/temporary-credentials/)

### Confirmed

| Capability | Evidence |
|---|---|
| Authorization Code is the supported flow for a self-managed client. A server app uses a client secret. | OAuth client docs. Client Credentials, device code, and password grants are not supported. |
| A private client can be authorized only by members of the Cloudflare account that owns the client. | OAuth client docs. |
| A public client can be authorized by any Cloudflare user. Making it public is permanent. | OAuth client docs. |
| Public requires a client name, logo, client URL, at least one scope, and a DNS TXT record proving the client URL domain. The domain cannot be changed after verification. | OAuth client docs. |
| The consent screen lets the person choose which of their Cloudflare accounts the app may use, then shows the requested permissions. | Authorizing an application. |
| Creating a bucket accepts `Workers R2 Storage Write`. | Create Bucket API. |
| That same permission is described as creating, listing, and deleting buckets, editing bucket configuration, and reading and writing objects. | R2 authentication. |
| An R2 API token cannot be generated until R2 has been purchased on that account. The get-started guide uses the dashboard checkout. | R2 authentication and get started. |
| A permanent S3 key is an API token: the access key id is the token id, and the secret is the SHA-256 of the token value. | R2 authentication. |
| Creating a user API token accepts `API Tokens Write`, which is a different permission from R2 write. | Create Token API. |
| Object Read & Write can be limited to named buckets. Account API tokens last until revoked or until a chosen expiry. User API tokens stop working if that user is removed. | R2 authentication. |
| Temporary credentials last at most seven days and require an existing parent R2 access key. | Temporary credentials API. |
| Standard storage includes 10 GB-month, 1 million Class A operations, and 10 million Class B operations a month. Egress is free. Infrequent Access has no free tier. Deletes are free. Usage past the free allowance rounds up to the next GB-month and the next million operations. | R2 pricing. |

### Not confirmed until a private test

These are the assumptions that the private OAuth test must prove before a public client is considered.

| Question | Why it is open |
|---|---|
| The exact OAuth scope id for R2 write | The docs say scope names match API token permissions and that `GET /oauth/scopes` is the source of truth. That endpoint was not called. A third-party example uses `workers-r2.write`. That is not Cloudflare's own list. |
| Whether the R2 write scope can set CORS | The permission text includes editing bucket configuration. The CORS API page does not repeat the accepted permission name. |
| Whether the R2 write scope can create a permanent bucket-scoped token | The token API asks for `API Tokens Write`, not R2 write. The setup grant may be unable to mint the lasting key. |
| Whether a token created during OAuth still works after the OAuth grant is revoked | The design discards the setup grant. The docs do not say that a child token dies with the grant. The private test must revoke the grant and retry the object key. |
| Whether `http://localhost` is accepted as a redirect | The client docs show HTTPS examples. Loopback HTTP is documented for a different Workers OAuth library, not for Cloudflare's own authorization server. |
| Which scope lists the accounts the grant can see | The consent screen already selects the account. A follow-up account list depends on a membership or account-read scope that must be present in the scope picker. |

OAuth access tokens are bearer tokens for the Cloudflare API. They are not documented as S3 access keys. The app must not hash an OAuth access token and send it to R2.

## Onboarding

The creator clicks **Set up storage** on the dashboard or in place of an upload control. Catalogue fields stay editable. Where practical, the return address and unsaved form state stay in the browser until setup finishes.

1. **Ownership and cost.** The files stay in the creator's Cloudflare account. Almost Heard keeps the catalogue. Cloudflare may ask for a payment method before R2 can be turned on. The free monthly allowance and the rounding rule are shown in plain language. Infrequent Access is not offered.
2. **Account.** A new customer gets Cloudflare's signup link. An existing customer gets Cloudflare's login. Creators does not create the user.
3. **R2 checkout, only if needed.** If the chosen account has not purchased R2, the wizard sends the creator to the R2 overview and waits. Almost Heard never sees the card.
4. **Authorize.** One Cloudflare consent screen. The creator picks an existing account. The requested setup permission is R2 write, and nothing broader unless the private test proves a second permission is required.
5. **Configure.** Creators creates `almost-heard-` plus a short unique id, Standard class, default jurisdiction, no location hint. An existing bucket is a secondary choice. CORS allows the dashboard origin and `GET`, `PUT`, `HEAD`, and `DELETE`.
6. **Narrow the key.** Creators creates one Object Read & Write credential for that bucket, encrypts it in `acc_storage_secrets`, and does not store the setup grant or a refresh token.
7. **Verify.** The checks in the verification section must pass. Health stays `unknown` or `unhealthy` until they do.
8. **Return.** The creator lands on the artist, release, or song page that started the flow. Upload controls appear only then.

A retry reuses the bucket name already stored on the connection row. It does not create another bucket or another key unless the creator explicitly chooses a different bucket. A failed connection is not repaired by silently allocating a new bucket. Repair of CORS or permissions requires a new consent.

If the private test shows that R2 write cannot mint the object key, setup pauses. The creator is not asked to paste a key. Two later options need a separate owner approval: add API Tokens Write to the private client, or add a one-time guided paste of an Object Read & Write key for the bucket the app already named. Neither option is enabled. The scope, risk, and alternative are in `docs/implementation/OWNER-ACTIONS.md`.

## Owner configuration

The exact dashboard steps, redirect URL, environment names, and the localhost test that leaves the Coming Soon site in place are in `docs/implementation/OWNER-ACTIONS.md`. Leave the client private. Do not register `https://creators.almostheard.ca/auth/cloudflare/callback` while that host still serves the static Coming Soon site. Do not add API Tokens Write before the private test. Do not create a creator bucket by hand.

## Database

`acc_storage_connections` already stores the account id, bucket name, optional public URL, health, and the check time. `acc_storage_secrets` already stores the encrypted object key outside client grants. `acc_media` stores object references separately from the connection. `acc_recordings` remains the submission identity. `acc_upload_intents` remains the short-lived upload reservation.

No applied migration was edited. `supabase/migrations/20261127210000_acc_storage_onboarding.sql` is prepared for review and has not been applied to the shared project. It:

- Adds `onboarding_step`, a sanitized `last_error`, and `browser_verified_at` to `acc_storage_connections`.
- Adds `acc_storage_deletions`, unique on creator, bucket, and object key. Cleanup returns a row only when that bucket is the creator's healthy connection and the key is not current media. Service role only.
- Requires `health_status = 'healthy'` before a new upload intent or media finalization, including a direct database call.
- Replaces the upload key check for new rows with immutable artwork keys and `songs/{songId}/{submissionId}.mp3`. The check is `NOT VALID`, so a finalized historical key is left as stored. Pending rows that still use the previous key shape are expired and are not rewritten.
- Inserts a new current cover and queues the previous cover in one statement. Retiring the previous audio and inserting its deletion row happen in one statement. A later check queues audio that is still marked current after its submission was retired, and queues an unfinished upload whose intent has expired.

Onboarding does not write `public_base_url`. The column stays nullable. Retired `acc_recordings` rows remain as audit boundaries, with no current media row and no playable object.

Onboarding return state can live in a short-lived http-only cookie. It does not need a table.

## Object paths

Creators generates every key. The creator never types a path or an endpoint. Ids are the stable catalogue ids, so a rename does not move a file.

| Media | Key | Why the parts exist |
|---|---|---|
| Artist artwork | `artists/{artistId}/{uploadId}.webp` | The artist id groups the file. The upload id is the upload intent id and never changes. A replacement stores a new object. |
| Release artwork | `releases/{releaseId}/{uploadId}.webp` | Same rule for a release. |
| Song artwork | `songs/{songId}/{uploadId}.webp` | Same rule for a song cover. |
| Current audio | `songs/{songId}/{submissionId}.mp3` | The song id groups the file with the song. The submission id is the `acc_recordings` id. It changes on replacement so an old catalogue reference and an old signed URL do not point at the new file. |
| In-progress upload | `staging/{intentId}` | Removed after success or expiry. |
| Connection test | `health/{nonce}.txt` | Removed at the end of verification. |

Example: `artists/72062edf-9e7b-481c-96a2-55475ebba7d1/4c1e8a20-6b33-4d11-9e44-1a2b3c4d5e6f.webp` and `songs/6f0c2a40-1c0e-4a7a-9a55-0e5d2a9a7c11/b7e1c4d2-8a10-4f0e-9c33-2d6b1a0e4f88.mp3`.

These paths are not the Music Manager paths. Originals artwork uses slug folders such as `artists/{profileSlug}/profile.webp` and `music/artwork/releases/{artist}/{release}/cover.webp` on the platform bucket `almost-heard`. Originals audio uses `music/audio/{songId}/v{version}-{contentToken}.mp3` or the private prefix, and it keeps versioned objects. Creators uses creator-owned buckets and immutable ids. Both apps still meet the player through an absolute `audioUrl` and an `artworkUrl`. The player does not need the object key.

Artwork URLs stay `/api/media/{id}?v={revision}`. A replacement inserts a new media row, so the next catalogue render uses a new id. That query is not added to the signed R2 URL. An unsigned parameter would make R2 reject the signature. The app response is `cache-control: no-store` and redirects to a newly signed GET. Artwork GETs are signed with `response-cache-control: private, no-store`. An already issued signed URL names the previous immutable object until cleanup deletes it. It does not serve the replacement. R2 bucket versioning stays off. The current object is never overwritten.

Private playback URLs last 60 minutes. Renewal is another request to `/api/media/{id}`, which signs a fresh URL. The signature still allows HTTP range requests.

## One current audio file

`acc_recordings` stays. It is the submission id that stats, promotion, favourites, and playlists will attach to later. It is not a library of playable files. The interface does not offer recording history, version restore, or playback of a retired submission.

Replacement, after explicit warning and confirmation:

1. Upload the new file to `staging/{intentId}` and validate type, size, and checksum.
2. Leave the current object untouched until that validation succeeds.
3. Copy the staged object to `songs/{songId}/{newSubmissionId}.mp3` and verify it.
4. Point the song at the new submission, clear publication, and require republication. Duration updates from the new file.
5. Engagement counters, likes, endorsements, rankings, and promotion eligibility attach to the submission id, so they do not follow the new id. The numeric rules for those systems are not defined yet and are not invented here.
6. Delete the staged object.
7. The database marks the previous audio not current and inserts its deletion row in the same statement, using that row's bucket. The app then deletes the object. If the delete fails, the row stays queued. A check that stops after the submission is retired still queues that object on the next upload or storage visit. The retired submission is not returned as a playable URL while the retry is pending.
8. Keep an audit row for the retired submission without the audio bytes.

Publication allowances, ranking formulas, and promotion eligibility remain the open rules in planning 04 and 06. Replacement consumes a new publication only when that policy is approved. Republication is required either way. Song metadata and release tracks stay.

The database queues the previous object in the same statement that marks it not current. Cleanup leases that row, then checks once more that the key is still not current media before deleting it. Finalizing a new key cancels a lease that has not been granted, and refuses one that has. The parent row is locked for the artwork switch, and one current cover index remains, so two replacements cannot both stay current or delete the image that won. That path has not been run against a live bucket.

## Artwork replacement

One current image per artist, release, or song. There is no artwork version history and no intentional copy of the previous image.

1. Upload and validate the new file.
2. Store it at `artists/{artistId}/{uploadId}.webp`, `releases/{releaseId}/{uploadId}.webp`, or `songs/{songId}/{uploadId}.webp`. The upload id is the upload intent id. The current object is not written.
3. Lock the parent, mark the previous cover not current, queue that object for deletion, and insert the new current row in one transaction.
4. Delete the previous object. A failed delete stays in `acc_storage_deletions` and is retried by the same cleanup lease.
5. If the catalogue update does not commit, the previous image stays current and is not queued. The new object is queued for deletion.

Artwork replacement does not change the song, its submission, publication, engagement, or ranking. Audio replacement is unchanged.

## Recovery

Obsolete audio is a current media row whose submission has `retired_at` set. The next upload and each visit to Storage run `acc_recover_obsolete_audio`, which marks that row not current and inserts the deletion in one statement. The object is then leased and removed from the connected bucket.

A deletion row stores its attempt count. Automatic cleanup stops after eight failures and leaves the row in place. Storage lists those files. **Remove leftover files** resets their attempts and tries again. Rows for another bucket are not reset and are not deleted with the current credentials.

An overdue pending upload is expired by the storage check. Its object key, and `staging/{intentId}/object` for a finalized, expired, failed, or cancelled intent, are queued only when that key is not current media in the connected bucket. Objects in a Cloudflare account the creator no longer uses stay there. Creators does not have those credentials and will not guess them.

## Delivery

| Audience | How it gets the file |
|---|---|
| Creator preview | Creators mints a short-lived signed GET for the current submission after checking the active member. The browser or player code receives the URL only. |
| Website and Player, private | Same shape: an absolute `audioUrl` minted for one submission after device authorization. The player already plays `audioUrl` directly and uses range requests for seeking. A signed GET that does not lock a single byte range still accepts `Range`. |
| Website and Player, public Originals | Unchanged. `https://media.almostheard.ca/...` plus `?v=` on artwork. |
| Future public creator audio | Not approved. When it is, the website returns an absolute URL for the current submission. It does not read the creator's R2 secret and does not insert creator rows into `dcm_music_*`. |

No new delivery service is proposed. A Worker in front of every creator bucket would be a second system. Signed URLs match the player and keep credentials on the server.

Limits to accept:

- A signed URL issued before deletion fails once the object is gone, except for audio the device has already buffered.
- The player keeps the `audioUrl` it queued until that song is played again from the catalogue. The submission id in the key makes that old URL fail instead of playing the replacement.
- Private playback URLs last 60 minutes. The client renews one by requesting the media route again.
- Cancelling a membership must stop new signatures immediately. It cannot erase a URL that was already issued until that URL expires or the object is deleted.

## Verification before healthy

All of these use a tiny object under `health/{nonce}` and delete it afterward:

- Server put, get, copy, and delete with the stored object key.
- A browser PUT to a presigned URL from the dashboard origin, which is the CORS proof.
- A following server read of that browser upload.
- Rejection of an operation outside the bucket.

Saving a key, or a server-only health check, does not set `healthy`.

## Management

The storage page shows the account, the bucket, the step, and the last plain-language error. The creator can test again. Expired keys, a missing bucket, a permission denial, and a CORS failure each name the next action. The next action is **Continue setup**, which starts consent again. The page does not offer a second bucket as the repair.

Disconnecting storage, moving a bucket, and deleting media after account cancellation are owner decisions. They are not part of onboarding. Catalogue metadata already follows the 60-day cancellation rule. Media files remain in the creator's bucket.

## Implementation status

The app now has the setup screen, OAuth start and callback, CSRF state, session binding, dedicated-bucket provisioning, CORS, the credential attempt, server and browser checks, the return path, cleanup retries, and the single-audio replacement. An existing-bucket picker is not a separate screen. A retry reuses the bucket name already stored for that creator.

Still unverified against a live Cloudflare account: the scope id, bucket creation, CORS, whether R2 write can mint a lasting key, whether that key survives revocation of the OAuth grant, and whether `http://localhost` is accepted as a redirect. The new migration is not applied. The client is not public.

## Remaining owner order

1. Review and apply `20261127210000_acc_storage_onboarding.sql`.
2. Create the private OAuth client and the server secret names. Leave the Coming Soon site in place.
3. Private-test from the Creators app with no bucket prepared. Stop if the object key cannot be created, and do not add API Tokens Write until that result is reviewed.
4. After a key exists, revoke the OAuth grant and confirm the stored key still uploads.
5. Only after a later approval, make the OAuth client public and run the ordinary-creator test.

## Acceptance

- A creator with no Cloudflare knowledge can finish setup from **Set up storage** without typing an endpoint, a path, or an S3 term.
- An existing Cloudflare customer can choose the account on the consent screen. A retry reuses the bucket this app already stored.
- The stored credential cannot create or delete buckets.
- Health requires the server and browser checks above.
- Setup returns to the page that started it.
- A retry does not create a second bucket.
- A song has one current audio object. A failed replacement leaves that object in place.
- A successful replacement deletes the previous object or records a retry.
- Retired submissions are not playable.
- The website and player are unchanged in this phase.
