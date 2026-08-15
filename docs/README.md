# Magpie documentation map

`PRODUCT_CHARTER.md` is authoritative. Plans and handoffs may refine execution
but must not silently change the product model or trust boundary.

## For users and evaluators

| Document | Purpose |
|---|---|
| [`GETTING_STARTED.md`](GETTING_STARTED.md) | Sign in, install the unpacked extension, pair, and first capture |
| [`PRODUCT_GUIDE.md`](PRODUCT_GUIDE.md) | Every feature in depth: capture modes, organization, review, watches, refresh-on-revisit, the Agent, and the trust model |
| [`API.md`](API.md) | Public API reference: principals, endpoints, typed outcomes, reason codes |
| [`RELEASE_NOTES.md`](RELEASE_NOTES.md) | Current draft release notes and verified limitations |
| [`BETA_LIMITATIONS.md`](BETA_LIMITATIONS.md) | What's supported vs. assumed/unverified before the beta opens, by status label |
| [`PROJECT_WRITEUP.md`](PROJECT_WRITEUP.md) | Submission write-up: decisions defended, what went wrong, what's not done |

## Continue development

| Document | Purpose |
|---|---|
| [`PRODUCT_CHARTER.md`](PRODUCT_CHARTER.md) | Durable product intent, model, principles, and non-goals |
| [`CLAUDE_CODE_HANDOFF.md`](CLAUDE_CODE_HANDOFF.md) | Current deployed state, next verification, known gaps, and Claude Code launch |
| [`API_AND_FAILURE_MAP.md`](API_AND_FAILURE_MAP.md) | Engineering-grade function contracts, typed failures, and security invariants |
| [`V3_1_PRODUCT_AND_RISK_PLAN.md`](V3_1_PRODUCT_AND_RISK_PLAN.md) | Mandatory risk gate for V3.1 changes |
| [`BUILD_GUIDE.md`](BUILD_GUIDE.md) | Ordered implementation checkpoints and verification evidence |

## Architecture and history

| Document | Purpose |
|---|---|
| [`V3_AUTO_ORGANIZATION_PLAN.md`](V3_AUTO_ORGANIZATION_PLAN.md) | Automatic Project/Collection routing contract |
| [`ENGINEERING_NOTES.md`](ENGINEERING_NOTES.md) | Observed Base44, MV3, routing, deployment, and failure-state findings |
| [`DECISIONS.md`](DECISIONS.md) | Deliberate omissions, reversals, and product tradeoffs |
| [`DASHBOARD_V2_HANDOFF.md`](DASHBOARD_V2_HANDOFF.md) | Historical V2 dashboard handoff; not current product authority |
| [`README_V1_ARCHIVE.md`](README_V1_ARCHIVE.md) | The original V1 apartment-hunting README |

## Current release checkpoint

> Reconciled 2026-08-16 against source and `deploy-base44.yml` GitHub Actions
> run history for issue #47; see `docs/BETA_LIMITATIONS.md` for the full
> supported-vs-unverified breakdown.

- Production: <https://magpieorelse.base44.app>
- 17 backend functions exist in `base44/functions/`, including
  `resolve-routing`, `delete-record`/`delete-collection`/`delete-mission`,
  `refresh-capture`, and `report-bug`; a full `functions` redeploy (evidence:
  GitHub Actions run `31849671121`, 2026-08-14) put current source into
  production for all of them, most recently including the B13 cascade-delete
  pagination fix; configured Agent `magpie_organizer`'s signed-in tool-calling
  was verified once (Build Guide 29.2), not re-verified by this audit
- Automated suite: 143/143 passing (re-run 2026-08-16); live smoke tests
  documented in `docs/CLAUDE_CODE_HANDOFF.md` cover auth, the original
  deletion-cascade smoke checks, and a real pairing-token refresh
- Remaining priorities: manual Chrome pass (still outstanding), folders (not
  built), the beta backlog opened as issues #46 (Side Panel), #48
  (Don't-Make-Me-Think audit), #49 (release checklist) — see
  `CLAUDE_CODE_HANDOFF.md`
- Deployment remains explicit-approval only
