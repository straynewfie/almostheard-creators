# Architecture and creator-owned storage

## Boundaries
Separate Creators public site and private dashboard; shared mobile player integration through APIs. Platform owns accounts, catalogue metadata, analytics and authorization. Creators own media in Cloudflare R2. Artist and release entities group recordings; store audio once per recording.

## Database placement
Creators stores its tables in the existing Almost Heard Supabase project and uses that project's authentication users. Catalogue tables are prefixed `acc_` and private helpers live in `acc_private`. Website tables stay on their `dcm_`, `dcf_`, and `dcs_` names. A person may have both an admin profile and a creator profile. Creators does not add a trigger on `auth.users`. Deleting an authentication user who already has a creator profile is blocked until a reviewed purge exists, because creator rows restrict that delete.

Guided R2 onboarding is specified in `docs/implementation/STORAGE-ARCHITECTURE.md`. The creator authorizes Almost Heard through Cloudflare. The app creates or reuses one Standard bucket, sets browser upload rules, and stores one bucket-scoped object key. It does not keep a bucket-admin grant. Object keys are immutable: `artists/{artistId}/{uploadId}.webp`, `releases/{releaseId}/{uploadId}.webp`, `songs/{songId}/{uploadId}.webp`, and `songs/{songId}/{submissionId}.mp3`. Clients receive signed URLs, never credentials or paths. Public delivery remains unapproved.

## Security and integrity
Enforce ownership and membership server-side. Use scoped revocable credentials for player pairing. Private catalogue access must not leak across tenants. Creator-owned public media URLs may remain accessible outside the platform; private player authorization is not DRM. Detect external R2 audio replacement using checksums or other integrity verification; detection may not be instantaneous. Define safe caching and revocation behavior.

## Capacity context
Earlier Supabase snapshot: 15 MB used of nominal 500 MB free database allowance; artists 11 rows averaging 555 bytes, releases 2 averaging 217 bytes, songs 19 averaging 418 bytes. These are historical observations, not current measurements or capacity guarantees. Illustrative 500 KB per creator estimate includes overhead; analytics, compute and bandwidth may dominate. Validate with load tests and actual pricing.

## Legal and operational
Creator-owned storage does not eliminate platform obligations. Define terms, rights attestations, moderation, takedowns, privacy, account security, abuse appeals, backup and incident response before public launch. No legal conclusions assumed.
