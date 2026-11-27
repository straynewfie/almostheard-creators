# Roadmap and implementation backlog

## Revised rollout (planning direction)
1. Accounts, membership, tenant security and creator-owned R2 proof of concept.
2. Dashboard, Music Manager, public creator site and web player.
3. Private mobile player access. First three phases provide standalone subscription value.
4. Founding creator beta and engagement analytics. Instrument playback before beta so useful data is captured.
5. Weekly public promotions and guest public mobile catalogue integration.
6. Established Creator recognition.
7. Promotion Board and Promotion Coins.

This sequence is a planning baseline, not a delivery commitment. Security, legal and moderation readiness span phases and must precede public launch. Promotion and board thresholds remain open.

## Repositories
- Creators: https://github.com/straynewfie/almostheard-creators
- Originals: https://github.com/straynewfie/almostheard
- Player: https://github.com/straynewfie/almostheard-player
- Canon: https://github.com/straynewfie/almostheardcanon

Creators issues (https://github.com/straynewfie/almostheard-creators/issues):
1. Architecture and project roadmap
2. Creator accounts, membership and tenant security
3. Creator-owned R2 storage and media integrity
4. Creator Dashboard and Music Manager
5. Public Creators website and web player
6. Engagement analytics and abuse prevention
7. Weekly promotion and recording replacement policy
8. Legal, moderation and operational readiness
9. Founding creator closed beta and promotional tools
10. Mobile player catalogue integration handoff (deferred public integration)
11. Promotion Board, monthly membership review and weekly Promotion Coins
12. Integrated media uploads and release track creation workflow
13. Private player access and creator device pairing

Player #12: https://github.com/straynewfie/almostheard-player/issues/12 — private library playback.

Original main-repo issues #101–112 were recreated as Creators #1–12 and closed with links. Historical issue wording may lag decisions. Cancellation revocation and weighted self-listening were updated in relevant issues. Revised rollout and reactivation payment policy need roadmap/backlog reconciliation.

## Current implementation baseline
Static mission site in Creators repository: public/index.html, public/styles.css, public/favicon.svg, README.md, wrangler.jsonc. Cloudflare Worker configured for static assets; custom domain creators.almostheard.ca setup discussed, live status not independently verified here. No database, authentication or creator functionality implemented in that baseline. No deployment performed for this documentation task.
