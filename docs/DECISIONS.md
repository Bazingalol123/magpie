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

## The extension's refresh memory is local-only and dies with the pairing token

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
