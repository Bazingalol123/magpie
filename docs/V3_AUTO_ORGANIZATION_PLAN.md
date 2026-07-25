# Magpie V3 — automatic organization plan

> New-session implementation handoff. Read `docs/PRODUCT_CHARTER.md` first.

## V3 outcome

The default extension flow becomes:

`capture -> server routes -> existing/new/review -> structured Record -> realtime dashboard`

The user may provide a Mission as context, but never has to choose a Collection before clipping.

## Why V3 is needed

The original classifier could name and create Collections. V2 then made the selected Mission own one extraction schema and classified captures into a generated `Mission · <title>` Collection. The extension also persists `activeMissionId`, while an empty selection means "latest active Mission."

That implementation is useful for one homogeneous shortlist but breaks the broader promise:

- an old or unintended Mission can receive the capture;
- one Mission cannot naturally contain several object types;
- the user does filing work before Magpie can organize anything;
- Collection becomes a hidden compatibility object instead of the structured table the agent is supposed to create.

V3 deliberately restores Collection routing while retaining Missions as optional purpose.

## Product decisions

1. **Pairing binds to an owner, never a Mission or Collection.**
2. **Auto-organize is the extension default.**
3. **Mission is optional context.** Explicit context is authoritative; when it is absent, the backend may infer one active owner-owned Project only through the bounded Project-routing contract below. It never uses creation recency.
4. **Collection owns the reusable extraction schema.**
5. **The server can choose an existing Collection, create one, or request review.**
6. **The extension remains write-only.** It receives capture acceptance, not a browsable Collection list or Record data.
7. **No nested folders.** Use `Mission -> Collection -> Record`, plus global Collections, search, tags, and saved views later.
8. **No destructive V2 migration during the competition.** Existing Mission and Record fields remain readable while new routing becomes canonical.

## Phase 0/1 audit — 2026-07-24

Phase 0 was not fully frozen when this session began. The charter and this plan described the intended V3 behavior, but `docs/API_AND_FAILURE_MAP.md` still documented only the V2 runtime contract and `docs/ENGINEERING_NOTES.md` still named deterministic `Saved clips` creation as the AI-failure fallback. The implementation matches that older documentation:

- a missing Mission hint silently selects the latest active Mission;
- Mission extraction generates `Mission · <title>` Collections;
- malformed AI output or an AI outage can create or reuse `Saved clips`;
- Collection reuse is based only on a case-insensitive name match;
- classification creates a Record even when extraction needs review;
- retrying `classify-clip` can create a second Record because classification has no clip-level idempotency guard;
- no `routing.ts`, `routing.test.ts`, or `RoutingDecision` exists yet.

The MV3 trust boundary is intact: the service worker uses plain `fetch`, the pairing token remains in `chrome.storage.local`, privileged writes stay behind backend functions, and `extension-context` returns only bounded Mission metadata. V3 work must preserve that boundary.

This audit freezes the following clarifications before implementation:

1. **Outcome layers are distinct.**
   - The untrusted AI proposal uses `existing`, `new`, or `review`.
   - The validated pure routing result uses the same three outcomes, with `review` representing a successful safe decision not to mutate organization.
   - `Clip.routing_status` persists `pending`, `routed_existing`, `created_collection`, `needs_review`, or `failed`.
   - `RoutingDecision.outcome` persists `existing`, `new`, `review`, or `failed`.
   - AI outage, malformed output, ambiguity, mixed content, and unsafe schemas map to `review` / `needs_review`; `failed` is reserved for an unexpected durable-processing fault.
2. **Review creates no Collection and no Record.** It persists the Clip and, after Phase 2, one auditable RoutingDecision. A Record is created only after a validated existing/new route or an owner resolves the review.
3. **Mission scope is explicit or deterministically validated.**
   - With no Mission hint and no validated automatic Project assignment, only active global Collections (`mission_id` absent) are eligible and any new Collection is global.
   - With no Mission hint and one validated automatic Project assignment, that Project becomes the routing scope for the current Clip.
   - With a valid Mission hint, active Collections in that Mission and active global Collections are eligible.
   - When equivalent Mission-scoped and global Collections both qualify, prefer the Mission-scoped Collection; otherwise a global Collection may be reused.
   - A new Collection created for a Mission-hinted capture is Mission-scoped.
   - Missing Mission context never means “latest active Mission.”
4. **Pure routing and persistence idempotency are separate proofs.** Phase 1 proves normalization, eligibility, equivalence, and safe outcomes without writes. Duplicate capture/classification retries are proved in Phase 2 against persistence.
5. **No production or entity work starts until Phase 1 passes.** The only allowed implementation files before that gate are `base44/shared/routing.ts`, `tests/routing.test.ts`, and extraction/normalization helpers refactored from `base44/shared/classification.ts`.

### Audit disposition

| Area | State after audit | Required next action |
|---|---|---|
| Product authority and hierarchy | Frozen by `PRODUCT_CHARTER.md` | No change |
| Route outcome vocabulary | Frozen in this plan and the API map | Use it in fixtures |
| AI outage and malformed output | Frozen as review, never fallback Collection creation | Prove in Phase 1 |
| Mission/global eligibility | Frozen above | Prove precedence and exclusion in Phase 1 |
| Pure routing engine | Missing | Implement only after this documentation update |
| Routing persistence and entities | Intentionally not started | Wait for the Phase 1 gate |
| Extension trust boundary | Currently compliant | Preserve through every phase |

## Target user experience

### Extension

- Destination control defaults to **Auto-organize**.
- Optional context reads **Within Mission: Move to Berlin** or **No Mission**.
- The popup never silently labels an empty selection "Latest active Mission."
- Capture intent remains optional metadata.
- A successful capture says **Captured — organizing in Magpie**.
- The dashboard, not the extension, reveals the destination.

### Dashboard

- **Library:** global and Mission-scoped Collections.
- **Mission:** related Collections, not one hidden table.
- **Collection:** schema-backed Records with realtime inserts.
- **Capture inbox:** processing, ambiguous, failed, and correction-needed captures.
- **Routing review:** suggested destination/new Collection with accept or move.
- Moving a Record becomes routing feedback.

## Target data model

Preserve existing entity names for compatibility.

### `Mission`

Keep:

- goal;
- constraints;
- ranking policy;
- watch policy;
- lifecycle.

Transition:

- `schema_json` and `schema_version` remain legacy-compatible;
- new classification must not assume one Mission equals one schema.

### `Collection`

Add:

- `mission_id`: optional Mission scope;
- `description`: bounded routing description;
- `normalized_key`: deterministic owner/scope/name key;
- `schema_signature`: deterministic normalized field-name/type signature;
- `schema_version`;
- `routing_profile_json`: bounded category cues and accepted examples;
- `status`: active or archived;
- `origin`: agent, user, or legacy.

For the competition build, the normalized routing profile begins with `{ "aliases": string[] }`. Phase 6 may add bounded positive cues, but unknown keys never become executable instructions.

`origin` deliberately avoids Base44's built-in `created_by` row attribute, which already records the creator identity.

Collection remains owner-scoped. The server owns creation.

### `Clip`

Clarify/add:

- `mission_id` becomes an optional context hint;
- `collection_id` is written only after routing;
- `routing_status`: pending, routed_existing, created_collection, needs_review, failed;
- `routing_confidence`;
- `routing_reason_code`;
- `processing_error` remains user-safe.

### `Record`

Keep:

- `collection_id` as the canonical container;
- `mission_id` during compatibility migration;
- `fields_json`, evidence linkage, enrichment state, and decision state.

### `RoutingDecision` — new

Create an auditable entity with:

- `owner_id`;
- `clip_id`;
- `mission_id`;
- `outcome`: existing, new, review, failed;
- `selected_collection_id`;
- `suggested_name`;
- `suggested_schema_json`;
- `confidence`;
- `reason_codes_json`;
- `classifier_version`;
- `corrected_collection_id`;
- `decided_at`;
- `corrected_at`.

This entity is load-bearing: it powers the review inbox, explains automatic organization, and records user corrections.

## Routing contract

### Bounded Project-routing addendum — 2026-07-25

The classifier is upgraded to a backend code agent because Project selection and
Collection selection are one organization decision. This is not a managed
conversational agent and does not require an agent resource under `base44/agents`.
It runs inside the existing classification backend through the Base44 AI Gateway.

The agent receives read-only tools over trusted, preloaded, owner-scoped context:

- `list_projects`;
- `list_collections`;
- `submit_route_proposal`.

No tool writes an entity. `submit_route_proposal` only returns an untrusted proposal
to deterministic server code. The loop uses model `automatic`, stops after the submit
tool or four model steps, and keeps image evidence limited to visual/image captures.

Project proposal fields are:

```json
{
  "project_assignment": "explicit | project | global | review",
  "project_id": "optional",
  "project_confidence": 0,
  "project_candidates": [
    { "project_id": "owner-scoped active Project ID", "score": 0 }
  ]
}
```

Validation rules:

1. An explicit Project on the Clip always wins.
2. An inferred Project must be active, owned by the Clip owner, score at least
   `0.90`, and lead the next proposed candidate by at least `0.15`.
3. Unknown, inactive, cross-owner, low-confidence, or small-margin Project proposals
   cannot scope a Collection write.
4. A confident `global` proposal preserves the existing global routing behavior.
5. Ambiguous Project assignment routes the Clip to review; it does not guess.
6. Agent/gateway failure preserves the existing safe AI-failure result: review with
   no Collection or Record.
7. Existing proposal providers that do not include Project fields remain global.
   This compatibility rule keeps tests, retries, and older function callers stable.

The RoutingDecision records assignment source, confidence, bounded candidate scores,
and allowlisted Project reason codes. It never stores raw Project or Clip content.

### Project-aware change gate

| Required field | Decision |
|---|---|
| User value | Auto-organize can associate a camera capture with "Buying a new camera" without making the extension browse owner data. |
| Frontend surface | No required extension change; explicit Project selection remains available and authoritative. |
| Backend surface | Classification code-agent loop, pure Project validator, routing persistence, additive RoutingDecision audit fields. |
| Data compatibility | Existing rows remain valid; absent Project audit fields mean legacy/no automatic assignment. |
| Security/RLS | Tools operate only over server-preloaded owner-scoped active Projects and Collections; the agent receives no write tool; extension reads do not expand. |
| Failure behavior | Agent/tool/schema failure -> existing `review` result; ambiguous Project -> review; no clear Project -> global. |
| Migration | Additive entity fields only; generate local types; no backfill. |
| Rollback | Switch the proposal provider back to the existing structured single-call implementation; ignore additive audit fields. |
| Risk | L=4, I=4, score 16 Critical because a wrong association can misfile durable data. |
| Verification | Pure thresholds/owner fixtures, tool-loop bound/finish fixtures, persistence stamps, all existing 50 tests, Deno checks, frontend build, MV3 import check. |
| Release authority | Local implementation only. Entity push and function deployment require new explicit approval. |

The AI gateway returns one bounded proposal:

```json
{
  "outcome": "existing | new | review",
  "existing_collection_id": "optional",
  "collection_name": "optional",
  "collection_description": "optional",
  "schema": [],
  "fields": {},
  "confidence": 0,
  "reason_codes": []
}
```

The initial allowlist for `reason_codes` is:

- `existing_schema_match`;
- `mission_scope_match`;
- `global_scope_match`;
- `no_equivalent_collection`;
- `ambiguous_candidates`;
- `mixed_content`;
- `unsupported_schema`;
- `malformed_ai_response`;
- `ai_unavailable`;
- `cross_owner_candidate`;
- `ineligible_scope`;
- `inactive_collection`;
- `insufficient_supported_fields`;
- `low_confidence`;
- `equivalent_collection`.

Server validation must:

- discard collection IDs outside the owner and optional Mission scope;
- validate fields strictly against the selected/proposed schema;
- clamp confidence and ignore unsupported reason codes;
- normalize Collection names to short human-readable plural nouns;
- reject page titles, site names, and `Mission · ...` as Collection names;
- use a deterministic schema signature and normalized key before creating;
- never trust model confidence by itself;
- route uncertain or conflicting output to review;
- make retries idempotent and avoid duplicate Records.

## Routing rules

### Existing Collection

Use an existing Collection only when:

- it belongs to the owner;
- it is active;
- it is within the explicit Mission scope or the global Library;
- its schema can represent the captured object;
- the proposal has a clear lead over alternatives;
- deterministic validation finds useful supported fields.

### New Collection

Create a Collection only when:

- the clip represents a coherent reusable object type;
- no existing Collection has an equivalent normalized key or schema signature;
- the proposed schema has 2–8 safe fields;
- the name is stable beyond the source page;
- the same idempotency key cannot create it twice.

Examples of valid names: `Apartments`, `Moving companies`, `Recipes`.

Invalid names: `Saved clips from example.com`, a page headline, or `Mission · Move to Berlin`.

### Needs review

Use review when:

- two Collections are plausible;
- the content is a mixed page fragment;
- the proposed type is too specific or too broad;
- the schema contains little supported data;
- the AI response is malformed;
- safe Collection creation cannot be guaranteed.

Review is a successful product outcome, not an internal server exception.

## Correction memory

When a dashboard user moves a Record:

1. update the Record and Clip through one authenticated backend function;
2. update the `RoutingDecision.corrected_collection_id`;
3. preserve the original proposal for audit;
4. add bounded cues to the destination Collection's routing profile;
5. use those cues as examples in later routing.

Do not fine-tune a model or build open-ended memory for the competition version.

## API changes

### `extension-context`

- Continue returning only safe Mission metadata.
- Add an explicit `auto_organize: true` capability flag if the popup needs migration behavior.
- Never return Collection or Record lists to the extension.

### `ingest-clip`

- Accept optional Mission context.
- Persist the Clip first.
- Return `202` after accepted processing.
- Keep idempotency behavior.
- Do not return private Collection/Record contents to the extension.

### `classify-clip`

- Replace Mission-only extraction with route-then-extract.
- Persist a `RoutingDecision`.
- Create at most one Record.
- Return a typed routing result to authenticated dashboard retries.

### `resolve-routing` — new

- Caller: signed-in owner.
- Actions: accept suggestion, move to existing Collection, or create approved Collection.
- Update Clip, Record, and RoutingDecision together as one server-owned workflow.
- Reject cross-owner IDs and invalid schemas.

## Compatibility migration

1. Keep current fields and entities readable.
2. Backfill existing `Collection.mission_id` from Records where the mapping is unambiguous.
3. Copy a legacy Mission schema into its associated Collection once.
4. Keep `Record.mission_id` during V3.
5. Stop generating `Mission · <title>` Collection names for new captures.
6. Treat existing generated Collections as valid legacy destinations until manually renamed or migrated.
7. Do not delete `Mission.schema_json` before the competition.

Because local Base44 entity changes clear local development data, export or seed a repeatable fixture set before applying schema updates.

## Implementation phases

### Phase 0 — Freeze the contract

**Files**

- `docs/PRODUCT_CHARTER.md`
- `docs/V3_AUTO_ORGANIZATION_PLAN.md`
- `docs/API_AND_FAILURE_MAP.md`

**Audit status (2026-07-24): complete.** The product hierarchy, route outcomes, scope rules, review mutation rule, reason-code allowlist, and current-to-target contract are now explicit. This status does not claim that V3 runtime behavior exists.

**Verification**

- A reviewer can explain Mission versus Collection without reading code.
- All route outcomes are named before entity or UI work begins.
- The API map distinguishes current V2 runtime behavior from the frozen V3 target contract.
- AI outage, malformed output, and ambiguity have one documented result: review without Collection or Record creation.

### Phase 1 — Build the routing engine as fixtures

**Files**

- `base44/shared/routing.ts`
- `tests/routing.test.ts`
- refactor reusable extraction helpers from `base44/shared/classification.ts`

**Implementation status (2026-07-24): complete.** Seventeen pure fixtures pass without entity access or durable writes. The suite first passed with Node 22's TypeScript stripping and a minimal `Deno.test` compatibility harness; after restoring Deno 2.9.4, native `deno test tests/routing.test.ts` also passed all 17 cases. Routing and classification bundle successfully with the installed esbuild.

**Required fixtures**

- clear existing Collection;
- genuinely new object type;
- ambiguous between two Collections;
- malformed AI response;
- cross-owner Collection ID;
- same type with a synonym name;
- equivalent schema under a synonym name;
- Mission-scoped versus global Collection;
- mixed-content fragment;
- AI outage.

**Verification**

- Pure fixture tests prove that only a validated proposal can return an existing/new routing decision.
- AI outage and ambiguity produce `needs_review`, not `Saved clips` pollution.
- A review result contains no mutation instruction for a Collection or Record.
- With no Mission hint, Mission-scoped Collections are ineligible; with a Mission hint, an equivalent Mission-scoped Collection wins over a global one.
- Phase 1 performs no entity, function, extension, dashboard, or deployment changes.

### Phase 2 — Define routing persistence storage

**Files**

- `base44/entities/routing-decision.jsonc`
- `base44/entities/collection.jsonc`
- `base44/entities/clip.jsonc`
- generated Base44 types

**Implementation status (2026-07-24): schema complete; local workflow active, not deployed.** The additive Collection and Clip fields plus the owner-readable/server-write-only RoutingDecision schema are defined, parse successfully, and appear in generated local types. The local function source now uses them, but no entity push or deployment was run.

**Verification**

- Entity definitions are additive and keep all V2 fields readable.
- Generated types contain the new Collection/Clip fields and RoutingDecision registry entry.
- RoutingDecision create/update/delete are server-only while owner reads remain owner scoped.
- Sequential retry and partial-write recovery are fixture-proven in Phase 3. Simultaneous-request serialization remains an integration gate because the current entity schema does not expose a unique constraint.

### Phase 3 — Replace Mission-only classification and activate persistence

**Implementation status (2026-07-24): core local path implemented; correction and integration gates remain.** `ingest-clip` and `classify-clip` use the validated route/persist workflow. Seven persistence fixtures pass for existing/new/review, retry, AI outage, no-Mission global scope, and partial-write recovery. `resolve-routing`, live Base44 entity/RLS verification, simultaneous-request handling, and the Chrome matrix remain incomplete. Nothing was deployed.

**Files**

- `base44/shared/classification.ts`
- `base44/functions/ingest-clip/entry.ts`
- `base44/functions/classify-clip/entry.ts`
- `base44/functions/resolve-routing/entry.ts`

**Verification**

- Under **Move to Berlin**, apartment, neighborhood, and moving-company captures route to three Collections.
- Repeating each type reuses its existing Collection.
- An ambiguous paragraph lands in review without contaminating a Collection.
- An accepted non-duplicate Clip has exactly one RoutingDecision.
- Replaying the same idempotency key creates no second Clip, Collection, Record, or decision.
- Retrying `classify-clip` for an already routed Clip returns the existing decision and Record rather than creating another Record.
- Owner-scoped RLS blocks cross-owner reads.

### Phase 3.1 — Add bounded Project-aware code-agent routing

**Implementation status (2026-07-25): deployed.** The backend
code agent uses three proposal/read tools, requires inspection results before accepting
the finish tool, and stops after four model steps. Deterministic Project validation and
additive audit persistence are active in the linked app. Sixty-four Deno fixtures pass.
The eight-entity definition set and only `classify-clip`/`ingest-clip` were synchronized
after explicit approval; the site and extension were not redeployed.

**Files**

- `base44/shared/project-routing.ts`;
- `base44/shared/classification.ts`;
- `base44/shared/routing-persistence.ts`;
- `base44/entities/routing-decision.jsonc`;
- Project-agent and persistence fixtures.

**Verification**

- Explicit Project context wins over every agent proposal.
- A camera capture clearly matching one Camera Project scopes the Collection, Record,
  Clip, and RoutingDecision to that Project.
- No active Projects and a confident no-match remain global.
- Two plausible Projects, a score below `0.90`, or a lead below `0.15` enter review.
- An inactive or non-owner Project ID is rejected before Collection routing.
- The agent can inspect only preloaded owner-scoped context and cannot write entities.
- The loop stops after `submit_route_proposal` or four model steps.
- Gateway failure preserves the current review outcome.
- All existing routing, persistence, capture, and enrichment fixtures remain green.

### Phase 4 — Make extension context explicit

**Implementation status (2026-07-24): local source implemented; Chrome verification remains.** The popup defaults to Auto-organize, treats Project/Mission context as optional, and keeps the MV3 worker on plain fetch. The extension context response adds `auto_organize` and a presentation-level `projects` alias without exposing Collections or Records.

**Files**

- `extension/popup.html`
- `extension/popup.js`
- `extension/service-worker.js`
- `base44/functions/extension-context/entry.ts`

**Verification**

- Fresh install defaults to Auto-organize with no implicit latest Mission.
- Choosing a Mission affects only subsequent captures.
- Clearing the Mission persists as No Mission.
- The extension still cannot read Collection or Record data.
- Captures still work after the MV3 worker sleeps.

### Phase 5 — Expose organization in the dashboard

**Files**

- dashboard components and styles;
- realtime subscriptions;
- `resolve-routing` integration.

**Verification**

- New Collections and Records animate into the correct Mission or global Library.
- The inbox shows processing, review, and failure states.
- Accepting or moving a routed item removes it from review and updates the destination live.
- Existing V2 Records remain visible.

### Phase 6 — Use correction memory

**Files**

- routing profile normalization;
- `resolve-routing`;
- routing fixtures.

**Verification**

- Move one misrouted fixture to the correct Collection.
- A semantically similar fixture subsequently prefers that Collection.
- Feedback cannot leak across owners.

### Phase 7 — Competition hardening

**Verification**

- Run generated types, backend checks, frontend build, and routing/enrichment fixtures.
- Exercise the full 60-second demo from a clean pairing.
- Confirm every visible failure has a recovery action.
- Update `BUILD_GUIDE`, `ENGINEERING_NOTES`, `DECISIONS`, and README with reality.

## Nested-folder decision

Do not add arbitrary nested folders in V3.

The product already has a meaningful fixed hierarchy:

`optional Mission -> auto-organized Collection -> Record`

Nested folders would reintroduce manual filing, complicate routing and navigation, and weaken the claim that Magpie organizes captures automatically. Reconsider only after evidence that search, Mission context, tags, archive, and saved views cannot support real libraries.

Post-V3 planning in `docs/V3_1_PRODUCT_AND_RISK_PLAN.md` permits a bounded Folder → Subfolder → Collection navigation layer. Those folders remain outside routing and do not change this V3 decision.

## Scope guards

- No automatic actions or outreach.
- No folder tree.
- No multi-user collaboration.
- No broad crawling.
- No visual schema editor.
- No destructive renaming of core entities.
- One routing correction loop is more valuable than several shallow organization controls.
- Keep the existing enrichment failure contract intact.

## Start-of-session procedure

Use a fresh Codex task for V3 implementation. Start with:

> Continue Magpie V3 using `docs/PRODUCT_CHARTER.md`, `docs/V3_AUTO_ORGANIZATION_PLAN.md`, `docs/API_AND_FAILURE_MAP.md`, and `docs/ENGINEERING_NOTES.md`. Treat `PRODUCT_CHARTER.md` as authoritative. First audit current implementation against Phase 0 and Phase 1, identify any conflicts, and update the plan before writing entity or production code. Preserve the MV3 trust boundary and do not deploy without explicit approval.

The new session must not begin by redesigning the UI or editing entities. It begins with routing fixtures, because they define what automatic organization is allowed to do.

## Definition of V3 complete

V3 is complete when a paired user can clip without selecting a Collection, the backend safely chooses existing/new/review, the dashboard shows the result live, corrections improve later routing, and the extension remains an untrusted write-only capture client.
