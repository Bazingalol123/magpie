# Dashboard V2 handoff

Use this document to start the dashboard redesign in a separate Codex task.

> **Architecture update:** This handoff predates the V3 auto-organization decision. `docs/PRODUCT_CHARTER.md` is authoritative. The redesign must present Collection as an auto-organized structured table within an optional Mission, rather than treating Collection as permanently hidden.

## Product contract

Magpie turns scattered, changing web content into structured information the user can trust, compare, and keep current:

`clip -> understand -> organize -> review -> compare -> refresh`

Mission is an optional goal and research workspace. Collection is the visible structured type of thing Magpie creates or selects. V2 data may still use Collection as a compatibility layer, but new UI structure must not make that temporary implementation the product model.

## Current implementation

- Multiple active Missions with templates and Mission-owned schemas.
- Mission-aware extension selection and capture intent.
- Owner-bound opaque extension pairing token.
- Idempotent ingestion with best-effort screenshot storage.
- Mission-constrained classification with deterministic fallback.
- Candidate records expose decision, processing, confidence, freshness, and enrichment state.
- `docs/API_AND_FAILURE_MAP.md` defines server outcomes the new UI must present.

The Mission-owned schema and generated `Mission · <title>` Collection are transitional V2 behavior. V3 will move canonical schema ownership and routing back to Collection.

## Screens to design

1. **Today:** meaningful changes, blocked sources, deadlines, and recommended review actions.
2. **Missions:** active, paused, and completed Mission cards with Collection, candidate, and attention counts.
3. **Mission workspace:** Overview, Collections, Compare, Activity.
4. **Collection:** schema-backed Records with routing and freshness state.
5. **Candidate detail:** facts, source evidence, freshness, change history, recovery actions.
6. **Capture inbox:** processing, needs review, duplicate, failed, and unassigned captures.
7. **Compare:** deterministic constraint matrix plus grounded explanation.

## Required UI states

- Loading, empty, partial data, and realtime insert/update.
- `changed`, `unchanged`, `stale`, `blocked`, `unreachable`, `rate_limited`, `not_found`, `invalid_content`, and `suspicious_data`.
- Routing states: pending, existing Collection, new Collection, needs review, corrected, and failed.
- Source recovery actions: retry now, open source, recapture with extension, and pause watch.
- AI confidence and missing evidence must be visible without dominating the primary workflow.

## Preserve

- MV3 worker uses plain `fetch`; never import `@base44/sdk`.
- Extension cannot read Records, Collections, Clips, or Enrichments.
- Dashboard uses the SDK and realtime subscriptions.
- Existing owner-scoped RLS and service-role function boundary.
- Existing backend field names unless the redesign includes a deliberate compatibility migration.
- No arbitrary nested folders.

## Start-of-task prompt

> Continue Magpie Dashboard V2 using `docs/PRODUCT_CHARTER.md`, `docs/DASHBOARD_V2_HANDOFF.md`, `docs/V3_AUTO_ORGANIZATION_PLAN.md`, and `docs/API_AND_FAILURE_MAP.md`. First audit the current visual hierarchy and propose the screen/state system before changing UI code. Treat the product charter as authoritative, preserve the Base44 trust boundary, and do not imply that every Mission has only one Collection.
