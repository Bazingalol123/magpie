# Magpie V3.1 — Claude Code handoff

> Updated 2026-07-25 after the ten-gap release (deletion, dismissal, blocked
> watches, review UX, chat markdown, landing page).

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
- Production: <https://magpieorelse.base44.app>
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

Latest verified release gates:

- 102/102 Deno tests pass.
- All backend entry points pass `deno check`.
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

## Bug-fix pass (2026-08-14, `fix/p0-bugfix-pass`, not yet merged)

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

## Immediate continuation

Build Guide 29.2–29.4 are complete and deployed. The remaining manual check is
one real browser pass: sign out to see the landing page, sign in, exercise the
review panel (accept, redirect, create-with-Project, dismiss), delete an Item,
inspect a blocked Item's pause/resume, and ask Magpie for a comparison table.
Four real `needs_review` Captures exist in production data for this.

## Known gaps, in priority order

1. **Chrome integration matrix:** right-click capture modes, real crop geometry,
   hosted multimodal routing, semantic Project assignment, and the new review,
   deletion, and landing surfaces still need manual browser verification.
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
   entity). Not yet deployed or browser-verified. Still open: signed-out
   landing changes, a distinct "paired and ready" state, the wider
   recovery-state set, and fixture/Playwright tests — see
   `docs/DECISIONS.md` and the G9 entry in `docs/BUGS_AND_BEHAVIORS.md`.

Undo for deletions and resolutions is a recorded omission, not a gap
(`docs/DECISIONS.md`).

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

## Suggested first prompt

```text
Continue Magpie V3.1 from docs/CLAUDE_CODE_HANDOFF.md.
Treat docs/PRODUCT_CHARTER.md as authoritative.
First verify the deployed signed-in Magpie Agent conversation and inspect logs.
Do not write entity or production code until you update the risk plan and API
failure map. Preserve the MV3 plain-fetch trust boundary. Do not deploy without
my explicit approval.
```
