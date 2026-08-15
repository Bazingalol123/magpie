# Known beta limitations

> Produced 2026-08-16 by the issue #47 pre-beta source-of-truth audit. This
> document separates **supported, evidenced behavior** from **assumptions and
> unverified behavior**, using one consistent status vocabulary across the
> whole product. It does not replace `docs/API_AND_FAILURE_MAP.md` (the
> engineering contract) or `docs/CLAUDE_CODE_HANDOFF.md` (the implementation
> handoff) — it summarizes both against the same evidence bar so a reader
> deciding whether to open the beta doesn't have to reconcile them by hand.

## Status vocabulary

| Status | Meaning |
|---|---|
| **source-only** | Code exists in this repository; not confirmed running anywhere outside a local checkout. |
| **locally-verified** | A test, type-check, or local script confirmed the behavior against this repository (`deno test`, `deno check`, local Playwright, a local `base44 dev` instance). Not confirmed in production. |
| **deployed** | Verifiable evidence (a successful `deploy-base44.yml` GitHub Actions run, or a documented targeted deploy command) shows this code is live in the production Base44 app. This is a claim about code presence, not about anyone having exercised it there. |
| **live-verified** | A specific, documented check was performed against the production app itself (an HTTP call, a signed-in click-through, a database read) and its result is recorded. |
| **unknown** | Neither this audit nor the docs it reviewed could establish the status. Treated as unverified, not as broken. |

This audit did not have production Base44 access (no dashboard sign-in, no
`base44 logs`, no direct database read). "Deployed" claims below are backed
by GitHub Actions run IDs (`gh api repos/Bazingalol123/magpie/actions/runs`),
which is real evidence of a CI-dispatched deploy succeeding — it is not the
same as this audit having used the production app.

## Core product loop

| Area | Status | Basis |
|---|---|---|
| Six capture modes (element, selection, page, link, visual, image) | locally-verified | `npm run test:e2e` (issue #19 Phase 1, PR #35) drives the real unpacked extension against a real local `base44 dev` backend for all 6 modes, 6/6 passing. Not run against production. |
| Automatic routing (existing / new / review) and confidence/lead thresholds | locally-verified (unit) | Extensively covered by the 143-test Deno suite (`tests/`). No hosted routing smoke test found in the docs beyond the 2026-07-25 `refresh-capture`/`ingest-clip` chain check below. |
| Needs-review resolve actions (accept/redirect/create/dismiss) | deployed | `resolve-routing` deployed 2026-07-25 per `docs/CLAUDE_CODE_HANDOFF.md`; auth/404 behavior live-verified at that time (see below). Full manual click-through of all four actions: **unknown** — not reconfirmed by this audit. |
| Item/Collection/Project cascade delete, including the B13 pagination fix | deployed | GitHub Actions run [`31849671121`](https://github.com/Bazingalol123/magpie/actions/runs/31849671121) (`target=functions`, commit `f542c4e`, 2026-08-14T23:14:53Z) succeeded; `git diff f542c4e..<main HEAD> -- base44/` is empty, so this is still current. Auth/404 shape live-verified for `delete-record` at an earlier checkpoint; the actual >200-row orphan scenario the B13 fix addresses has **not** been exercised against production data — unknown. |
| Dashboard pagination past 200 rows per entity (G1) | deployed | GitHub Actions run [`31850021926`](https://github.com/Bazingalol123/magpie/actions/runs/31850021926) (`target=site`, commit `f542c4e`, 2026-08-14T23:20:40Z) succeeded. Locally-verified via `tests/dashboard-pagination.test.ts`. Never manually confirmed against a production account with 200+ rows — unknown. |
| Watches: backoff, three-strikes auto-pause, resume | source-only / locally-verified | Covered by unit fixtures; no documented hosted sweep-watches run found in the docs reviewed. |
| Refresh-on-revisit (browser-token healing of blocked Items) | live-verified (2026-07-25) | Build Guide checkpoint documents a real, immediately-revoked pairing token used in production: unauthenticated `401`, a real price-change diff produced `updated`/`change_count:1`, an Enrichment row was created, freshness restored, watch reactivated, and an uncaptured URL returned `no_match`. Test fixture was cascade-deleted afterward. Not re-run by this audit; treat as historical, not continuously monitored. |
| `magpie_organizer` Agent (Ask Magpie) tool-calling | live-verified (documented, not re-run) | `docs/CLAUDE_CODE_HANDOFF.md` states signed-in tool-calling behavior was verified (Build Guide 29.2). This audit did not have dashboard access to reconfirm. |
| RLS owner isolation (no admin bypass) | live-verified (2026-07-26, documented) | The original incident and fix are documented with a specific reproduction (`Clip.list()` as the admin account returning another owner's rows) and a fix verified the same way. A hosted cross-owner spot-check was performed once at that time and not repeated since; local cross-owner fixtures (G4) were re-run 2026-08-14. |

## Onboarding (G9)

| Area | Status | Basis |
|---|---|---|
| Pairing checklist + first-capture status banner (states 2/3/5/6 of 7) | deployed | Site deploy at commit `1a28831`, 2026-08-14T21:39:38Z. Not manually browser-verified. |
| Signed-out landing explanation of the product loop (state 1) | not built | `Landing.jsx` was not touched by this work; the pre-G9 landing copy is what's live. |
| Distinct "paired and ready" state (state 4) | not built | Folded into `AWAITING_FIRST_CAPTURE` copy instead of its own step. |
| Broader recovery-state set (AI/routing unavailable, source blocked, distinct from generic failure) | not built | One generic `FAILED` state exists. |
| Fixture-driven UI tests / local Playwright happy-path for onboarding | not built | Recorded as a deliberate scope cut, `docs/DECISIONS.md`. |

## Extension surface

| Area | Status | Basis |
|---|---|---|
| Popup-based UI (not Side Panel) | locally-verified, current | `extension/manifest.json` uses `action.default_popup`; no `side_panel` key or `sidePanel` permission. Confirmed 2026-08-16. |
| Chrome Side Panel migration (issue #46) | not started / in flight elsewhere | No matching branch or open PR found (`git log origin/main`, `gh pr list`) as of this audit. Every popup-based instruction in `docs/GETTING_STARTED.md` and `docs/PRODUCT_GUIDE.md` is accurate against current `main`. Do not treat Side Panel as done. |
| Extension release artifact | deployed (GitHub Release) | `extension-v0.2.0` GitHub Release exists and matches `extension/manifest.json`'s `"version": "0.2.0"` — consistent. |
| `@base44/sdk` absence from extension code | locally-verified | `rg -n "@base44/sdk" extension` returns no matches (2026-08-16). |

## Backend function inventory

17 functions exist in `base44/functions/`. All 17 `entry.ts` files pass
`deno check` (2026-08-16). Per-function deployment/verification status:

| Function | Status | Notes |
|---|---|---|
| `create-extension-pairing`, `extension-context`, `create-mission`, `ingest-clip`, `classify-clip` | deployed | Original V3/V3.1 hosted checkpoint plus the 2026-08-14 targeted redeploy and the 2026-08-14 full functions redeploy. |
| `resolve-routing` | deployed, partially live-verified | Deployed 2026-07-25; auth/404 shape checked then. Full action-by-action click-through: unknown. |
| `delete-record` | deployed, partially live-verified | Auth (`401`) and typed `404` behavior checked at deploy time; the B13 orphan-row scenario specifically: unknown against production data. |
| `delete-collection`, `delete-mission` | deployed | Deployed 2026-07-26 (site + functions) and again as part of the 2026-08-14 full functions redeploy. Live smoke checks (`401`, site `200`) passed; the manual signed-in click-through (actually deleting a Collection/Project in the browser) has explicitly **not** been performed per `docs/CLAUDE_CODE_HANDOFF.md` — unknown. |
| `refresh-capture` | deployed, live-verified (2026-07-25, historical) | See "Refresh-on-revisit" above. Contract description in `docs/API.md`/`docs/API_AND_FAILURE_MAP.md` corrected in this audit to note canonical-URL-first matching. |
| `enrich-record` | deployed | No dedicated hosted smoke-test note found beyond general deploy evidence. |
| `sweep-watches` | deployed | Scheduled/admin function; no hosted run log reviewed by this audit. |
| `agent-workspace-context`, `agent-compare-items`, `agent-explain-organization`, `agent-configure-monitoring` | deployed | Deployed 2026-07-25; `magpie_organizer`'s use of them verified once (Build Guide 29.2), not reconfirmed here. |
| `report-bug` | deployed | Previously documented as "not yet deployed, needs owner approval" (Build Guide checkpoint 34); the 2026-08-14 full `functions deploy --force` run redeploys every function regardless of which one changed, so it went live in that dispatch. Whether it actually files a GitHub issue end-to-end in production (i.e., `GITHUB_ISSUES_TOKEN` is configured and working there) is unknown — this audit could not check repository/environment secrets. |

## Testing and CI

| Claim | Status | Evidence |
|---|---|---|
| `deno test` count | locally-verified: **143/143** | Re-run 2026-08-16 in a clean worktree. Several docs (`CLAUDE.md`, the intro of `docs/CLAUDE_CODE_HANDOFF.md`, `README.md`, `docs/README.md`) cited stale figures (102/102 or 123/123); corrected in this audit. |
| `deno check` across all backend entry points | locally-verified: **17/17** | Some docs cited "16"; `report-bug` was missing from the count. |
| Extension script syntax (`node --check`) | locally-verified | Clean across all `extension/*.js`. |
| No `@base44/sdk` in extension | locally-verified | `rg` returns no matches. |
| Production build (`npm run build`) | locally-verified | Succeeds; one pre-existing Vite chunk-size warning (~527 kB), not new, not addressed by this audit. |
| CI (`ci.yml`) runs the above on every push/PR | source-only claim, plausible | Not independently re-verified by triggering CI in this audit; the workflow file matches the documented behavior. |
| `deploy-base44.yml` deploy history | live-verified (via GitHub Actions API, not the Base44 app itself) | 12 successful dispatches visible in the queried window; used throughout this document as deployment evidence. |
| Chrome capture integration matrix (issue #19 Phase 1) | locally-verified | 6/6 against a local `base44 dev` backend. CI wiring for this suite, non-English keyboard layouts, tab-already-open-after-reload, and worker sleep/wake are explicitly out of scope for Phase 1 (`docs/BUGS_AND_BEHAVIORS.md` G3/G8). |
| Owner/RLS cross-owner integration fixtures (G4) | locally-verified (2026-08-14) + live-verified (2026-07-26, not repeated) | Local run used two synthetic owners plus the real admin-role account against `base44 dev`. Hosted spot-check was performed once, at the original incident fix, and not repeated since. |
| Concurrent-ingest idempotency under simultaneous requests (G2) | unknown / open gate | Sequential retries are idempotent (tested); true concurrent-request behavior is explicitly not covered. |

## Explicit non-goals and deliberate omissions (not bugs)

These are recorded product decisions, not gaps to close before beta — listed
here so they aren't mistaken for oversights. Full detail in
`docs/DECISIONS.md`.

- No undo for deletions or resolve-routing actions — deletion and dismissal
  are permanent by design.
- No soft-archive / `dismissed` status; a resolved or dismissed capture is
  gone, not hidden.
- Deleting a Project leaves a dangling `mission_id` on any Needs-review
  capture that only had it as a hint (never became a Collection/Item);
  `resolve-routing` already treats that as a typed `404`, not a crash.
- No RLS admin-audit replacement was built after removing the admin bypass —
  the app owner's `role: admin` account now has the same restricted access
  as every other owner, with no special read path.
- Extension refresh-on-revisit memory is local-only and is lost when the
  extension is removed or re-paired; coverage rebuilds through recapture.
- No visual schema editor, no connector export (Sheets/Notion), no arbitrary
  nested folders — see the Product Charter's non-goals.
- The bug-report form (`report-bug`) has no rate limiting and is dashboard-
  only (no landing-page or extension path, since neither has an owner
  identity to attach a report to).

## What this audit did not check

- No production Base44 dashboard sign-in, so no live click-through of review,
  deletion, onboarding, or Agent-conversation UX was performed.
- No `npx base44 logs` access, so no production error-rate or log-based
  verification.
- No `target=entities` or `target=agents` `deploy-base44.yml` dispatch
  appears in the run history window checked; entity-schema and Agent sync
  status beyond what other docs already state as "run locally" could not be
  independently confirmed.
- Whether the four `needs_review` Captures `docs/CLAUDE_CODE_HANDOFF.md`
  mentions still exist in production data is unknown.
