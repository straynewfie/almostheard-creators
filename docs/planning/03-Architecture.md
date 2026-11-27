# Architecture and creator-owned storage

## Boundaries
Separate Creators public site and private dashboard; shared mobile player integration through APIs. Platform owns accounts, catalogue metadata, analytics and authorization. Creators own media in Cloudflare R2. Artist and release entities group recordings; store audio once per recording.

One account-level production media base URL. Deterministic paths based on stable immutable IDs/slugs; one cover.webp per artist/release/song and audio.mp3 per song. Exact path schema TBD. No arbitrary media hosting. Guided R2 onboarding, connection health checks, restricted encrypted credentials and tenant isolation. Direct media uploads/downloads where practical. Never send R2 credentials to the player.

## Security and integrity
Enforce ownership and membership server-side. Use scoped revocable credentials for player pairing. Private catalogue access must not leak across tenants. Creator-owned public media URLs may remain accessible outside the platform; private player authorization is not DRM. Detect external R2 audio replacement using checksums or other integrity verification; detection may not be instantaneous. Define safe caching and revocation behavior.

## Capacity context
Earlier Supabase snapshot: 15 MB used of nominal 500 MB free database allowance; artists 11 rows averaging 555 bytes, releases 2 averaging 217 bytes, songs 19 averaging 418 bytes. These are historical observations, not current measurements or capacity guarantees. Illustrative 500 KB per creator estimate includes overhead; analytics, compute and bandwidth may dominate. Validate with load tests and actual pricing.

## Legal and operational
Creator-owned storage does not eliminate platform obligations. Define terms, rights attestations, moderation, takedowns, privacy, account security, abuse appeals, backup and incident response before public launch. No legal conclusions assumed.
