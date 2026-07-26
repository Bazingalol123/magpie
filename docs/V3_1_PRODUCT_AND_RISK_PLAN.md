# Magpie V3.1.0 — product polish and bounded organization

> Planning and risk gate for the product-quality release after V3 automatic routing and before V4. Read `docs/PRODUCT_CHARTER.md` first.

## Release outcome

V3.1 turns the technically credible V3 workflow into a product that is immediately understandable, pleasant to navigate, and safe to organize:

`discover -> understand -> capture -> auto-organize -> review -> compare -> revisit`

V3.1 does not replace or postpone the V3 routing contract. The first release gate is still a Chrome capture reaching validated `existing`, `new`, or `review` routing end to end.

## Product scope

### Must ship

1. A polished unauthenticated landing experience.
2. Clear user-facing vocabulary and navigation.
3. A coherent Library, Projects, Needs review, and Updates information architecture.
4. Strong empty, loading, error, and first-run states.
5. Responsive and accessible dashboard behavior.
6. Bounded folders and subfolders for organizing Collections.
7. A testable migration and rollback story for every backend change.

### Explicit constraints

- The extension remains an untrusted write-only capture client.
- Element, selection, page, link, visual, and image captures feed one Clip/routing pipeline.
- Link capture stores browser-observed context; V3.1 does not fetch arbitrary submitted URLs server-side.
- Visual routing receives an explicit cropped screenshot only for visual/image modes.
- Folders never appear in the extension and never influence automatic routing.
- Backend entity names are not renamed for UI wording.
- Existing V1/V2/V3 data remains readable.
- No destructive migration, cascade delete, or arbitrary-depth tree.
- No deployment or remote resource push without explicit approval.

> The "no destructive migration, cascade delete" constraint above governs
> schema/migration-time deletion — it is not a ban on the owner-triggered,
> explicitly-confirmed delete features scored individually in the change
> matrix below (`delete-record`, `delete-collection`, `delete-mission`). Those
> are a deliberate, narrow, per-feature exception recorded in
> `docs/DECISIONS.md`, gated by their own risk score and fixtures, never an
> automatic or migration-driven deletion.

## Multi-mode capture contract

V3.1 adds capture choices without turning Magpie into a crawler or a generic screenshot archive:

| Mode | Browser evidence | Source identity | Routing behavior |
|---|---|---|---|
| `element` | Bounded selected HTML/text plus viewport screenshot | Current page | Existing V3 behavior |
| `selection` | Selected text plus bounded surrounding text | Current page | Text-only routing |
| `page` | Title, description, and bounded visible text; no full-page HTML | Current page | May route or enter review |
| `link` | Link label and bounded surrounding text; no backend fetch | Link target; containing page retained as context | May route or enter review |
| `visual` | User-selected element crop plus any visible text | Current page | Crop is supplied to the vision-capable routing request |
| `image` | Right-clicked image crop, alt/caption, and surrounding text | Current page | Crop is supplied to the vision-capable routing request |

`Clip.capture_mode` records the mode. `Clip.context_url` is optional and records the containing page when `source_url` is a clicked link target. Both are additive; legacy Clips behave as `element`.

Visual crops are uploaded through the existing screenshot boundary. The model may propose facts visible in the crop, but deterministic schema, scope, confidence, and mutation validation remains unchanged. If image capture/upload is unavailable, useful text may continue through normal routing; otherwise the Clip enters review rather than inventing fields.

## User-facing vocabulary

Backend names remain stable; only product labels change.

| Backend concept | V3.1 UI label | Explanation |
|---|---|---|
| `Mission` | **Project** | Optional goal context such as “Move to Berlin” |
| `Collection` | **Collection** | A structured type of item such as Apartments or Recipes |
| `Record` | **Item** | One structured row inside a Collection |
| `Clip` | **Capture** | Original selected web evidence |
| `RoutingDecision` | **Organization decision** | Internal audit detail; usually presented as “Why Magpie put this here” |
| `Enrichment` | **Update** | A trusted source-backed field change |
| `WatchRule` | **Monitoring** | The policy that keeps an Item current |
| routing review inbox | **Needs review** | Captures Magpie deliberately did not auto-file |

`Mission`, `Record`, and `Clip` remain in schemas and code until a separately approved migration proves that renaming them creates more value than risk.

## Information architecture

### Public landing

- Hero: “Turn the messy web into living, structured collections.”
- Three-step explanation: Capture, Magpie organizes, changes stay visible.
- One coherent Move to Berlin storyboard.
- Trust section explaining the write-only extension.
- Use cases for comparing, watching, and researching.
- Sign-in / open-app call to action.

The landing page is static before authentication and performs no entity reads.

### Authenticated application

- **Home:** recent captures, items needing review, source changes, and active Projects.
- **Library:** all Collections, grouped by optional folders.
- **Projects:** goal-oriented views such as Move to Berlin.
- **Needs review:** ambiguous and failed routing with a clear recovery action.
- **Updates:** enrichment history and monitoring status.

### Collection experience

- Schema-backed table or compact card view.
- Search and client-side filters in V3.1.
- Visible evidence, freshness, and update state.
- Collection location is navigational; moving it between folders does not change routing identity or Mission scope.

## Bounded folder model

Folders are a secondary navigation structure, not part of the canonical data hierarchy.

```text
Folder
└── Subfolder                maximum depth: 2
    └── Collection reference

Project (optional context)
└── Collection
    └── Item
        └── Capture evidence
```

Rules:

1. A Collection may have zero or one `folder_id`.
2. A Folder may have zero or one `parent_folder_id`.
3. Root folder depth is `0`; subfolder depth is `1`; deeper moves are rejected.
4. Folders contain Collections, not Items or Projects.
5. Folder membership never changes `Collection.mission_id`, `normalized_key`, routing profile, or schema.
6. Folder deletion is not supported in V3.1; archive is reversible and leaves Collections unfiled.
7. All create, rename, move, and archive actions go through backend functions that re-check owner, depth, cycles, and target state.
8. Existing Collections require no backfill; absent `folder_id` means **Unfiled**.

## Risk calculation

Every V3.1 change receives:

- **Likelihood (L):** chance of a meaningful regression, 1–5.
- **Impact (I):** worst credible effect on data, security, core demo, or recoverability, 1–5.
- **Risk score:** `L × I`.

| Score | Rating | Required control |
|---:|---|---|
| 1–4 | Low | Build and regression test |
| 5–9 | Moderate | Acceptance fixtures plus rollback note |
| 10–15 | High | Backend contract and failure map before implementation |
| 16–25 | Critical | Explicit product decision, migration rehearsal, and deploy approval |

Impact uses the highest applicable consequence rather than averaging security or data-loss risk downward.

## Mandatory change gate

Before any V3.1 change is implemented, its plan or pull request must state:

| Required field | Question |
|---|---|
| User value | Which user story or measurable friction does this solve? |
| Frontend surface | Which views, extension screens, states, and accessibility paths change? |
| Backend surface | Which entities, functions, AI prompts, realtime subscriptions, storage, or auth paths change? |
| Data compatibility | Are existing rows valid without a backfill? |
| Security/RLS | Can any new ID or relationship cross owners or expand extension reads? |
| Failure behavior | What typed state appears when the operation partially or fully fails? |
| Migration | How is the change rehearsed locally without losing the repeatable fixture set? |
| Rollback | Can the feature be hidden or ignored without deleting data? |
| Risk | What are L, I, score, and rating? |
| Verification | Which automated and manual tests must pass? |
| Release authority | Does it require entity push, function deployment, site deployment, or no remote change? |

No change rated High or Critical begins production implementation until its backend contract, failure behavior, migration, rollback, and fixtures are documented. Any remote mutation still requires explicit deployment approval regardless of risk rating.

## Change and backend-impact matrix

| Change | User value | Frontend work | Backend change | L | I | Score | Decision |
|---|---|---|---|---:|---:|---:|---|
| Visual design system polish | Consistent, credible product | Tokens, components, spacing, typography, responsive states | None | 2 | 2 | 4 Low | Ship |
| Public landing page | Explains value before login | Expand current `Landing`; static product storyboard and trust copy | None; no public entity reads | 2 | 3 | 6 Moderate | Ship |
| Clear UI vocabulary | Removes Mission/Record jargon | Label mapping, help text, empty states | None; preserve entity/function names | 1 | 2 | 2 Low | Ship |
| Home/Library/Projects/Review/Updates navigation | Makes the data model understandable | Split monolithic dashboard into views and reusable components | Existing entity reads/subscriptions; no new write contract | 3 | 3 | 9 Moderate | Ship after V3 routing works |
| First-run onboarding | Reduces pairing and capture confusion | Guided checklist and connection status | Reuse pairing/context functions; do not expand extension reads | 2 | 3 | 6 Moderate | Ship |
| Search and filters | Makes larger libraries usable | Client-side search/filter first | None for V3.1; server search deferred | 2 | 2 | 4 Low | Ship |
| Two-level folders | Optional personal organization | Folder tree, create/rename/archive dialogs | New `Folder`; additive `Collection.folder_id`; server workflows | 4 | 4 | 16 Critical | Ship behind its own gate |
| Drag-and-drop folder moves | Fast organization | Optimistic interaction with rollback | Owner-checked `move-collection` function | 3 | 4 | 12 High | Ship only after non-drag workflow passes |
| Deep links inside SPA | Shareable/reload-safe navigation | Stable view/selection URLs | None, but auth callback and SPA fallback regression risk | 3 | 3 | 9 Moderate | Ship if schedule allows |
| Responsive and keyboard behavior | Product quality and accessibility | Focus management, dialogs, table fallback, navigation | None | 2 | 3 | 6 Moderate | Ship |
| Capture-mode menu and context actions | Faster capture with less irrelevant HTML | Popup actions, picker modes, right-click menu | Additive Clip metadata only | 2 | 3 | 6 Moderate | Ship |
| Visual/image crop routing | Understand layouts and image-native evidence | Visual picker and crop feedback | Existing upload path plus multimodal routing input | 3 | 4 | 12 High | Ship after contract fixtures |
| Project-aware routing code agent | Auto-associate a capture with a clearly matching active Project | No required extension read or filing step | Bounded AI Gateway tool loop, deterministic Project validator, additive RoutingDecision audit fields | 4 | 4 | 16 Critical | Ship behind thresholds, fallback, fixtures, and separate deploy approval |
| Owner routing correction (`resolve-routing`) | Let an owner accept, redirect, or approve a new Collection for a `needs_review` or wrongly routed capture instead of it sitting unresolved | Wire existing Needs review / Item detail actions to one function call; no new view | New `resolve-routing` function; server-owned move/create across Clip, Record, RoutingDecision; reuses `classify-clip` owner/scope checks; no schema change | 3 | 4 | 12 High | Ship behind contract fixtures and separate deploy approval; before folders |
| Owner Item deletion (`delete-record`) | Let an owner permanently remove an Item they no longer want, including its watches, update history, capture, and routing audit | Remove-item action with two-step confirm in Item detail | New `delete-record` function; owner-validated destructive cascade over WatchRule, Enrichment, RoutingDecision, Record, Clip; no schema change | 3 | 4 | 12 High | Ship behind cascade/idempotency fixtures and deploy approval |
| Owner Collection deletion (`delete-collection`) | Let an owner permanently remove a Collection they no longer want, including every Item inside it | Delete action with two-step confirm in the Collection sidebar | New `delete-collection` function reusing the existing per-record cascade primitive over every owned Record in the Collection, then the Collection; no schema change | 3 | 4 | 12 High | Ship behind cascade/idempotency/pagination fixtures and deploy approval |
| Owner Project deletion (`delete-mission`) | Let an owner permanently remove a Project they no longer want, including every Collection and Item inside it | Delete action with two-step confirm in the Project switcher | New `delete-mission` function cascading over every owned Collection scoped to the Mission (each via the `delete-collection` cascade), then the Mission; hint-only `needs_review` Clips are left untouched; no schema change | 3 | 5 | 15 High | Ship behind cascade/idempotency/pagination/scope fixtures and deploy approval |
| Review dismissal and Project-scoped creation (`resolve-routing` extensions) | Dismiss an unwanted `needs_review` capture; choose or create a Project when approving a new Collection during review | Dismiss button and Project selector inside the Needs-review wizard | Additive `dismiss` action and optional validated `project_id` on the existing function; no schema change | 2 | 3 | 6 Moderate | Ship with fixtures alongside `delete-record` |
| Blocked-watch auto-pause | Stop wasting scheduled checks on login-walled or bot-challenged sources | Blocked-state notice with pause/resume in Item detail | Pure pause-decision helper plus a `sweep-watches` update path setting `active: false` after 3 consecutive blocked checks; no schema change | 2 | 3 | 6 Moderate | Ship with sweep fixtures; rollback is redeploying the previous sweep |
| Capture-time duplicate status | A re-clip of an already-saved capture says so instead of silently filing a twin | Toast copy plus a dashboard item deep link | `ingest-clip` checks owner + `content_hash` before creating and returns a safe `capture_status`; additive response field | 2 | 3 | 6 Moderate | Ship with the refresh release |
| Refresh-on-revisit | Blocked or stale Items update automatically when the owner naturally revisits the source page in their logged-in browser | Popup auto-refresh toggle (default on); quiet capture with a change toast | New pairing-authenticated `refresh-capture` function; server-side field diff reusing enrichment guards; extension-local URL memory; no schema change | 3 | 4 | 12 High | Ship behind contract fixtures, rate limit, and deploy approval |
| Configured Magpie Agent | Ask questions across Projects and Collections, compare Items, understand routing, and configure watches | Authenticated dashboard conversation panel | One managed Agent plus bounded owner-validating context, comparison, explanation, and watch functions | 4 | 5 | 20 Critical | Build locally; push/deploy only after contract tests and separate approval |
| Server-side arbitrary URL retrieval | Convenient link-only ingestion | Async status and retry UI | New network fetcher, SSRF controls, redirect/content limits | 4 | 5 | 20 Critical | Reject for V3.1 |
| Mobile share target | Capture away from desktop Chrome | PWA/native share UI | New public/authenticated ingestion handoff | 3 | 4 | 12 High | Defer until desktop modes pass |
| Rename Base44 entities | Cleaner code terminology | Broad refactor | Destructive entity/function/type migration | 4 | 5 | 20 Critical | Reject for V3.1 |
| Let folders influence routing | More contextual filing | Hidden behavior and complex controls | Routing contract, prompts, keys, correction memory, migrations | 4 | 5 | 20 Critical | Reject |
| Arbitrary folder depth | Flexible hierarchy | Recursive tree and complex navigation | Recursive validation, cycle/path migration, larger query surface | 4 | 4 | 16 Critical | Reject |
| Remove RLS admin bypass on owner-scoped entities (security incident fix) | Restore the promised owner-isolation guarantee; stop cross-owner data exposure | None | Every owner-scoped entity's `read`/`update`/`delete` RLS drops the `user_condition: role=admin` `$or` clause; `canAccessOwner()` in `shared/auth.ts` drops its admin fallback | 2 | 5 | 10 High | Ship immediately; entity + affected-function deploy required |
| Real brand icon (extension + dashboard) | Replaces the placeholder CSS bird mark with the real Magpie logo everywhere | Extension manifest/popup icons; dashboard topbar/pairing/landing mark; browser favicon | None | 1 | 1 | 1 Low | Ship; site deploy only (extension icon needs no deploy, just a reload) |
| Card view for image-bearing Collections | Product listings read as visual cards instead of a dense table | Auto per-Collection Cards/Table choice in `RecordTable`, reusing already-loaded Clip screenshots | None; no new entity reads | 1 | 2 | 2 Low | Ship |
| Landing page AI-capability section | Names the AI decision/comparison/explanation/watch-config surface the landing previously didn't mention | New static `Landing.jsx` section | None; no entity reads, preserves the zero-entity-read landing constraint | 1 | 1 | 1 Low | Ship |
| In-app Docs page | Replaces linking out to raw GitHub markdown with a branded in-app docs surface; explains the extension trust story right next to the sign-in CTA | New `Docs.jsx` view reached via `?docs=<slug>` (no server routing needed, same pattern as the `?review=` deep link); links from Landing and the dashboard topbar | None; renders the existing `docs/*.md` files client-side via a build-time `?raw` import, no entity reads for a signed-out visitor | 1 | 1 | 1 Low | Ship |

## Backend change plan

### Remove RLS admin bypass (security incident fix)

Live cross-owner data exposure confirmed 2026-07-26: the app owner's account
carries `role: "admin"` (Base44's default for the app creator), and every
owner-scoped entity's RLS included `{"user_condition": {"role": "admin"}}` as
an `$or` alternative to the `data.owner_id` check on `read` (and, for `Record`,
`Clip`, `Collection`, `Mission`, `WatchRule`, on `update`/`delete` too). This
let the admin account read, edit, or delete any owner's Clips, Records,
Collections, Projects, WatchRules, Enrichments, RoutingDecisions, and
ExtensionInstalls through the ordinary dashboard SDK — verified live via an
unfiltered `Clip.list()` call as the admin account, which returned another
owner's Clips mixed with its own. `shared/auth.ts`'s `canAccessOwner()` carried
the identical bypass, extending it to `classify-clip` and `enrich-record`.

The reverse direction reported alongside this (a non-admin account allegedly
seeing the admin's data) has no matching code path: RLS and every
`requireOwned`/strict-`owner_id` check in `delete-record`, `resolve-routing`,
and the agent tools only ever add rows for an admin caller, never remove the
owner check for a plain `role: "user"` caller. The most likely explanation is
session/browser sharing during a joint test, not a second bug; this fix does
not depend on resolving that separately.

- **User value:** restores the product's owner-isolation guarantee (Product
  Charter: captures and organized data are private to their owner).
- **Frontend surface:** none. `src/App.jsx` has no admin-role branch, so
  nothing in the UI depends on the bypass.
- **Backend surface:** `base44/entities/*.jsonc` — drop the admin `$or`
  alternative from `read`/`update`/`delete` on `clip`, `record`, `collection`,
  `mission`, `watch-rule`, `enrichment`, `routing-decision`,
  `extension-install`. `create` stays admin-only on every entity (unchanged;
  all writes already go through `asServiceRole` in backend functions, never
  direct client writes). `base44/shared/auth.ts` — `canAccessOwner()` becomes a
  strict `user.id === ownerId` check (or is removed and call sites inline the
  check, matching the `requireOwned` pattern already used by `delete-record`
  and `resolve-routing`).
- **Data compatibility:** no schema change, no backfill; this only narrows who
  can read/write existing rows.
- **Security/RLS:** this is the fix, not a new exposure. No new ID crosses
  owners; the extension pairing principal is unaffected (it never had entity
  access).
- **Failure behavior:** an admin calling `classify-clip`/`enrich-record` on
  another owner's id now gets `403` instead of succeeding, matching the
  behavior every other owner-scoped function already has.
- **Migration/rollback:** none needed; re-adding the `$or` clause is the
  rollback, but should only happen with a scoped, function-mediated admin
  audit path if that capability is ever legitimately needed — never a blanket
  RLS bypass.
- **Release authority:** entity deployment (`npx base44 entities deploy`)
  required for the RLS change; function deployment required for
  `classify-clip` and `enrich-record` (the only importers of `canAccessOwner`).
  Both need explicit owner approval before running.

Risk is L=2, I=5 (worst-credible impact is cross-owner data exposure, the
highest category the risk model has), score 10 High — scored High rather than
the matrix's usual Critical banding because this is a pure narrowing with no
migration, no schema change, and no dependent feature to rehearse; the
severity lives in the impact of the bug being fixed, not in the risk of the
fix itself.

### Configured Magpie Agent

The configured `magpie_organizer` Agent is the authenticated, user-facing
intelligence layer. It is broad across content domains but is not a second autonomous
filing system. The existing AI Gateway code agent remains responsible for automatic
capture routing.

The managed Agent receives only these backend-function tools:

- `agent-workspace-context`: bounded owner-visible Projects, Collections, Items,
  routing summaries, update summaries, and watches;
- `agent-compare-items`: a bounded comparison of two to twelve explicitly named,
  owner-visible Items;
- `agent-explain-organization`: evidence and allowlisted routing reasons for one
  owner-visible Capture;
- `agent-configure-monitoring`: create, update, pause, or resume a WatchRule only
  after re-validating the caller and Record owner.

It receives no direct entity tools, no service credential in the dashboard, and no
cross-conversation memory. Every function calls `requireUser`, loads referenced rows
through the service role, and applies `canAccessOwner` before returning or mutating
data. Responses exclude raw HTML, pairing secrets, and unrelated owner data. The
Agent must never claim a mutation unless a tool confirms it.

Compatibility and rollback:

- no entity schema changes or data backfill are required;
- the extension, ingestion, routing, and enrichment paths are unchanged;
- the dashboard panel can be removed without deleting product data;
- Agent memory is explicitly disabled, so durable context remains in canonical
  entities and conversations;
- the local Agent file is not synchronized until a separate deployment approval,
  because `agents push` is a full synchronization operation.

Risk is L=4, I=5, score 20 Critical. Required controls are owner-isolation fixtures,
bounded-output fixtures, mutation idempotency, Agent-config inspection, frontend
build, regression tests, and a separate approval for function deployment, Agent
synchronization, or site deployment.

### Project-aware routing code agent

The routing agent is backend code running through `base44.aiGateway.connection()`,
not a managed conversational agent resource. It has three read/proposal tools over
trusted owner-scoped context and no entity mutation tools. Deterministic code owns
Project eligibility, confidence/margin thresholds, Collection routing, and all writes.

Compatibility and rollback:

- explicit extension Project selection remains unchanged and authoritative;
- proposals without Project fields retain global V3 behavior;
- agent failure retains the existing no-mutation review result;
- additive RoutingDecision audit fields require no backfill;
- reverting the proposal provider restores the current structured classifier without
  deleting or rewriting data.

Risk is L=4, I=4, score 16 Critical. The full contract and fixtures are frozen in
`docs/V3_AUTO_ORGANIZATION_PLAN.md` before implementation.

### Owner routing correction (`resolve-routing`)

`resolve-routing` closes the largest gap between the shipped V3 routing pipeline
and the product promise: an owner can currently see a `needs_review` Capture, or
ask the Magpie Agent to explain a routing decision, but nothing lets them act on
it. This is the correction workflow `docs/API_AND_FAILURE_MAP.md` already
documents as "V3 target, not implemented."

- **User value:** an owner facing a `needs_review` Capture, or a capture routed to
  the wrong Collection, resolves it in one action — accept the safe suggestion,
  redirect to a different eligible Collection, or approve a new bounded Collection
  — instead of the item sitting unresolved indefinitely.
- **Frontend surface:** wires existing Needs review / Item detail actions to one
  function call; no new view, no folder or navigation change.
- **Backend surface:** one new function, `resolve-routing`, callable only by the
  signed-in owner and never the extension's pairing principal. It is the sole
  writer for this transition and updates Clip, Record, and RoutingDecision
  together in one server-owned outcome. It reuses the same owner/scope
  eligibility checks as `classify-clip` rather than introducing a second
  validation path.
- **Data compatibility:** additive only. No entity schema change; existing Clips,
  Records, and RoutingDecisions with no resolution remain valid and keep showing
  as `needs_review` until acted on.
- **Security/RLS:** every referenced Clip, RoutingDecision, and target Collection
  must independently pass an owner check; a proposed Collection ID from another
  owner or an ineligible scope is rejected, matching the existing `classify-clip`
  invariant. The extension's pairing token must be structurally unable to call
  this function.
- **Failure behavior:** see the frozen contract in `docs/API_AND_FAILURE_MAP.md`
  (`400` malformed action/schema, `401` unauthenticated, `403` cross-owner, `404`
  missing row, `409` already-resolved/incompatible state). No partial mutation
  may survive a failed call — Clip, Record, and RoutingDecision finish in one
  coherent state, or the original `needs_review` state is preserved untouched.
- **Migration:** none required. Rehearse locally against the existing fixture set
  (unresolved review Clips already produced by V3 fixtures) before any push.
- **Rollback:** hide the resolution actions behind a local flag; leave existing
  Clips in `needs_review`. Reverting the function deployment does not delete or
  rewrite any Clip, Record, or RoutingDecision.
- **Sequencing:** per `docs/CLAUDE_CODE_HANDOFF.md`, this ships before folders
  (Phase 6). Folders are navigation polish; this closes a core product promise.
- **Release authority:** function deployment only; no entity or site deployment
  required. Deploy only after explicit owner approval.

Risk is L=3, I=4, score 12 High. Required controls are owner-isolation fixtures
covering the accept, redirect, create-new, and already-resolved paths; an
audit-trail invariant test confirming the original proposal remains readable
after resolution; and a regression check that the extension's pairing token
cannot call the function — all before any deploy approval is requested.

### Owner Item deletion (`delete-record`)

Owners currently cannot remove an Item at all. The chosen semantics are full
delete: at explicit owner request, the Item and everything derived from or
supporting it is permanently removed. This is a deliberate, recorded exception
to "evidence travels with data" — the owner of the evidence may destroy it
(`docs/DECISIONS.md`).

- **User value:** remove an Item that is wrong, stale, or no longer wanted, with
  no orphaned watches or update history left behind.
- **Frontend surface:** a remove action with a two-step inline confirmation in
  Item detail; no new view.
- **Backend surface:** one new `delete-record` function, signed-in owner only.
  Deletion order is children first: WatchRules, Enrichments, RoutingDecision,
  Record, then Clip. RLS alone cannot do this coherently because Enrichment and
  RoutingDecision deletes are admin-only.
- **Data compatibility:** no schema change; no backfill.
- **Security/RLS:** every row is owner-checked before the cascade starts; the
  extension pairing principal has no path to this function.
- **Failure behavior:** missing id `400`; unauthenticated `401`; cross-owner
  `403`; already-fully-deleted Record `404` (the UI treats a retry `404` as
  done). A mid-cascade failure leaves only already-deleted children gone;
  retrying skips missing rows and finishes the remainder.
- **Migration/rollback:** none needed; the function can be removed without data
  impact. Deleted data is unrecoverable by design.
- **Release authority:** function deployment only.

Risk is L=3, I=4, score 12 High. Required controls: cascade-count fixtures,
cross-owner rejection, missing-row idempotent retry, and the hosted
throwing-`get` fixture pattern.

### Owner Collection/Project deletion (`delete-collection`, `delete-mission`)

Owners can currently only delete one Item at a time. Deleting a whole
Collection or Project one Item at a time is tedious and easy to abandon
half-finished, leaving orphaned watches and history behind exactly the
problem `delete-record` solved at the Item level. This extends the same
full-delete semantic one and two levels up the existing hierarchy rather than
introducing a new destructive concept.

- **User value:** remove a Collection (with every Item inside it) or an entire
  Project (with every Collection and Item inside it) in one confirmed action,
  with no orphaned watches, update history, captures, or routing audit rows
  left behind.
- **Frontend surface:** a delete action with a two-step inline confirmation in
  the Collection sidebar and in the Project switcher; no new view.
- **Backend surface:** two new functions, signed-in owner only.
  `delete-collection` reuses the exact per-record cascade `delete-record`
  established (`base44/shared/record-removal.ts`'s extracted `cascadeRecord`)
  over every owned Record in the Collection, then deletes the Collection.
  `delete-mission` reuses `delete-collection`'s cascade over every owned
  Collection scoped to the Mission (`Collection.mission_id`), then deletes the
  Mission. Neither introduces a new relationship type or a new deletion
  primitive — both are pure fan-out over the already-reviewed cascade. Listing
  a Collection's Records or a Mission's Collections is paginated
  (`listAllOwned` in `base44/shared/service-entities.ts`) so an owner with more
  rows than one page still gets a complete cascade.
- **Data compatibility:** no schema change; no backfill.
- **Security/RLS:** every row is owner-checked before the cascade starts, same
  as `delete-record`; the extension pairing principal has no path to either
  function.
- **Scope decision:** `delete-mission` deletes only Collections structurally
  scoped to the Mission and their Records. It deliberately does not touch
  `needs_review`/`failed` Clips that only carried the Mission as a routing
  hint — see `docs/DECISIONS.md`.
- **Failure behavior:** missing id `400`; unauthenticated `401`; cross-owner
  `403`; already-fully-deleted row `404` (a retry `404` after success means
  done). Missing child rows are skipped, never errors, so a mid-cascade
  failure is completed by retrying. An implausibly large cascade (past
  `listAllOwned`'s documented row bound) fails loud with `500` rather than
  silently deleting a partial cascade.
- **Migration/rollback:** none needed; the functions can be removed without
  data impact beyond what a completed delete already did. Deleted data is
  unrecoverable by design, same as `delete-record`.
- **Release authority:** function deployment only.

Risk for `delete-collection` is L=3, I=4, score 12 High — the same class as
`delete-record`, just a wider fan-out over a proven primitive. Risk for
`delete-mission` is L=3, I=5, score 15 High: worst-credible impact is losing an
entire Project's structure in one action, the top impact band, but it stays
High rather than Critical because the likelihood and control profile match the
already-reviewed cascade primitive with no new relationship type or new attack
surface — the same reasoning already used to score the RLS-bypass fix High
rather than Critical. Required controls: cascade-count fixtures across
multiple Collections/Records, cross-owner rejection before any delete,
missing-row idempotent retry, a pagination fixture exceeding one page, and a
fixture proving an unrelated global Collection and a hint-only `needs_review`
Clip both survive Project deletion untouched.

### `resolve-routing` extensions: dismiss and Project-scoped creation

- **`dismiss`:** an owner discards a `needs_review` capture they do not want.
  Same state rule as other actions — a Clip outside `needs_review` returns
  `409`. Dismiss deletes the RoutingDecision then the Clip through the service
  role. A retry after success returns `404`, which the UI treats as done.
- **`project_id` on `create`:** the owner may scope the newly approved
  Collection to an owner-owned active Project (or create one first through the
  existing `create-mission` function). An unknown, inactive, or cross-owner
  Project fails `404`/`409`/`403`; it never silently falls back to global.
- **Data compatibility:** additive input fields only; no schema change.

Risk is L=2, I=3, score 6 Moderate. Controls: fixtures for dismiss happy path,
non-review conflict, retry-after-delete, Project validation, and scoping of the
created Collection/Record/Clip.

### Blocked-watch auto-pause

Blocked sources (login walls, anti-bot challenges) are non-retryable, but the
sweep currently resets the backoff multiplier for non-retryable outcomes, so a
blocked watch re-checks at full cadence forever.

- **Behavior:** a pure helper pauses a watch (`active: false`,
  `last_error_code: "AUTO_PAUSED_BLOCKED"`) when a blocked result makes the
  consecutive failure count reach 3. The owner can resume at any time through
  the existing owner-validated watch function; a successful check resets the
  counter as today.
- **Failure behavior:** unchanged sweep isolation — one failing watch never
  fails the batch.
- **Rollback:** redeploy the previous sweep entry; paused watches are resumed
  manually from the dashboard.

Risk is L=2, I=3, score 6 Moderate. Controls: pure helper fixtures covering
below-threshold, at-threshold, non-blocked outcomes, and reset-on-success.

### Refresh-on-revisit (`refresh-capture`) and capture-time duplicate status

The server cannot re-check login-walled or bot-protected sources, and the
charter forbids crawling. The owner's own browser visits those pages anyway —
logged in and first-party — so the extension quietly re-captures a page the
owner previously clipped when they revisit it, and the backend performs the
same guarded field diff the scheduled sweep would have performed.

- **User value:** the "keeps current" promise extends to sources the server can
  never reach; a re-clip of a saved capture reports "already saved" or
  "updated" instead of silently filing a twin.
- **Frontend surface:** popup auto-refresh toggle (default on); a toast only
  when a refresh finds changes; toast copy for duplicate captures.
- **Backend surface:** `ingest-clip` gains an owner + `content_hash` duplicate
  check and an additive `capture_status` response field. New `refresh-capture`
  function, pairing-authenticated like `ingest-clip`: matches the owner's most
  recent Record by exact `source_url`, diffs watched fields from the supplied
  bounded text through the existing enrichment machinery (including the
  suspicious-value guard), appends Enrichment rows, restores freshness, resets
  watch failure counts, and reactivates an `AUTO_PAUSED_BLOCKED` watch. It
  never creates or moves Collections, Records, or Clips.
- **Trust boundary:** unchanged. The extension learns nothing new — it only
  remembers URLs it itself captured, in `chrome.storage.local` beside the
  pairing token. No server-to-extension data flow is added; responses carry
  typed outcomes and counts only. A forged refresh from a stolen token can
  only pollute that owner's own data, matching the existing capture threat
  model, and the suspicious-value guard still applies.
- **Privacy:** implicit collection is bounded to pages the owner explicitly
  saved, rate-limited to once per URL per 12 hours, disabled by one toggle, and
  surfaced by a toast whenever it changes anything.
- **Uninstall degradation (accepted):** deleting the extension wipes the local
  URL memory together with the pairing token, so automatic refresh resumes only
  for newly captured or re-clipped pages; the dashboard's source links remain
  the recovery path. The designated future fix is a bounded URL-hash seed
  handed over at pairing time by the authenticated dashboard — never a read
  capability for the pairing token (`docs/DECISIONS.md`).
- **Failure behavior:** missing/invalid pairing `401`/`403`; malformed input
  `400`; no matching Record returns a typed `no_match`, never an error; a
  suspicious diff mutates nothing.
- **Rollback:** disable the toggle default or remove the tab listener; the
  function can be removed without data impact.
- **Release authority:** function deployment plus local extension reload.

Risk is L=3, I=4, score 12 High. Controls: fixtures for no-match, unchanged,
changed, suspicious, and watch-reactivation paths; rate-limit behavior in the
worker; the extension pairing principal must be unable to call any owner
workflow through this function.

### New `Folder` entity

Proposed additive fields:

- `owner_id`;
- `name`;
- `parent_folder_id`;
- `normalized_key`: owner/parent/name key;
- `depth`: `0` or `1`;
- `sort_order`;
- `status`: active or archived.

RLS:

- create/update/delete: server/admin path only;
- read: matching owner or admin.

The server owns writes because RLS alone cannot prevent cycles, excessive depth, cross-owner parents, or duplicate sibling names.

### Additive `Collection` change

- Add optional `folder_id`.
- Existing Collections remain valid and appear under **Unfiled**.
- Folder membership is excluded from Collection routing keys and schema signatures.

### New backend workflows

#### `manage-folder`

Authenticated dashboard caller only.

Actions:

- create;
- rename;
- move;
- archive;
- restore.

Checks:

- owner equality for every referenced Folder;
- bounded names and deterministic sibling key;
- maximum depth;
- no self-parent or descendant cycle;
- no mutation of archived parents;
- archive moves child Collections and child Folders to Unfiled/root in one documented order.

#### `move-collection`

Authenticated dashboard caller only.

Checks:

- Collection and Folder share the caller owner;
- target Folder is active;
- absent target means Unfiled;
- update only `folder_id`;
- never alter Mission scope, schema, routing profile, or Records.

### Realtime

- Subscribe to owner-visible Folder changes.
- Existing Collection subscription reflects `folder_id` moves.
- Optimistic UI must roll back on `403`, `404`, or `409`.

### Migration

1. Export or preserve a repeatable local fixture before schema reload.
2. Add the Folder entity and optional Collection field.
3. Generate types.
4. Reload locally; existing Collections appear as Unfiled.
5. Do not backfill fabricated folders.
6. Rehearse archive/restore and rollback with fixtures.
7. Push or deploy only after explicit approval.

### Rollback

- Hide the folder UI with a local feature flag.
- Leave `folder_id` ignored; existing routing and Collection reads continue.
- Do not delete Folder rows during rollback.
- Reverting the feature never rewrites Mission, Record, Clip, or RoutingDecision.

## Required test cases

### No-backend UI changes

- Landing renders without authentication or entity requests.
- Sign-in returns to the correct authenticated view.
- UI labels show Project/Item/Capture while SDK calls retain Mission/Record/Clip.
- All existing V3 routing fixtures remain green.
- Desktop, narrow desktop, tablet, and mobile layouts have no inaccessible actions.
- Keyboard focus stays inside dialogs and returns to the invoking control.

### Resolve-routing contract

- Accept the safe suggestion for a `needs_review` Clip; confirm exactly one
  Record and one updated RoutingDecision result.
- Redirect to a different eligible existing Collection; confirm the original
  RoutingDecision proposal remains readable and auditable.
- Approve a new bounded Collection from a `needs_review` Clip; confirm at most
  one Collection and one Record are created.
- Reject a target Collection owned by another user with `403`.
- Reject an already-resolved Clip in an incompatible state with `409`.
- Reject a malformed action or schema with `400`.
- Retry the same resolution call; confirm no duplicate Record or Collection.
- Confirm the extension's pairing token has no access to this function.

### Folder contract

- Create two same-named folders under different parents.
- Reject duplicate normalized sibling names.
- Reject a parent owned by another user.
- Reject self-parent and descendant cycles.
- Reject depth greater than two visible levels.
- Move a Collection into a root folder, subfolder, and Unfiled.
- Confirm moving a Collection does not change Mission, schema, routing keys, Records, or routing decisions.
- Archive/restore a folder without deleting Collections.
- Retry each mutation without producing duplicate folders or conflicting moves.
- Confirm the extension cannot read Folder data.

### Multi-mode capture

- Element mode preserves the existing bounded HTML/text behavior.
- Selection and page modes never send full-page HTML.
- Link mode uses the target as `source_url`, retains the containing page as `context_url`, and performs no backend fetch.
- Visual and image modes crop the visible pixels to the selected browser rectangle.
- Only visual/image modes attach screenshot evidence to the AI request.
- Invalid or oversized screenshots return the existing typed capture errors.
- Missing visual evidence with insufficient text enters review and creates no Collection or Record.
- Every mode uses a fresh idempotency key and the same owner-bound pairing token.
- The service worker contains no `@base44/sdk` import and context-menu actions expose no owner data.

## Implementation phases

### Phase 0 — Freeze V3.1 product and risk contract

Files:

- `docs/PRODUCT_CHARTER.md`;
- `docs/V3_1_PRODUCT_AND_RISK_PLAN.md`;
- `docs/DECISIONS.md`;
- `docs/BUILD_GUIDE.md`;
- `docs/ENGINEERING_NOTES.md`.

Gate:

- Every planned change has a risk score and backend impact.
- Backend entity renames, routing-aware folders, and arbitrary depth are explicitly rejected.

### Phase 1 — Finish the V3 testable product loop

Before visual expansion:

- activate route-then-extract persistence;
- make the extension default to Auto-organize;
- demonstrate existing/new/review from Chrome;
- preserve MV3 worker-sleep authentication.

Gate:

- V3 is testable end to end rather than only through fixtures.

### Phase 2 — Vocabulary and visual foundation

- Apply UI label mapping without code/schema renames.
- Extract design tokens and reusable primitives.
- Add complete loading, empty, error, and success states.
- Lock responsive and accessibility acceptance checks.

Backend: none.

### Phase 3 — Landing and onboarding

- Expand the current unauthenticated landing component.
- Add static Move to Berlin product storytelling.
- Add first-run dashboard checklist and clearer pairing instructions.

Backend: reuse existing auth and pairing functions only.

### Phase 4 — Application information architecture

- Add Home, Library, Projects, Needs review, and Updates views.
- Consume typed routing/enrichment states rather than parsing raw errors.
- Keep one owner-scoped realtime data layer.

Backend: no new mutations; query/subscription review required.

### Phase 5 — Multi-mode capture

- Add the explicit capture-mode menu and relevant right-click actions.
- Keep element capture as the primary/default action.
- Add bounded selection/page/link evidence without backend crawling.
- Add cropped visual/image evidence to the existing upload path and vision-capable routing request.
- Verify the MV3 sleep/wake boundary and all routing fixtures before any remote change.

### Phase 6 — Folder fixtures and persistence

- Write pure tree validation fixtures.
- Add Folder and optional Collection field.
- Add server-owned folder workflows.
- Generate types and exercise migration/rollback locally.

Gate:

- Cross-owner, cycle, depth, archive, retry, and no-routing-impact fixtures pass.

### Phase 7 — Folder UI

- Implement create, rename, archive, restore, and explicit move controls.
- Add drag-and-drop only after explicit moves pass.
- Add Unfiled and archived views.

### Phase 8 — V3.1 hardening

- Run native Deno fixtures, generated types, frontend build, and manual responsive/accessibility checks.
- Test clean onboarding, pairing, capture, routing, review, folder movement, and enrichment.
- Update screenshots, README, demo script, API/failure map, and decisions.
- Review the exact remote change set before requesting deployment approval.

## Definition of V3.1.0 complete

V3.1.0 is complete when a new user understands Magpie from the landing page, reaches a clear authenticated workspace, clips through V3 automatic organization, reviews uncertainty, finds Collections through Projects or optional two-level folders, and can trust that presentation changes did not weaken evidence, routing, owner isolation, or the extension boundary.
