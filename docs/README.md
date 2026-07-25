# Magpie documentation map

`PRODUCT_CHARTER.md` is authoritative. Plans and handoffs may refine execution
but must not silently change the product model or trust boundary.

## For users and evaluators

| Document | Purpose |
|---|---|
| [`GETTING_STARTED.md`](GETTING_STARTED.md) | Sign in, install the unpacked extension, pair, and first capture |
| [`PRODUCT_GUIDE.md`](PRODUCT_GUIDE.md) | Every feature in depth: capture modes, organization, review, watches, refresh-on-revisit, the Agent, and the trust model |
| [`API.md`](API.md) | Public API reference: principals, endpoints, typed outcomes, reason codes |

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

- Production: <https://magpieorelse.base44.app>
- 14 backend functions deployed, including `resolve-routing`, `delete-record`,
  and `refresh-capture`; configured Agent `magpie_organizer` verified signed-in
- Automated suite: 108/108 passing; live smoke tests cover auth, deletion
  cascade, and a real pairing-token refresh
- Remaining priorities: manual Chrome pass, folders, competition finish
  (`CLAUDE_CODE_HANDOFF.md`)
- Deployment remains explicit-approval only
