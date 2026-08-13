# Magpie build guide

This guide follows the build in dependency order. Check each box only after completing its verification step.

## V1 — capture, structure, and refresh

### 1. Define the data boundary

- [x] **Build:** Replace the starter `Task` schema with `Clip`, `Collection`, `Record`, `Enrichment`, `WatchRule`, and `ExtensionInstall`. Owner identity lives on each row so dashboard reads can be owner scoped.
- **Files:** `base44/entities/*.jsonc`, `base44/config.jsonc`
- **Verify:** Run `npx base44 types generate`; the generated registry contains the product entities and no `Task` entry.

### 2. Pair an extension securely

- [x] **Build:** Add `create-extension-pairing`. A signed-in dashboard user receives one opaque browser token; only its SHA-256 hash and owner binding are persisted.
- **Files:** `base44/entities/extension-install.jsonc`, `base44/functions/create-extension-pairing/entry.ts`, `base44/shared/auth.ts`, `src/App.jsx`
- **Verify:** Click **Pair extension** while signed in. Copy the token, close the dialog, then confirm no raw token is available from an `ExtensionInstall` entity read.

### 3. Add backend-only ingestion

- [x] **Build:** Add `ingest-clip`, which authenticates the calling principal, validates a bounded clip payload, uploads an optional screenshot through Base44 file storage, and persists only through `base44.asServiceRole`.
- **Files:** `base44/functions/ingest-clip/entry.ts`, `base44/shared/*.ts`
- **Verify:** Invoke the function with a valid bearer token and confirm it returns a `clip_id`; invoke it without one and confirm it returns `401`.

### 4. Classify clips into records

- [x] **Build:** Add `classify-clip`, which uses the Base44 AI gateway to choose or define a Collection, then creates a structured Record.
- **Files:** `base44/functions/classify-clip/entry.ts`, `base44/shared/*.ts`
- **Verify:** Classify a product clip and a recipe clip. Confirm each creates a Record whose fields conform to its Collection schema.

### 5. Add enrichment and watch sweeps

- [x] **Build:** Add `enrich-record` to revisit a source and append an Enrichment only when trusted fields differ. Add `sweep-watches` to process active rules in batches.
- **Files:** `base44/functions/enrich-record/entry.ts`, `base44/functions/sweep-watches/entry.ts`, `base44/shared/*.ts`
- **Verify:** Update a mocked source field, invoke enrichment, and confirm one history row records the old and new values. A repeat invocation with unchanged data creates no additional row.

### 6. Build the authenticated dashboard

- [x] **Build:** Replace the Todo UI with a dashboard that loads owner-scoped data, subscribes to Record changes, and displays detail plus enrichment history.
- **Files:** `src/App.jsx`, `src/api/base44Client.js`, `src/index.css`, `src/components/*.jsx`
- **Verify:** Sign in, open the dashboard in two tabs, then create a Record from one tab. The second tab shows the new row without a reload.

### 7. Add the extension handoff

- [x] **Build:** Create an MV3 extension with a global `Alt+Shift+M` picker shortcut, dashboard launcher, and a worker that stores its token in `chrome.storage.local` and calls the backend using plain `fetch`.
- **Files:** `extension/manifest.json`, `extension/content.js`, `extension/service-worker.js`, extension styles
- **Verify:** Reload the extension, clip an element, let the worker go idle, and clip again. Both calls authenticate and no extension file imports `@base44/sdk`.

### 8. Finish product documentation

- [x] **Build:** Document architecture, the security boundary, Base44 surface coverage, and deployment.
- **Files:** `README.md`, `docs/ENGINEERING_NOTES.md`, `docs/DECISIONS.md`
- **Verify:** From a fresh checkout, the README links here, explains the MV3 boundary, names the asymmetric trust boundary, and identifies every load-bearing Base44 surface.

### 9. Validate local resources

- [x] **Build:** Run local checks and generate resource types.
- **Files:** `base44/.types/types.d.ts`
- **Verify:** Run `npm run build` and `npx base44 types generate`; both exit successfully and the generated registries contain the implemented resources.

### 10. Deploy the application

- [ ] **Build:** Deploy Base44 resources and the dashboard after reviewing the remote change set.
- **Files:** deployed Base44 resources
- **Verify:** In the deployed dashboard, complete the documented clean-pairing demo and confirm realtime classification and enrichment.

## V2 — purpose and reliability

### 11. Generalize Missions

- [ ] **Build:** Replace the apartment-only Mission contract with reusable goal, constraint, ranking, watch, and lifecycle fields. Retain schema fields during compatibility work.
- **Files:** `base44/entities/mission.jsonc`, `base44/functions/create-mission/entry.ts`
- **Verify:** Create apartment and laptop Missions. Confirm both remain active and neither creation archives the other.

### 12. Make captures and candidates Mission-aware

- [ ] **Build:** Add bounded capture identity and processing fields, plus top-level Record fields for Mission filtering, ranking, freshness, and decision state.
- **Files:** `base44/entities/clip.jsonc`, `base44/entities/record.jsonc`, `base44/shared/clip.ts`, `base44/functions/extension-context/entry.ts`, `extension/*`
- **Verify:** Submit one `idempotency_key` twice and confirm the backend reuses the first Clip. Confirm a classified Record exposes Mission, schema version, decision, score, freshness, and processing fields.

### 13. Extract against the transitional Mission schema

- [ ] **Build:** Add Mission-constrained extraction without allowing the AI to mutate the stored schema. Preserve Collection and `fields_json` compatibility.
- **Files:** `base44/shared/classification.ts`, `base44/functions/ingest-clip/entry.ts`, `base44/functions/classify-clip/entry.ts`
- **Verify:** Capture one candidate into each of two Missions. Confirm every emitted field belongs to the selected transitional schema.

### 14. Expose multiple Missions in the dashboard

- [ ] **Build:** Replace the single active-Mission assumption with explicit Mission selection and a general Mission creator.
- **Files:** `src/App.jsx`, `src/index.css`
- **Verify:** Switch between two active Missions without reloading; each view shows only its associated Records and policy summary.

### 15. Validate the V2 foundation

- [x] **Build:** Generate Base44 types, build the frontend, and record platform or migration surprises.
- **Files:** `base44/.types/types.d.ts`, `docs/ENGINEERING_NOTES.md`, `docs/DECISIONS.md`
- **Verify:** `npx base44 types generate` and `npm run build` both exit successfully.

### 16. Verify local authentication

- [ ] **Build:** Configure the browser SDK from the app ID and local backend URL injected by `base44 dev`, while retaining deployed defaults.
- **Files:** `src/api/base44Client.js`
- **Verify:** Start with `npx base44 dev`, complete Google login from the Vite URL, and confirm the callback returns locally with `base44.auth.me()` resolving the signed-in user.

### 17. Harden enrichment outcomes

- [x] **Build:** Replace generic source-fetch errors and heuristic title mutation with typed, persisted enrichment outcomes and watch backoff.
- **Files:** `docs/API_AND_FAILURE_MAP.md`, `base44/shared/enrichment-v2.ts`, `base44/entities/record.jsonc`, `base44/entities/watch-rule.jsonc`, `base44/functions/enrich-record/entry.ts`, `base44/functions/sweep-watches/entry.ts`, `src/App.jsx`
- **Verify:** Exercise changed, unchanged, unreachable, blocked, not-found, rate-limited, invalid-content, unsupported-field, and suspicious-data fixtures. Confirm only trusted changes mutate fields or create Enrichment rows.

## V3 — automatic organization

Read `docs/PRODUCT_CHARTER.md` and `docs/V3_AUTO_ORGANIZATION_PLAN.md` before starting these steps.

### 18. Define and test routing outcomes

- [x] **Build:** Extract a pure routing engine that can select an existing Collection, propose a new Collection, or request review without mutating durable data.
- **Files:** `base44/shared/routing.ts`, `tests/routing.test.ts`, `base44/shared/classification.ts`
- **Verify:** Existing, new, ambiguous, cross-owner, synonym/equivalent-schema, Mission-scoped versus global, mixed-content, malformed-AI, and AI-outage fixtures all produce the documented deterministic outcomes. Review results contain no Collection/Record mutation instruction.
- **Verified 2026-07-24:** 17/17 fixtures passed with Node 22 TypeScript stripping and, after restoring Deno 2.9.4, with native `deno test tests/routing.test.ts`; esbuild bundled `routing.ts` and `classification.ts`.

### 19. Define auditable routing storage

- [x] **Build:** Add `RoutingDecision` and Collection/Clip routing fields while retaining V2 compatibility.
- **Files:** `base44/entities/routing-decision.jsonc`, `base44/entities/collection.jsonc`, `base44/entities/clip.jsonc`, `base44/.types/types.d.ts`
- **Verify:** Definitions remain additive, generated types include the new registry and fields, and RoutingDecision is owner-readable but server-write-only. Runtime uniqueness is verified in step 20.
- **Verified 2026-07-24:** All three JSONC definitions parsed locally, generated types include RoutingDecision and the V3 fields, and `npm run build` passed. Nothing was pushed or deployed.

### 20. Route before extraction

- [ ] **Build:** Replace Mission-only extraction with validated existing/new/review routing, plus an owner-scoped `resolve-routing` correction workflow.
- **Files:** `base44/shared/classification.ts`, `base44/shared/routing-persistence.ts`, `base44/functions/ingest-clip/entry.ts`, `base44/functions/classify-clip/entry.ts`, `base44/functions/resolve-routing/entry.ts`
- **Verify:** Under one moving Mission, apartment, neighborhood, and moving-company captures create or reuse three Collections; an ambiguous capture enters review. One accepted Clip has exactly one RoutingDecision, and retrying ingestion or `classify-clip` creates no duplicate Clip, Collection, Record, or decision.
- **Local checkpoint 2026-07-25:** The ingest and dashboard-retry functions call the validated V3 persistence workflow. Eight in-memory persistence fixtures prove existing/new/review writes, sequential retry idempotency, AI-outage review, global routing without a Mission hint, partial-Record recovery, and a Hebrew camera capture with a formatted shekel price. `resolve-routing`, simultaneous-request serialization, owner-RLS integration, and the Chrome end-to-end matrix remain before this step can be checked.

### 21. Make extension context explicit

- [ ] **Build:** Default the popup to Auto-organize and make Mission an explicit optional hint. Remove the implicit Latest active Mission behavior.
- **Files:** `extension/popup.html`, `extension/popup.js`, `extension/service-worker.js`, `base44/functions/extension-context/entry.ts`
- **Verify:** No Mission remains selected after the user clears it, choosing a Mission affects only subsequent captures, and the extension still cannot read Collections or Records.
- **Local checkpoint 2026-07-24:** Popup copy now defaults to Auto-organize and presents an optional Project context. `extension-context` returns `auto_organize` plus the same bounded context under `projects` and the backward-compatible `missions` key. All extension scripts parse and the extension directory has no `@base44/sdk` import. Live Chrome sleep/wake and capture checks remain.

### 22. Expose routing and corrections

- [ ] **Build:** Show Library, Mission Collections, realtime routing results, and the capture review inbox. Record moves as routing feedback.
- **Files:** dashboard components and styles, routing function integration
- **Verify:** A new Collection and Record appear live; accepting or correcting an ambiguous route updates the destination and improves the next matching fixture.

### 23. Validate the V3 demo

- [ ] **Build:** Harden the clean-pairing demo, update documentation with actual platform behavior, and verify all resource types and builds.
- **Files:** `README.md`, `docs/ENGINEERING_NOTES.md`, `docs/DECISIONS.md`, generated types
- **Verify:** In 60 seconds, clip an apartment, neighborhood guide, and moving company under **Move to Berlin**; observe three correct Collections, then show one trusted source-backed update.

## V3.1.0 — product polish and bounded organization

Read `docs/V3_1_PRODUCT_AND_RISK_PLAN.md` before implementing any V3.1 change.

### 24. Freeze the V3.1 product and risk contract

- [x] **Build:** Define UI vocabulary, information architecture, bounded-folder semantics, risk scoring, backend impact, migration, rollback, and sequencing.
- **Files:** `docs/PRODUCT_CHARTER.md`, `docs/V3_1_PRODUCT_AND_RISK_PLAN.md`, `docs/DECISIONS.md`, `docs/ENGINEERING_NOTES.md`
- **Verify:** Every proposed change has a risk score; critical folder work has a backend gate; entity renames, arbitrary depth, and routing-aware folders are rejected.

### 25. Finish the testable V3 loop

- [ ] **Build:** Complete steps 20–23 before V3.1 visual work can hide or compound routing defects.
- **Verify:** Chrome captures demonstrate existing, new, and review outcomes end to end.
- **Checkpoint:** The route/persist fixture gate is complete (24 routing tests; 33 total Deno tests). Chrome and local Base44 persistence remain the release gate.
- **Recalculated checkpoint 2026-07-25:** Hosted triage reproduced the actual AI contract swap (`schema` returned as a label and `fields` returned as definitions). The replacement JSON-schema contract and compatibility adapter now have four direct contract fixtures; HTML-size validation has its own hosted-limit regression. The full suite is 45/45 passing. Deployment and a clean hosted reclip remain the release gate.

### 26. Improve vocabulary and visual foundations

- [ ] **Build:** Apply UI-only terminology, reusable design tokens/components, and complete loading/empty/error/success states.
- **Files:** dashboard components and styles
- **Verify:** Project/Item/Capture labels are clear while SDK calls still use Mission/Record/Clip; responsive and keyboard checks pass.
- **Local checkpoint 2026-07-24:** The first presentation-only slice is active: the dashboard opens to Library instead of an implicit latest Mission, Missions display as optional Projects, and Records/Candidates display as Items. Entity names, SDK calls, permissions, and routing identity are unchanged; the production build passes.

### 27. Expand landing and onboarding

- [ ] **Build:** Turn the current auth landing into a product story and add a first-run pairing/capture checklist.
- **Files:** landing, authentication, and onboarding components/styles
- **Verify:** The public landing performs no entity reads; a new user can explain Capture → Organize → Review → Refresh and complete pairing.

### 28. Add application navigation

- [ ] **Build:** Introduce Home, Library, Projects, Needs review, and Updates views over one owner-scoped realtime data layer.
- **Files:** dashboard components, view state/routing, data subscriptions
- **Verify:** Reload/deep-link behavior, owner isolation, realtime inserts, and typed failure states remain correct.

### 29. Add multi-mode evidence capture

- [ ] **Build:** Add element, selection, page, link, visual, and image capture choices that all submit through the same plain-fetch MV3 boundary. Store additive mode/context metadata, crop visual evidence in the browser, and attach images to routing only for visual/image captures.
- **Files:** `extension/*`, `base44/entities/clip.jsonc`, `base44/shared/clip.ts`, `base44/shared/classification.ts`, capture/classification fixtures
- **Verify:** Right-click selection/link/image/page actions and popup element/visual/page actions create bounded payloads; link capture performs no backend URL request; visual/image routing receives the crop; all existing routing tests pass; no extension file imports `@base44/sdk`.
- **Local checkpoint 2026-07-25:** Source implementation is complete. Generated types include additive mode/context fields; 50/50 Deno tests, backend checks, extension syntax checks, the MV3 import check, and the Vite build pass. Keep this step unchecked until Chrome interaction and live multimodal gateway behavior are verified.
- **Hosted checkpoint 2026-07-25:** After explicit approval, the eight-entity schema set synchronized successfully and Base44 deployed only `ingest-clip` and `classify-clip`. Hosted smoke checks returned app `200`, CORS preflight `204`, and unauthenticated ingestion `401`. Reload and exercise extension `0.2.0` before checking this step.

### 29.1 Add bounded Project-aware routing agent

- [x] **Build:** Replace the default single-shot proposal provider with a bounded
  backend AI Gateway tool loop that jointly proposes optional Project context and
  Collection routing. Keep explicit Project selection authoritative, preserve the
  structured provider for rollback, and give the agent no entity-write tool.
- **Files:** `base44/shared/project-routing.ts`,
  `base44/shared/classification.ts`, `base44/shared/routing-persistence.ts`,
  `base44/entities/routing-decision.jsonc`, Project-agent/persistence fixtures
- **Verify:** Clear semantic Project assignment requires confidence `>= 0.90` and a
  lead `>= 0.15`; ambiguity enters review; no match remains global; explicit context
  wins; owner/inactive IDs are rejected; the tool loop cannot submit before reading
  Projects and Collections and stops after four steps.
- **Verified 2026-07-25:** 64/64 Deno tests passed, both routing entry points passed
  `deno check`, generated types contain the additive Project audit fields, the Vite
  build passed, extension scripts parsed, and the MV3 SDK-import check was clean. After
  explicit approval, the eight-entity definition set synchronized and only
  `classify-clip`/`ingest-clip` were deployed. Hosted smoke checks returned app `200`,
  ingestion preflight `204`, and unauthenticated ingestion `401`.

### 29.2 Add the bounded user-facing Magpie Agent

- [x] **Build:** Add one managed `magpie_organizer` Agent as an authenticated
  dashboard interface across Projects and Collections. Give it only owner-validating
  context, comparison, routing-explanation, and watch-management function tools.
  Explicitly disable Agent memory and do not grant direct entity operations.
- **Files:** `base44/agents/magpie_organizer.jsonc`,
  `base44/functions/agent-*/entry.ts`, shared Agent tool helpers and fixtures,
  `src/App.jsx`, `src/index.css`
- **Verify:** Cross-owner IDs return no partial data; context and comparison outputs
  stay bounded; watch creation/update is idempotent; Agent configuration contains no
  entity tools and has memory disabled; dashboard conversations stream through the
  normal authenticated SDK; all existing routing tests and the MV3 SDK-import check
  still pass.
- **Release gate:** Keep this step local until Chrome/dashboard regression checks
  pass and the owner separately approves function deployment, full Agent
  synchronization, and site deployment.
- **Local checkpoint 2026-07-25:** Source implementation is complete. The configured
  Agent has four function tools, no entity tools, and memory disabled. The full Deno
  suite passes 72/72, every backend function entry point passes `deno check`, the
  production frontend builds, extension scripts parse, and the MV3 SDK-import check
  is clean. At this local checkpoint, `agents push`, function deployment, and site
  deployment had not been run.
  Keep this step unchecked until the separately approved hosted Agent can complete
  real conversations and tool calls.
- **Hosted checkpoint 2026-07-25:** After explicit approval, Base44 deployed the four
  Agent tool functions, created `magpie_organizer` through the full Agent
  synchronization, and deployed the dashboard to
  `https://magpieorelse.base44.app`. No entities or extension files were deployed.
  A production smoke check found that the SDK auth exception initially escaped as
  `500`; `requireUser` now maps only authentication-shaped SDK errors to the
  documented `401` while preserving unrelated failures. The revised suite passes
  76/76. Hosted checks return app `200` and a safe JSON `401` from all four functions
  without authentication. A signed-in dashboard conversation and tool call remain
  the final check before ticking this step.
- **Signed-in checkpoint 2026-07-25:** A scripted authenticated conversation through
  `base44 exec` (functionally the dashboard SDK path) verified all four tools:
  `agent-workspace-context` answered only from stored owner data,
  `agent-explain-organization` and `agent-compare-items` returned bounded grounded
  results, and `agent-configure-monitoring` created exactly one WatchRule with an
  idempotent retry confirmed against the entity. Function logs showed only `INFO`
  entries. Step 29.2 is complete.

### 29.3 Add owner routing correction (`resolve-routing`)

- [x] **Build:** Implement the owner-only correction workflow for `needs_review`
  Captures: accept the stored suggestion, redirect to an eligible existing
  Collection, or create an owner-approved bounded Collection. Add a dashboard
  Needs-review panel with those actions and a `?review=<clip_id>` deep link, and
  make extension toasts routing-status-aware with a link back to the dashboard.
- **Files:** `base44/shared/routing-resolution.ts`,
  `base44/functions/resolve-routing/entry.ts`, `tests/routing-resolution.test.ts`,
  `src/App.jsx`, `src/index.css`, `extension/content.js`, `extension/content.css`,
  `extension/service-worker.js`
- **Verify:** Accept/redirect/create each produce at most one Collection and one
  Record; cross-owner targets return `403`; non-review Clips return `409`; identical
  retries are idempotent; conflicting retries return `409`; unsafe owner-supplied
  names are rejected; the original RoutingDecision proposal stays auditable via
  `corrected_collection_id`/`corrected_at`; the extension pairing principal cannot
  call the function.
- **Hosted checkpoint 2026-07-25:** After explicit approval, `resolve-routing` was
  deployed with a targeted function deploy and the dashboard was redeployed. The
  first authenticated smoke test returned `500` for a missing Clip because the
  hosted SDK throws `Base44Error: Entity ... not found` from `get()` instead of
  returning null; a `getOrNull` mapping restored the documented `404`, a fixture
  pinned the behavior, and the redeployed function returned
  `{"error":"Capture not found"}` with `404`. Unauthenticated calls return a safe
  JSON `401`. The suite passes 87/87. No entities or Agents were pushed.

### 29.4 Ten-gap release: deletion, dismissal, blocked watches, review UX, chat markdown, landing

- [x] **Build:** Add owner Item deletion (`delete-record` cascade), review dismissal
  and Project-scoped creation (`resolve-routing` extensions), blocked-watch
  auto-pause after three consecutive blocked checks, clickable URL fields, a sticky
  dashboard header, a title-as-dropdown Project switcher, markdown rendering for
  Agent replies, blocked-source guidance with watch pause/resume, Project creation
  inside the review wizard, and a full static landing page with CSS-3D hero and
  scroll-revealed storyboard.
- **Files:** `base44/shared/record-removal.ts`, `base44/shared/routing-resolution.ts`,
  `base44/shared/enrichment-v2.ts`, `base44/functions/delete-record/entry.ts`,
  `base44/functions/resolve-routing/entry.ts`, `base44/functions/sweep-watches/entry.ts`,
  `tests/record-removal.test.ts`, `tests/routing-resolution.test.ts`,
  `tests/enrichment-v2.test.ts`, `src/App.jsx`, `src/Landing.jsx`, `src/index.css`,
  `package.json` (react-markdown, remark-gfm)
- **Verify:** Cascade counts, cross-owner aborts before any delete, idempotent
  partial-state retries, dismiss happy/409/404 paths, Project validation without
  silent global fallback, auto-pause threshold cases; the landing performs no
  entity reads and honors reduced motion.
- **Hosted checkpoint 2026-07-25:** After pre-approved batch deployment,
  `delete-record`, `resolve-routing`, and `sweep-watches` were deployed with a
  targeted functions deploy and the site was redeployed. Smoke checks:
  unauthenticated `delete-record` returns a safe JSON `401`; authenticated calls
  with nonexistent IDs return `404 {"error":"Item not found"}` and
  `404 {"error":"Capture not found"}`; the live page serves the new bundle; no
  error-level function logs. The suite passes 102/102. No entities or Agents were
  pushed.

### 29.5 getOrNull 404 sweep and extension popup redesign

- [x] **Build:** Convert every remaining bare `entity.get()` on a possibly-missing
  ID to the shared `getOrNull` pattern (`base44/shared/service-entities.ts`) across
  `classify-clip`, `ingest-clip`, `enrich-record`/`enrichment-v2`, the four
  `agent-*` functions, `configureWatch`, and `routing-persistence`. Redesign the
  extension popup: brand-matched header, connection-aware pairing state with a
  first-run setup callout, an icon-led capture hierarchy with the keyboard
  shortcut, and a polished toast entrance.
- **Verify:** Two throwing-get fixtures pin `processStoredClip` and
  `configureWatch`; the suite passes 104/104; extension scripts parse and the
  SDK-import guard stays clean.
- **Hosted checkpoint 2026-07-25:** After approval, all 13 functions were
  redeployed. A synthetic live happy-path run verified dismiss and the
  `delete-record` cascade end to end in production with exact counts and
  idempotent `404` retries, leaving no synthetic rows. The extension redesign is
  local-only (reload the unpacked extension); no entities, Agents, or site were
  deployed.

### 29.6 Refresh-on-revisit and capture-time duplicate status

- [x] **Build:** New pairing-authenticated `refresh-capture` function: matches the
  owner's most recent Record by exact `source_url`, diffs watched fields from
  browser-supplied bounded text through the shared enrichment guards
  (`refreshRecordFromEvidence`), appends Enrichment rows, restores freshness, and
  reactivates auto-paused watches (`reactivateWatchesAfterRefresh`). `ingest-clip`
  gains an owner + `content_hash` duplicate check with an additive
  `capture_status` response field. The extension remembers the URLs it captured
  (local-only, capped at 500), auto-refreshes on revisit (default on, popup
  toggle, 12-hour per-URL rate limit), and shows a toast only when a refresh
  changes something or a capture is a duplicate.
- **Files:** `base44/shared/enrichment-v2.ts`,
  `base44/functions/refresh-capture/entry.ts`,
  `base44/functions/ingest-clip/entry.ts`, `tests/enrichment-v2.test.ts`,
  `extension/service-worker.js`, `extension/content.js`, `extension/popup.html`,
  `extension/popup.css`, `extension/popup.js`
- **Verify:** Refresh fixtures cover updated, unchanged (restores blocked
  freshness), suspicious (mutates nothing), and watch reactivation including
  cross-owner isolation; 108/108 pass; all 14 entries type-check; extension
  scripts parse; the SDK-import guard is clean.
- **Hosted checkpoint 2026-07-25:** After approval, `refresh-capture` and
  `ingest-clip` were deployed. A live smoke run through a real (immediately
  revoked) pairing token verified the full chain in production: unauthenticated
  `401`; a price change in browser-supplied text produced
  `{"outcome":"updated","change_count":1}`, one `extension-refresh-v1`
  Enrichment row (`$50 -> $40`), restored `fresh` freshness, and reactivated
  the auto-paused watch with its failure count reset; an uncaptured URL
  returned `no_match`. The synthetic Item was cascade-deleted and the smoke
  pairing deactivated.

### 29.7 Remove RLS admin bypass (security incident fix)

- [x] **Build:** Live incident 2026-07-26: the app owner's account carries
  `role: "admin"`, and every owner-scoped entity's RLS included an admin
  `$or` bypass on read (and update/delete for several entities), letting the
  admin account read/edit/delete any owner's data through the ordinary
  dashboard SDK. `shared/auth.ts`'s `canAccessOwner()` carried the same
  bypass for `classify-clip`/`enrich-record`. Fix: `read`/`update`/`delete`
  on `Clip`, `Record`, `Collection`, `Mission`, `WatchRule` are now a strict
  `data.owner_id == {{user.id}}` check; `Enrichment`, `RoutingDecision`, and
  `ExtensionInstall` (already client-write-only-via-function) get owner-only
  `read` and `update`/`delete: false`. `canAccessOwner()` is now a strict
  `user.id === ownerId` check.
- **Files:** `base44/entities/*.jsonc` (all eight), `base44/shared/auth.ts`,
  `docs/V3_1_PRODUCT_AND_RISK_PLAN.md`, `docs/API_AND_FAILURE_MAP.md`,
  `docs/DECISIONS.md`
- **Verify:** 108/108 Deno tests pass, all 14 entries pass `deno check`,
  extension scripts parse, no SDK import in `extension/`, the production
  build passes; live, an admin account's unfiltered `Clip.list()` returns
  only its own rows.
- **Hosted checkpoint 2026-07-26:** After explicit approval, all eight
  entity definitions were pushed and `classify-clip`/`enrich-record` were
  redeployed (the only functions importing `canAccessOwner`). A live check
  confirmed the admin account's unfiltered `Clip.list()` now returns only
  its own 13 rows, where it previously returned 13 plus 6 belonging to
  another owner.

### 29.8 Real brand icon, card view, and landing AI messaging

- [x] **Build:** Replace the placeholder CSS-drawn bird mark with the real
  Magpie logo (`src/icon/magpie.png`) everywhere: extension manifest/toolbar/
  popup icons (cropped tight from the source artwork so it reads clearly at
  16-48px), dashboard topbar/pairing-dialog/landing mark, and the browser
  favicon. Added an auto per-Collection Cards/Table view to `RecordTable`
  (Cards when most Items in a Collection have a captured screenshot, Table
  otherwise) reusing the Clip screenshots already loaded into dashboard
  state — no new entity reads. Added a landing-page section naming the AI
  surfaces the product already has but didn't advertise: bounded routing
  decisions, Item comparison, routing explanation, and natural-language
  watch configuration.
- **Files:** `extension/manifest.json`, `extension/popup.html`,
  `extension/popup.css`, `extension/icons/*.png`, `src/icon/*.png`,
  `src/App.jsx`, `src/Landing.jsx`, `src/index.css`, `index.html`
- **Verify:** Extension `manifest.json` parses and scripts pass `node --check`;
  the Vite production build passes; no new entity reads were introduced.
- **Hosted checkpoint 2026-07-26:** Deployed to production in two batches
  (`npx base44 site deploy -y`): the icon wiring first, then the card view
  and landing AI section. Both smoke-checked `200` for the app. The
  extension icon needs no deploy — reload the unpacked extension to see it.

### 29.9 In-app Docs page

- [x] **Build:** Replaced linking out to raw GitHub markdown with a branded
  in-app Docs page (`src/Docs.jsx`) that renders the existing
  `docs/GETTING_STARTED.md`, `docs/PRODUCT_GUIDE.md`, and `docs/API.md`
  through `react-markdown`/`remark-gfm` (bundled at build time via Vite's
  `?raw` import — single source of truth, no content duplication).
  Cross-document links between the three files are intercepted client-side
  to switch sections instead of 404ing. Reached via `?docs=<slug>` (mirrors
  the existing `?review=` deep-link pattern, so no server-side routing is
  needed). Linked from the landing hero ("How it works, and how to install
  the extension") right next to the trust-boundary line, and from the
  dashboard topbar.
- **Files:** `src/Docs.jsx`, `src/App.jsx`, `src/Landing.jsx`,
  `src/index.css`
- **Verify:** The Vite production build passes and the bundled JS contains
  the doc content; a signed-out visit to `?docs=...` triggers no dashboard
  data load (the existing `if (!user) return` guard on the load effect
  still applies), preserving the zero-entity-read guarantee for anonymous
  visitors.
- **Hosted checkpoint 2026-07-26:** Deployed via `npx base44 site deploy -y`;
  smoke-checked `200` for the app.
- **Follow-up fix 2026-07-26:** Real markdown tables (Getting Started's
  Action/How and Symptom/Fix tables) exposed a table-layout bug: the short
  first column claimed its full natural width while the long descriptive
  column absorbed the entire deficit and wrapped heavily. First attempt
  paired the standard `width: 1%` + `white-space: nowrap` shrink-to-content
  hint with `table-layout: fixed` — wrong pairing: `fixed` takes `1%`
  literally instead of as a content-sizing hint, so the unwrapped first
  column overflowed into the second column instead of shrinking to fit.
  Corrected to `table-layout: auto` (the hint only works there) with the
  same first-column `width: 1%` + `nowrap`, which lets the browser size the
  first column to its actual content and gives the rest of the row to the
  description column. Applies to both the Docs page and the Ask Magpie chat
  tables since both share `.agent-md`. Deployed via `npx base44 site deploy
  -y`, smoke-checked `200`.

### 29.10 Owner Collection/Project deletion (`delete-collection`, `delete-mission`)

- [x] **Build:** Extend the `delete-record` full-delete semantic one and two
  levels up the hierarchy. Extract the per-record cascade out of
  `record-removal.ts` into a reusable `cascadeRecord`; add a paginated
  `listAllOwned` helper; add `delete-collection` (cascades over every owned
  Record in a Collection, then the Collection) and `delete-mission` (cascades
  over every owned Collection scoped to a Mission via the same primitive, then
  the Mission). Add a delete action with two-step confirm to the Collection
  sidebar and the Project switcher.
- **Files:** `base44/shared/record-removal.ts`, `base44/shared/service-entities.ts`,
  `base44/shared/collection-removal.ts`, `base44/shared/mission-removal.ts`,
  `base44/functions/delete-collection/entry.ts`,
  `base44/functions/delete-mission/entry.ts`,
  `tests/record-removal.test.ts`, `tests/collection-removal.test.ts`,
  `tests/mission-removal.test.ts`, `src/App.jsx`, `src/index.css`
- **Verify:** Cascade counts across multiple Collections/Records, cross-owner
  rejection before any delete, missing-row idempotent retry, a pagination case
  exceeding one page, and a fixture proving an unrelated global Collection and
  a hint-only `needs_review` Clip both survive Project deletion untouched.
- **Hosted checkpoint 2026-07-26:** After explicit owner approval, `delete-collection`
  and `delete-mission` were deployed with a targeted `functions deploy`, and the
  site was redeployed with the new sidebar/switcher delete UI. Smoke checks:
  unauthenticated calls to both functions return a safe JSON `401`; the live
  page returns `200`. No entities or Agents were pushed (unchanged this
  session). The deferred manual sign-in click-through (delete a Collection
  with Items, delete a Project with Collections) still has not been performed.
- **Follow-up fix 2026-07-26 — realtime reload burst:** live use surfaced
  Base44 `429`s. Every one of the dashboard's 6 realtime subscriptions
  (`Collection`, `Record`, `Clip`, `Enrichment`, `RoutingDecision`,
  `WatchRule`) independently called the full 7-query `loadDashboard()` on
  every row change with no debouncing. A single cascade delete can touch
  dozens of rows across those entities, so it could burst into hundreds of
  near-simultaneous list calls — a pre-existing fragility this release's
  cascade deletes made acute. Fixed by debouncing the realtime callback
  (400ms trailing) so a burst of row changes collapses into one reload;
  explicit reloads after an owner's own action stay immediate. Site-only
  change, no entity/function impact; deployed via `npx base44 site deploy -y`
  after a passing `npm run build`, smoke-checked `200`.

### 29.11 One capture in flight at a time

- [x] **Build:** Every capture path (picker/snip submission in `content.js`,
  the popup's "Save page" button, and the right-click context menu) funnels
  through `service-worker.js` before hitting the network. Added a single
  `captureInFlight` lock (`withCaptureLock`) around all three entry points —
  a second capture attempt while one is still submitting is rejected
  immediately with a clear toast/status message instead of firing a second
  overlapping `ingest-clip` request and risking a rate limit. The quiet
  background auto-refresh check also skips while a manual capture is
  in-flight.
- **Files:** `extension/service-worker.js`
- **Verify:** Extension scripts parse and no extension file imports
  `@base44/sdk`. Local-only change — reload the unpacked extension to pick
  it up; no backend or site deploy involved.
- **Follow-up 2026-07-26:** Rejecting a second capture with a toast still let
  the user attempt one — proactively disabling controls is better UX.
  `content.js` now tracks a local `captureSubmitting` flag and refuses to
  open the picker/snip UI in the same tab while a capture from that tab is
  still submitting (toast instead of silently failing later). The popup
  queries a new `magpie:capture-status` message on open and disables all
  three capture buttons if a capture is already in flight anywhere, and
  disables them itself for the duration of its own "Save page" / picker-start
  requests, re-enabling on error.

### 29.12 CI/CD pipeline

- [x] **Build:** Automated the release gates instead of running them by hand
  from PowerShell before every commit, while keeping every remote mutation
  behind an explicit, human-approved trigger:
  - `.github/workflows/ci.yml` — runs on every push to `main`/`feature/**`
    and every PR into `main`. `backend` job: `deno test --allow-env
    --allow-read tests` then `deno check` over every
    `base44/functions/**/entry.ts`, pinned to Deno 2.9.4 (the version this
    project has always run locally; there is no `deno.json`/lockfile to pin
    it otherwise). `frontend-extension` job: `node --check` on every
    `extension/**/*.js`, the `@base44/sdk`-in-`extension/` grep from the
    architecture boundary, `npm ci`, `npm run build`.
  - `.github/workflows/extension-release.yml` — triggers on an
    `extension-v*` tag push. Confirms the tag matches
    `extension/manifest.json`'s `version`, re-runs the extension-only gates,
    zips `extension/`, and publishes a GitHub Release with the zip attached
    — replacing the fully manual process used for `extension-v0.2.0`.
  - `.github/workflows/deploy-base44.yml` — `workflow_dispatch` only, never
    triggered by push or merge. A `target` input picks `all | entities |
    functions | agents | site`. A `verify` job re-runs the full gate suite;
    the `deploy` job that actually calls `npx base44 <command>` only runs
    after `verify` passes and requires manual approval via the
    `production-deploy` GitHub Environment. Reads `BASE44_API_KEY` and
    `BASE44_APP_ID` from repository secrets (never committed — Base44's CLI
    accepts both as env vars ahead of the local `base44/.app.jsonc` file).
- **Files:** `.github/workflows/ci.yml`,
  `.github/workflows/extension-release.yml`,
  `.github/workflows/deploy-base44.yml`
- **Verify:** YAML reviewed by hand; `ci.yml` exercised end-to-end via a real
  push/PR. `extension-release.yml` and `deploy-base44.yml` were reviewed but
  deliberately not fired for real during this change — the first ships with
  the next `extension-v*` tag, the second requires a separate, explicit
  owner-approved run per `CLAUDE.md`.

### 29.13 Fix element-picker capture saving the list page instead of the item

- [x] **Build:** `captureElement` (`extension/content.js`) hardcoded
  `source_url: window.location.href` for every picker capture (hover, click,
  or the `C` shortcut). On list-style pages (e.g. rental listings) this saved
  the *list* page's URL instead of the specific card's own detail link, and
  because list pages are commonly client-rendered and reshuffle/refresh, the
  captured item could vanish from the page the user is sent back to. Added
  `resolveDetailUrl(element)`, which looks for the clicked element's nearest
  detail link (`element.closest("a[href]")`, falling back to
  `element.querySelector("a[href]")`), resolves it through the existing
  `safeHttpUrl` helper, and falls back to `window.location.href` only if no
  link is found. `captureElement` now uses this instead of the page URL
  directly. Context-menu capture modes (`selection`, `link`, `image`, `page`)
  and the visual snip flow were left unchanged — they weren't part of the
  reported bug and already have (`link` mode) or don't need (whole-page
  intent) this resolution.
- **Files:** `extension/content.js`
- **Verify:** `node --check extension/content.js` passes. Local-only change —
  reload the unpacked extension to pick it up; no backend or site deploy
  involved.
- **Follow-up 2026-08-14 (found via manual Playwright testing against
  books.toscrape.com):** the no-anchor-found fallback was itself broken.
  `safeHttpUrl(anchor?.href)` passed `undefined` when no anchor was found;
  `new URL(undefined, base)` coerces that to the literal string `"undefined"`
  instead of throwing, so `safeHttpUrl` returned a bogus
  `https://<origin>/undefined` URL instead of `""`, and the `||
  window.location.href` fallback never ran — a real capture reproduced this
  exactly (`https://books.toscrape.com/undefined`). Fixed by checking
  `anchor` truthiness before calling `safeHttpUrl` at all. Re-verified live
  post-fix: the same no-link scenario (hovering a book's price text, which
  has no ancestor or descendant link) now correctly saves the list page URL.
  Also confirmed live: the happy path (hovering a card's title/image link)
  saves the specific item's detail URL, and the descendant-link case
  (hovering a non-link card container whose only link is a child, e.g. the
  image wrapper) resolves correctly per a direct DOM check
  (`element.closest("a[href]") || element.querySelector("a[href]")`) against
  real book.toscrape.com markup — an end-to-end capture of that exact case
  wasn't cleanly reproducible in the test session (a prior capture was still
  in flight, so the picker likely never activated for that attempt; see
  `captureSubmitting`/`withCaptureLock` in `content.js`/`service-worker.js`),
  but the DOM logic itself is confirmed sound.

### 29.14 Normalize URLs for duplicate matching (B8)

- [x] **Build:** Duplicate detection in `ingest-clip` (`content_hash` over
  `capture_mode` + `source_url` + `context_url` + `raw_text`) and
  `refresh-capture`'s revisit lookup both matched on the raw, unnormalized
  `source_url`. Tracking/session query params that vary between two visits to
  the same page (`utm_*`, `gclid`, `fbclid`, etc. — common on rental/listing
  sites) produced a different hash each time, so the same listing captured
  twice silently created two separate Clips/Records instead of being flagged
  a duplicate. Added `canonicalizeUrl()` (`base44/shared/clip.ts`): strips a
  denylist of known tracking params, sorts the remaining query params, and
  trims a trailing slash — deliberately does **not** touch the URL fragment,
  since list/detail pages can use hash-based routing to identify the specific
  item (see Build Guide 29.13), and stripping it could wrongly merge two
  different items. `ingest-clip` now hashes on the canonical URL and stores
  it as `Clip.canonical_url` (new field); `routing-persistence.ts` copies it
  onto the created `Record`; `refresh-capture` looks up by `canonical_url`
  first and falls back to the old exact `source_url` match so Records created
  before this change (which have no `canonical_url`) keep working.
  `source_url` itself is never rewritten — it's still the exact link the user
  needs to get back to the page.
  Scope is forward-only per product decision: this does not retroactively
  merge or flag duplicate Clips/Records that already exist in the database
  from before this fix — that would be a separate, explicit cleanup task.
- **Files:** `base44/shared/clip.ts`, `base44/functions/ingest-clip/entry.ts`,
  `base44/shared/routing-persistence.ts`,
  `base44/functions/refresh-capture/entry.ts`,
  `base44/entities/clip.jsonc`, `base44/entities/record.jsonc`,
  `tests/clip.test.ts`
- **Verify:** `deno test --allow-env --allow-read tests` — 127/127 passing,
  including 4 new `canonicalizeUrl` cases. `deno check` on every
  `base44/functions/**/entry.ts` passes. The new `canonical_url` field on
  `Clip`/`Record` has **not** been pushed to Base44 yet
  (`npx base44 entities push` needs explicit owner approval per `CLAUDE.md`)
  — until that runs, the code paths that read/write `canonical_url` will
  just see it as `undefined` on the hosted entities, which is safe (falls
  back to the pre-fix exact-`source_url` behavior) but means the fix isn't
  live.

### 29.15 Show an AI summary instead of the raw capture (B1)

- [x] **Build:** No code path anywhere generated a short, digestible summary
  of a capture — `Clip.raw_text`/`raw_html` were the only content fields, and
  the dashboard sidepanel (`RecordDetail`) and review panel rendered the raw
  captured text verbatim and unbounded, contrary to the product's "structured
  info, not a raw dump" charter. Rather than a second AI call, `summary` is
  now a required field on the same `submit_route_proposal` tool call the
  routing agent already makes per capture (`base44/shared/classification.ts`
  — added to `ROUTING_RESPONSE_FORMAT`'s schema, the agent tool's schema, the
  agent's system prompt instructions, `adaptRoutingProposal`, and the
  rollback structured-classifier prompt/example for consistency): one or two
  plain-language sentences, no markdown. `processStoredClip`
  (`base44/shared/routing-persistence.ts`) writes it onto `Clip.summary`
  right after the proposal succeeds, in its own try/catch so a summary-save
  failure can never turn an otherwise-good capture into a false "review"
  outcome — it's a best-effort cheap entity write riding an AI call that
  already happened, not a second AI call. `Clip.review`/`ai_unavailable`
  outcomes (the proposal call itself threw) have no summary, by design.
  Frontend: added `CapturedContext` (`src/App.jsx`), used by both
  `RecordDetail` and the review panel — shows `clip.summary` when present
  (falling back to a 240-char preview of `raw_text` when it isn't, e.g. for
  `ai_unavailable`/older clips), with the full `raw_text` always reachable
  behind a "View full captured text" `<details>` toggle rather than gone.
- **Files:** `base44/shared/classification.ts`,
  `base44/shared/routing-persistence.ts`, `base44/entities/clip.jsonc`,
  `src/App.jsx`, `src/index.css`, `tests/routing-agent.test.ts`
- **Verify:** `deno test --allow-env --allow-read tests` — 127/127 passing.
  `deno check` on every `base44/functions/**/entry.ts` passes. `npm run
  build` passes.
- **Deployed 2026-08-14** (owner-approved): `npx base44 entities push` and
  `npx base44 functions deploy ingest-clip refresh-capture classify-clip`.
  First live check found `Clip.summary` completely absent from real captures
  — the `submit_route_proposal` tool's `required` array doesn't force the
  model to include a field without the tool also setting `strict: true`
  (unlike `ROUTING_RESPONSE_FORMAT`, which already had it for the unrelated
  rollback path). Added `strict: true` to the tool definition, redeployed,
  re-verified against fresh captures on books.toscrape.com: `Clip.summary`
  now populates with accurate, on-spec content (see
  `docs/ENGINEERING_NOTES.md` 2026-08-14). Backend confirmed live and
  working. **Frontend not yet deployed** — `src/App.jsx`'s `CapturedContext`
  change needs `npm run build` + `npx base44 site deploy`, so the live
  dashboard still renders the pre-fix raw-text dump even though the data now
  has a summary to show.

### 30. Add bounded folder persistence

- [ ] **Build:** Write tree fixtures, add Folder plus optional `Collection.folder_id`, and implement server-owned folder/move workflows.
- **Files:** folder fixtures, entity definitions, backend functions, generated types
- **Verify:** Cross-owner, duplicate sibling, cycle, depth, archive/restore, retry, Unfiled, and no-routing-impact cases pass locally.

### 31. Add folder UI and harden V3.1

- [ ] **Build:** Add explicit folder controls, then drag-and-drop with rollback; complete accessibility, responsive, migration, rollback, and demo checks.

### 32. Stable per-Collection dot color and dashboard LinkedIn link (B9, B10)

- [x] **Build:** B9 — the sidebar's `collection-dot` color (`CollectionSidebar`,
  `src/App.jsx`) was `dot-${index % 4}`: a function of the collection's
  position in whichever array was rendered, not the collection itself, so the
  same Collection could show a different color after a Project switch or
  reorder. Added `collectionDotIndex(collectionId)`, a stable hash of the
  collection's own `id` mod 4, and used it for the sidebar dot and a new
  matching dot added next to the collection name in the detail panel header
  (`RecordTable`). The detail view's "live collection" eyebrow icon was left
  as-is — tracing both render paths showed it's the same static green used by
  the topbar/footer live-status indicators app-wide, not an attempted
  per-collection color, so it wasn't actually the source of the reported
  inconsistency (see `docs/ENGINEERING_NOTES.md` 2026-08-14).
  B10 — added a "Follow on LinkedIn" link to the dashboard's
  `workspace-footer`, matching the one already shipped on the landing page
  footer (separate PR).
- **Files:** `src/App.jsx`, `src/index.css`
- **Verify:** `deno test --allow-env --allow-read tests` — 127/127 passing
  (no backend touched). `npm run build` passes.
- **Verify:** Users can organize Collections without changing Mission scope or routing, and the complete V3 flow remains testable from Chrome.
