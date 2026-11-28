# Almost Heard Creators — project guide
Planning baseline: November 27, 2026.

Use these files as the working knowledge base for a dedicated ChatGPT project. Distinguish agreed direction from proposals and open decisions. Do not treat illustrative thresholds as final. Update the relevant file and GitHub issue when a decision is approved. Do not implement or deploy without explicit instruction.

## Index
- 01: Mission and product positioning
- 02: Membership and lifecycle
- 03: Architecture and storage
- 04: Dashboard and Music Manager
- 05: Player and private access
- 06: Analytics and promotion
- 07: Governance and rewards
- 08: Roadmap and GitHub backlog

## Working conventions
Keep discussions concise; develop requirements before implementation. Prefer small, coordinated GitHub issues. Almost Heard Originals, Creators and Canon are distinct products. Canon is not a guest-creator feature. Preserve recording identity and tenant isolation. No automatic deployment unless requested.

Genres are deferred. The website and Music Manager are defining a shared genre catalogue. Creators will reuse that catalogue later and will not keep an independent genre model in the meantime. See 04.

The 2026-11-28 cross-app review lives in the website repository, not here. Pointer: `docs/integration/ECOSYSTEM_REVIEW.md`.

## Phase 1 handoff
- 09: Technical implementation specification and owner gates (master #14; #15–21).
- 10: Cursor implementation prompt. Planning only; implementation requires separate authorization.
