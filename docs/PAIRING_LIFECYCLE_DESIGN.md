# Extension pairing lifecycle — research and design (issue #61)

> Began as the discovery deliverable for issues #61 and #27. The owner approved
> the design on 2026-08-24 and the list/revoke/reconnect lifecycle is now
> implemented, locally verified, and deployed from branch
> `codex/issue-61-pairing-lifecycle` on 2026-08-24. Sections that
> describe “current behavior” at discovery time are retained as the audit
> baseline, with implementation outcomes called out below.

## Owner approval and redesign reconciliation (2026-08-24)

The owner approved implementation after the dashboard redesign landed. The
following decisions resolve §11 and supersede older wording in this note where
the redesign changed current behavior:

- Magpie supports multiple active browser pairings. Creating a pairing never
  revokes another pairing implicitly.
- "Replace" remains two explicit actions: create and confirm the new pairing,
  then revoke the old pairing. `create-extension-pairing` remains unchanged.
- Missing and foreign `installation_id` values both return `404`, so the API
  never confirms another owner's pairing exists.
- `list-extension-pairings` is a flat, newest-first, bounded list of at most
  100 rows for MVP. It returns only `id`, `label`, `active`, `created_at`,
  `paired_at`, and `last_used_at`; it never returns `token_hash`.
- `revoke-all-extension-pairings` means every active browser pairing owned by
  the caller. The UI must call it "Revoke every browser" and disclose that
  every Extension will need to reconnect.
- Expiration, idle timeout, label editing, and revoke undo remain deferred.
  An accidental revoke is recovered by creating a new pairing, never by
  restoring or recovering the old raw token.
- The Extension clears only the credential pair (`extensionToken` and the
  non-secret row identifier `extensionId`) after a pairing-auth `403`. It
  preserves `ingestUrl` and `savedUrls` so the owner can still open the
  Dashboard and harmless refresh-on-revisit memory is not destroyed.

The merged redesign added optional `ExtensionInstall.paired_at` and makes the
first authenticated `extension-context` request stamp it. Existing pairings
need no migration: `last_used_at` remains proof of a successful legacy use,
and the next successful context request adds `paired_at`. Pairing-management
status is therefore:

- active with neither timestamp: **Awaiting setup**;
- active with `paired_at` but no `last_used_at`: **Connected, no captures yet**;
- active with `last_used_at`: **Active**;
- `active: false`: **Revoked**.

The redesign also removed the old `OnboardingPanel` render path. The source
files for `ReconnectNotice`/`PairingChecklist` still exist, but they are not a
reachable reconnect surface in the redesigned app. Implementation must add a
real Connected browsers/account surface and a visible reconnect notice when a
returning owner's pairing history exists but no active pairing remains.

## Implementation and deployment outcome (2026-08-24)

- Added owner-authenticated `list-extension-pairings`,
  `revoke-extension-pairing`, and `revoke-all-extension-pairings` Functions.
  List output is explicitly sanitized; unknown and foreign IDs share one
  `404`; individual revoke is idempotent.
- Added the dashboard **Connected browsers** dialog, four distinct lifecycle
  statuses, two-step confirmations for one/all revokes, and a desktop/mobile
  reconnect notice when every historical pairing is inactive.
- `extension-context` now returns the authenticated non-secret
  `extension_id`; the Side Panel stores it. Capture, refresh-on-revisit, and
  context loading special-case a pairing-auth `403`, remove the stale token
  and ID, preserve `ingestUrl`/`savedUrls`, and show actionable reconnect copy.
- No token migration or entity backfill exists or is needed. Legacy rows use
  `last_used_at`; the next successful context request adds `paired_at` and
  teaches the Extension its ID.
- Local Base44 verification found that `ExtensionInstall.updateMany` is not
  supported by the local runtime: the request is forwarded toward production
  and returned `{ updated: 0 }` without changing local matches. Revoke-all
  therefore pages owner-scoped rows and uses the same proven service-role
  single-row update as revoke-one. Two active local pairings were revoked and
  a follow-up list returned zero active rows.
- Focused Deno contracts, backend type checks, Extension syntax checks, the
  Vite production build, and authenticated desktop/390×844 browser checks
  pass. A local two-owner check confirmed A cannot list B's pairing, A gets
  `404` trying to revoke B's ID, and A's revoke-all leaves B active. Hosted
  two-owner isolation remains gated by issue #20.
- After explicit owner approval, all ten entity schemas were synced, the four
  changed pairing Functions and the three redesign Functions required by the
  site were deployed, and Base44 reported all 24 Functions present remotely.
  Both hosted domains returned `200`; anonymous calls to the seven deployed
  endpoints returned the intended `401` boundary. This proves reachability
  and code presence, not the still-open signed-in hosted lifecycle or
  two-owner isolation checks.

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
   semantics. See §3, §5, §8, §9. **Superseded by review round 2 below** —
   the create half of that sequence turned out to have its own unsolved
   retry problem, so `replace_installation_id` is now deferred entirely
   rather than shipped with "just" revoke-side failure semantics.
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

## Review round 2 (Hermes, 2026-08-17) — resolved

Round 1 correctly forced this note to describe `replace_installation_id`'s
create-then-revoke sequence as non-atomic with defined failure semantics for
the revoke half. Round 2 found that was incomplete: **the create half has
its own unsolved retry problem**, and this design cannot fix it without
weakening the "raw token is never persisted" security invariant
(`docs/API_AND_FAILURE_MAP.md:89`, §1). If a `create-extension-pairing`
response is lost after the write commits, the client cannot tell whether a
pairing was created; retrying mints a second active row, and the first
row's raw token — never stored anywhere, only its hash — is unrecoverable.
A client-supplied idempotency key (the pattern this codebase already uses
for `ingest-clip`) does not fix this the way it fixes `ingest-clip`,
because `ingest-clip`'s retry can safely re-return already-stored data,
while `create-extension-pairing`'s retry cannot re-return a secret that was
deliberately never stored.

**Resolution: took the review's option (a).** `replace_installation_id` is
deferred out of MVP entirely; `create-extension-pairing` is unmodified by
this issue. "Replacing a browser's pairing" in MVP is two separately
confirmed UI-level actions (create, confirm, *then* revoke the old one) built
entirely from the already-safe `create-extension-pairing` (unchanged) and
`revoke-extension-pairing` (idempotent) primitives — no new backend surface
that could itself have an ambiguous-retry failure mode. See §3, §5, §6, §8,
§9, §10. The pre-existing ambiguous-retry gap in plain
`create-extension-pairing` (independent of this issue, already shipped
today) is recorded as open question §11.5 rather than solved here.

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
explicit revoke-old**, and in MVP it stays that way as two separately
confirmed actions rather than one bundled call. §5 evaluated bundling those
two writes into a single `create-extension-pairing` call for the common
"replace this browser's key" case; since Base44 has no documented
cross-entity transaction primitive (review round 1) *and* the create half
has its own unsolved ambiguous-retry problem given the "raw token is never
persisted" invariant (review round 2), §5 defers that bundling entirely
rather than ship a convenience call whose own failure mode it cannot fully
specify.

## 4. Security / threat model

| Scenario | Behavior at discovery | Risk | Implemented mitigation |
|---|---|---|---|
| Token copied off a shared/managed machine | Works indefinitely; no expiry, no owner visibility into which machines hold a copy | Silent write access to the owner's ingest pipeline (capture spam / junk Collections) — cannot read data (extension boundary already prevents that) | List surfaces `label`, `created_at`, `last_used_at` so an owner can spot an unrecognized/stale entry and revoke it |
| Owner loses a device with the token still in `chrome.storage.local` | No revoke path exists at all today | Same as above, indefinitely | New `revoke-extension-pairing` function; revoked tokens are rejected on the very next request (already proven — `requireExtensionPrincipal` checks `active` synchronously on every call, no caching) |
| Owner wants to nuke all installs and start clean (suspected broader compromise, e.g. leaked `BUGS.local.md`-style local file) | No bulk path | Manual per-row revoke is slow and error-prone under time pressure | `revoke-all-extension-pairings` (owner-authenticated, revokes every active row for that owner in one call) |
| Attacker enumerates/guesses `extension_id` | N/A — `extension_id` is a Base44-generated row id, not a capability; the *token* is the credential, and it is 32 random bytes, never guessable | Low | List/revoke functions must still validate the installation belongs to `requireUser(base44).id` before mutating (never trust a client-supplied `owner_id`) |
| Cross-owner revoke (owner A revokes owner B's pairing by guessing/observing an id) | N/A, no function exists yet | Would be a real RLS/trust-boundary bug if the new function forgot the ownership check | Explicit `installation.owner_id === user.id` check before any mutation, mirroring `delete-record`'s pattern; covered by #20's hosted two-owner matrix (§2, §6) |
| Extension keeps calling with a revoked token after revoke | Generic error toast only; local token is never cleared (§1) | User sees repeated confusing failures instead of a clear reconnect prompt | On `403` specifically, clear `extensionToken`/`extensionId`, preserve `ingestUrl`/`savedUrls`, and show the reachable dashboard/Side Panel reconnect path |
| Raw token exposure in logs/UI | `create-extension-pairing` returns the raw token once in the response body; `PairingDialog` renders it once and it is never persisted client-side beyond that render; server never logs it (only `token_hash` is stored) | Low, matches existing design intent (`docs/API_AND_FAILURE_MAP.md:89` "raw token is never persisted") | List/revoke functions must never select or return `token_hash` — return only `id`, `label`, `active`, `created_at`, `last_used_at` |
| Rate limiting / abuse of the revoke/list functions themselves | Not evaluated — out of scope per issue #61 non-goals ("Do not add... general Base44 credentials"; expiration/rate-limiting is explicitly listed as a deferrable question, #10 in the issue body) | Low for MVP (owner-authenticated, low call volume) | Deferred; note as a later hardening item, not a blocker |

**Findings label: `Verified`** for everything in the table's "Current
behavior" column (traced to code above); **`Assumed`** for attacker
motivation/likelihood (no incident data exists for this specific entity);
**`Unknown`** whether Base44's platform applies any rate limiting to
Functions independent of anything Magpie adds.

## 5. API contract (deployed 2026-08-24)

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
- **Behavior:** load the row via `getOrNull`; return the same `404` if missing
  or owned by somebody else, else
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

### `create-extension-pairing` (existing — **no change in MVP**; `replace_installation_id` deferred, review round 2)

- **`replace_installation_id` is deferred out of MVP entirely** (review
  round 2 finding — see the review-round note at the top of this doc).
  Round 1 had already established the create-then-revoke sequence is
  non-atomic (above) and defined failure/retry semantics for *step 2*
  (the revoke half). Round 2 found that *step 1* (the create half) has an
  unsolved retry problem of its own, and one this design cannot safely
  solve without weakening an existing security invariant:
  - `create-extension-pairing` mints a raw token and returns it exactly
    once; only `sha256(token)` is ever persisted
    (`docs/API_AND_FAILURE_MAP.md:89`, "raw token is never persisted" —
    §1). If a client calls `create-extension-pairing` (with or without
    `replace_installation_id`) and the response is lost to a timeout or
    network failure after the server-side create already committed, the
    client cannot tell whether a pairing was created, and **cannot safely
    retry**: retrying creates a second active row, and the first row's raw
    token is gone forever (never shown, never stored) — an orphaned,
    unusable, but still-active credential.
  - A client-supplied idempotency key (the pattern this codebase already
    uses for `ingest-clip`'s `idempotency_key`, `base44/shared/clip.ts:21`)
    does not fix this here the way it fixes `ingest-clip`: `ingest-clip`'s
    retried call can safely re-return the *same already-stored* Clip data.
    `create-extension-pairing`'s retried call cannot re-return the *same
    already-issued* raw token, because the invariant above means the token
    was never stored anywhere to re-return. Any mechanism that "safely
    reconciles the prior result" would have to either persist the raw
    token somewhere (weakens the invariant this design must not touch) or
    mint and return a *different* new token on retry while discarding the
    orphaned first row (which reintroduces exactly the duplicate-row
    problem the idempotency key was meant to prevent).
  - This ambiguous-retry gap is **pre-existing in `create-extension-pairing`
    today, independent of this design** — it is not introduced by
    `replace_installation_id`. What `replace_installation_id` would have
    done is couple that pre-existing ambiguity to a second write (revoking
    the old pairing), which raises the stakes of an ambiguous retry from
    "one orphaned extra row" to "possible confusion about which of two
    pairings survived." Deferring it removes that added risk from MVP
    without pretending to have solved the underlying, harder problem.
  - **Resolution (per the review's option (a)):** MVP ships `create-extension-pairing`
    completely unchanged — no `replace_installation_id` field, no request/response
    shape change. "Replacing a browser's pairing" in MVP is two separately
    confirmed, already-safe actions composed at the UI layer: call the
    existing `create-extension-pairing` to get a new token, then — once the
    user has confirmed the new pairing is saved — call the new
    `revoke-extension-pairing` (§ above) against the old `installation_id`.
    `revoke-extension-pairing` is idempotent and safe to retry on its own
    (already established above); the risk this section is deferring is
    specific to retrying a **token-issuing create**, not to revoke.
  - The pre-existing ambiguous-retry gap in plain `create-extension-pairing`
    (i.e., today's shipped behavior, with or without this issue) is flagged
    as a candidate future hardening item in §11, out of scope for this
    design to solve.
- Everything about the function's current behavior (raw-token-once,
  `ingest_url` in the response, no persistence of the raw token) is
  unchanged by this issue.

No `rename-extension-pairing` / label-edit endpoint is proposed here — not
required by #61's acceptance criteria or #27's, and adding it would expand
scope beyond "list/revoke/rotate." Flagged as a candidate follow-up, not a
gap in this design.

## 6. UI/UX contract (site deployed 2026-08-24)

- **Dashboard: a "Connected browsers" panel** in the existing account rail,
  implemented as `PairingManagementDialog` and reusing the pairing-dialog
  visual language. It lists
  each pairing's `label`, a relative "last used" time (or "never used" —
  distinct from #27's "never-used tokens" requirement), and a `Revoke`
  button per row plus a **Revoke every browser** bulk action.
- **Identifying "this browser."** At discovery, the Extension stored no
  non-secret pairing ID. The implemented fix adds `extension_id` to the
  authenticated `extension-context` response and stores it in the Side Panel
  after a successful load. The dashboard still cannot read another Chrome
  process's local storage and therefore does not self-highlight a row; label
  text remains the disambiguator there. The browser itself now knows its row
  for future Extension-side affordances. `extension_id` is not a capability,
  so this does not weaken the write-only guarantee. A more specific automatic
  label remains a UX nice-to-have, not a blocker.
- **Revoke confirmation.** A revoke is destructive to that browser's ability
  to capture — needs a confirm step, following the existing two-step
  confirm pattern already used for Item deletion
  (`docs/CLAUDE_CODE_HANDOFF.md`: "Item deletion with two-step confirm").
- **Reconnect entry point.** The redesigned App now renders a reachable
  warning when pairing history exists but no active row remains. The account
  action becomes **Reconnect browser**, and the warning offers both
  **View browsers** and **Reconnect** (the secondary action is collapsed on
  narrow screens).
- **"Replace this browser's pairing" remains two explicit actions, not one
  bundled call (review round 2).** **Pair another browser** creates and shows
  the new one-time token; the dialog closes when server handshake evidence
  arrives (or the owner can finish later). The old pairing stays active. The
  owner then reopens **Connected browsers** and separately confirms revoke on
  the old row. An interrupted flow therefore fails toward "both pairings are
  active" rather than disconnecting the old browser before the new one has
  connected.
- **Extension behavior on `403` specifically:** `submitCapture`, automatic
  refresh, and Side Panel context loading special-case `response.status ===
  403` to clear `extensionToken`/`extensionId` from `chrome.storage.local`,
  preserve `ingestUrl`/`savedUrls`, and show a distinct "This browser was
  disconnected. Open the Magpie dashboard to reconnect." message. `401`
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

## 8. Test matrix and current evidence

- Unit (pure, Deno):
  - `list-extension-pairings` never includes `token_hash` in its response shape.
  - `revoke-extension-pairing` sets `active: false`, is idempotent on an
    already-revoked row, rejects malformed ids (`400`), rejects unknown ids (`404`).
  - `revoke-all-extension-pairings` only touches rows for the caller's `owner_id`.
  - `create-extension-pairing` is unchanged by this issue in MVP (review
    round 2 deferred `replace_installation_id` — §5): the existing
    `tests/extension-pairing.test.ts` assertions continue to pass unmodified,
    and no new request/response fields are added to this function.
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
  - Creating a new pairing while an old one is still active always leaves
    both active — MVP has no bundled create+revoke call (§5), so this is
    simply `create-extension-pairing`'s existing, unchanged behavior.
  - The UI-composed two-step "replace" flow (§6): creating a new pairing
    and then separately revoking the old one via `revoke-extension-pairing`
    produces the same end state as two independent, already-tested actions
    — no new backend test surface, since no backend code couples them.
  - Extension-side: after a `403`, stale pairing credentials are cleared and the next
    capture attempt shows the "not paired" state, not a stale error loop.
- Live/hosted smoke (per `docs/API_AND_FAILURE_MAP.md`'s existing pattern,
  same shape as the 2026-07-25 refresh-capture checkpoint in §1): create a
  real pairing, capture successfully, revoke it via the new function,
  capture again and confirm `403`, confirm another owner's pairings are
  unaffected. Cascade-delete/clean up synthetic data afterward, per #20's
  "no accumulating data" requirement.

## 9. Rollback plan

- All three new functions (`list-extension-pairings`,
  `revoke-extension-pairing`, `revoke-all-extension-pairings`) are additive;
  none change `ExtensionInstall`'s schema. `create-extension-pairing` itself
  is unmodified in MVP (§5 defers `replace_installation_id`), so there is no
  existing-function request/response shape to roll back at all.
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

## 10. Documentation impact map

- `docs/API_AND_FAILURE_MAP.md`: add `list-extension-pairings`,
  `revoke-extension-pairing`, `revoke-all-extension-pairings` entries in the
  same format as the existing `create-extension-pairing` entry (line 84
  onward). Do **not** add a `replace_installation_id` field to that existing
  entry — it is deferred out of MVP (§5, review round 2).
- `docs/CLAUDE_CODE_HANDOFF.md`: add a "Deployed state" bullet once shipped;
  do not write it preemptively.
- `docs/DECISIONS.md`: record the "multiple active pairings, explicit revoke
  only" product decision (§3) as a dated entry once implementation lands,
  same pattern as the existing refresh-memory decision.
- `docs/BUILD_GUIDE.md`: new checkpoint documenting files/tests/verify
  commands, per this repo's standard checkpoint format.
- `docs/GETTING_STARTED.md` / `docs/PRODUCT_GUIDE.md` describe the new
  lifecycle. `README.md` and this note distinguish deployed code and live
  anonymous reachability from the still-unverified signed-in hosted journey.
- Issue #27: recommend closing as superseded by #61's implementation
  follow-ups, or re-scoping to explicitly point at them, to avoid duplicate
  tracking (§2).

## 11. Resolved and deferred questions

1. **Resolved:** `revoke-extension-pairing` returns `404` for both foreign and
   unknown IDs, hiding existence.
2. **Resolved:** listing is a flat, newest-first page capped at 100 rows.
3. **Resolved:** `extension-context` returns `extension_id` and the Side Panel
   stores it; no raw token or token hash is added to any read response.
4. **Deferred:** expiration/idle-timeout for unused pairings (#61 question 9): explicitly
   deferred by this design; no proposal made.
5. **Pre-existing ambiguous-retry gap in plain `create-extension-pairing`**
   (surfaced by review round 2, §5): if a `create-extension-pairing`
   response is lost after the server-side write commits, the client cannot
   safely retry (duplicate active row) or recover the lost raw token (never
   persisted, by design). This already exists in the shipped function today
   and is not caused or worsened by anything in this design — flagged here
   as a candidate future hardening item (e.g., a "creation in progress"
   client-side guard, or accepting the orphaned-row cost as a documented,
   deliberate tradeoff) rather than solved in this pass.

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
- [x] Owner approved implementation; the backend, dashboard, Extension
      recovery, tests, and documentation are implemented on
      `codex/issue-61-pairing-lifecycle`.
- [x] Entity, Function, and site deployment plus anonymous production smoke.
- [ ] Signed-in hosted lifecycle and hosted two-owner verification; issue #20
      remains the gate.
