# Magpie V3.1 — Claude Code handoff

> Updated 2026-07-25 after the ten-gap release (deletion, dismissal, blocked
> watches, review UX, chat markdown, landing page). Patched 2026-08-16 by the
> issue #47 documentation audit — see the dated inline notes below and
> `docs/BETA_LIMITATIONS.md` for what is and isn't verified before beta.

This is the continuation point for Claude Code. Read
`docs/PRODUCT_CHARTER.md` first; it is authoritative when another document
conflicts with it.

## Start here

Read these files in order:

1. `docs/PRODUCT_CHARTER.md` — durable product intent and boundaries.
2. This handoff — current implementation and deployment state.
3. `docs/API_AND_FAILURE_MAP.md` — backend contracts and typed failures.
4. `docs/V3_AUTO_ORGANIZATION_PLAN.md` — routing rules and incomplete correction
   workflow.
5. `docs/V3_1_PRODUCT_AND_RISK_PLAN.md` — change-risk gate.
6. `docs/BUILD_GUIDE.md` — chronological checkpoints.
7. `docs/ENGINEERING_NOTES.md` and `docs/DECISIONS.md` — platform findings and
   deliberate omissions.

Do not treat older V1/V2 checkpoints as the current product contract.

## Current product

Magpie turns selected web evidence into structured, owner-scoped information:

`capture -> understand -> organize -> review -> compare -> refresh`

The product is broad across products, jobs, apartments, recipes, articles,
vendors, places, and other research domains. A Project is optional purpose; a
Collection is the reusable object type; an Item is one structured Record.

Two AI execution modes share the same model:

- The event-driven AI Gateway code agent proposes Project and Collection routing
  during capture. Deterministic code validates all proposals and performs all
  writes.
- The configured `magpie_organizer` Agent is an authenticated dashboard
  conversation. It can read bounded owner context, compare Items, explain
  routing, and configure explicit watches through backend functions.

The configured Agent has no direct entity tools and memory is disabled.

## Non-negotiable trust boundary

Never import `@base44/sdk` into the MV3 extension service worker.

```text
MV3 extension
  -> plain fetch + opaque pairing token in chrome.storage.local
  -> Base44 backend function
  -> service-role entity writes after explicit owner validation

Dashboard
  -> normal browser SDK + authenticated realtime subscriptions
```

The extension can submit Captures and receive only safe acceptance/routing
status. It cannot read Clips, Collections, Records, RoutingDecisions,
Enrichments, Projects, watches, or Agent conversations.

Do not add arbitrary server-side URL retrieval. Submitted URLs are evidence, not
authorization to crawl.

## Deployed state

- Base44 app ID: `6a622e254ee5f8740523313e`
- Production: <https://magpiecapture.com>
- Eight entity definitions are deployed.
- Existing capture, routing, pairing, enrichment, and sweep functions are
  deployed.
- The following V3.1 Agent functions are deployed:
  - `agent-workspace-context`
  - `agent-compare-items`
  - `agent-explain-organization`
  - `agent-configure-monitoring`
- `magpie_organizer` is deployed and its signed-in tool-calling behavior is
  verified (see Build Guide 29.2 signed-in checkpoint).
- `resolve-routing` is deployed: accept / redirect / create (optionally
  Project-scoped via validated `project_id`) / dismiss for `needs_review`
  Captures.
- `delete-record` is deployed: owner-only permanent cascade over WatchRules,
  Enrichments, RoutingDecision, Clip, and the Record.
- `sweep-watches` auto-pauses a watch (`AUTO_PAUSED_BLOCKED`) after three
  consecutive blocked checks.
- The dashboard is deployed with **Ask Magpie** (markdown-rendered replies),
  a **Needs review** panel (resolve, dismiss, create-with-Project, inline
  Project creation, `?review=<clip_id>` deep link), Item deletion with two-step
  confirm, blocked-source guidance with watch pause/resume, clickable URL
  fields, a sticky header, and a title-dropdown Project switcher.
- A full static landing page (CSS-3D hero, scroll-revealed Move to Berlin
  storyboard, trust section) renders before sign-in with zero entity reads.
- `refresh-capture` is deployed: refresh-on-revisit lets the owner's own
  browser update blocked or stale Items through the same enrichment guards;
  `ingest-clip` returns `capture_status` (`new`/`duplicate`) using the stored
  `content_hash`. The extension remembers its own captured URLs locally
  (default-on popup toggle, 12-hour rate limit) and auto-refreshes on revisit.
- Extension toasts are routing-status-aware, duplicate-aware, and link to the
  dashboard review panel. The extension remains write-only; its URL memory is
  local-only and dies with the pairing token (`docs/DECISIONS.md`).
- **Security fix 2026-07-26:** every owner-scoped entity's RLS had an admin
  `$or` bypass (the app owner's account carries `role: "admin"` by Base44
  default), letting that account read/edit/delete any owner's data — verified
  live and closed. All eight entities were re-pushed with strict
  `owner_id`-only RLS, and `classify-clip`/`enrich-record` were redeployed
  after `shared/auth.ts`'s matching `canAccessOwner()` bypass was removed.
  See `docs/ENGINEERING_NOTES.md` (2026-07-26) and `docs/DECISIONS.md`.

Latest verified release gates (re-run locally 2026-08-16, issue #47 audit):

- 143/143 Deno tests pass (was 102/102 at the 2026-07-25 ten-gap checkpoint;
  see `docs/BUILD_GUIDE.md` checkpoint 37 and `docs/ENGINEERING_NOTES.md`
  2026-08-15 for the intervening growth, most recently the B13 regression
  fixtures).
- All 17 backend entry points under `base44/functions/*/entry.ts` pass
  `deno check` (count includes `report-bug`, added after this section was
  first written).
- The Vite production build passes.
- Extension scripts parse.
- No extension file imports `@base44/sdk`.
- Production app returns `200` and serves the current bundle.
- `delete-record` and `resolve-routing` return safe JSON `401` unauthenticated
  and typed `404`s for missing rows when authenticated.

## Deployed 2026-07-26, not yet merged

`delete-collection` and `delete-mission` (Build Guide 29.10) extend the
`delete-record` full-delete cascade to Collections and Projects. Built on
branch `feature/cascade-delete` (not yet merged to `main`), gated locally
(123/123 Deno tests, every `entry.ts` type-checked, Vite build passed), then
deployed with explicit owner approval: both functions via a targeted
`functions deploy`, and the site with the new sidebar/switcher delete UI.
Live smoke checks passed (`401` unauthenticated, site `200`). The manual
sign-in click-through (actually deleting a Collection/Project in the browser)
still has not been performed — do that next. No entities or Agents changed
or were pushed this round.

## CI/CD (added 2026-08-13)

`.github/workflows/ci.yml` now runs the full release-gate suite automatically
on every push to `main`/`feature/**` and every PR into `main`.
`extension-release.yml` packages and publishes a GitHub Release on an
`extension-v*` tag push. `deploy-base44.yml` is a manual, approval-gated
"deploy button" (`workflow_dispatch`) — see Build Guide 29.12 and
`docs/DECISIONS.md` for why it stays manual rather than auto-deploying.

**Setup action complete:** the `production-deploy` GitHub Environment
(required reviewer: the owner) and the `BASE44_API_KEY` / `BASE44_APP_ID`
repository secrets exist and were exercised for real on 2026-08-14 (see
below) — the deploy workflow is confirmed working, not just configured.

## Bug-fix pass (2026-08-14, `fix/p0-bugfix-pass`)

**2026-08-16 audit note:** the "not yet merged" claim later in this section
is stale. `git log origin/main` shows this branch merged as commit `f95dd13`,
"Fix/p0 bugfix pass (#5)".

Worked a local, gitignored triage list (`BUGS.local.md`, not committed) of
P0 bugs top to bottom, one commit per bug. All three are fixed, deployed, and
verified — owner-tested live against the deployed dashboard:

- **B4 (Build Guide 29.13 + follow-up):** element-picker captures now
  resolve the clicked element's own link instead of always saving
  `location.href`, fixing captures on list-style pages (e.g. rental
  listings) saving the list page instead of the specific item. Manual
  Playwright testing against a real site also caught and fixed a genuine
  regression in the no-link fallback path (`safeHttpUrl(anchor?.href)`
  produced a bogus `.../undefined` URL — see `docs/ENGINEERING_NOTES.md`).
  Extension-only; no backend/entities/site deploy needed.
- **B8 (Build Guide 29.14):** duplicate detection now canonicalizes URLs
  (strips tracking params, sorts query params) before hashing/matching,
  fixing false-negative duplicate detection caused by session/tracking
  query-string drift. Verified via direct `ingest-clip` calls: a clean URL
  and the same URL with `utm_source`/`utm_medium`/`gclid` appended both
  resolved to the same `clip_id`.
- **B1 (Build Guide 29.15):** sidepanel/review panel show `clip.summary`
  (generated by the existing routing agent tool call, no second AI call)
  instead of the raw captured text, full text still reachable behind a
  toggle. Live testing caught a second real bug: the `submit_route_proposal`
  tool's `required` array wasn't actually enforced without `strict: true`,
  so the model silently omitted `summary` — fixed and redeployed (see
  `docs/ENGINEERING_NOTES.md`).

**Deployed 2026-08-14** (all owner-approved):
- `npx base44 entities push` (all 8 entities, including `Clip.canonical_url`
  and `Clip.summary`) — run locally.
- `npx base44 functions deploy ingest-clip refresh-capture classify-clip`
  (the three functions importing the changed shared modules) — run locally,
  twice (once initially, once after the `strict: true` fix). No error-level
  function logs after either deploy.
- Site (frontend `CapturedContext` UI) — run through the **CI pipeline**
  instead of locally: `gh workflow run "Deploy to Base44" --ref
  fix/p0-bugfix-pass -f target=site`, approved via the `production-deploy`
  environment's required-reviewer gate in the GitHub Actions UI. First
  dispatch was mistakenly targeted at `--ref main` (which didn't have these
  changes yet) and was cancelled before approval; re-dispatched against
  `fix/p0-bugfix-pass` and approved.

`fix/p0-bugfix-pass` itself has not been merged to `main` — only entities,
three functions, and the site bundle built from that branch have been
deployed. Merge/PR is still pending, at the owner's discretion.

**Superseded 2026-08-16:** this branch is merged to `main` (`f95dd13`, #5).
The functions/entities/site listed above as deployed from the branch are, as
of the same-day full `functions`/`site` deploys described in the next
section, also deployed from `main` at a newer commit.

## Extension Side Panel migration (2026-08-15, issue #46, merged 2026-08-16 as PR #50)

`extension/popup.html`/`.css`/`.js` are retired; the extension now opens as
a Chrome Side Panel (`extension/sidepanel.html`/`.css`/`.js`,
`manifest.json`'s `side_panel.default_path` + `sidePanel` permission,
`action.default_popup` dropped, `service-worker.js` calls
`chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` once
in `onInstalled`). Every `window.close()` call from the old popup (Save page
success, picker/snip start, Open dashboard) is removed since the panel is
designed to stay open — status text and re-enabled buttons replace the
self-close behavior. Pairing copy is now explicit: "open the dashboard in a
new tab ... come back to this side panel ... and paste." The plain-`fetch` +
opaque-pairing-token capture protocol, `chrome.storage.local` schema, and
every other extension file (`content.js`, the rest of `service-worker.js`)
are unchanged — no backend, entity, or trust-boundary change. Manifest
version bumped `0.2.0` -> `0.3.0`.

Gated locally: 147/147 Deno tests (4 new fixtures in
`tests/extension-manifest.test.ts` covering manifest validity and Side Panel
references), all 16 `entry.ts` type-check clean, `node --check` clean on
every `extension/**/*.js`, `@base44/sdk`-in-`extension/` grep clean, `npm
run build` clean. `tests-e2e/` was updated (helper renamed `openPopup` ->
`openSidePanel`, all 6 capture-mode specs + `global-setup.ts` point at
`sidepanel.html`) but not executed — needs real Chrome + a local `npx base44
dev` backend. **No real-Chrome manual verification was performed this
pass** (toolbar click opening the actual panel, panel persisting across a
tab switch, worker-sleep/wake) — see `docs/DECISIONS.md`. No entity or
function change; ships as GitHub Release `extension-v0.3.0` — tag push and
site redeploy (for the popup->side-panel dashboard copy in `src/App.jsx`,
`src/onboarding/PairingChecklist.jsx`) are the release steps still pending
owner approval as of this writing.

## P0 code audit (2026-08-15, `fix/p0-cascade-delete-pagination`)

**2026-08-16 audit note:** the "not merged" / "Not deployed" claims below are
stale. The branch merged to `main` as commit `f542c4e`, "fix: page
cascade-delete child rows past the first fetch page (B13, P0) (#40)". GitHub
Actions run
[`31849671121`](https://github.com/Bazingalol123/magpie/actions/runs/31849671121)
(`deploy-base44.yml`, `target=functions`, commit `f542c4e`,
2026-08-14T23:14:53Z) succeeded — `npx base44 functions deploy --force`
redeploys every function, so `delete-record`, `delete-collection`, and
`delete-mission` carry this fix in production. `git diff f542c4e..e2a4f84 --
base44/` (current `main` HEAD) is empty, so this is still the deployed
function state. See `docs/BUGS_AND_BEHAVIORS.md` B13 and
`docs/DECISIONS.md`'s 2026-08-16 entry for the full evidence trail. This is
deployment evidence, not manual browser verification — the click-through
noted below as outstanding is still outstanding.

Proactive audit (no user report) found B13: `cascadeRecord`
(`base44/shared/record-removal.ts`, shared by `delete-record`/
`delete-collection`/`delete-mission`) fetched WatchRule/Enrichment/
RoutingDecision children with a single hardcoded-limit `.filter()` call
instead of paging to completion via the existing `listAllOwned` helper —
unlike the Collection/Mission cascades one level up, which already page
correctly. A Record with more than 200 Enrichment rows or 100 WatchRules
(realistic for a long-lived watched candidate) only had its newest page
deleted; since the Record is deleted last as the retry anchor, the leftover
rows are permanently orphaned. Fixed by routing all three child fetches
through `listAllOwned`. Also fixed a latent test-mock gap that had been
hiding this: `tests/record-removal.test.ts`'s fake `filter()` ignored the
`skip` parameter. Full writeup: Build Guide checkpoint 37,
`docs/BUGS_AND_BEHAVIORS.md` B13, `docs/ENGINEERING_NOTES.md` (2026-08-15),
`BUGS.local.md` B13.

`deno test` 143/143, `deno check` clean on all 17 entry points, `npm run
build` passes. No entity/schema change. **Deployed** via the full functions
redeploy described in the audit note above (evidence: GitHub Actions run
`31849671121`); the PR for this branch is still open/unmerged-adjacent in the
sense that `git log` shows it landed as a squash commit rather than a
tracked open PR at the time of writing — treat the code as merged and
deployed, not as a pending branch.

## Immediate continuation

Build Guide 29.2–29.4 are complete and deployed. The remaining manual check is
one real browser pass: sign out to see the landing page, sign in, exercise the
review panel (accept, redirect, create-with-Project, dismiss), delete an Item,
inspect a blocked Item's pause/resume, and ask Magpie for a comparison table.
Four real `needs_review` Captures exist in production data for this.

## Known gaps, in priority order

1. **Chrome integration matrix:** Phase 1 (issue #19) landed 2026-08-15 — a
   real Playwright suite (`npm run test:e2e`, `tests-e2e/`) drives the real
   unpacked extension against a real local `npx base44 dev` backend for all
   6 capture modes and passes 6/6; see `docs/BUGS_AND_BEHAVIORS.md`'s G3/G8
   and `docs/BUILD_GUIDE.md` checkpoint 36. Still open: CI wiring,
   non-English keyboard layouts, tab-already-open-after-reload, worker
   sleep/wake, hosted multimodal routing, semantic Project assignment, and
   the review/deletion/landing surfaces (still need manual browser
   verification, or a later phase of this same suite). The suite was
   updated for the Side Panel migration (checkpoint 38) but has not been
   re-run since — running it, and a real-Chrome manual pass of the Side
   Panel itself (toolbar click, panel persisting across a tab switch,
   worker sleep/wake), is the next concrete verification step.
2. **Concurrent ingest serialization:** sequential retries are idempotent, but
   simultaneous-request behavior remains an explicit gate.
3. **Owner/RLS integration fixtures:** pure ownership tests exist, and live
   cross-owner integration verification against a local `base44 dev` instance
   (two synthetic owners plus the real admin-role account) was completed
   2026-08-14 — see `docs/BUGS_AND_BEHAVIORS.md` G4 and
   `docs/ENGINEERING_NOTES.md`. A matching hosted spot-check was performed
   once already, at the original RLS-bypass fix (2026-07-26 entry); it was
   not repeated in this pass and remains optional future work if desired.
4. **Folders:** bounded two-level Collection folders are planned but not built.
   They must never influence routing or appear in the extension.
5. **Competition finish:** demo fixture and screenshots/video remain. User
   documentation is done: refreshed `README.md`, `docs/GETTING_STARTED.md`
   (including unpacked-extension install), `docs/PRODUCT_GUIDE.md`, and the
   public `docs/API.md`.
6. **G9 onboarding, partially built:** Build Guide 36 adds `src/onboarding/`
   (pairing checklist + first-capture status banner, dashboard-only, no
   entity/function changes — reads the already-deployed `ExtensionInstall`
   entity). **Deployed to the site** as of the `target=site` run at commit
   `1a28831` (2026-08-14T21:39:38Z) — the "not yet deployed" note here was
   stale as of the 2026-08-16 audit; browser verification of the deployed
   UI is still outstanding. Still open regardless of deploy status:
   signed-out landing changes, a distinct "paired and ready" state, the
   wider recovery-state set, and fixture/Playwright tests — see
   `docs/DECISIONS.md` and the G9 entry in `docs/BUGS_AND_BEHAVIORS.md`.
7. **Chrome Side Panel migration (issue #46):** open, unmerged as of
   2026-08-16 — `git log origin/main` and `gh pr list` show no matching
   branch/PR yet, and `extension/manifest.json` still uses
   `action.default_popup` (no `side_panel` key, no `sidePanel` permission).
   Treat every popup-based instruction elsewhere in the docs as current and
   correct until #46 lands; do not assume Side Panel behavior.
8. **Beta-readiness backlog opened 2026-08-15/16:** issues #47 (this
   source-of-truth audit), #48 (Don't-Make-Me-Think UX audit), and #49
   (extension release checklist) are open and unstarted beyond this audit's
   own doc patches. See `docs/BETA_LIMITATIONS.md` for the consolidated
   known-limitations list this audit produced.

Undo for deletions and resolutions is a recorded omission, not a gap
(`docs/DECISIONS.md`).

**Unverified production-data claim:** "Immediate continuation" above states
four real `needs_review` Captures exist in production data. That was true as
of whenever it was written; this audit has no production data access and
cannot confirm it still holds — treat it as unverified, not current fact.

## Safe work order for the next implementation

For any High or Critical change:

1. Update the charter only if product intent changes.
2. Update `docs/V3_1_PRODUCT_AND_RISK_PLAN.md`.
3. Update `docs/API_AND_FAILURE_MAP.md`.
4. Add or update the Build Guide checkpoint.
5. Write failing pure fixtures.
6. Implement shared deterministic logic.
7. Implement Base44 function/entity/UI code.
8. Run the full release gates.
9. Append the real result to `docs/ENGINEERING_NOTES.md`.
10. Do not deploy without explicit owner approval.

## Verification commands

PowerShell:

```powershell
$magpieDeno = "$env:USERPROFILE\.deno\bin\deno.exe"
& $magpieDeno test --allow-env --allow-read tests

$entryFiles = (Get-ChildItem -Path base44\functions -Filter entry.ts -Recurse).FullName
& $magpieDeno check $entryFiles

$extensionScripts = (Get-ChildItem -Path extension -Filter *.js -Recurse).FullName
foreach ($script in $extensionScripts) { node.exe --check $script }

rg -n "@base44/sdk" extension
npm.cmd run build
```

The `rg` command should return no matches. Deno is installed at
`C:\Users\omerk\.deno\bin\deno.exe` but is not reliably present in this shell's
`PATH`.

Base44 CLI commands must use the local package:

```powershell
npx.cmd base44 whoami
npx.cmd base44 dev
npx.cmd base44 logs --level error
```

Use targeted release commands. `npx base44 agents push` is a full
synchronization and may delete remote Agents absent from `base44/agents`.

## Claude Code launch

Recommended local workflow:

```powershell
cd D:\backend-competition
claude
```

Claude Code automatically reads the repository `CLAUDE.md`, which points back to
this handoff.

Optional Base44 sandbox MCP connection:

```powershell
claude mcp add --transport http base44 https://app.base44.com/mcp
```

Then run `/mcp` inside Claude Code and authenticate. The local checkout plus
Base44 CLI is the simpler continuation path for this repository; do not edit the
local checkout and the Base44 cloud sandbox concurrently.

## Current continuation after proactive refresh Phase 1

The local owner-browser proactive refresh slice is implemented on the current
branch. It adds an opt-in `chrome.alarms` wake-up, one inactive background tab
at a time, bounded refresh evidence through the existing `refresh-capture`
function, additive local URL state, per-domain cooldown, timeout/cleanup, and
unit coverage. It does not add a backend entity, queue, cloud browser, or
server-to-extension read path.

Verified locally: 150/150 Deno tests, all 17 backend entry points pass
`deno check`, all extension scripts pass `node --check`, and `npm run build`
passes. Not yet verified: real Chrome alarm delivery, background tab behavior,
service-worker restart during refresh, offline recovery, and a live staging
round trip. The next task is manual/browser verification before any release
or deployment approval.

The proactive refresh slice also now garbage-collects an exact local `savedUrls`
entry when owner-scoped `refresh-capture` returns `no_match`, covering the
case where its Record or parent Collection was deleted server-side. This is
local cache cleanup only; the extension still has no Record read path.

## Suggested first prompt

```text
Continue Magpie V3.1 from docs/CLAUDE_CODE_HANDOFF.md.
Treat docs/PRODUCT_CHARTER.md as authoritative.
First verify the deployed signed-in Magpie Agent conversation and inspect logs.
Do not write entity or production code until you update the risk plan and API
failure map. Preserve the MV3 plain-fetch trust boundary. Do not deploy without
my explicit approval.
```
