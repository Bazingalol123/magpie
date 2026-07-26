# Magpie API and failure-state map

This document separates deployed state from the local V3 source currently under verification. Expected operational outcomes are returned as structured states. Exceptions are reserved for malformed requests, authorization failures, missing internal records, conflicts, and unexpected server faults.

> `docs/PRODUCT_CHARTER.md` is authoritative. V3 auto-organization, V3.1 capture modes,
> and the bounded Project-aware routing code agent were deployed to the linked app on
> 2026-07-25. Chrome semantic-Project and multimodal interaction, owner-RLS integration,
> correction, and concurrency gates remain.

## Shared response rules

| Case | HTTP | Response behavior |
|---|---:|---|
| CORS preflight | 204 | No body |
| Invalid JSON or missing required input | 400 | Stable `error` message |
| Missing/invalid authentication | 401/403 | Stable `error` message; no resource details leaked |
| Resource owned by another user | 403 | Stable `error` message |
| Resource does not exist | 404 | Stable `error` message |
| Conflict with current state | 409 | Stable `error` message |
| Expected remote/source failure | 200 | Typed outcome such as `blocked` or `unreachable` |
| Unexpected internal failure | 500 | Generic client message; detailed server log |

## Owner isolation and RLS — security fix 2026-07-26

Every owner-scoped entity's `read`/`update`/`delete` RLS is a strict
`data.owner_id == {{user.id}}` check with no other alternative. There is no
admin/role-based bypass anywhere in RLS or in backend authorization helpers.
`create` on every owner-scoped entity remains admin-(service-role-)only, since
all writes go through backend functions using `asServiceRole`, never a direct
client create.

This closes a confirmed live incident: entity RLS previously included
`{"user_condition": {"role": "admin"}}` as an `$or` read/update/delete
alternative, and `shared/auth.ts`'s `canAccessOwner()` carried the same
admin fallback. The app owner's account carries `role: "admin"` (Base44's
default for the app creator), so that account could read, edit, or delete any
other owner's Clips, Records, Collections, Projects, WatchRules, Enrichments,
RoutingDecisions, and ExtensionInstalls, and could call `classify-clip` /
`enrich-record` on another owner's row. Verified live via an unfiltered
`Clip.list()` call as the admin account, which returned another owner's Clips
mixed with its own. See `docs/V3_1_PRODUCT_AND_RISK_PLAN.md` for the full
change record and `docs/DECISIONS.md` for why no scoped admin-audit
replacement was built.

## V3 frozen routing contract

### Outcome and persistence map

| Situation | Validated routing result | Clip state | Durable organization mutation |
|---|---|---|---|
| One eligible existing Collection clearly matches | `existing` | `routed_existing` | Reuse that Collection; create at most one Record |
| A coherent reusable type has no equivalent Collection | `new` | `created_collection` | Create at most one Collection and one Record |
| Ambiguous, mixed, weakly supported, or unsafe proposal | `review` | `needs_review` | Create neither Collection nor Record |
| AI unavailable or response malformed | `review` | `needs_review` | Create neither Collection nor Record |
| Unexpected failure after the Clip is durable | `failed` | `failed` | No partial Collection or Record should survive |

`review` is an expected successful routing outcome. It is not an HTTP error. `failed` is not an AI-confidence outcome; it is reserved for unexpected durable-processing faults.

After routing persistence exists, every accepted non-duplicate Clip has exactly one `RoutingDecision`. Duplicate ingestion or classification retries return the existing Clip/decision/Record identifiers and do not create additional rows.

### Scope rules

- With no Mission hint, the backend code agent may propose one active owner-owned
  Project. Deterministic code accepts it only at confidence `>= 0.90` with a
  `>= 0.15` lead over the runner-up.
- With no Mission hint and no validated Project assignment, only active owner-owned
  global Collections are eligible.
- With a valid Mission hint, active owner-owned Collections in that Mission and active owner-owned global Collections are eligible.
- An equivalent Mission-scoped Collection wins over a global Collection for a Mission-hinted capture.
- A new Collection is scoped to the explicit Mission hint; without a hint it is global.
- A missing hint never selects the latest active Mission.
- A proposed Collection ID from another owner or an ineligible Mission scope is discarded and the safe result is review unless another independently validated eligible route exists.
- An explicit Project always wins. Unknown, inactive, cross-owner, low-confidence, or
  ambiguous automatic Project proposals never scope a durable Collection write.

### Supported routing reason codes

Unknown AI-provided reason codes are discarded. The initial server allowlist is:

`existing_schema_match`, `mission_scope_match`, `global_scope_match`, `no_equivalent_collection`, `ambiguous_candidates`, `mixed_content`, `unsupported_schema` (legacy), `invalid_schema`, `unsafe_collection_name`, `malformed_ai_response`, `ai_unavailable`, `cross_owner_candidate`, `ineligible_scope`, `inactive_collection`, `insufficient_supported_fields`, `low_confidence`, and `equivalent_collection`.

## Function map

### `create-extension-pairing`

- **Caller:** signed-in dashboard.
- **Success:** `201`; creates a hashed, owner-bound browser token and returns the raw token once.
- **Expected cases:** unauthenticated `401`; malformed label is bounded/defaulted.
- **Security invariant:** raw token is never persisted.

### `extension-context`

- **Caller:** paired extension.
- **Hosted V3 success:** `200`; returns `auto_organize: true` plus bounded active Project context (`projects`, with `missions` retained for compatibility). An empty selection explicitly means no Mission.
- **Expected cases:** missing token `401`; inactive/invalid pairing `403`; no Missions returns an empty list.
- **Security invariant:** cannot read candidates, clips, collections, or enrichments.

### `create-mission`

- **Caller:** signed-in dashboard.
- **Success:** `201`; creates one active Mission without archiving other Missions.
- **Expected cases:** missing title `400`; unknown template falls back to `custom`.
- **Data invariant:** schema and policy are created once and versioned.

### `ingest-clip`

- **Caller:** paired extension.
- **Accepted evidence modes:** `element`, `selection`, `page`, `link`, `visual`, and `image`; absent mode remains compatible as `element`.
- **Boundaries:** selection/page/link send bounded browser-observed text and no full-page HTML. Link mode may retain the containing page as `context_url`, but ingestion does not retrieve the target URL. Visual/image modes may include one bounded PNG/JPEG crop through the existing screenshot upload path.
- **Hosted V3.1 success:** `202`; stores the Clip first with pending routing, runs route-then-extract, and returns acceptance, Clip ID, routing status, and one allowlisted safe reason code without Collection/Record contents.
- **Expected cases:** invalid URL/text `400`; oversized screenshot `413`; invalid pairing `403`; unavailable selected Mission `409`; repeated idempotency key returns the existing clip with `duplicate: true`; an identical re-capture (same owner and `content_hash`) returns the existing clip with `capture_status: "duplicate"` instead of creating a twin.
- **Hosted V3.1 degradation:** screenshot upload failure preserves the text capture; AI outage or malformed output produces `needs_review` without a Collection or Record; unexpected durable-processing faults create a failed audit outcome.
- **Visual degradation:** screenshot evidence is sent to the model only for visual/image modes. If it is unavailable, bounded text may still route; weak evidence resolves to `needs_review`, never fabricated fields.
- **Security invariant:** user-provided URLs are stored as evidence only. V3.1 ingestion performs no arbitrary server-side URL fetch.

### `refresh-capture` — V3.1

- **Caller:** paired extension, on revisiting a page the owner previously
  captured (automatic, rate-limited, owner-toggleable) or via a dashboard
  source-link visit.
- **Success:** `200` with a typed outcome only: `updated` (with `change_count`),
  `unchanged`, `no_match`, or `suspicious`. No Record, Collection, or Clip
  contents are returned.
- **Behavior:** matches the owner's most recent Record by exact `source_url`;
  diffs watched fields from the supplied bounded text through the same
  extraction and suspicious-value guards as `enrich-record`; appends Enrichment
  rows and restores freshness on real changes; resets watch failure counts and
  reactivates an `AUTO_PAUSED_BLOCKED` watch.
- **Expected cases:** missing token `401`; inactive pairing `403`; malformed
  input `400`; no matching Record is `no_match`, not an error.
- **Hard rule:** a suspicious or empty diff never mutates `fields_json`; this
  function never creates or moves durable rows beyond Enrichment appends and
  freshness/watch updates.
- **Security invariant:** grants the pairing principal no read capability;
  the extension's URL memory is local-only and dies with the pairing token.

### `classify-clip`

- **Caller:** signed-in dashboard retry.
- **Hosted V3.1 success:** `200`; returns the existing idempotent routing result or runs route-then-extract once, persists one RoutingDecision, and creates at most one Record.
- **Expected cases:** missing ID `400`; missing Clip `404`; cross-owner Clip `403`
  (strict owner check; no admin bypass, see "Owner isolation and RLS" above).
- **Hosted V3.1 degradation:** AI outage, invalid JSON, ambiguity, or unsafe proposals return a typed review result and create no Collection or Record.
- **Data invariant:** unknown AI fields are dropped; proposed Collection IDs must pass owner, status, and scope eligibility checks.
- **Project-aware hosted implementation:** the backend code agent can inspect bounded,
  preloaded owner-scoped Project/Collection summaries and submit one proposal. It has
  no write tool. Explicit Project context wins; accepted automatic context is audited
  on RoutingDecision; ambiguity becomes review and no-match remains global.
- **Agent failure:** a missing finish-tool call, malformed tool arguments, step-limit
  exhaustion, or gateway failure maps to the existing AI-unavailable review outcome.

### `resolve-routing` — V3.1 deployed 2026-07-25

- **Caller:** signed-in owner only; the extension pairing principal has no path to
  this workflow.
- **Scope:** acts only on Clips currently in `needs_review`. Re-routing an
  already-filed Item and undoing a completed resolution are deliberately excluded
  (see `docs/DECISIONS.md`).
- **Actions:** `accept` creates the Collection from the audited
  `suggested_name`/`suggested_schema_json` and fails `400` if no suggestion was
  stored; `redirect` moves into an owner-owned active existing Collection;
  `create` validates an owner-supplied name and schema through the same safety
  rules as automatic routing, optionally scoped by a validated `project_id`
  (owner-owned active Mission; unknown `404`, cross-owner `403`, inactive
  `409` — never a silent global fallback); `dismiss` discards an unwanted
  `needs_review` capture by deleting its RoutingDecision and Clip. A dismiss
  retry after success returns `404`, which callers treat as done.
- **Success:** `200`; creates at most one Collection and one Record, marks the
  RoutingDecision with `corrected_collection_id`/`corrected_at`, and moves the Clip
  to `routed_existing` or `created_collection`. The created Record carries empty
  fields and `processing_status: needs_review`; resolution fixes routing, never
  fabricates field values.
- **Expected cases:** malformed action/name/schema `400`; unauthenticated `401`;
  cross-owner Clip or Collection `403`; missing Clip/decision/Collection `404`;
  non-review Clip or a conflicting second resolution `409`; an identical retry
  returns the existing rows with `duplicate: true`.
- **Data invariant:** the original proposal outcome and reason codes remain
  auditable after resolution.
- **Hosted note:** the hosted SDK throws on `get()` for a missing ID instead of
  returning null; the function maps that to the documented `404`.

### `agent-workspace-context` — V3.1 deployed 2026-07-25

- **Caller:** signed-in dashboard user through the configured Magpie Agent.
- **Success:** `200`; returns bounded owner-visible Project, Collection, Item,
  routing, update, and watch summaries. It never returns raw HTML, pairing tokens, or
  unbounded entity dumps.
- **Expected cases:** malformed or oversized selectors `400`; unauthenticated `401`;
  cross-owner referenced IDs `403`; missing referenced rows `404`.
- **Security invariant:** service-role reads occur only after user authentication and
  an owner check for every explicitly referenced row.

### `agent-compare-items` — V3.1 deployed 2026-07-25

- **Caller:** signed-in dashboard user through the configured Magpie Agent.
- **Success:** `200`; returns a normalized comparison for two to twelve owned Records,
  including fields, Collection label, source URL, freshness, and update time.
- **Expected cases:** invalid count or duplicate IDs `400`; unauthenticated `401`;
  mixed/cross-owner IDs `403`; missing Record or Collection `404`.
- **Security invariant:** one unauthorized ID fails the whole request; partial
  cross-owner results are never returned.

### `agent-explain-organization` — V3.1 deployed 2026-07-25

- **Caller:** signed-in dashboard user through the configured Magpie Agent.
- **Success:** `200`; returns the owned Capture's safe routing outcome, allowlisted
  reason codes, selected Project/Collection labels, confidence, and correction state.
- **Expected cases:** missing `clip_id` `400`; unauthenticated `401`; cross-owner
  Capture `403`; missing Capture or RoutingDecision `404`.
- **Evidence invariant:** raw classifier prompts, raw HTML, and unrestricted model
  output never leave the backend.

### `agent-configure-monitoring` — V3.1 deployed 2026-07-25

- **Caller:** signed-in dashboard user through the configured Magpie Agent.
- **Success:** `200` for an idempotent update or `201` for creation. Actions are
  `create`, `update`, `pause`, and `resume`; frequency is hourly, daily, or weekly.
- **Expected cases:** malformed condition/action/frequency `400`; unauthenticated
  `401`; cross-owner Record or WatchRule `403`; missing row `404`; Record/WatchRule
  mismatch `409`.
- **Mutation invariant:** every write is server-owned, owner-validated, bounded, and
  confirmed in the response. The Agent has no direct WatchRule entity tool.

### `delete-record` — V3.1

- **Caller:** signed-in owner only; the extension pairing principal has no path.
- **Semantics:** permanent full delete at explicit owner request. Cascade order
  is children first: WatchRules, Enrichments, RoutingDecision, Record, Clip.
- **Success:** `200` with deleted-row counts per entity.
- **Expected cases:** missing `record_id` `400`; unauthenticated `401`;
  cross-owner Record `403`; already-fully-deleted Record `404` (a retry `404`
  after success means done). Missing child rows are skipped, never errors, so a
  mid-cascade failure is completed by retrying.
- **Security invariant:** every row is owner-checked before any delete.

### `delete-collection`

- **Caller:** signed-in owner only; the extension pairing principal has no path.
- **Semantics:** permanent full delete at explicit owner request. Cascade order
  is children first: for every owned Record in the Collection, its WatchRules,
  Enrichments, RoutingDecision, and Clip (the same per-record cascade
  `delete-record` uses), then the Record, then the Collection.
- **Success:** `200` with deleted-row counts per entity:
  `{ deleted: { watch_rules, enrichments, decisions, clips, records, collections } }`.
- **Expected cases:** missing `collection_id` `400`; unauthenticated `401`;
  cross-owner Collection `403`; already-fully-deleted Collection `404` (a retry
  `404` after success means done). Missing child rows are skipped, never
  errors, so a mid-cascade failure is completed by retrying.
- **Security invariant:** every row is owner-checked before any delete.

### `delete-mission`

- **Caller:** signed-in owner only; the extension pairing principal has no path.
- **Semantics:** permanent full delete at explicit owner request. Cascade order
  is children first: for every owned Collection scoped to the Mission
  (`Collection.mission_id`), the same cascade as `delete-collection` (Records
  and their WatchRules/Enrichments/RoutingDecision/Clips, then the Collection),
  then the Mission.
- **Scope:** only Collections structurally scoped to this Mission are deleted.
  A `needs_review`/`failed` Clip that merely carried this Mission as a routing
  hint but never produced a Collection/Record is left untouched; its
  `mission_id` becomes a dangling reference, which `resolve-routing`'s existing
  Project validation already handles as a typed `404` rather than a crash
  (`docs/DECISIONS.md`). Global Collections (no `mission_id`) are never touched.
- **Success:** `200` with deleted-row counts per entity:
  `{ deleted: { watch_rules, enrichments, decisions, clips, records, collections, missions } }`.
- **Expected cases:** missing `mission_id` `400`; unauthenticated `401`;
  cross-owner Mission `403`; already-fully-deleted Mission `404` (a retry `404`
  after success means done). Missing child rows are skipped, never errors.
- **Security invariant:** every row is owner-checked before any delete.

### `enrich-record`

- **Caller:** signed-in dashboard.
- **Success:** `200`; always returns an `outcome`, `checked_at`, `change_count`, `retryable`, and user-safe `message` for expected source behavior.

| Outcome | Meaning | Record state | Retry |
|---|---|---|---|
| `changed` | Trusted watched fields changed | `fresh`; append Enrichment rows | Normal cadence |
| `unchanged` | Trusted page, no changes | `fresh` | Normal cadence |
| `no_extractable_fields` | Page is valid but schema has no safely supported watch fields | `stale` | Manual review/schema work |
| `suspicious_data` | Extracted value is implausible relative to stored data | `stale`; no field mutation | Manual review |
| `blocked` | Authentication wall, bot challenge, robots denial, or 401/403 | `blocked` | Extension-assisted recapture |
| `not_found` | 404/410 or listing-removed signal | `stale` | Usually stop/slow watch |
| `rate_limited` | 429/temporary throttling | `stale` | Yes, with backoff |
| `unreachable` | DNS, timeout, network error, or upstream 5xx | `unreachable` | Yes, with backoff |
| `invalid_content` | Empty, oversized, non-HTML/text, or unusable response | `stale` | Sometimes |

- **Hard rule:** a failed or suspicious check never mutates `fields_json` and never creates an Enrichment row.
- **Hard rule:** document `<title>` alone is not candidate evidence and is never used to update the candidate title.

### `sweep-watches`

- **Caller:** admin/scheduled backend.
- **Success:** `200`; returns per-watch typed outcomes.
- **Expected cases:** one failed source does not fail the batch; retryable failures increment backoff; persistent/non-retryable failures remain visible.
- **Auto-pause:** a `blocked` result that brings the consecutive failure count to 3 sets the watch to `active: false` with `last_error_code: "AUTO_PAUSED_BLOCKED"`. The owner resumes it through `agent-configure-monitoring`; a successful check still resets the counter.
- **Batch invariant:** each watch is isolated; one unexpected exception is recorded and processing continues.

## Entity state map

### Record

- `enrichment_status`: latest check outcome.
- `last_check_at`: every completed attempt.
- `last_enriched_at`: only trusted successful checks.
- `freshness`: `fresh`, `stale`, `unreachable`, or `blocked`.
- `enrichment_error_code` / `enrichment_error_message`: user-safe latest problem.
- `consecutive_check_failures`: reset on `changed`/`unchanged`; increment on other outcomes.
- `next_action`: actionable recovery, not raw infrastructure text.

### WatchRule

- `last_status`: typed result of the most recent sweep.
- `failure_count`: consecutive retry/backoff counter.
- `last_error_code`: stable machine-readable problem.
- `next_check_at`: explicit due time calculated from cadence and backoff.

## Dashboard redesign handoff boundary

The next dashboard task should consume these states rather than reinterpret raw errors. It can design Today cards, candidate freshness badges, retry actions, and blocked-source recovery around this stable API contract. See `docs/DASHBOARD_V2_HANDOFF.md`.
