# Magpie API reference

Every durable write in Magpie goes through a backend function — the dashboard
and extension are both clients of this API. This is the public reference; the
engineering-grade contract with failure-state guarantees lives in
[`API_AND_FAILURE_MAP.md`](API_AND_FAILURE_MAP.md).

## Calling the API

All functions accept `POST` with a JSON body at:

```text
https://magpieorelse.base44.app/api/apps/{app_id}/functions/{function-name}
```

There are two caller identities, and every function accepts exactly one:

- **Signed-in user** — the dashboard calls with the user's session via the
  Base44 SDK (`base44.functions.invoke(name, payload)`). All reads and every
  owner decision use this principal.
- **Paired extension** — the extension calls with
  `Authorization: Bearer mp_…` (the pairing token) plus `X-App-Id` /
  `Base44-App-Id` headers, over plain `fetch`. This principal is write-only:
  it can submit captures and refreshes for its paired owner and can read
  nothing.

## Shared response rules

| Case | HTTP | Behavior |
|---|---:|---|
| CORS preflight | 204 | No body |
| Invalid JSON / missing input | 400 | `{"error": "…"}` with a stable message |
| Missing or invalid auth | 401 / 403 | Stable error; no resource details leaked |
| Cross-owner resource | 403 | One unauthorized ID fails the whole request |
| Missing resource | 404 | Stable error; a retry after a successful delete also reads 404 |
| State conflict | 409 | Stable error |
| Expected source failure | 200 | A *typed outcome* such as `blocked` — not an HTTP error |
| Unexpected fault | 500 | Generic message; details only in server logs |

---

## Extension endpoints (pairing token)

### `ingest-clip`

Submit one capture. Runs route-then-extract before responding.

**Request:** `source_url` (required), `raw_text` (required), `capture_mode`
(`element` | `selection` | `page` | `link` | `visual` | `image`), `raw_html`
(element mode only, ≤12,000 chars), `screenshot_data_url` (≤3 MB),
`context_url` (link mode), `mission_id` (optional explicit Project),
`capture_intent`, `idempotency_key`, `captured_at`. Text is bounded to 20,000
characters server-side regardless of what is sent.

**Success `202`:**

```json
{
  "accepted": true,
  "capture_status": "new",
  "clip_id": "…",
  "routing_status": "routed_existing",
  "routing_reason_code": "existing_schema_match"
}
```

`capture_status` is `"duplicate"` when the same `idempotency_key` or an
identical capture (same owner and content hash) already exists — the existing
IDs are returned and nothing new is created. `routing_status` is one of
`routed_existing`, `created_collection`, `needs_review`, `failed`. The
response never contains Collection or Item contents.

**Errors:** invalid URL/text `400`; oversized screenshot `413`; invalid
pairing `403`; unavailable selected Project `409`.

### `extension-context`

Fetch the bounded context the popup needs: the owner's active Projects (id +
title only) and `auto_organize: true`. Returns nothing else — no collections,
items, or captures. Empty body `{}` is a valid request.

### `refresh-capture`

Report fresh page text for a previously captured URL, so an Item can update
from the owner's own browser when server checks are blocked.

**Request:** `source_url` (required, exact URL of a prior capture),
`raw_text` (required, ≤20,000 chars).

**Success `200`:** `{"outcome": "updated", "change_count": 1, "checked_at": "…"}`
— outcome is one of `updated`, `unchanged`, `no_match`, `suspicious`. Real
changes append Update history, restore freshness, and reactivate an
auto-paused watch. A suspicious or empty diff mutates nothing. `no_match`
(no Item for that URL) is a success, not an error.

---

## Dashboard endpoints (signed-in user)

### `create-extension-pairing`

Mint a pairing token for the extension. **`201`** returns the raw `mp_…` token
**once** plus the ingest URL; the server persists only the token's SHA-256
hash, bound to the calling owner.

### `create-mission`

Create a Project. **Request:** `title` (required), `template`
(`custom` | `product` | `apartment` | `job`), `goal`, `criteria`.
**`201`** returns the created Project.

### `classify-clip`

Re-run routing for one of your captures (used to retry a `failed` state).
**Request:** `clip_id`. Idempotent: an already-routed capture returns its
existing result without another AI call. **`200`** mirrors the `ingest-clip`
routing fields plus `duplicate: true` when returning an existing result.

### `resolve-routing`

Resolve a capture waiting in Needs review. **Request:** `clip_id` plus an
`action`:

| Action | Extra fields | Effect |
|---|---|---|
| `accept` | — | Create the Collection Magpie suggested (400 if it had no stored suggestion) and file the Item |
| `redirect` | `collection_id` | File the Item into an existing active Collection you own |
| `create` | `collection_name`, `schema` (1–8 `{name, type}` fields), optional `collection_description`, optional `project_id` | Create your own Collection — validated by the same safety rules as automatic routing — and file the Item |
| `dismiss` | — | Permanently delete the capture and its routing record |

**`200`** returns the outcome and the affected IDs. Filed Items start with
empty fields and `processing_status: "needs_review"` — resolution fixes
*routing*, it never invents field values. Only `needs_review` captures can be
resolved; anything else returns `409`. Retrying an identical resolution is
idempotent (`duplicate: true`); a *different* resolution after success is a
`409`; a dismiss retry returns `404`, which means done.

### `delete-record`

Permanently delete one Item and everything attached to it.
**Request:** `record_id`. **`200`:**

```json
{"deleted": {"watch_rules": 1, "enrichments": 3, "decisions": 1, "clips": 1, "records": 1}}
```

Children are removed first and already-missing rows are skipped, so a
mid-failure retry completes the cascade; a retry after full success returns
`404` (done). This is a real deletion — there is no undo.

### `delete-collection`

Permanently delete one Collection and every Item inside it.
**Request:** `collection_id`. **`200`:**

```json
{"deleted": {"watch_rules": 1, "enrichments": 3, "decisions": 2, "clips": 2, "records": 2, "collections": 1}}
```

Same cascade `delete-record` uses, applied to every Item in the Collection,
then the Collection itself. Children are removed first, already-missing rows
are skipped, and a retry after full success returns `404` (done). This is a
real deletion — there is no undo.

### `delete-mission`

Permanently delete one Project and every Collection (and Item) inside it.
**Request:** `mission_id`. **`200`:**

```json
{"deleted": {"watch_rules": 1, "enrichments": 3, "decisions": 2, "clips": 2, "records": 2, "collections": 2, "missions": 1}}
```

Cascades over every Collection scoped to the Project, then the Project
itself. A `needs_review` capture that only had this Project as a hint (but
never became a Collection/Item) is left alone — only structurally-scoped
Collections and Items are deleted. Same idempotent-retry behavior as
`delete-record`/`delete-collection`: children first, missing rows skipped,
`404` on a retry after success.

### `enrich-record`

Check an Item's source now. **Request:** `record_id`. **`200`** always returns
a typed outcome — `changed`, `unchanged`, `no_extractable_fields`,
`suspicious_data`, `blocked`, `not_found`, `rate_limited`, `unreachable`,
`invalid_content` — plus `checked_at`, `change_count`, `retryable`, and a
user-safe `message`. A failed or suspicious check never mutates fields and
never fabricates history.

### Agent tools

Four functions back the **Ask Magpie** conversation; the dashboard may also
call them directly. Every referenced ID is owner-checked; one unauthorized ID
fails the whole request.

| Function | Purpose | Key input |
|---|---|---|
| `agent-workspace-context` | Bounded summaries of Projects, Collections, Items, routing, updates, and watches | optional `project_id`, `collection_id`, `record_id`, `clip_id`, `limit` (≤25) |
| `agent-compare-items` | Normalized field comparison of 2–12 owned Items | `record_ids[]` (unique) |
| `agent-explain-organization` | One capture's routing outcome, allowlisted reason codes, confidence, and correction state | `clip_id` |
| `agent-configure-monitoring` | Create / update / pause / resume a watch (`201` on create, idempotent `200` after) | `action`, `record_id`, `condition`, `frequency` (`hourly`/`daily`/`weekly`), `watch_rule_id` |

### `sweep-watches` (admin/scheduled)

Runs due watches in an isolated batch: successes reset failure counts,
retryable failures back off exponentially, and a watch that hits three
consecutive `blocked` checks pauses itself with
`last_error_code: "AUTO_PAUSED_BLOCKED"`. Admin-only.

---

## Routing reason codes

`routing_reason_code` values are drawn from a fixed server-side allowlist —
anything else an AI proposes is discarded. The ones you'll commonly see:

| Code | Meaning |
|---|---|
| `existing_schema_match` | Matched an existing Collection's shape |
| `equivalent_collection` | A proposed "new" Collection already existed |
| `no_equivalent_collection` | A genuinely new type; Collection created |
| `mission_scope_match` / `global_scope_match` | Filed under a Project / in the Library |
| `ambiguous_candidates` | More than one plausible destination → review |
| `mixed_content` | The capture mixed multiple types → review |
| `low_confidence` | Below the confidence floor → review |
| `insufficient_supported_fields` | Too few extractable fields → review |
| `unsafe_collection_name` / `invalid_schema` | Unsafe proposal rejected → review |
| `ai_unavailable` / `malformed_ai_response` | AI outage or bad output → review, never a guess |
