# Deliberate decisions

## No direct entity access from the extension

The extension only calls `ingest-clip` with a random opaque pairing token. It cannot read collections, records, clips, or enrichments. The server stores only the token hash and resolves its owner binding, enforcing the asymmetric trust boundary rather than treating RLS as a generic checkbox.

## No SDK in the MV3 service worker

The worker uses `fetch` and `chrome.storage.local` to survive MV3 lifecycle termination. The SDK remains in the dashboard where browser storage and realtime sockets are appropriate.

## No visual schema editor

The classifier proposes a small schema and collection. A schema editor would not improve the 60-second demo enough to justify its complexity; schema changes can remain a follow-up capability.

## One reliable enrichment path first

The first enrichment implementation focuses on values represented in the captured text. General scraping, arbitrary selectors, and broad connector export are deferred until the ingestion-to-live-row path is dependable.

## No connector export in the first demo

Google Sheets and Notion export are intentionally absent. They would add OAuth setup and another presentation surface without making the core clip-to-live-row workflow more reliable. The README names this omission instead of presenting an unused connector as feature depth.

## Screenshot storage is retained

The extension captures a compressed viewport image. The backend turns that data URL into a `File`, uploads it through `integrations.Core.UploadFile`, and persists the returned URL in `Clip.screenshot_id`. Direct binary entity fields were rejected by the local Base44 entity API, so file storage is kept as a separate operation. Screenshot upload is best-effort: a temporary storage failure cannot discard the clip itself.

## Keep Collection as a compatibility layer in V2 (historical; superseded for V3)

V2 made Mission the navigation, schema, and decision boundary because removing Collection would have forced a destructive migration and rewrite of stable enrichment code. V2 therefore hid Collection as an implementation detail and stamped Mission-queryable fields onto Record. This was a transitional implementation decision, not the durable product model.

## Add capture modes without adding a crawler

V3.1 treats element, selection, page, link, visual, and image capture as different evidence bundles for the same Clip and routing pipeline. Link capture uses the target URL plus browser-observed label/context and does not authorize the backend to retrieve arbitrary URLs. This avoids introducing SSRF, redirect, authentication-wall, content-size, and source-trust behavior into the critical capture path.

Visual and image modes upload actual browser-captured pixels through the existing screenshot boundary and expose that image only to the backend routing request. The extension remains write-only, imports no SDK, and receives only the existing safe routing status.

## Restore Collection as the automatic organization boundary in V3

The V2 assumption that one Mission owns one extraction schema is too narrow for Magpie's original promise. A believable Mission such as moving to a city can contain apartments, neighborhoods, and moving companies. V3 therefore keeps Mission as optional purpose and makes Collection the schema-backed type selected or created by the classifier.

This supersedes the product direction in the V2 compatibility decision without requiring a destructive competition migration. Existing Mission schema fields and Records remain readable while new routing becomes canonical.

## No arbitrary nested folders in V3

Magpie's fixed hierarchy is optional Mission, auto-organized Collection, then Record. Arbitrary folder trees would restore manual filing work and weaken automatic organization. Search, archive, tags, and saved views should be exhausted before reconsidering another hierarchy level.

## Add bounded navigational folders in V3.1

V3.1 supersedes the blanket presentation-level folder omission without changing the canonical product hierarchy. Users may organize Collections into a Folder and one level of Subfolder, but folders remain optional dashboard navigation.

Folders cannot contain individual Records or Projects, cannot influence routing, and never appear in the extension. The backend keeps Folder writes behind validated functions to prevent cross-owner references, cycles, excessive depth, and duplicate sibling names. Arbitrary depth and routing-aware folders remain rejected.

## Use clearer UI labels without renaming backend resources

V3.1 presents Mission as Project, Record as Item, Clip as Capture, and routing review as Needs review. Collection remains Collection. Base44 entity and function names stay unchanged because a destructive naming migration would add data and deployment risk without improving the user experience.

## Infer a Project semantically, never by recency

An unscoped capture may be associated with one active owner-owned Project only when a
backend code-agent proposal passes deterministic owner/status validation, confidence
of at least `0.90`, and a lead of at least `0.15`. Explicit Project selection always
wins. No clear match remains global; ambiguity enters review.

This supersedes V3's global-only interpretation of a missing Mission hint, but it does
not restore the discarded "latest active Mission" shortcut. The agent is stateless,
has no entity-write tool, and cannot expand the extension's read permissions.

## Use one broad configured Agent with narrow authority

V3.1 adds one `magpie_organizer` Agent instead of separate camera, shopping, job, or
research assistants. Its domain breadth comes from the canonical Project,
Collection, Item, Capture, routing, update, and watch model—not from hard-coded
vertical rules.

The Agent receives no direct entity tools and no cross-conversation memory. It may
read bounded owner data and configure explicit watches only through backend
functions that authenticate and re-check ownership. Automatic capture routing
remains the existing deterministic code-agent workflow. This avoids both a narrowly
scoped product and an open-ended assistant with unbounded database authority.

## Resolve only review-state Captures, without undo

`resolve-routing` deliberately acts only on Clips whose routing status is
`needs_review`. Re-routing an Item that was already filed successfully, and
undoing a completed resolution, are both excluded from this first cut. A second
resolution attempt with a different target returns `409` instead of silently
overwriting the first decision; an identical retry is idempotent.

Undo was omitted because it forces design decisions that deserve their own
gate: whether an emptied owner-created Collection is deleted or archived,
whether reverting needs an audit trail beyond `corrected_at`, and how a revert
interacts with enrichment history on the created Record. The dashboard response
also intentionally omits Collection names from the extension's ingest reply;
toasts stay informative using only the already-permitted `routing_status` and
`routing_reason_code`, preserving the write-only extension contract.

## Full delete is the removal semantic, and dismiss deletes the capture

When an owner removes an Item, Magpie permanently deletes the Item, its
WatchRules, its Enrichment history, its RoutingDecision, and its Clip in one
server-owned cascade. When an owner dismisses an unwanted `needs_review`
capture, the RoutingDecision and Clip are deleted the same way. Soft archive
and a `dismissed` status were considered and rejected for V3.1: both require
entity enum changes and produce hidden state the competition build has no UI
to manage.

This is a deliberate, narrow exception to "evidence travels with data": the
owner of the evidence may destroy it, and only through an authenticated
owner-validated function. Nothing else in the product deletes evidence, and
enrichment failures still never mutate or remove anything.

## Collection and Project deletion reuse the same full-delete semantic

`delete-collection` and `delete-mission` extend the same owner-destroys-their-
own-evidence exception one and two levels up the hierarchy: deleting a
Collection permanently deletes every Record inside it (and each Record's
WatchRules, Enrichments, RoutingDecision, and Clip); deleting a Project
(Mission) does the same for every Collection scoped to it. Both reuse the
identical per-record cascade `delete-record` already established rather than a
second cascade implementation.

Deleting a Project deliberately does not reach `needs_review`/`failed` Clips
that only carried it as a routing hint and never became a Collection/Record.
Silently deleting unresolved review work because it once mentioned a Project
the owner is now removing would surprise a user trying to declutter their
organized structure, not their inbox. Those Clips keep a dangling `mission_id`;
this is safe because `resolve-routing`'s existing Project validation already
returns a typed `404` for an unknown Project id rather than crashing, and the
review UI simply shows the capture as no longer having a resolvable Project
hint. Global Collections (no `mission_id`) are never touched by Project
deletion.

## Blocked watches pause themselves after three consecutive blocked checks

A login-walled or bot-challenged source is a stable condition, not a transient
failure. After three consecutive `blocked` results, the sweep sets the watch
inactive with `AUTO_PAUSED_BLOCKED` instead of re-checking a source that
cannot succeed. Three was chosen over one so a single transient challenge or
misclassified page does not kill a healthy watch. The owner can resume at any
time; extension-assisted recapture-to-update remains future "Living knowledge"
scope.

## The extension's refresh memory is local-only; uninstall wipes it, revocation does not

Refresh-on-revisit needs the extension to recognize pages the owner previously
captured. It remembers only URLs it itself submitted, stored in
`chrome.storage.local` beside the pairing token. The server never sends the
captured-URL list (or any owner data) down to the extension: that would turn a
stolen pairing token from write-only into a read of the owner's research
history.

The accepted consequence is that uninstalling the extension wipes this memory
together with the token, so after re-pairing, automatic refresh resumes only
for newly captured or re-clipped pages, with dashboard source links as the
recovery path. The designated future fix is a bounded URL-hash seed handed to
the extension at pairing time by the authenticated dashboard — an explicit
owner action on the trusted surface — never a read capability for the token.

A server-side pairing revoke is intentionally narrower than uninstalling the
Extension. On the next pairing-authenticated `403`, the browser removes only
`extensionToken` and its non-secret `extensionId`. It keeps `ingestUrl` so the
owner can open the right dashboard and keeps `savedUrls` so a fresh pairing can
resume refresh-on-revisit without the server ever disclosing browsing history.

Auto-refresh defaults on with a popup toggle, is bounded to explicitly saved
pages, is rate-limited to once per URL per 12 hours, and announces itself with
a toast when it changes anything.

## No RLS admin bypass, and no scoped admin-audit replacement built

Discovered 2026-07-26 as a live incident: every owner-scoped entity's RLS
allowed `role: "admin"` to read/update/delete any owner's rows, and
`canAccessOwner()` gave the same bypass to `classify-clip`/`enrich-record`.
The app owner's own account carries `role: "admin"` (Base44's default for the
app creator), so the bypass was not theoretical — it was actively exposing
one real user's Clips to another during ordinary dashboard use, verified live.

The fix removes the bypass entirely rather than narrowing it to a dedicated
admin-audit function. Magpie's product promise is per-owner isolation with no
interpersonal visibility (`docs/PRODUCT_CHARTER.md`); nothing in the shipped
product needs an admin to see across owners, and nothing in the frontend or
backend depended on the bypass once removed. If a legitimate cross-owner
admin/support tool is ever needed, it should be a new, explicitly audited,
owner-facing-consent-aware function — never a blanket RLS or auth-helper
bypass — and that is a future decision, not part of this fix.

The reverse report from the same incident (a non-admin account allegedly
seeing another owner's data) has no matching code path in RLS or in any
backend function's ownership check; every non-admin path is a strict
`owner_id == caller.id` check with no alternative. This was not treated as a
second bug to fix — see `docs/API_AND_FAILURE_MAP.md` for the reasoning.

## CI/CD: automate the gates, never auto-deploy to Base44

`.github/workflows/ci.yml` runs the full release-gate suite (Deno tests and
type check, extension `node --check`, the `@base44/sdk` import grep, `npm
run build`) automatically on every push and PR. That much is pure signal —
nothing it does can mutate Base44 or ship anything, so there was no reason
to keep it manual.

Deploying is different. `CLAUDE.md` requires explicit owner approval before
any deploy, entity push, or Agent sync, and the risk plan says the same for
"any remote mutation... regardless of risk rating." An auto-deploy-on-merge
pipeline would violate that outright, so `deploy-base44.yml` is
`workflow_dispatch`-only — it never fires from a push or a merged PR — and
its `deploy` job additionally sits behind the `production-deploy` GitHub
Environment's required-reviewer approval. That gives a real audit trail
(who triggered it, who approved it, which target) without ever letting CI
itself decide to touch production. The `agents` target specifically prints
the existing "full synchronization" warning from `CLAUDE.md` before running,
since `npx base44 agents push` deletes any remote Agent absent from
`base44/agents/*.jsonc`.

The extension-packaging workflow (`extension-release.yml`) is the one
exception allowed to run unattended on a tag push: it only ever touches this
GitHub repo (zip + Release), never Base44, so it carries none of the same
risk.

## URL canonicalization for duplicate matching is forward-only, and keeps the fragment

`canonicalizeUrl()` (Build Guide 29.14) fixes duplicate Clips/Records caused
by tracking-param variance (`utm_*`, `gclid`, `fbclid`, ...) going forward,
but does not retroactively scan and merge/flag duplicate rows that already
exist from before this change. A retroactive cleanup would need its own
explicit design (what counts as a safe auto-merge vs. something that needs
owner review, what happens to a Collection left with zero Records if its only
Record was a duplicate) rather than riding along with this fix, and the user
explicitly scoped this pass to new captures only.

The function deliberately does **not** strip the URL fragment (`#...`), even
though a generic canonicalizer normally would. List/detail sites can use
hash-based client-side routing where the fragment is the only thing
distinguishing one listing from another (the same class of page this release
already had to handle carefully for Build Guide 29.13's link-resolution fix).
Stripping it here would risk the opposite failure mode from the bug being
fixed: two genuinely different items silently merging into one duplicate
instead of two real duplicates staying unmerged.

## B7 pagination is UI-only; the 200-record fetch cap is a separate, larger gap

Build Guide 29.18 paginates the rendered per-Collection Record table/card
grid, but `loadDashboard` (`src/App.jsx`) still fetches at most 200 rows per
entity (`Record`, `Clip`, `Enrichment`, `RoutingDecision`, `WatchRule`) in a
single `list()` call. A user whose total Record count exceeds 200 across all
Collections combined would have older Records silently absent from the
dashboard entirely — no error, no indication, they just never load. UI
pagination cannot fix this; it only helps once the data is already fetched.
Fixing the fetch cap itself needs its own scoping pass (cursor vs. offset
pagination, per-entity vs. global page size, whether `loadDashboard`'s
single-shot-everything pattern should change at all) and was intentionally
left out of this pass, which was scoped to "the page keeps growing" UX
complaint, not data completeness at scale. Worth revisiting if this project
gets meaningfully more usage per owner.

**Superseded by Build Guide 35 (G1):** the fetch cap itself is fixed —
`loadDashboard` now pages every entity to completion (or a 5,000-row
ceiling) instead of a single 200-row request. See the next entry for the
scoping decision made as part of that fix, and
`docs/ENGINEERING_NOTES.md` (2026-08-14) for the full contract note.

## G1 fix keeps Record queries global instead of scoping to the active Collection

G1's own note in `docs/BUGS_AND_BEHAVIORS.md` suggested scoping Record
queries to the active Collection "where that's a reasonable design." Before
choosing, every consumer of `data.records` in `src/App.jsx` was checked:

- the Items count in `workspace-heading` sums Records across the whole
  Mission (or the whole owner with no Mission selected);
- `CollectionSidebar` needs a per-Collection count for every Collection in
  the sidebar, not just the active one;
- `ActivityPanel` shows recent activity across all Collections;
- `missionRecords`/`missionCollectionIds` derive Mission-level aggregates
  that need every Record scoped to the Mission, not just the active
  Collection within it.

Scoping the Record fetch to only the active Collection would break all four
of these without restructuring them into their own separately-scoped
queries — a materially larger change than a data-completeness fix, and one
that changes consumption patterns the task instructions explicitly said not
to touch without a specific need. Kept `loadDashboard` fetching the full
(now fully paginated, not capped) Record set instead. If this ever becomes a
real performance problem — an owner with tens of thousands of Records — the
right fix is probably separate lightweight count/aggregate queries for the
sidebar and heading rather than scoping the main fetch, so the full Record
set doesn't have to move over the wire just to render a count. Not needed at
current or foreseeable scale (5,000-row ceiling per entity per load).

## The in-app bug report form is dashboard-only and has no rate limit

`report-bug` (Build Guide 34) deliberately does not extend to the landing
page or the extension, even though "someone hits a bug before ever signing
in" is a real gap the raw GitHub link (checkpoint 33) doesn't cover either.
Reachable-when-signed-out would mean an unauthenticated endpoint that writes
to a public GitHub repo, which needs its own abuse-protection scoping
(rate limiting, minimum-content heuristics) before it's safe to expose —
explicitly deferred rather than built ahead of that conversation, same
posture as the rest of B11's original triage note.

Within the dashboard-only scope that shipped, there is also no per-owner
rate limit on report submissions. This was a deliberate simplification, not
an oversight: the caller is authenticated (unlike a public endpoint), GitHub
enforces its own API rate limit on the token (5,000 req/hr), and the token
is scoped to Issues-only on a single repo, so the worst case of a signed-in
owner submitting many reports is GitHub issue noise, not a security or data
exposure. Revisit if this ever becomes reachable from a signed-out surface.

## G7 audit: the one direct Dashboard entity write (`Record.decision_status`/`next_action`) stays as-is

Exhaustive grep of `src/` for `base44.entities.*.(create|update|delete|bulkCreate)`
found exactly one hit: `updateCandidateStatus()` in `src/App.jsx` calls
`base44.entities.Record.update(selectedRecord.id, { decision_status,
next_action })` directly instead of going through a backend function, unlike
every other mutation in the file (`create-mission`, `report-bug`,
`resolve-routing`, `delete-record` all use `base44.functions.invoke`).

Left unfixed, deliberately, for two independent reasons:

1. `record.jsonc`'s `update` RLS is a strict `{"data.owner_id":
   "{{user.id}}"}` with no admin or service-role escape hatch — re-verified
   live against a local `base44 dev` instance during this same pass (see
   `docs/ENGINEERING_NOTES.md`, 2026-08-14 G4 entry). Even a forged
   `selectedRecord.id` pointing at another owner's Record is rejected
   server-side by RLS; the "always go through a function" convention is
   defense-in-depth here, not the only barrier.
2. `decision_status`/`next_action` are presentational triage metadata with a
   system-set default at creation time. The only backend code that reads
   either field back (`agent-tools.ts`) truncates it to 40 characters as
   bounded context for the owner's own AI agent tool calls; nothing treats
   either field as an ownership, routing, or authorization signal.

Adding a bespoke backend function for a two-field, RLS-protected, non-security
status toggle would be additive complexity without closing a real gap. If
either field ever becomes security-relevant (gates a notification, a share
link, another owner-visible surface, etc.), move this call to a small backend
function at that point — not before.

## Issue #19 / G8: Phase 1 scope, local fixtures over a live site, CI wiring deferred

Issue #19 ("Complete and automate the Chrome capture integration matrix") and
its G8 dependency ("local verification harness") are both large — the full
issue also covers non-English keyboard layouts, tab-already-open-before-
reload, worker sleep/wake, and a hosted smoke test. This was deliberately
scoped down before implementation, in a plan-mode conversation with the
repo owner, to avoid either silently shrinking the issue's acceptance
criteria or attempting all of it in one unreviewable pass. Recording the
three scoping decisions here so a future session does not re-litigate or
silently re-expand them.

**Phase 1 = all 6 capture modes, nothing else.** Element, selection, page,
link, visual, and image are the whole multi-mode capture contract
(`docs/V3_1_PRODUCT_AND_RISK_PLAN.md`) and share one Clip/routing pipeline,
so a matrix that skipped any of them would not actually prove the pipeline
works end to end. Non-English keyboard layouts, tab-reopen-after-extension-
reload, and worker sleep/wake are each a narrow edge case orthogonal to the
6-mode matrix — deferring them keeps this pass reviewable and still ships a
real, running harness. The hosted smoke test is explicitly the very last
step of the issue's own "Verification" section ("Hosted smoke verifies only
the final release path after approval") and requires a production deploy
approval this task was not given — deferring it is not a scope reduction, it
is respecting the issue's own stated order.

**Local static HTML fixtures instead of a live external site.** Issue #19's
own "Verification" section calls for "Local Base44 + local Vite + unpacked
Extension" and this repo's whole existing test philosophy
(`tests/*.test.ts`) is pure/deterministic fixtures, not live external
dependencies. A live site can change layout, get rate-limited, add its own
bot/CAPTCHA defenses (ironic, given B8/refresh-capture's guardrails exist
because of exactly that class of site), or simply go offline, turning a
regression suite into a source of unrelated flakiness. The chosen fixtures
(`tests-e2e/fixtures/index.html` + 3 listing detail pages + an article page)
are deliberately shaped to reproduce the real B4 regression (a card-grid
list page where element/link capture must resolve to the clicked card's own
detail URL, not the list page's URL) rather than being arbitrary placeholder
markup.

**CI wiring is a deliberate fast-follow, not part of this change.** Getting
`tests-e2e/` running green and stable locally first, before adding a new job
to `.github/workflows/ci.yml`, avoids landing a flaky new gate on every push/
PR before its stability profile is understood (extension/Chromium E2E tests
are a materially different reliability class than the existing pure Deno
unit tests `ci.yml` already runs). This also sidesteps deciding CI-specific
concerns — headless Chromium install caching, a CI-only pinned-port
collision story, secrets/OTP handling in a shared runner — that this pass
did not need to resolve to deliver a working local harness. Wiring it into
`ci.yml` is the natural next step, not rejected, just sequenced after this.

## Issue #19 / G8: a dev-only `window.__magpieBase44` hook in `base44Client.js`

The issue's own auth-strategy decision requires Playwright tests to log the
dashboard in through the real `base44.auth.loginViaEmailPassword(email,
password)` SDK method, called via `page.evaluate(...)`, rather than
hand-injecting a session into `localStorage`. `src/api/base44Client.js`'s
`base44` client singleton was not reachable from outside React's module
graph before this change — nothing in `src/App.jsx` exposes it — so
satisfying that requirement literally needed one new handle.

Added `if (import.meta.env.DEV) { window.__magpieBase44 = base44; }` right
after the client is constructed. `import.meta.env.DEV` is statically `false`
in a `vite build` production bundle (confirmed: `grep -c __magpieBase44
dist/assets/*.js` is `0` after a real build in this pass), so this branch and
the global it creates are dead-code eliminated and never exist outside a
local `vite`/`base44 dev` session. This is a narrow, additive, dev-gated
change to a shared frontend file — scored Low (L=1, I=1) since it has no
runtime effect in the shipped product at all — not a new production auth
surface.

## G9 onboarding (Build Guide 36): shipped 3 of 7 required UI states, not the full contract

`docs/BUGS_AND_BEHAVIORS.md`'s G9 entry lists seven required UI states and a
"treat onboarding as a state machine" constraint. This pass built the state
machine (`src/onboarding/state.js`) and two of the states that hang off it —
signed-in-not-paired (`PairingChecklist`) and first-capture-processing/
received (`CaptureStatusBanner`) — but deliberately did not attempt:

1. **Signed-out landing changes.** G9 state 1 asks the landing page itself to
   explain Capture → Organize → Review → Refresh and the write-only Extension
   model before sign-in. `Landing.jsx` was not touched; the existing landing
   page copy (checkpoint 33) was left as the signed-out surface.
2. **A distinct "paired and ready" state (G9 state 4).** Right now a paired
   owner with zero clips stays in `AWAITING_FIRST_CAPTURE`, which is close
   enough in copy ("waiting for the extension — open the popup and try a
   capture") but doesn't separately call out the keyboard shortcut or explain
   available capture actions as its own step, per the required-journey list.
3. **The broader recovery-state set.** `CaptureStatusBanner`'s `FAILED`
   branch is one generic "something went wrong, report it" state; it does not
   distinguish AI/routing-unavailable from source-blocked from a generic
   ingest failure, all of which G9 lists as distinct recovery states.
4. **Fixture-driven UI tests and the local Playwright happy-path test**, both
   explicit G9 acceptance criteria. `state.js` was written pure and
   side-effect-free specifically so it can be unit-tested, but no test file
   was added in this pass.

Reason for the cut: these are the states directly reachable from the current
empty-Dashboard/first-capture path, the highest-value slice for a new signed-
in user, and each of the remaining items is either a separate surface
(Landing) or additive polish on top of the now-existing state machine rather
than a redesign — lower risk to ship as a follow-up than to bundle into one
larger change. Revisit as a second G9 pass; do not treat G9 as closed until
items 1–4 above are addressed and the table row in
`docs/BUGS_AND_BEHAVIORS.md` says so.

## Extension popup -> Side Panel migration (issue #46): no real-Chrome UI verification performed

Build Guide checkpoint 38 replaces `extension/popup.html`/`.css`/`.js` with
`extension/sidepanel.html`/`.css`/`.js`, switches `extension/manifest.json`
to `side_panel.default_path` + the `sidePanel` permission, drops
`action.default_popup`, and has `service-worker.js` call
`chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` once in
`onInstalled`. This session had no way to launch real Chrome, so the actual
acceptance criteria that only a live browser can confirm — the toolbar
action opening a genuine Side Panel instead of a popup, the panel visibly
staying docked while the dashboard opens in a new tab, and the panel
surviving a service-worker sleep/wake cycle — were **not** manually
exercised. What was verified instead: `node --check` on every
`extension/**/*.js`; a new Deno fixture
(`tests/extension-manifest.test.ts`) asserting the manifest is valid JSON,
declares no `default_popup`, declares `side_panel.default_path` and the
`sidePanel` permission, and that every manifest-referenced file exists on
disk and the old popup files are gone; the `@base44/sdk`-in-`extension/`
grep stays clean; and a full read-through reasoning that
`chrome.storage.local` keys (`ingestUrl`, `extensionToken`,
`activeMissionId`, `captureIntent`, `autoRefreshEnabled`, `savedUrls`) are
untouched, so pairing/auto-refresh state survives the surface change without
a migration step. The `tests-e2e/` Playwright helpers/specs were updated to
open `sidepanel.html` instead of `popup.html` and to drop the
now-inaccurate "closes itself" comments, but the suite itself was not run in
this pass (it needs a real Chrome + a local `npx base44 dev` backend, same
precondition as every other run of that suite). Real-Chrome verification is
the explicit next step before treating this migration as done, not a gap
that was silently skipped. **Merged to `main` 2026-08-16 as PR #50**; still
outstanding at merge time: the real-Chrome verification above, and the
`extension-v0.3.0` release tag / site redeploy.

## 2026-08-16 — Issue #47 documentation audit: corrections, not new decisions

This entry records corrections made during the pre-beta source-of-truth audit
(issue #47). It does not change product intent; it reconciles stale
"not yet deployed" claims against verifiable deployment evidence found in
GitHub Actions run history (`gh api repos/Bazingalol123/magpie/actions/runs`),
which was not consulted when several earlier checkpoints were written.

- **B13 (cascade-delete pagination) and G1 (dashboard pagination) were
  deployed, not "not yet deployed."** `docs/BUGS_AND_BEHAVIORS.md` and
  `docs/CLAUDE_CODE_HANDOFF.md` stated both fixes were source-only pending
  owner-approved deploys. GitHub Actions run
  [`31849671121`](https://github.com/Bazingalol123/magpie/actions/runs/31849671121)
  ran `deploy-base44.yml` with `target=functions` (`npx base44 functions
  deploy --force`, which redeploys every function) against commit `f542c4e`
  — the exact commit that contains the B13 fix — at 2026-08-14T23:14:53Z, and
  succeeded. Run
  [`31850021926`](https://github.com/Bazingalol123/magpie/actions/runs/31850021926)
  then ran `target=site` against the same commit at 2026-08-14T23:20:40Z,
  deploying the G1 dashboard-pagination frontend fix. `git diff
  f542c4e..e2a4f84 -- base44/` (current `main` HEAD) is empty, so no backend
  function has changed since that deploy — the deployed function source and
  the current repository source are the same for `base44/functions`.
  `docs/BUGS_AND_BEHAVIORS.md` and `docs/CLAUDE_CODE_HANDOFF.md` were updated
  accordingly. This does **not** mean the fixed behavior was exercised
  through the browser in production — the manual sign-in click-through is
  still unperformed and remains "unknown," not "live-verified."
- **`report-bug` was also deployed** by the same `--force` functions deploy
  (it redeploys all functions unconditionally, regardless of which one
  changed), contradicting Build Guide checkpoint 34's "not yet deployed"
  note. Function *presence* in production is now "deployed"; its live
  behavior (an actual GitHub issue being filed end to end) is still
  unverified by this audit.
- **G9 onboarding's site code was deployed** by the `target=site` run at
  commit `1a28831` (2026-08-14T21:39:38Z), even though the UI contract is
  still incomplete per the entry above. "Deployed" and "feature-complete" are
  independent axes; G9 is now both source-complete-for-its-scope and
  deployed, but still lacking states 1/4/recovery-set/tests as documented.
- **Current `deno test` count is 143/143** (verified locally on 2026-08-16),
  not the 102/102 figure in `CLAUDE.md`'s "Current continuation point" or the
  intro line of `docs/CLAUDE_CODE_HANDOFF.md`. `docs/BUILD_GUIDE.md` and
  `docs/ENGINEERING_NOTES.md` already carried the correct running total
  (143/143, dated 2026-08-15, B13) — the staleness was only in the two
  top-level summary docs, which have been corrected.
- No entities-target or agents-target `deploy-base44.yml` run appears in the
  most recent 12 workflow dispatches (checked via `gh run list
  --workflow=deploy-base44.yml`), so entity-schema and Agent deployment
  status claims elsewhere in the docs could not be independently confirmed or
  denied this way; they remain whatever the source doc already stated
  (typically "run locally, not CI-visible").
- The heading `## Keep Collection as a compatibility layer in V2 (historical;
  superseded for V3)` above had lost its body paragraph in an earlier edit —
  the paragraph had drifted under the next heading instead. Reordered; no
  wording was changed, only the paragraph's position.

See the PR for issue #47 for the full audit table and
`docs/BETA_LIMITATIONS.md` for the consolidated supported-vs-unverified
summary this audit produced.

## Picker/snip mode-switch and stale-toast fix (extension-v0.3.1): no real-Chrome UI verification performed

Build Guide checkpoint 40 fixes two bugs in `extension/content.js` reported
by hand-testing the Side Panel build: Escape not visibly cancelling the
picker/snip hint toast, and being unable to switch between Clip Element and
Snip Area once one was active. Both fixes were verified by reading the full
`startPicker`/`startSnip`/`stopPicker`/`stopSnip`/`showToast` lifecycle and
confirming the new guards and `hideToast()` calls produce the intended state
transitions — not by exercising the picker in a real browser, since this
session had no way to launch real Chrome. Real-Chrome verification (trigger
Shift+Alt+M, confirm Escape clears the hint immediately, click Snip Area
while Clip Element is active and confirm it switches cleanly) is the
explicit next step before treating either fix as done.

## Onboarding flow's iOS Shortcut: reused the existing `/share` session flow instead of PR #67's token design

Build Guide checkpoint 42 builds the iPhone/iPad Shortcut on top of the
already-merged `/share` page (`src/App.jsx`'s `readShareDraft`,
`ShareCapturePage`, `public/manifest.webmanifest`'s `share_target`,
`public/sw.js`), which opens Safari at
`https://magpiecapture.com/share?url=<link>` using the user's normal signed-in
session — the same authenticated session `base44.functions.invoke` already
uses. This was a deliberate divergence from PR #67
(`docs/mobile-capture-design.md`, open/DRAFT at the time of this pass),
which proposes a slower, explicitly-sequenced path: a design gate, then
separate popup/UI, backend-token, Android, and iOS implementation PRs, with
iOS built around "a scoped, revocable, write-only Mobile Capture token" and
"an HTTPS request." That token/slice sequencing was never actually built —
only the design doc landed — while the `/share` page, manifest, service
worker, and `mobile-capture` function it would have superseded were already
merged to this branch and confirmed live in production
(`docs/ENGINEERING_NOTES.md`, 2026-08-21 entry: "production was found to be
serving this ... bundle ... confirmed via `mobile-capture` and the PWA
share-target `postMessage` handler present in the live JS").

Given a working, already-shipped, lower-risk path existed (open a URL,
reuse the existing session, no new token surface, no new backend
endpoint), building PR #67's token scheme in the same pass would have been
redundant scope with a larger security surface for no functional gain.
This decision does not resolve PR #67 — it is still open, and its capacity
matrix / popup-with-Don't-show-again / verification-gate content remains
valid guidance for anyone picking it up. What it does establish: the iOS
Shortcut artifact this pass produced
(`docs/IOS_SHORTCUT_SETUP.md`) is deliberately token-free by design, not by
omission, and a future implementer of PR #67's slices should reconcile the
two rather than build a second, parallel iOS capture path.

Real-device verification (a physical iPhone running the Shortcut end to
end, and a physical Android phone using the installed-PWA Share Target)
was not performed in this pass — this sandbox has no phone to test with.
This is the same category of gap as the extension's existing G3/G8
real-Chrome items in `docs/CLAUDE_CODE_HANDOFF.md`'s "Known gaps."

## Onboarding: real recorded media, teach-before-setup ordering, and dismissal stays client-side

Build Guide checkpoint 43. Three related decisions from the same owner
click-through session:

**Real recordings over a coded illustration.** Asked to choose between a
stylized CSS/SVG mockup of the capture flow and actually recording the real
product, chose the latter: the existing `tests-e2e/` Playwright harness
already drives the real unpacked extension against a real local `npx base44
dev` backend, so recording real screenshots was barely more work than
faking convincing ones, and is strictly more honest — a future UI change to
the Side Panel or dashboard will make the recording visibly stale instead
of leaving a mockup that quietly drifts from the real product.

**Teach before setup.** The Learn step (real Side Panel + dashboard
screenshots) is wired between the optional Project step and the Method
(capture setup) step, not after it. Rationale: asking someone to install an
extension or configure a phone Shortcut before they've seen what it's for
is a higher-friction ask than showing the payoff first. This only reorders
the pre-capture wizard steps (all local UI state); it does not change what
counts as a real capture or touch the evidence-driven stage machine in
`src/onboarding/state.js`.

**Onboarding dismissal stays client-side (`localStorage`), not server-side.**
Confirmed `dismissOnboarding()` only ever writes
`localStorage["magpie.onboarding.dismissed"]` — there is no `User` field or
settings entity tracking it. Explicitly asked whether to add one; owner
chose to keep it client-side. Reasoning: this is a decision, not a bug —
server-side tracking would need a real entity/backend change (User field or
a settings function) and would go through the High-risk change gate for no
clear benefit over the standard "onboarding is per-browser" pattern most
products use. A fresh browser, device, or local-dev session showing the
Welcome tour again is therefore expected behavior, including the specific
case the owner hit (a brand-new `npx base44 dev` local session has no
`localStorage` history from production).

## Onboarding restructured into Pair -> Modes -> Collections/Agent/Sync preview (supersedes "teach before setup")

Build Guide checkpoint 44. Direct owner feedback after a real click-through
reversed the ordering decided in the "teach-before-setup" entry above:
Download-and-pair now comes first (its own dedicated step), followed by a
capture-modes walkthrough, then three clearly-labeled preview screens
(Collections, Ask Magpie, Sync) ending in "go to my dashboard." The
rationale volunteered for the new order: asking for pairing while
motivation is highest, right after the Welcome pitch, then rewarding that
with the full picture, reads better than fronting the walkthrough. The
"teach before setup" entry's underlying point — show real product, not a
mockup — still holds; only the sequencing changed.

Two new real recordings were added alongside the original page-save one:
`public/onboarding/mode-element.gif` (content.js's real hover-highlight
overlay during element-picker mode) and `mode-snip.gif` (the real drag
rectangle during a visual snip). Both are genuine page DOM, so both are
real screenshots — this is explicitly *not* true of two related requests
that came up in the same feedback: recording the Side Panel actually being
opened via a toolbar click, and a native right-click context menu
appearing. Neither is drivable or screenshotable by Playwright/CDP or any
other browser-automation tooling; `tests-e2e/helpers/capture.ts` already
documents this same limitation for the regression suite (it opens
`sidepanel.html` directly instead of a toolbar click, and fires a
synthetic `contextmenu` DOM event instead of a real right-click). This
isn't a scoping choice — no tool can do it — so the Modes step's gallery
covers the three modes that are drivable and stops there.

**Illustrative (mock) content, explicitly approved.** The Collections,
Agent, and Sync preview steps show content that cannot be demonstrated for
real in a one-shot recording (a populated multi-Collection workspace, an
Ask Magpie answer, a price-change update — Zyte-driven refresh needs a
real change over time, which a recording can't produce). Owner explicitly
approved this as long as it's clearly labeled, not presented as the
viewer's real data. Implementation: a visible "Example ..." pill
(`.onboarding-mock-badge`) plus explicit "Example" wording in each such
step's copy — checked by `tests/onboarding-media.test.ts`. The one real
screenshot on the Collections step (`first-value.png`, a genuine capture
through the flow above) is explicitly labeled "Real:" right next to the
mock cards beside it, so the two are never conflated.

## iOS Shortcut: real device needed to move past manual build-it-yourself instructions

Owner correctly called "read the docs and build it yourself" a weak
mobile experience and asked whether Magpie could distribute a real,
one-tap-installable Shortcut instead of asking each user to assemble the
three actions by hand. That format exists — Apple's Shortcuts app can
produce a shareable `icloud.com/shortcuts/...` link that installs the
exact same Shortcut in one tap — but generating one requires the
Shortcuts app on a real Mac or iPhone; there is no CLI, API, or file
format that can be authored from a non-Apple environment. This session had
no Apple hardware available. Decision: owner will build the Shortcut once
on a real device (using the exact spec already in
`docs/IOS_SHORTCUT_SETUP.md`) and hand back the resulting iCloud link; that
link will then become the primary CTA on the Modes step's iPhone card,
with the manual build-it-yourself steps kept as a fallback for anyone who
doesn't want to trust a shared link. Not done in this pass — blocked on
that one real-device step from the owner, tracked in
`docs/CLAUDE_CODE_HANDOFF.md`'s "Known gaps."

## Onboarding order reverted to teach-first; unified footer replaces per-step buttons (supersedes checkpoint 44's pair-first order)

Build Guide checkpoint 45. Same-day further owner feedback reversed
checkpoint 44's pair-first ordering back to teach-first: `welcome -> modes
-> project -> pair -> collections -> agent -> sync`. The owner's own words:
"first we teach, then we setup." Two ordering changes in one session on
the same question is a real signal, not noise — treat this ordering as
settled only provisionally; if it moves a third time, that's worth a
direct question before implementing rather than another silent swap.

**Persistent footer, not per-step action buttons.** Every step previously
rendered its own Continue/Skip/Create buttons inline, positioned
differently depending on the step's content length. Replaced with one
`onboarding-wizard-footer` (Back · Skip onboarding · Continue) that never
moves: `.onboarding-wizard` is a flex column with only
`.onboarding-wizard-scroll` scrolling, so the footer stays pinned at the
bottom of the modal regardless of how tall a given step's content is. This
required lifting Project's title input state up to the wizard component
itself (`projectTitle`), since the shared Continue button needs to read it
to decide "create then advance" vs. "just advance" — previously each step
owned its own local form state and its own submit button.

**Capture-mode gallery is a carousel, not a static 3-column grid.** All
three real recordings (element hover, snip drag, page-save) now share one
fixed-size, centered frame (`object-fit: contain`, so differently-shaped
recordings — the tall portrait Side Panel vs. the wide page screenshots —
still render at a uniform box size) with prev/next arrows and dot
indicators, instead of three side-by-side cards of differing implied
importance.

## Onboarding dismissal moved to the User record (supersedes "dismissal stays client-side")

Build Guide checkpoint 47. The earlier "onboarding dismissal stays
client-side" entry above was a considered tradeoff at the time, but owner
testing surfaced the failure mode that tradeoff hadn't accounted for: a
brand-new signup, in the same browser as a previously-onboarded account,
landed straight in the dashboard with onboarding already marked dismissed
-- because `localStorage` is scoped to the browser/origin, not the
account, a second account in the same browser silently inherits the
first account's dismissal. That's not "onboarding reappears when it
shouldn't" (the accepted cost of the original tradeoff); it's the reverse
and more serious failure: a genuinely new user never sees it at all.

Fixed by moving the flag onto the User record itself via
`base44.auth.updateMe({ onboarding_dismissed: true })`, read back as
`user.onboarding_dismissed`. This needed no new entity, schema file, or
backend function -- the installed `@base44/sdk`'s own `auth.updateMe()`
already supports arbitrary custom fields on the authenticated user's own
record (confirmed in `.agents/skills/base44-sdk/references/auth.md`), and
it's inherently owner-scoped (a user can only ever update their own
record through it), so this carries none of the cross-owner-write risk a
new entity or function would need fixtures for. `localStorage` is no
longer read or written for this at all.

One accepted one-time cost: any account that dismissed onboarding under
the old `localStorage` scheme will see it once more after this ships,
since their dismissal was never recorded server-side. Not worth a
migration -- the flow is idempotent and harmless to see again once.

## De-templating pass, Phase 1: refine the design system rather than rebrand it

Build Guide checkpoint 48. The owner's read: Magpie's product surfaces look
scaffolded rather than designed -- not because any one choice is bad, but
because the landing page, onboarding wizard, and login screen had
independently converged on the same generic-AI-SaaS idiom (a "Turn X into Y"
headline formula reused verbatim twice, an italicized accent word used as a
tic in four different headlines, "01/02/03" numbered step badges reused in
three unrelated places, a "G" letter and a "●" character standing in for the
Google/Apple logos, and letter-avatar placeholders where a real favicon
could render instead). A hand-designed product's marketing site, first-run
flow, and login screen each have their own idiom under one shared identity;
repeating the identical formula everywhere is the actual tell.

Decided directly with the owner, in order of how much they change: keep the
current green / DM Sans + Instrument Serif visual identity and the real bird
mark rather than rebrand from zero; invest in a small custom icon set for
Magpie-specific recurring concepts (capture modes, pairing status, the
agent, empty states) rather than either staying 100% lucide-react or
replacing all of it; and give the public landing page a benchmark pass
against respected B2C products (Linear, Arc, Raycast, Superhuman, Notion)
rather than rebuilding it, since the owner called it fine as-is.

The five-phase plan, in the order agreed: (1) favicons, real OAuth marks,
and voice guardrails -- this checkpoint; (2) the bounded custom icon set;
(3) reducing the cross-surface headline/badge repetition down to at most one
instance each; (4) pulling the Chrome extension side panel's separate
stylesheet closer to the dashboard's tokens; (5) the landing benchmark
research note and its resulting low-risk punch list.

This checkpoint's three changes are deliberately all client-side, additive,
and reversible: a favicon `<img>` with a same-behavior fallback, two brand
SVGs swapped in for two placeholder characters, and one headline rewritten
to stop duplicating the landing page's phrasing. None of it touches the
capture/routing trust boundary, so it did not need the High/Critical change
documentation this repo requires for backend-contract changes.

`docs/VOICE.md` exists so future copy doesn't reach for the same templates
again by default; it names which surface currently "owns" each device
(landing owns the "Turn X into Y" formula and the italic accent word) so
the next surface reaches for something else instead of repeating it.

Landing page copy and visuals (`src/Landing.jsx`) are unchanged this
checkpoint on purpose -- see the benchmark-first decision above.

## De-templating pass, Phase 2: a bounded custom icon set, not a full replacement

Build Guide checkpoint 49. The owner explicitly asked to push back if a full
custom icon set looked like the wrong call, given the "refine, don't
rebrand" decision already made in Phase 1. It does: replacing all of
lucide-react would mean maintaining a parallel copy of dozens of generic
action glyphs (close, back, arrow, check, trash) for no visible benefit,
since those are exactly the icons a hand-designed product would also reach
for a library over. The tell was never "this app uses lucide" -- it's that
none of Magpie's own distinguishing concepts had their own visual identity.

So this pass is deliberately narrow: six custom marks (`src/components/
icons.jsx`) for the handful of ideas that recur across the product and are
specific to Magpie -- the three capture modes, pairing/connection, the
agent's own automatic behavior, and the one dedicated empty-Collection
illustration -- built to lucide's own visual weight (24x24, 2px round
stroke) so they sit next to the remaining lucide icons without clashing.
Every other lucide usage in the product is untouched.

Two of the six needed a second pass. Hand-written SVG path coordinates are
easy to get subtly wrong without a design tool, so each mark was rendered
in a real browser, both at its actual call-site size and blown up to 160px,
before being treated as done (a temporary `public/_icon-preview.html`,
deleted before committing -- never part of the shipped bundle). The first
pairing-icon draft read as a barbell/headphones because two heavily
rounded rects plus a faint dashed connector collapsed into two ovals at
small sizes; tightening the corner radius and making the connector two
visible segments around a bigger pulse dot fixed it. The first agent-icon
draft (a filled triangle meant to suggest a bird's wings meeting at a
point) just read as an arrowhead at any size; switching to the classic
two-curved-stroke "gull" mark -- and to a stroke-based icon like the other
five, instead of a filled one -- both fixed the legibility and made it
visually consistent with the rest of the set.

`PairingIcon` replacing `Key` everywhere pairing is the action is also a
more accurate metaphor, not just a different one: pairing the extension is
establishing a device link, not presenting a credential, and the six call
sites it now covers (the pairing dialog, the topbar pair button, the
onboarding pair step, all three `PairingChecklist` icons, and
`ReconnectNotice`, which previously mixed `Key` and an unrelated `PlugZap`)
all mean the same thing and now render the same icon.

## De-templating pass, Phase 3: the login page stops duplicating Landing's devices

Build Guide checkpoint 50. `docs/VOICE.md` (Phase 1) already named Landing
as the one surface allowed to keep the "Turn X into Y" headline formula and
the single-italic-accent-word device, on the theory that repetition across
surfaces was the actual problem, not either device in isolation. That only
holds if the other surfaces actually stop reaching for them. `LoginPage.jsx`
was the one place besides Landing still using the italic-accent-word H2
and a third independent "01/02/03" numbered-badge treatment (after
Landing's own two and the onboarding welcome headline fixed in Phase 1) --
so this checkpoint removes both from the login page specifically, leaving
Landing as the sole owner of each device until its Phase 5 benchmark pass
decides whether to keep them there either.

The numbered badges weren't simply deleted; they're replaced with a small
solid dot that reuses a pattern the product already has elsewhere
(`.collection-dot`, `.status-dot`) rather than inventing a fourth "step
indicator" visual language. Landing itself is still untouched -- both of
its instances of each device stay in place pending Phase 5.

## De-templating pass, Phase 4: self-host the extension's font instead of importing it remotely

Build Guide checkpoint 51. Bringing `extension/sidepanel.css` closer to
`src/index.css`'s tokens could have meant literally copying the
dashboard's `@import url('https://fonts.googleapis.com/...')` line. That
was rejected: the side panel is opened far more often and far more
briefly than the dashboard is loaded, and giving it a new per-open network
call to a third-party font CDN -- with the attendant offline-breakage risk
and a category of remote-resource loading the Chrome Web Store review
process pays closer attention to for extensions than it does for websites
-- would be a worse trade than the font mismatch it fixes. Downloading the
two WOFF2 files the side panel actually needs (400 and 600 weight, Latin
subset, ~14KB each) and bundling them as static extension assets gets the
identical visual result -- confirmed both report `loaded` via
`document.fonts` in a real render -- with zero runtime network dependency
added, which is strictly better than what the dashboard itself does, not
just a smaller version of it.

The color-token change (three primary-brand-color spots moved from the
side panel's own `#2b5738`/`#1e4229` to the dashboard's exact
`#254d32`/`#193d27`) stayed intentionally partial. Matching every
secondary green already in that file would be a full rewrite of a
stylesheet that otherwise works fine, not the "partial, lightweight"
alignment the Phase 1 plan called for.

## De-templating pass, Phase 5: research confirmed the plan, but not the "low-risk" label on its best item

Build Guide checkpoint 52. The Phase 1 plan guessed that swapping Landing's
hand-built fake-UI mock scenes for real screenshots would be a low-risk
punch-list item once the benchmark research was done. It wasn't, and this
is worth recording because the guess was reasonable and still wrong: the
research (`docs/LANDING_BENCHMARK.md`) fully confirmed the direction --
Linear, Raycast, and Notion all use real, high-fidelity product screenshots
as their hero visual, none use abstract mockups -- but *implementing* it
for Magpie specifically ran into something the research couldn't surface:
the three story-section mock scenes are written around a specific fictional
"moving to Berlin" narrative, and Magpie's existing real capture assets are
generic onboarding demos that don't depict that narrative. There's no
mechanical swap available; it's a choice between recording new footage
that actually matches the copy, or rewriting the copy to match footage
that already exists. Both are legitimate content decisions, so this
checkpoint stops at naming the choice in the benchmark doc rather than
picking one unasked.

The three items that were genuinely mechanical -- wording the two jargon
eyebrows plainly, reducing the italic-accent device from three Landing
instances to the one `docs/VOICE.md` already allows it, and dropping the
"01/02/03" story-section labels -- shipped this checkpoint. All three are
the same reductions Phases 1 and 3 already proved out elsewhere in the
product; Phase 5's contribution was confirming, with live evidence from
real competitor sites rather than the owner's or the author's judgment
alone, that Landing should stop being the exception.

This closes the five-phase de-templating plan from Phase 1. What's left
un-done and named for a follow-up, if wanted: the real-screenshot swap
above, and matching lucide's remaining generic icon usage was explicitly
ruled out of scope in Phase 2 rather than deferred.

## Dashboard redesign, R1: a wrong first draft, corrected before shipping

Build Guide checkpoint 53. Worth recording precisely because it was a real
design mistake, caught by the owner in plan mode before any code shipped,
not a hypothetical to guard against.

The owner said the de-templating pass wasn't enough: the product is
text-heavy, has almost no color differentiation, and asks users to read
their way to understanding instead of seeing it. My first response
proposed extending `App.jsx`'s `collectionDotIndex` (`hash(id) % 4`,
currently just four muted sidebar-dot colors) into a six-color
categorical palette applied to Collection cards, badges, and table
accents -- "Collection = color identity." The owner rejected it directly:
*"What value does this dot indicator have on a user?"* The honest answer
is none. A color chosen by hashing an id carries no meaning a user can
learn -- it's not "blue means Cameras" the way a real label would be,
it's "blue happened to be what the hash produced for this specific id,"
which a user still has to read the text label to decode. It was
decoration wearing a function's clothes.

The owner's second objection was sharper: *"why do we assume our current
layout is doing great and sufficient?"* -- naming that the first draft had
proposed layering color onto the dashboard's existing structure without
ever questioning whether that structure was the actual problem. It was a
fair hit: the research behind that draft (Figma and Wix) was their
*marketing* pages, not their product UI, which isn't necessarily the same
design language a working tool should borrow from.

Corrected direction, reached together: color is reserved entirely for
real status the data model already tracks (freshness, a changed field,
needs-review, blocked, a live sync) -- never assigned by a hash or
otherwise standing in for a category. This is verifiably how the
comparable real products work in their actual product UI, not just their
marketing pages -- a live screenshot of Linear's real issue view (same
session) shows status and priority as an icon plus one word, colored only
because that word is specifically true of that issue, never a decorative
per-group color. And before proposing any layout change, `docs/
DASHBOARD_AUDIT.md` was written first: a structural comparison of
Magpie's actual rendered dashboard against that same Linear evidence,
naming `RecordDetail` as the concrete worst offender (8-10 always-stacked
text blocks with no color or size hierarchy) rather than assuming where
the problem was.

`docs/DESIGN_SYSTEM.md` exists as the durable output of getting this
wrong once: the corrected color rule ("status only, never category") and
the hierarchy rules from the audit are written down so the next redesign
starts from a document instead of re-arriving at the same mistake.

## Dashboard redesign, R2: a floating popover over a scroll container clips, use inline expand instead

Build Guide checkpoint 54. The first version of `RecordDetail`'s
collapsed refresh-options control used `position: absolute` to float a
small popover below its trigger icon, styled after a conventional
dropdown-menu pattern. Rendered against the actual compiled CSS in a real
browser (a temporary static preview, not the live app -- see the
checkpoint's Verify note for why), it was silently clipped whenever it
opened near the bottom of `.detail-panel`'s `overflow-y: auto` scroll
area: an absolutely-positioned descendant doesn't escape an ancestor's
scroll clipping just because it's visually "floating." This is exactly
the class of bug that reading JSX never surfaces and only shows up
rendered -- worth naming as a reason this pass keeps testing everything
in a real browser rather than trusting the markup alone.

Fixed by dropping the floating-popover approach entirely in favor of a
normal inline expand -- the panel content pushes whatever's below it
down when opened, the same way `.clip-raw-toggle` (an existing
`<details>`/`<summary>` disclosure elsewhere in this same panel) already
behaves. No positioning math, no clipping surface, and one fewer distinct
interaction pattern for the codebase to carry. The tradeoff (opening it
shifts layout below it, rather than floating over it) was judged worth
it for the robustness -- if a genuine floating popover is wanted
somewhere later, it needs real anchor-positioning logic (a ref + measured
offsets, or a portal), not `position: absolute` inside a scrollable
ancestor.

## Dashboard redesign, R3: don't "fix" a design decision that already works

Build Guide checkpoint 55. The plan's R3 line item -- "table/card default
switch" -- was written from `docs/DASHBOARD_AUDIT.md`'s claim that table
is still the dashboard's default `displayMode`. That claim was checked
before acting on it and turned out to be incomplete: `App.jsx:192`'s
`inferCollectionDisplayMode` already picks cards vs. table per Collection
based on real data -- cards when most of that Collection's records have a
captured screenshot, table when they don't. That's a genuinely good,
already-shipped heuristic: a Collection of mostly numeric/text fields
(price comparisons, say) is easier to compare row-by-row in a table than
scattered across cards, while a Collection with real photos benefits from
seeing them. Forcing an always-cards default, as R3 was originally
scoped, would have made the dashboard worse for exactly the Collections
where a table earns its density.

This is worth recording for the same reason the R1 correction was: the
audit's job is to find real problems, not to justify a pre-decided fix.
Checking the actual behavior before changing it, and being willing to
leave R3's plan half undone when the "problem" turns out not to be one,
matters more than shipping everything a plan named.

What R3 did ship is the audit's other, verified-real finding: three
panels competing for attention at once. `ActivityPanel` is no longer a
permanent grid column; it's a topbar-launched overlay reusing the app's
existing `.detail-overlay` pattern. This incidentally fixes a real
regression the old version had -- `.activity-panel { display: none }`
below 990px made it fully unreachable on tablet-width screens, not just
hidden on desktop, which is a worse failure than "always visible and
competing for space." The new version is reachable at every width via
the topbar button or (below 680px, where `.pair-button` itself is
hidden) the mobile hamburger menu.

Also caught and fixed here: `--status-blocked` (defined in R1) was wrong.
It was set to the terracotta danger-red by pattern-matching against
`.danger-button` rather than checking what "blocked" actually renders as
today -- every real instance (`.blocked-notice`, `.blocked-badge`,
`.record-card-badge`) already uses the amber family, the same as "needs
review." Terracotta stays reserved for destructive delete actions, a
genuinely different concept from "this source needs attention."
Corrected the token to match reality before it propagated into more
places using the wrong color.

## Header declutter: two bigger changes flagged and deliberately not done

Build Guide checkpoint 56. The owner raised two ideas alongside "the
header has too many buttons" and, after discussion, agreed both are
separate work. Recording the reasoning now so neither has to be
re-derived when someone does pick them up.

**Rename "Project" to "Folder" in the UI.** Checked before agreeing to
defer it: `docs/PRODUCT_CHARTER.md` and this file's own "Add bounded
navigational folders in V3.1" entry describe a distinct, already-shipped
Folder concept -- Collections can be organized into a Folder and one
level of Subfolder for dashboard navigation. That's unrelated to Mission
(labeled "Project" in the UI, per "Use clearer UI labels without renaming
backend resources"). Renaming Project to Folder in the UI would make two
different concepts share one name in the same product. Whoever picks
this up needs to either pick a different target name or resolve that
collision first -- it's not just a label swap, and it's also correctly
flagged as touching the backend Mission entity, which is exactly the kind
of destructive-migration risk the original "clearer UI labels without
renaming backend resources" decision was written to avoid.

**Replace the header/sidebar split with one left nav rail**, Linear-style
-- global actions, Collections, and account all in a single sidebar, with
little or no separate top bar. This is the strictly cleaner direction:
Linear's actual product UI (screenshotted earlier this session, not just
its marketing page) puts exactly this in one rail, and Magpie already has
half the pieces (`CollectionSidebar` lists Collections; the account menu
added this checkpoint is most of what a sidebar-bottom account entry
would contain). But it's a real shell restructuring -- `.app-shell`,
`.topbar`, `.collection-sidebar` CSS, and the mobile responsive behavior
all change together -- not a same-session fix alongside everything else
in this pass. Recorded as the recommended direction for a dedicated
future pass rather than attempted piecemeal here.

What *did* ship this checkpoint: consolidating the header's setup/account
actions behind one menu, by generalizing the mobile-only dropdown that
already existed rather than inventing a new component or jumping straight
to the bigger rail redesign. Two real CSS specificity/ordering bugs were
caught by checking `getComputedStyle` directly at multiple widths instead
of trusting the markup -- see the checkpoint entry in `docs/BUILD_GUIDE.md`
for both; the second (equal-specificity ties resolving by source order,
not by which media query "should" win) is a sharp enough gotcha to watch
for again anywhere a base rule and a media-query override end up with
matching specificity.

## 2026-08-24 — Push notifications stay outside the redesign refactor

The phone redesign ships real Signals, changed-first Collection browsing, and
Nest swipe actions against the existing backend. It does not show a fake push
permission or claim background delivery. Real push requires a
`PushSubscription` owner-scoped entity, VAPID keys stored as Base44 secrets, a
sender/retry function, service-worker `push`/`notificationclick` handlers, and
revocation cleanup. None of those contracts or credentials currently exist.
They are a separate Critical backend change and require explicit product and
deploy approval.

The same rule drove three redesign additions that did ship locally: saved
searches are a distinct `saved_search` Collection type excluded from routing;
route undo is an owner-only 30-second server workflow; and tablet correction is
an owner-only function that appends an Enrichment audit row. No production
entity, function, secret, or site deployment was performed in this refactor.

## 2026-08-24 — Pairings are multiple, explicit, and never silently rotated

An owner may keep several active browser pairings. Creating a new pairing does
not revoke an old one, and Magpie does not bundle token creation with revoke:
the raw token is returned once, so an ambiguous retry cannot safely recover it.
Replacement is therefore two owner-visible actions—pair the new browser, then
separately confirm revoke on the old row.

The management API is intentionally small: a sanitized newest-first list of at
most 100 rows, idempotent revoke-one, and **Revoke every browser** for an
emergency reset. Unknown and foreign IDs both return `404`. Expiration, label
editing, undo/reactivation, and automatic rotation remain deferred. Existing
tokens require no migration: `last_used_at` proves legacy use, while the next
successful context load stamps `paired_at` and stores the non-secret
`extensionId` in that browser.
