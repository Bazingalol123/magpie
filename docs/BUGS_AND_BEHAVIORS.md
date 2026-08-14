# Magpie — Bugs and Behavioral Contract

## Purpose

This document is an agent-facing triage and behavior reference for Magpie.
Use it before changing code, backend functions, entities, the extension, or the
Dashboard.

It is intentionally written in English so it can be handed to coding agents
running on another machine.

This is not a list of guesses. Each item is classified as one of:

- **Fixed and verified** — the fix is in `main` and has automated or live evidence.
- **Expected behavior** — a deliberate product or security invariant; do not "fix" it.
- **Known gap** — a real limitation that still needs a scoped change.
- **Open verification gate** — source exists, but the required browser/hosted proof is incomplete.

## Source-of-truth order

When documents disagree, use this order:

1. `docs/PRODUCT_CHARTER.md`
2. `docs/API_AND_FAILURE_MAP.md`
3. `docs/API.md`
4. this file
5. `docs/BUILD_GUIDE.md` and `docs/ENGINEERING_NOTES.md`
6. historical handoffs or old planning notes

Do not treat an old handoff note as proof that a branch is still unmerged.
Always check `git log`, the current branch, and live CI/PR state.

---

# 1. Fixed bugs and completed behavior changes

## B1 — Raw capture text was shown instead of a useful summary

**Status:** Fixed and merged to `main`.

**Symptom:** The side panel and review panel rendered unbounded `Clip.raw_text`,
which made the product look like a raw clipboard rather than a structured
research tool.

**Fix:**

- The existing routing-agent proposal now also requests a short plain-language
  `summary`.
- `Clip.summary` is persisted when available.
- `CapturedContext` shows the summary first.
- Full captured text remains available behind an explicit toggle.
- Summary persistence is isolated so a summary failure cannot turn a valid
  capture into a false routing failure.
- The routing tool uses strict schema enforcement so `summary` is not silently
  omitted by the model.

**Invariant:** Do not add a second AI call merely to summarize a capture unless
there is a separately approved product reason. Prefer the existing bounded
routing proposal.

**Verification:** See the B1 commits in merged PR #5, the classification code,
and the frontend `CapturedContext` implementation.

## B4 — Element capture saved the list-page URL

**Status:** Fixed and merged to `main`.

**Symptom:** Selecting a card on a list page saved `window.location.href`,
which pointed to the list page instead of the selected item's detail URL.

**Fix:** Element capture resolves the nearest valid `a[href]` from the selected
element, checking ancestors and descendants, and falls back to the current page
URL when no valid link exists.

**Important edge case:** Passing a literal `undefined` into URL normalization can
produce a bogus `/undefined` URL. The no-anchor path must guard the anchor before
calling the URL helper.

**Expected behavior:**

- A selected card with a detail link stores the detail URL.
- A selected text fragment with no link stores the current page URL.
- Other capture modes must not inherit element-mode URL semantics accidentally.

## B8 — Duplicate detection missed tracking/query-string variants

**Status:** Fixed and merged to `main`; hosted entity/function deployment was
performed with owner approval.

**Symptom:** The same listing captured once with a clean URL and again with
`utm_*`, `gclid`, `fbclid`, or reordered query parameters could create duplicate
Clips/Records.

**Fix:** `canonicalizeUrl()`:

- removes known tracking parameters;
- sorts remaining query parameters;
- removes a trailing slash where safe;
- preserves the URL fragment because some client-side sites use it as item
  identity.

Ingestion hashes the canonical URL and stores `Clip.canonical_url`. Refresh
lookup uses the canonical URL first and falls back to exact `source_url` for
legacy rows.

**Deliberate limitation:** Existing duplicates are not merged retroactively.
Do not add automatic merging without an explicit data-reconciliation design.

## B2 — Picker highlight could be baked into screenshots

**Status:** Fixed and merged to `main`.

**Symptom:** The picker highlight was removed from the DOM, but the browser could
capture a frame before repainting, leaving the green highlight in the screenshot.

**Fix:** After removing the picker overlay, `captureElement()` waits for two
`requestAnimationFrame` cycles plus a short delay before asking the service worker
to capture the tab.

**Invariant:** Any new screenshot path that removes a visual overlay must wait
for repaint before calling `captureVisibleTab`.

## B5 / Issue #11 — Card images were cropped or distorted

**Status:** Rendering fix merged to `main`. GitHub issue #11 may still be open
as an issue-tracking artifact and should not be treated as proof that the fix is
absent.

**Symptom:** Portrait or non-4:3 images were cropped with `object-fit: cover`.
The card media box could also ignore its intended 4:3 ratio because it was a
flex item with the default content-based minimum height.

**Fix:**

- `.record-card-media img` uses `object-fit: contain`.
- `.record-card-media` uses `min-height: 0` so `aspect-ratio: 4 / 3` is enforced.
- The complete image remains visible with letterboxing rather than unexpected
  cropping.

**Expected behavior:**

- Portrait images remain fully visible.
- Wide images remain fully visible.
- Cards keep a stable media tile size.
- A missing image uses the existing fallback rather than breaking layout.

**Open verification gate:** A real browser spot-check against a live Collection
with portrait and wide images should still be repeated when the browser test
harness is available.

## B7 — Collection panels grew without bound

**Status:** UI rendering fix merged to `main`.

**Symptom:** Every Record in a Collection was rendered at once, making the panel
grow indefinitely.

**Fix:** Client-side pagination was added:

- table mode: 30 Items per page;
- card mode: 8 Items per page;
- page resets on Collection change;
- page is clamped when records disappear;
- card/table mode is decided from the full loaded set.

**Important limitation:** This is not server-side pagination. The Dashboard
still has a per-entity fetch cap of 200 in the current loading path. See the
known gaps section.

## Docs deep-link anchor navigation

**Status:** A follow-up fix is in open PR #12, not yet part of `main` at the time
this document was written.

**Symptom:** A direct URL such as
`?docs=product-guide#trust-model` could select the correct document but fail to
scroll to the heading because React rendered the Markdown after the browser's
initial fragment navigation.

**Proposed fix in PR #12:** Parse the document slug and hash explicitly, then
scroll after the selected Markdown has rendered. Do not duplicate or close this
work without checking the current PR state.

---

# 2. Expected product and security behaviors

## Extension trust boundary

The MV3 extension is an untrusted, write-only capture client.

```text
Extension
  → plain fetch
  → pairing-authenticated backend function
  → server-side owner validation
  → service-role entity writes
```

The extension:

- may submit bounded Captures;
- may submit owner-browser refresh evidence for previously captured URLs;
- stores its opaque pairing token in `chrome.storage.local`;
- must not import `@base44/sdk`;
- must not read Collections, Records, Clips, Enrichments, or owner history;
- must not receive raw routing proposals, Collection contents, or pairing secrets.

The Dashboard is a different principal:

- it uses authenticated browser SDK access and realtime subscriptions;
- it may read and mutate only the signed-in owner's data;
- it must never cross the owner boundary, including for an admin-role account.

## Routing outcomes

Routing is a product state, not an untyped success/failure boolean.

| Situation | Outcome | Durable organization |
|---|---|---|
| Clear existing Collection match | `routed_existing` | Reuse Collection; create at most one Record |
| Safe new reusable type | `created_collection` | Create at most one Collection and one Record |
| Ambiguous, mixed, weak, or unsafe proposal | `needs_review` | Create neither Collection nor Record |
| AI unavailable or malformed | `needs_review` | Create neither Collection nor Record |
| Unexpected durable-processing fault | `failed` | No partial organization should survive |

`needs_review` is expected business behavior. It is not a server crash.

Retries must be idempotent: duplicate ingestion/classification returns existing
identifiers rather than creating additional Clip, Collection, Record, or
RoutingDecision rows.

## Enrichment outcomes

Expected source problems return typed outcomes rather than pretending that a
field changed:

- `changed`
- `unchanged`
- `no_extractable_fields`
- `suspicious_data`
- `blocked`
- `not_found`
- `rate_limited`
- `unreachable`
- `invalid_content`

A blocked, suspicious, unreachable, or invalid source must not mutate
`fields_json` or create false Enrichment history.

After three consecutive blocked watch checks, the watch is auto-paused with
`AUTO_PAUSED_BLOCKED`. The owner can resume it.

## Capture modes

All modes use the same Clip/routing pipeline, but evidence differs:

- `element` — bounded selected HTML/text and current-page screenshot context.
- `selection` — selected text and bounded surrounding text.
- `page` — title/description/bounded visible text; no full-page HTML.
- `link` — target URL plus browser-observed label/context; no server-side fetch
  of the target URL.
- `visual` — user-selected crop plus visible text.
- `image` — right-clicked image crop, alt/caption, and surrounding text.

The backend must not turn arbitrary user-submitted URLs into an unrestricted
crawler. Link capture stores browser-observed evidence only.

## Storage and screenshots

Screenshot upload is best-effort. A storage failure must not discard an otherwise
valid text capture.

The current boundary is:

```text
browser screenshot data URL
  → bounded ingest payload
  → backend file upload
  → stored screenshot URL in Clip metadata
```

Do not put binary `File` values directly into unsupported entity fields. Use the
existing upload integration and persist the returned URL.

## Delete semantics

Owner-requested Item, Collection, and Project deletion is a real destructive
cascade, not an archive:

- child WatchRules and Enrichments first;
- RoutingDecision and Clip next;
- Record/Collection/Project last;
- owner validation before deletion;
- missing child rows are skipped so retries can complete;
- a fully completed retry returns a typed `404` treated by the UI as done.

Do not add a new cascade implementation. Reuse the existing shared removal
primitive and its fixtures.

---

# 3. Known gaps and open verification gates

## G1 — Dashboard data completeness beyond 200 rows

The UI pagination fix does not solve the `loadDashboard()` fetch cap. Older data
can be silently absent when an owner has more than 200 rows in an entity.

Required future work:

- verify Base44 `filter`/`list` pagination signatures;
- choose cursor or offset pagination;
- scope Record queries to the active Collection;
- return `hasMore` or a real count;
- add fixtures with more than 200 rows.

Do not claim that the current UI pagination is server-side pagination.

## G2 — Concurrent ingestion serialization

Sequential retries are covered by idempotency fixtures. Truly simultaneous
requests for the same capture still need live integration proof or a server-side
serialization/CAS design.

Do not claim hard exactly-once behavior under concurrent requests until this gate
passes.

## G3 — Full Chrome integration matrix

The following need repeatable browser verification:

- every right-click capture mode;
- real crop geometry;
- hosted multimodal routing;
- semantic Project assignment;
- review actions;
- deletion flows;
- landing and pairing flows;
- image/card rendering on real data.

## G4 — Live cross-owner integration fixtures

Pure ownership tests exist, but the live hosted environment still needs a safe,
throwaway two-owner verification that proves:

- Dashboard owner A cannot read owner B;
- an admin-role account does not bypass owner isolation;
- an extension pairing token cannot read owner data;
- unauthorized IDs fail without partial responses.

Use synthetic data and delete it after verification.

## G5 — Bug-report rate limiting

`report-bug` is authenticated and uses a repository-scoped server-side GitHub
token, but it does not currently have a durable per-owner quota or duplicate
fingerprint system.

This is acceptable for the current dashboard-only scope but should be revisited
before exposing bug reporting publicly or to unauthenticated users.

## G6 — Folders

Bounded two-level Collection folders are planned but not built. Folders must
remain dashboard navigation only:

- never appear in the extension;
- never influence automatic routing;
- never change Collection identity or Project scope;
- must have owner/depth/cycle validation if implemented.

## G7 — Direct Dashboard entity writes

The documented architecture prefers durable writes through backend functions.
Audit the current UI for direct `base44.entities.*.update/create/delete` calls
before adding new writes. Any new durable mutation should use an owner-validated
Backend Function unless an explicit exception is documented.

## G8 — Local verification harness

The repository supports local Base44 development through `npx base44 dev`,
but the complete local browser harness is not yet a single reproducible command.
The desired workflow is:

```text
local Base44 + local Vite
  → saved local auth state
  → targeted Playwright tests
  → CI gates
  → one approved Production smoke test
```

Do not deploy merely to test a UI change that can be verified locally.

## G9 — Website first-run onboarding is not yet a complete UI contract

**Status:** Known product/UI gap. Suitable for a focused frontend task.

The website needs to make the first successful journey obvious:

```text
Landing page
  → understand the value
  → sign in
  → install the Chrome extension
  → pair the extension
  → capture the first item
  → see the item arrive in the Dashboard
  → understand what to do next
```

### Required UI states

The onboarding work should explicitly design and test these states:

1. **Signed-out landing**
   - Explain Capture → Organize → Review → Refresh.
   - Provide one primary next action.
   - Explain that the Extension is write-only and does not read workspace data.
   - Do not perform entity reads while signed out.

2. **Signed-in but not paired**
   - Show a first-run checklist.
   - Explain why pairing is needed.
   - Offer the install-extension action before asking for a token.
   - Distinguish “extension not installed” from “extension installed but not paired”
     when the browser can know the difference; do not invent a state it cannot verify.

3. **Pairing in progress**
   - Show that the token is being created or waiting to be used.
   - Make the one-time secret handling clear.
   - Do not display or persist the raw pairing token beyond its intended one-time use.

4. **Paired and ready**
   - Show a clear connected state.
   - Explain the keyboard shortcut and the available capture actions.
   - Provide a “capture your first item” next step.

5. **First capture processing**
   - Show that the capture was accepted.
   - Distinguish routing states: existing Collection, new Collection, Needs review, or failed.
   - Never present `needs_review` as an infrastructure error.

6. **First item received**
   - Point to the new Item or Collection.
   - Explain what the user is seeing.
   - Offer a next action such as review, compare, or enable monitoring.

7. **Recovery states**
   - Pairing token invalid or revoked.
   - Capture failed.
   - AI/routing unavailable.
   - Source blocked.
   - Empty workspace after an unsuccessful first attempt.

### Frontend constraints

- Prefer existing endpoints: `create-extension-pairing`, `extension-context`,
  `ingest-clip`, and `resolve-routing`.
- Do not expand Extension read permissions to implement onboarding.
- Do not expose Collection, Record, Enrichment, or owner-history data to the
  pairing principal.
- Keep backend entity/function names unchanged; UI may use Project, Item,
  Capture, and Needs review labels.
- Preserve deep-link and auth-callback behavior.
- Treat onboarding as a state machine rather than a collection of unrelated
  banners or modals.
- Make the flow keyboard-accessible and responsive.

### Acceptance criteria

- A new signed-in user can identify the next action without external instructions.
- The user can reach pairing from the empty Dashboard.
- Pairing success and pairing failure are visually distinct.
- The first capture has a visible, status-aware result.
- A `needs_review` capture leads to a clear recovery action.
- Returning users do not see the full first-run tour after pairing is known.
- Signed-out landing performs no entity reads.
- Onboarding can be tested locally with fixture data and a targeted Playwright
  smoke test; it must not require a Production deploy for every UI iteration.

### Recommended implementation order

1. Map the current Landing, auth, pairing, empty-state, and capture-result surfaces.
2. Define the onboarding state machine and transitions.
3. Extract reusable status/checklist components.
4. Add fixture-driven UI tests for each state.
5. Add one local Playwright happy-path test.
6. Only then consider visual polish or additional onboarding copy.

---

# 4. Agent operating rules

Before changing code:

1. Check the current branch and `git status`.
2. Read `AGENTS.md`, `CLAUDE.md`, and the relevant product/API documents.
3. Search for existing fixes, PRs, and tests before opening duplicate work.
4. Identify whether the item is fixed, expected behavior, a known gap, or an
   open verification gate.
5. Write a focused failing test or a deterministic reproduction before changing
   production code.
6. Preserve the MV3 trust boundary.
7. Keep changes narrow; do not bundle unrelated refactors.
8. Run the smallest targeted test first, then the full applicable gates.
9. Distinguish local verification, CI verification, and hosted verification.
10. Never deploy entities, functions, Agents, or the site without explicit owner
    approval.

## Recommended verification commands

```powershell
# Backend tests
$magpieDeno = "$env:USERPROFILE\.deno\bin\deno.exe"
& $magpieDeno test --allow-env --allow-read tests

# Backend type checks
$entryFiles = (Get-ChildItem -Path base44\functions -Filter entry.ts -Recurse).FullName
& $magpieDeno check $entryFiles

# Frontend
npm.cmd ci
npm.cmd run build

# Extension syntax and SDK boundary
Get-ChildItem extension -Filter *.js -Recurse | ForEach-Object { node --check $_.FullName }
rg -n "@base44/sdk" extension

# Local Base44 development
npx.cmd base44 dev
```

On macOS/Linux, use the equivalent `npm`, `npx`, and Deno commands.

## Completion standard

A bug is not complete merely because a patch exists. The agent must report:

- root cause;
- changed files;
- regression test;
- local test output;
- CI status;
- hosted status, if applicable;
- remaining known limitations;
- whether a deploy or approval is still required.

---

# 5. Quick triage index

| ID | Topic | Status |
|---|---|---|
| B1 | Raw capture text replaced by bounded summary | Fixed and merged |
| B2 | Picker highlight captured in screenshot | Fixed and merged |
| B4 | Element capture saved list-page URL | Fixed and merged |
| B5 / #11 | Card images cropped/distorted | Rendering fix merged; browser spot-check recommended |
| B7 | Unbounded Collection panel | UI pagination merged; server cap remains |
| B8 | Tracking/query-string duplicate misses | Fixed and merged |
| D1 | Docs deep-link anchor scroll | Open PR #12 |
| G1 | Server-side pagination beyond 200 | Known gap |
| G2 | Concurrent ingest serialization | Open verification gate |
| G3 | Complete Chrome matrix | Open verification gate |
| G4 | Live cross-owner fixtures | Open verification gate |
| G5 | Bug-report quota/rate limiting | Known gap |
| G6 | Bounded folders | Not built |
| G7 | Direct Dashboard entity writes | Audit required |
| G8 | Local Base44 + Playwright harness | Not yet packaged as one command |
| G9 | Website first-run onboarding UI contract | Known product/UI gap |
