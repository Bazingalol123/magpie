# Extension pairing lifecycle — research and design (issue #61)

> Discovery-phase design note. **No revoke, rotate, list, or schema change is
> implemented by this document.** Per issue #61's non-goals, implementation
> is split into small follow-up PRs only after this discovery is approved by
> the owner. This note also serves as the design deliverable for #27 (pairing
> installation management), which this issue supersedes as the concrete
> design vehicle.

## Review round 1 (Hermes, 2026-08-17) — resolved

1. **Atomicity of `replace_installation_id`.** Verified Base44 has no
   cross-entity transaction, batch-across-entities, or rollback primitive
   (`.agents/skills/base44-sdk/references/entities.md`: `bulkCreate`,
   `bulkUpdate`, `updateMany`, `deleteMany` all operate within one entity
   type only; the SDK's one atomicity-adjacent statement — "operations
   succeed or fail... no partial results" — scopes to a single write's
   RLS/FLS evaluation, not to coupling two separate writes). This note no
   longer describes `replace_installation_id` as atomic: it is now two
   sequential, non-atomic service-role writes with explicit failure/retry
   semantics. See §3, §5, §8, §9.
2. **Scope of `revoke-all`.** Resolved the mismatch between issue #27's
   unconditional "Revoke all installations" acceptance criterion and this
   note's earlier "optional bulk action" framing for
   `revoke-all-extension-pairings`. It is now explicit MVP scope, required
   in the first implementation PR, not deferred. See §2, §5.
3. **Rollback/recovery.** The "manual `active: true` production edit" is no
   longer presented as a normal rollback procedure. It is now marked
   `Unknown`/unverified whether that is even a sanctioned operational
   practice independent of this feature, and this design states plainly
   that **no supported recovery mechanism exists** today for an incorrect
   revoke. Minimum requirements for a future break-glass mechanism (owner-only
   authorization, first-party Base44 tooling only, an audit trail, documented
   operational ownership) are listed as requirements for such a thing to be
   buildable later — none of them are implemented or assumed available now.
   See §9.

## 1. Verified current behavior

Each item below is evidence-backed by file/line; labeled `Verified` unless
otherwise noted.

- **Entity shape.** `base44/entities/extension-install.jsonc`: `ExtensionInstall`
  has `owner_id`, `label`, `token_hash`, `active` (default `true`),
  `created_at`, `last_used_at`. RLS: `create` requires `role: admin`
  (i.e. only a service-role backend function can create rows — the Base44
  app owner's account happens to carry `role: admin`, but this is enforced
  server-side, not client-side), `read` is owner-scoped, `update: false`,
  `delete: false`. **Verified.**
- **Token creation.** `base44/functions/create-extension-pairing/entry.ts`
  requires a signed-in owner (`requireUser`), mints a random 32-byte token
  (`createPairingToken`, `base44/shared/auth.ts:45-49`), stores only
  `sha256(token)`, returns the raw token once, and **never deactivates any
  existing pairing**. Repeated pairing therefore accumulates active rows
  indefinitely. **Verified.**
- **Token verification.** `requireExtensionPrincipal` (`base44/shared/auth.ts:24-39`)
  hashes the bearer token, looks up the matching `ExtensionInstall` by
  `token_hash`, and throws `403` if no row matches or `active` is falsy.
  On success it (by default) writes `last_used_at`. **Verified.**
- **Callers.** Exactly three functions call `requireExtensionPrincipal`:
  `ingest-clip` (touches `last_used_at`), `refresh-capture` (touches
  `last_used_at`), `extension-context` (`touchLastUsed = false`, so browsing
  Missions for the picker UI does not count as "used"). All three return only
  routing/outcome metadata — no Clip/Record/Collection/Enrichment contents
  ever cross the extension boundary. **Verified**, matches
  `docs/ENGINEERING_NOTES.md`'s 2026-08-14 G4 read-boundary review.
- **No revoke/list/rotate path exists today.** Grepped every
  `base44/functions/*/entry.ts` and `src/App.jsx`: there is no function that
  updates or lists `ExtensionInstall` for revoke purposes, and no dashboard UI
  control besides the one-time `PairingDialog` shown right after
  `create-extension-pairing` (`src/App.jsx:196-219`, `:1243`). `deriveOverallPairingStatus`
  (`src/onboarding/state.js:32-37`) already reads `install.active` across
  *all* of an owner's pairings to compute onboarding status, so the
  dashboard already fetches the full list (`src/App.jsx:1141`,
  `listAllForDashboard(base44.entities.ExtensionInstall, ...)`) — it just
  doesn't render it as a management UI. **Verified.**
- **Extension-side storage.** `extension/service-worker.js` and
  `extension/sidepanel.js` store only `ingestUrl` and `extensionToken` in
  `chrome.storage.local` (plus `activeMissionId`, `captureIntent`,
  `savedUrls`, `autoRefreshEnabled`). **The pairing's non-secret
  `extension_id` returned by `create-extension-pairing` is never stored
  locally.** There is no local record of *which* `ExtensionInstall` row a
  given browser is bound to beyond the token itself. **Verified** — this is
  a gap the proposed UX below has to account for (see §5).
- **Extension error handling on 403.** `submitCapture` in
  `extension/service-worker.js:128-155` treats every non-`ok` fetch response
  identically: it surfaces `body.error` (e.g. "This pairing token is inactive
  or invalid") as a generic error toast via `notifyTab`. It does **not**
  distinguish `401` (missing token) from `403` (revoked/invalid token), does
  **not** clear `chrome.storage.local`'s stale token, and does **not**
  specifically prompt re-pairing. `refresh-capture`'s auto-refresh path
  (`extension/service-worker.js:186-207`) silently no-ops on any failure
  (no toast at all — see `docs/ENGINEERING_NOTES.md` refresh-memory section).
  **Verified.**
- **Revocation already works end-to-end at the auth layer, just not through
  a product flow.** `docs/BUILD_GUIDE.md:356-364` (checkpoint 29.6, hosted,
  2026-07-25): a real pairing was used in production and then deactivated;
  the mechanism used to deactivate it is not documented (most likely a
  direct entity edit via Base44 admin, since no revoke function exists) —
  but it proves `active: false` is honored by `requireExtensionPrincipal`
  end-to-end in the hosted environment, not just in unit fixtures.
  **Verified** for "the check works"; **Unknown** for "how that specific
  deactivation was performed."
- **Onboarding already models revocation as a UI state.**
  `src/onboarding/state.js`'s `PairingStepStatus.REVOKED` and
  `PairingChecklist.jsx`'s "This browser's connection looks inactive. Pair
  again to reconnect." copy already exist and already read `install.active`.
  This means the *reconnect* half of the UX (what a user sees once a pairing
  is inactive) is partially built; only the *cause* (an owner-initiated
  revoke action) is missing. **Verified.**
- **RLS forces server-mediated writes.** Because `update`/`delete` are
  `false` in the entity's RLS and `create` requires `role: admin`, no
  revoke/rotate/relabel operation can be a direct client SDK call from the
  dashboard — every one of them must be a new owner-authenticated backend
  Function using `base44.asServiceRole.entities.ExtensionInstall.update(...)`,
  the same pattern `delete-record`'s function already uses for a different
  entity (`base44/functions/delete-record/entry.ts`). **Verified.**

## 2. Overlap with #27, #38, #48, #20

- **#27 ("Add pairing installation management, revoke, and re-pair flows")**
  is the same feature at a less-audited stage. Its acceptance criteria — list
  without exposing raw tokens, **revoke one, revoke all**, replacement
  doesn't invalidate unrelated installations unless explicit, distinct
  expired/revoked/never-used states, tests for revoke/re-pair/capture-after-revoke —
  are a subset of #61's. **Resolution: #61 is the design vehicle; #27's
  acceptance criteria are folded into §4–§6 below and #27 should be closed
  or re-pointed at #61's follow-up implementation PRs rather than tracked
  separately**, to avoid two issues owning the same contract.
  **Scope correction (review round 1): an earlier draft of this note
  labeled `revoke-all-extension-pairings` an "optional bulk action," which
  contradicted #27's unconditional "Revoke all installations" requirement.
  Resolved: `revoke-all-extension-pairings` is part of MVP acceptance
  criteria, required in the first implementation PR, not deferred** — see
  §5, §8. Descoping it later would require a deliberate, explicit
  re-scoping of #27 itself, not a silent gap in this design.
- **#38 ("Refresh user-facing documentation...")** explicitly lists
  "Document pairing/reconnection expectations without exposing token
  internals unnecessarily" and "Update troubleshooting for pairing,
  revoked/expired connections" as in-scope. **Resolution: no contradiction.**
  #38 should not write revoke/list UX copy until this design (or its
  implementation) lands — otherwise #38 would be documenting a feature that
  doesn't exist yet, which #38's own scope boundary forbids ("no document
  claims a feature is Production-deployed when it is only locally verified").
  Sequence: this design → implementation PRs → #38 documents the shipped
  behavior.
- **#48 ("Don't-Make-Me-Think audit")** lists "Pairing: explains which
  values are copied... and what 'paired' means" as an audit checklist item,
  and its primary journey doesn't mention multi-device or revoke at all.
  **Resolution: no contradiction, narrower scope.** #48 is about the
  first-pairing UX copy already in `PairingChecklist.jsx`/`PairingDialog`;
  it does not need to wait for this design, but if #48's PR touches
  `PairingChecklist.jsx` around the same time as a #61 follow-up, they will
  conflict on the same file — flag for sequencing at implementation time.
- **#20 ("Add live two-owner verification for the RLS and principal trust
  boundary")** states the release rule: *"No new cross-owner-sensitive
  feature should be considered hosted-verified until this gate passes."*
  Revoke/list/rotate functions are exactly this kind of feature (an
  owner-authenticated function reading/writing `ExtensionInstall` rows keyed
  by `owner_id`). **Resolution: #20's two-owner hosted gate is a hard
  prerequisite for calling any #61 follow-up "hosted-verified," not merely
  parallel work.** The test matrix in §6 includes the specific cross-owner
  cases #20 would need for this entity (owner A cannot list/revoke owner
  B's pairing), which can double as the entity-specific slice of #20's
  broader matrix.

## 3. Product decision: multiple active pairings, explicit revoke

**Decision: an owner may have multiple simultaneously active pairings.
Creating a new pairing never revokes an existing one implicitly.** Evidence
for this over a single-active-pairing model:

- The entity already has a free-text `label` field with no uniqueness
  constraint and a `"Chrome extension"` default — designed for the
  multi-device case (work laptop, home desktop, a second Chrome profile),
  not as a vestigial field.
- The personas in `docs/PRODUCT_CHARTER.md` (apartment hunter, buyer, job
  seeker) plausibly capture from more than one machine during a single
  decision.
- Issue #61 itself lists this as non-goal: *"Do not automatically revoke
  existing keys just because a new key is created."*
- Issue #27's acceptance criteria explicitly requires "A replacement token
  does not invalidate unrelated installations unless the user chooses
  revoke-all," which only makes sense under a multi-pairing model.

This means "rotation" is not a distinct primitive — it is **create-new +
explicit revoke-old**. §5 evaluates bundling those two writes into a single
`create-extension-pairing` call for the common "replace this browser's key"
case, but — since Base44 has no documented cross-entity transaction
primitive (verified in the review-round note above and in §5) — describes
that bundling honestly as a non-atomic, two-step server-side sequence with
defined failure/retry semantics, not an atomic operation.

## 4. Security / threat model

| Scenario | Current behavior | Risk | Mitigation in this design |
|---|---|---|---|
| Token copied off a shared/managed machine | Works indefinitely; no expiry, no owner visibility into which machines hold a copy | Silent write access to the owner's ingest pipeline (capture spam / junk Collections) — cannot read data (extension boundary already prevents that) | List surfaces `label`, `created_at`, `last_used_at` so an owner can spot an unrecognized/stale entry and revoke it |
| Owner loses a device with the token still in `chrome.storage.local` | No revoke path exists at all today | Same as above, indefinitely | New `revoke-extension-pairing` function; revoked tokens are rejected on the very next request (already proven — `requireExtensionPrincipal` checks `active` synchronously on every call, no caching) |
| Owner wants to nuke all installs and start clean (suspected broader compromise, e.g. leaked `BUGS.local.md`-style local file) | No bulk path | Manual per-row revoke is slow and error-prone under time pressure | `revoke-all-extension-pairings` (owner-authenticated, revokes every active row for that owner in one call) |
| Attacker enumerates/guesses `extension_id` | N/A — `extension_id` is a Base44-generated row id, not a capability; the *token* is the credential, and it is 32 random bytes, never guessable | Low | List/revoke functions must still validate the installation belongs to `requireUser(base44).id` before mutating (never trust a client-supplied `owner_id`) |
| Cross-owner revoke (owner A revokes owner B's pairing by guessing/observing an id) | N/A, no function exists yet | Would be a real RLS/trust-boundary bug if the new function forgot the ownership check | Explicit `installation.owner_id === user.id` check before any mutation, mirroring `delete-record`'s pattern; covered by #20's hosted two-owner matrix (§2, §6) |
| Extension keeps calling with a revoked token after revoke | Generic error toast only; local token is never cleared (§1) | User sees repeated confusing failures instead of a clear reconnect prompt | Extension-side change (§5): on `403` specifically, clear the stored token/URL and show the existing `PairingChecklist` "reconnect" copy path |
| Raw token exposure in logs/UI | `create-extension-pairing` returns the raw token once in the response body; `PairingDialog` renders it once and it is never persisted client-side beyond that render; server never logs it (only `token_hash` is stored) | Low, matches existing design intent (`docs/API_AND_FAILURE_MAP.md:89` "raw token is never persisted") | List/revoke functions must never select or return `token_hash` — return only `id`, `label`, `active`, `created_at`, `last_used_at` |
| Rate limiting / abuse of the revoke/list functions themselves | Not evaluated — out of scope per issue #61 non-goals ("Do not add... general Base44 credentials"; expiration/rate-limiting is explicitly listed as a deferrable question, #10 in the issue body) | Low for MVP (owner-authenticated, low call volume) | Deferred; note as a later hardening item, not a blocker |

**Findings label: `Verified`** for everything in the table's "Current
behavior" column (traced to code above); **`Assumed`** for attacker
motivation/likelihood (no incident data exists for this specific entity);
**`Unknown`** whether Base44's platform applies any rate limiting to
Functions independent of anything Magpie adds.

## 5. Proposed API contract

All three new functions follow the existing owner-authenticated pattern
(`requireUser`, `base44.asServiceRole.entities...`, `errorResponse`) used by
`delete-record`. None of them touch the extension trust boundary — they are
signed-in-owner-only, exactly like `delete-record`/`delete-collection`.

### `list-extension-pairings` (new)

- **Caller:** signed-in owner only.
- **Method:** `POST` (matches this codebase's convention of using `POST` for
  functions that are logically reads, e.g. `extension-context`).
- **Request:** no body required.
- **Success `200`:**
  ```json
  { "pairings": [
    { "id": "...", "label": "Work laptop", "active": true,
      "created_at": "...", "last_used_at": "..." }
  ]}
  ```
  `token_hash` is never selected/returned. Sorted `-created_at`, paginated
  the same way `listAllForDashboard` already does client-side, or bounded to
  a fixed page size server-side (open question — see §9).
- **Failure:** `401` unauthenticated.
- **Security invariant:** filters strictly by `owner_id: user.id`; never
  accepts a client-supplied owner.

### `revoke-extension-pairing` (new)

- **Caller:** signed-in owner only.
- **Method:** `POST`.
- **Request:** `{ "installation_id": "..." }`.
- **Behavior:** load the row via `getOrNull`, `404` if missing, `403` (or
  `404` to avoid confirming existence — pick one and match `delete-record`'s
  existing convention, TBD) if `owner_id !== user.id`, else
  `entities.ExtensionInstall.update(id, { active: false })`.
- **Success `200`:** `{ "revoked": true }`. Idempotent: revoking an
  already-inactive row is a no-op success, not an error (matches
  `delete-record`'s `{ deleted: result.deleted }` idempotent-boolean shape).
- **Failure:** `401` unauthenticated; `404` unknown/foreign id;
  `400` malformed `installation_id` (same id-shape regex `delete-record`
  uses: `/^[A-Za-z0-9_-]{1,160}$/`).

### `revoke-all-extension-pairings` (new — **required for MVP**, not optional)

- Same shape as above but no `installation_id`; sets `active: false` on
  every currently-active row owned by the caller. Returns
  `{ "revoked_count": N }`.
- **In MVP scope, per the review-round scope correction above.** Issue #27's
  acceptance criteria requires "Revoke all installations" unconditionally,
  and it directly serves the "suspected broader compromise" scenario in §4.
  The first implementation PR must include this function alongside
  `list-extension-pairings` and `revoke-extension-pairing` — it is not a
  candidate to defer to a later follow-up.

### `create-extension-pairing` (existing — one additive, backward-compatible, **non-atomic** change)

- **Atomicity verified as unavailable (review round 1).** Base44's SDK
  documents no cross-entity transaction, cross-entity batch, or rollback
  primitive: `bulkCreate`/`bulkUpdate`/`updateMany`/`deleteMany`
  (`.agents/skills/base44-sdk/references/entities.md`) all operate within a
  single entity type, and the SDK's "no partial results" guarantee is scoped
  to one write's own RLS/FLS check, not to coupling a create on one row with
  an update on another. **This design does not claim or implement
  atomicity for `replace_installation_id`.**
- Add an **optional** `replace_installation_id` field to the request body,
  implemented as **two sequential, non-atomic service-role writes inside one
  function invocation**:
  1. Create the new `ExtensionInstall` row — existing behavior, unchanged.
  2. Only if step 1 succeeded and `replace_installation_id` was provided:
     verify the named row's `owner_id` matches the caller (identical
     ownership check to `revoke-extension-pairing`), then attempt
     `entities.ExtensionInstall.update(replace_installation_id, { active: false })`.
- **Failure/retry semantics, made explicit because there is no transaction
  to fall back on:**
  - If step 1 fails, nothing happened; the caller gets the normal error
    response and may retry the whole call.
  - If step 1 succeeds but step 2 fails or is skipped (network/service
    error, or `replace_installation_id` belongs to another owner), the
    response must say so rather than claim full success: `201` with
    `{ extension_id, token, ingest_url, replaced: false, replace_error:
    "<reason>" }`. The new pairing is real and usable either way.
  - No custom rollback path is needed for step 2's failure:
    `revoke-extension-pairing` is already idempotent (above), so the caller
    (or the user, from the pairing list UI) simply retries the revoke
    directly against the known `replace_installation_id`.
  - The failure direction is deliberately safe: any partial failure leaves
    **more** pairings active than intended (old and new both), never zero —
    consistent with the "never implicitly revoke" non-goal and with never
    locking an owner out of capture.
- If `replace_installation_id` is absent, behavior is byte-for-byte
  unchanged from today (no implicit revoke) — preserves the non-goal "do not
  automatically revoke existing keys."
- Everything else about the function (raw-token-once, `ingest_url` in the
  response, no persistence of the raw token) is unchanged.

No `rename-extension-pairing` / label-edit endpoint is proposed here — not
required by #61's acceptance criteria or #27's, and adding it would expand
scope beyond "list/revoke/rotate." Flagged as a candidate follow-up, not a
gap in this design.

## 6. Proposed UI/UX

- **Dashboard: a "Connected browsers" panel** (new, likely inside the
  existing account/settings surface or a new `PairingManagementDialog`
  reusing `pairing-dialog` CSS classes already in `src/App.jsx`) listing
  each pairing's `label`, a relative "last used" time (or "never used" —
  distinct from #27's "never-used tokens" requirement), and a `Revoke`
  button per row plus a `Revoke all other pairings` bulk action.
- **Identifying "this browser."** Because the extension currently stores no
  non-secret pairing id locally (§1 gap), the dashboard cannot mark
  "this is the browser you're using right now" in the list purely from
  server state. **Proposed fix, in scope for the follow-up implementation:**
  have the extension also store the `extension_id` from
  `create-extension-pairing`'s response and surface it in
  `extension-context`'s response (currently `{auto_organize, projects,
  missions}` only) so a future "which browser is this" affordance is
  possible without changing the trust boundary — `extension_id` is a
  non-secret row id, not a capability, so returning it does not weaken the
  write-only guarantee. Until built, the list simply cannot self-highlight
  the current browser; label text is the only disambiguator, which is why
  `create-extension-pairing`'s label default should probably become more
  specific than the current flat `"Chrome extension"` (e.g. include OS/browser
  hint) — flagged as a UX nice-to-have, not a blocker.
- **Revoke confirmation.** A revoke is destructive to that browser's ability
  to capture — needs a confirm step, following the existing two-step
  confirm pattern already used for Item deletion
  (`docs/CLAUDE_CODE_HANDOFF.md`: "Item deletion with two-step confirm").
- **Reconnect entry point.** `PairingChecklist.jsx` already has the
  `PairingStepStatus.REVOKED` branch and "Pair again" button (§1) — no new
  onboarding UI needed, just needs the new revoke action to actually be
  reachable from somewhere that produces that state.
- **Extension behavior on `403` specifically (new):** `submitCapture`
  (`extension/service-worker.js`) should special-case `response.status ===
  403` to clear `ingestUrl`/`extensionToken` from `chrome.storage.local` and
  show a distinct "Your pairing was revoked or expired — reconnect in the
  dashboard" toast, instead of today's generic error message. `401`
  (missing token, e.g. never paired) keeps today's "Open the Magpie
  extension and add your paired token first" message — the two cases are
  different user situations and should not share copy.
- **Extension behavior after a user manually changes the stored key**
  (pastes a new token in the side panel form, `extension/sidepanel.js:41-52`):
  already works today — `chrome.storage.local.set` simply overwrites the old
  value; the old server-side row is untouched (per the multi-pairing model,
  this is correct — the old pairing is a separate, still-active row unless
  the user explicitly revokes it from the dashboard).

## 7. Compatibility plan

- **Existing pairings** created before this feature have no schema change
  required — `list`/`revoke` operate on the existing five fields as-is.
- **Old vs. new ingest URL pairings** (the #59/#60 custom-domain migration)
  are unaffected: revocation keys off `active`/`token_hash`, never off
  `ingest_url`, which isn't even stored on the entity (it's derived at
  pairing-creation time and handed to the extension once, per
  `base44/shared/auth.ts:57-61`). A pairing created against the old domain
  and a pairing created against the new domain revoke identically.
- **No migration script needed.** Every row already has `active: true` by
  the entity's schema default; there is nothing to backfill.

## 8. Test matrix (for the follow-up implementation PRs, not this note)

- Unit (pure, Deno):
  - `list-extension-pairings` never includes `token_hash` in its response shape.
  - `revoke-extension-pairing` sets `active: false`, is idempotent on an
    already-revoked row, rejects malformed ids (`400`), rejects unknown ids (`404`).
  - `revoke-all-extension-pairings` only touches rows for the caller's `owner_id`.
  - `create-extension-pairing` with `replace_installation_id` revokes exactly
    that row and no others; without it, behavior is unchanged (regression
    guard against the existing `tests/extension-pairing.test.ts` assertions).
  - `create-extension-pairing` with `replace_installation_id` pointing at
    another owner's installation creates the new pairing but does **not**
    revoke the foreign row, and reports `replaced: false` — the step-2
    ownership check must behave identically to `revoke-extension-pairing`'s
    own check.
  - Simulated step-2 failure (mock the service-role update rejecting) still
    returns `201` with the newly created pairing intact and usable, and
    `replaced: false` — the function must never discard or roll back the
    already-created row because the optional revoke sub-step failed.
- Cross-owner (doubles as #20's entity-specific slice):
  - Owner A cannot list owner B's pairings.
  - Owner A's `revoke-extension-pairing` on owner B's `installation_id`
    returns `404` (not found from A's perspective) and does not mutate B's row.
  - Owner A's `revoke-all` never touches owner B's active rows.
- Revoke-then-capture:
  - A revoked pairing's token gets `403` on `ingest-clip`, `refresh-capture`,
    and `extension-context` (all three callers of `requireExtensionPrincipal`).
  - A revoked pairing does not update `last_used_at` on the rejected attempt.
- Re-pair flow:
  - Creating a new pairing while an old one is still active leaves both
    active (no implicit revoke) unless `replace_installation_id` was passed.
  - Extension-side: after a `403`, local storage is cleared and the next
    capture attempt shows the "not paired" state, not a stale error loop.
- Live/hosted smoke (per `docs/API_AND_FAILURE_MAP.md`'s existing pattern,
  same shape as the 2026-07-25 refresh-capture checkpoint in §1): create a
  real pairing, capture successfully, revoke it via the new function,
  capture again and confirm `403`, confirm another owner's pairings are
  unaffected. Cascade-delete/clean up synthetic data afterward, per #20's
  "no accumulating data" requirement.

## 9. Rollback plan

- All three new functions are additive; none change `ExtensionInstall`'s
  schema or any existing function's request/response shape (the
  `replace_installation_id` field on `create-extension-pairing` is optional
  and ignored by old clients).
- Rollback is: stop calling the new functions from the dashboard (revert the
  UI change) and/or redeploy without them via `npx base44 functions deploy`
  targeting only the previous function set. No entity rollback needed since
  no entity fields are added or removed.
- **Recovery from an incorrect revoke is currently unsupported, and must not
  be presented as a normal rollback procedure (review round 1 correction).**
  If a bug in `revoke-extension-pairing` (or a user's own mistaken click)
  deactivates the wrong row, this design proposes no product-level "undo" —
  consistent with this repo's existing recorded omission of undo for
  deletions/resolutions (`docs/DECISIONS.md`).
  - The only theoretical recovery path is a direct production entity edit
    (`active: true`) performed outside this repo's Functions — e.g. through
    Base44's own admin console or CLI with service-role/admin credentials.
    **This is `Unknown`/unverified as a documented, owner-approved, or
    audited operational procedure.** §1 notes that the 2026-07-25
    smoke-test pairing was deactivated by an unspecified mechanism; that is
    the closest precedent in this repo's history, and that mechanism was
    itself never documented or verified as a sanctioned operation. It must
    not be cited as evidence that a safe rollback path exists today.
  - **This design does not request, assume, or implement a break-glass
    recovery mechanism.** If the owner later wants one, it is a distinct
    decision outside issue #61's scope. Before it could be called
    "supported," it would need at minimum: (1) **owner-only authorization**
    — never performed by an automated agent or unattended script;
    (2) execution only through **Base44's own first-party tooling**
    (admin console/CLI), never a bespoke repo script that calls
    `asServiceRole` outside a reviewed, deployed Function; (3) an **audit
    trail** — `Unknown` whether Base44's admin console/CLI logs manual
    entity edits at all, not verified in this pass; (4) explicit
    **operational ownership** (who is authorized to perform it, and under
    what circumstances) recorded in documentation, not tribal knowledge.
  - Until such a mechanism is explicitly designed and approved, the correct
    statement is: **an incorrect revoke has no supported recovery today.**
    The affected owner must create a new pairing (re-pair) rather than
    expect the old one restored.

## 10. Documentation impact map (for follow-up PRs)

- `docs/API_AND_FAILURE_MAP.md`: add `list-extension-pairings`,
  `revoke-extension-pairing`, `revoke-all-extension-pairings` entries in the
  same format as the existing `create-extension-pairing` entry (line 84
  onward); add the `replace_installation_id` field to that existing entry.
- `docs/CLAUDE_CODE_HANDOFF.md`: add a "Deployed state" bullet once shipped;
  do not write it preemptively.
- `docs/DECISIONS.md`: record the "multiple active pairings, explicit revoke
  only" product decision (§3) as a dated entry once implementation lands,
  same pattern as the existing refresh-memory decision.
- `docs/BUILD_GUIDE.md`: new checkpoint documenting files/tests/verify
  commands, per this repo's standard checkpoint format.
- `docs/GETTING_STARTED.md` / `docs/PRODUCT_GUIDE.md` (owned by issue #38,
  not this issue): update only after implementation ships, per #38's own
  "no document claims a feature is Production-deployed when it is only
  locally verified" rule.
- Issue #27: recommend closing as superseded by #61's implementation
  follow-ups, or re-scoping to explicitly point at them, to avoid duplicate
  tracking (§2).

## 11. Open questions (unresolved, flagged `Unknown` — owner input needed before implementation)

1. `revoke-extension-pairing` on a foreign/unknown id: `404` for both cases
   (hides existence, matches typical API-security practice) or `403` for
   "exists but not yours"? `delete-record`'s current pattern should be
   checked/followed for consistency — not confirmed in this pass.
2. Should `list-extension-pairings` be paginated server-side, or is a flat
   list acceptable given realistic pairing counts are small (a handful of
   browsers per owner, not hundreds)? Leaning flat list for MVP; flagged for
   owner sign-off rather than decided unilaterally here.
3. Whether to also store/return `extension_id` client-side now (§6's "this
   browser" affordance) as part of the same implementation pass, or as a
   separate follow-up — affects how many files the first PR touches.
4. Expiration/idle-timeout for unused pairings (#61 question 9): explicitly
   deferred by this design; no proposal made.

## Acceptance-criteria checklist (issue #61)

- [x] Complete repository and documentation audit attached (§1).
- [x] Existing behavior and unknowns explicitly documented (§1, §11).
- [x] Overlap/contradictions with #27, #38, #48, #20 resolved or linked (§2).
- [x] Product decision recorded for multiple pairings and create-new
      behavior (§3).
- [x] Security-reviewed API and UX proposal (§4, §5, §6).
- [x] Documentation update list, current vs. planned (§10).
- [x] Test and live-verification plan, including old-token-rejected /
      other-owner-unaffected (§8).
- [ ] Implementation split into small follow-up PRs — **not started**, per
      this issue's explicit non-goal; owner approval of this design is the
      prerequisite next step.
