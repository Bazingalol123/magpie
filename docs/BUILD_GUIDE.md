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
  working.
- **Follow-up 2026-08-14:** frontend (`CapturedContext`) deployed via the
  `Deploy to Base44` GitHub Actions workflow (`site` target, dispatched
  against `fix/p0-bugfix-pass`, approved through the `production-deploy`
  environment gate). Owner-verified against the live dashboard.

### 29.16 Wait for repaint before screenshotting a picker capture (B2)

- [x] **Build:** `captureElement` (`extension/content.js`) removed the green
  picker highlight overlay (`stopPicker()`) and immediately sent the capture
  message to the service worker, which calls
  `chrome.tabs.captureVisibleTab`. Removing the DOM element doesn't
  guarantee the browser has repainted before that screenshot call runs, so
  the highlight could still be in the captured frame — the same race the
  visual snip flow (`onSnipUp`) already guards against with a documented
  double-`requestAnimationFrame` + short timeout before screenshotting.
  `captureElement` now awaits the same wait pattern after `stopPicker()` and
  before `submitCapturePayload()`.
- **Files:** `extension/content.js`
- **Verify:** `node --check extension/content.js` passes. Owner-tested
  manually against a live capture (Camera Listings) — the captured
  screenshot no longer includes the green highlight overlay.

### 29.17 Fix card image cropping (B5)

- [x] **Build:** `.record-card-media img` used `object-fit: cover`, so any
  captured screenshot whose aspect ratio didn't match the card's fixed 4:3
  tile got cropped to fill it — for portrait images (e.g. book covers) this
  cropped out the top and bottom, often removing the title entirely.
  Switched to `object-fit: contain` so the whole image is always visible,
  letterboxed against the card's background instead of cropped. While
  verifying this (a standalone HTML repro of `.record-card`/`.record-card-media`,
  since local dev has no session and the deployed site wasn't touched yet)
  also found the 4:3 tile wasn't actually being enforced at all:
  `.record-card-media` is a flex item inside `.record-card`'s
  `display:flex; flex-direction:column`, and flex items default to
  `min-height: auto`, which lets content (the image's own intrinsic height)
  override the `aspect-ratio` sizing entirely — cards were sizing to
  whatever image they happened to contain instead of a uniform tile. Added
  `min-height: 0` to `.record-card-media` to make `aspect-ratio` authoritative
  again, confirmed via the same repro (200×150 tile, matching 4:3, regardless
  of image shape).
- **Files:** `src/index.css`
- **Verify:** `npm run build` passes. Visually confirmed via a standalone
  HTML page reproducing the exact card CSS with a real portrait book cover
  image (books.toscrape.com) — before: title cropped out entirely; after:
  full cover visible, correctly letterboxed. Not yet deployed to the live
  site — bundling with Build Guide 29.18 (B7) into one site deploy.

### 29.18 Paginate the per-Collection Item table/card grid (B7)

- [x] **Build:** `RecordTable`/`RecordCardGrid` (`src/App.jsx`) rendered
  every Record in the selected Collection at once — a Collection accumulates
  captures indefinitely with no bound, so the panel just grows forever as a
  user adds Items. Added simple client-side pagination: 30 records per page
  in table mode, 8 per page in card mode (card tiles take much more vertical
  space per item, so a smaller page keeps a page to roughly one screen),
  Previous/Next controls, only shown when a Collection has more than one
  page. Resets to page 1 when the selected Collection changes (via a
  `useEffect` keyed on `collection.id`) so switching collections never
  leaves the view on an out-of-range page; also clamps the current page down
  if the record count shrinks (e.g. after a delete) so it can't get stuck
  past the end. The `showCards` vs. table-mode decision still looks at the
  *full* record set, not just the current page, so paginating doesn't cause
  the view to flip modes as the user pages through.
  Deliberately scoped to the rendering layer only — `loadDashboard`
  (`src/App.jsx`) still fetches up to 200 Records/Clips/etc. per entity in
  one shot (`base44.entities.Record.list("-created_date", 200)` and
  similar). A user with more than 200 Records total across all Collections
  would still have older ones silently absent from the fetched set entirely,
  which pagination-in-the-UI cannot fix — that's a separate, larger
  server-side pagination change (cursor vs. offset, page size per entity)
  that needs its own scoping pass, not bundled into this fix.
- **Files:** `src/App.jsx`, `src/index.css`
- **Verify:** `npm run build` passes. Pagination math (page count, clamping,
  slice bounds) reviewed by hand; not yet live-verified in a real browser
  against a Collection with more than 30 Items — do that as part of the next
  manual pass alongside B5.

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

### 33. Add dashboard bug-report link, align landing page wording (B11)

- [x] **Build:** B11 asked for a "Found a bug? Report here" affordance in the
  dashboard, discussed with the owner as a GitHub-issue link (the landing
  page already had one from an earlier PR, worded "Report a bug"). Added a
  matching link to the dashboard's `workspace-footer`
  (`https://github.com/Bazingalol123/magpie/issues/new`), styled to match
  the existing "Follow on LinkedIn" link — both now sit in a shared
  `.footer-links` wrapper instead of a single hardcoded LinkedIn anchor.
  Also renamed the landing page's link text from "Report a bug" to
  "Found a bug?" so the wording matches across both surfaces.
- **Files:** `src/App.jsx`, `src/Landing.jsx`, `src/index.css`
- **Verify:** `npm run build` passes. Not yet deployed/owner-verified live.

### 34. In-app bug report form — no GitHub account required (B11 follow-up)

- [x] **Build:** Checkpoint 33's raw GitHub-issues link still required the
  reporter to have their own GitHub account. Replaced the dashboard's "Found
  a bug?" link with a button that opens an in-app form
  (`BugReportDialog`, `src/App.jsx`); a new authenticated backend function,
  `report-bug`, files the GitHub issue server-side using a repo-scoped
  fine-grained PAT (`GITHUB_ISSUES_TOKEN` secret, configured via `npx base44
  secrets set`, permission: Issues read/write on this repo only), so the
  reporter never needs their own GitHub credentials. Scoped to the signed-in
  dashboard only (not the landing page or extension) per product decision —
  keeps the endpoint authenticated rather than public, which matters since
  it writes to a public repo. Validation
  (`base44/shared/bug-report.ts`: `validateBugReport`, `buildIssuePayload`)
  is pure and covered by fixtures; the issue body includes the reporter's
  email, the active Collection/Library view, and the browser user agent as
  context for triage. The landing page's link (checkpoint 32/33) is
  unchanged — it's pre-sign-in and has no owner identity to attach a form
  submission to.
- **Risk:** L=2, I=3, score 6, Moderate (`docs/V3_1_PRODUCT_AND_RISK_PLAN.md`
  change matrix). New but fully isolated code path; worst-case impact is a
  contained, revocable token (Issues-only, single repo) rather than any
  Magpie data or owner-isolation exposure.
- **Files:** `base44/shared/bug-report.ts`, `base44/functions/report-bug/entry.ts`,
  `base44/shared/auth.ts` (added `email` to the authenticated-user type),
  `src/App.jsx`, `src/index.css`, `tests/bug-report.test.ts`
- **Verify:** `deno test --allow-env --allow-read tests` — 135/135 passing,
  including 8 new fixture cases. `deno check` passes on every
  `base44/functions/**/entry.ts` including the new one. `npm run build`
  passes. Dev server boots and serves `200` with no console errors on the
  pre-auth landing page. The authenticated dialog open/submit flow itself
  has **not** been click-tested live — this environment has no browser
  automation and the dashboard sits behind Google sign-in, so that pass
  needs the owner, same as every other authenticated-flow fix in this
  project's history.
- **Not yet deployed:** the `report-bug` function needs `npx base44
  functions deploy report-bug`, and the frontend needs a site deploy. Both
  require explicit owner approval per `CLAUDE.md`.

### 35. Paginate `loadDashboard` beyond the 200-row fetch cap (G1)

- [x] **Build:** `loadDashboard` (`src/App.jsx`) fetched every owner-scoped
  entity with a single hardcoded-limit `list()` call (20 Missions, 100
  Collections, 200 each for Record/Clip/Enrichment/RoutingDecision/
  WatchRule) and silently dropped everything past that cap — the gap tracked
  as G1 in `docs/BUGS_AND_BEHAVIORS.md` and previously flagged as
  out-of-scope future work in `docs/DECISIONS.md` ("B7 pagination is
  UI-only"). Verified Base44's actual `list()`/`filter()` signature against
  `.agents/skills/base44-sdk/references/entities.md` instead of assuming:
  it's offset-based (`sort, limit, skip, fields`), max 5,000 rows per
  request, no cursor and no `hasMore`/count field returned — the same
  contract `base44/shared/service-entities.ts`'s `listAllOwned` already uses
  server-side for cascade deletes. Added `fetchAllPages`
  (`src/dashboard-pagination.js`), a pure offset-pagination helper that pages
  in 200-row increments (`listAllOwned`'s own default page size) until a
  short page is returned or a 5,000-row-per-entity ceiling is hit, returning
  `{ items, hasMore, total }`. `loadDashboard` now calls it once per entity
  (still in parallel via `Promise.all`, same shape as before) and stores the
  `hasMore`/`total` metadata in a new `dataMeta` state; the Items count in
  `workspace-heading` shows a `+` suffix and tooltip when
  `dataMeta.records.hasMore` is true, so truncation is visible instead of
  silent. Checked every `data.records`/`data.clips`/etc. consumer in
  `src/App.jsx` before deciding whether to scope Record queries to the
  active Collection instead (G1's suggested alternative): the Items count,
  `CollectionSidebar`, `ActivityPanel`, and Mission-level aggregates all need
  cross-Collection data, so scoping would have broken all four without a
  larger restructure — kept the full paginated fetch instead and recorded
  the decision in `docs/DECISIONS.md`. Unlike `listAllOwned` (which throws
  once it exceeds its ceiling, because a destructive cascade must never
  complete partially), this read-only helper degrades to a
  truncated-but-usable view with `hasMore: true` rather than failing the
  whole dashboard load. Full backend-contract/failure-behavior writeup:
  `docs/ENGINEERING_NOTES.md`, 2026-08-14.
- **Risk:** L=2, I=5, score 10, High (`docs/V3_1_PRODUCT_AND_RISK_PLAN.md`
  risk model) — mirrors an already-shipped, already-tested pattern with low
  regression likelihood, but this is the single call gating every
  authenticated page view for every owner, the highest-impact "core demo"
  consequence in the model.
- **Files:** `src/dashboard-pagination.js` (new),
  `tests/dashboard-pagination.test.ts` (new), `src/App.jsx`,
  `docs/BUGS_AND_BEHAVIORS.md`, `docs/DECISIONS.md`,
  `docs/ENGINEERING_NOTES.md`.
- **Verify:** `deno test --allow-env --allow-read tests` — 142/142 passing,
  including 6 new fixtures, one of which seeds 250 fake rows in a single
  entity (the literal ">200 rows" fixture G1 asked for) and asserts it takes
  exactly two requests (200 + 50) and returns all 250. `deno check` passes
  on every `base44/functions/**/entry.ts` (unaffected; no backend files
  touched). `node --check` on every extension script and the
  `@base44/sdk`-in-extension grep both pass (unaffected; dashboard-only
  change). `npm run build` passes. Not yet live-browser-verified against a
  real owner with more than 200 rows — do that as part of the next manual
  pass, same caveat as checkpoint 29.18's B7 pagination.
- **Not yet deployed:** frontend-only change; needs a site deploy
  (`npx base44 site deploy` or equivalent target), which requires explicit
  owner approval per `CLAUDE.md`. No entity or function changes, nothing
  else to push.

### 37. Automated Chrome capture integration matrix, Phase 1 (issue #19 / G8)

- [x] **Build:** New `tests-e2e/` Playwright suite (test infrastructure, not
  production code) drives the real unpacked `extension/` against a real
  local `npx base44 dev` backend + dashboard for all 6 capture modes —
  `docs/BUGS_AND_BEHAVIORS.md`'s G3 (Chrome integration matrix) and G8
  (local verification harness) both move from "not built" to "Phase 1
  landed"; see that doc for exactly what remains open. Scope was chosen in a
  plan-mode conversation with the repo owner before implementation — see
  `docs/DECISIONS.md` for the phased-scope, local-fixtures, and
  CI-deferred reasoning.
  - `playwright.config.ts`: `testDir: tests-e2e/specs`, `workers: 1`
    (every spec shares one already-paired extension Chrome profile, one
    local backend, and one test owner's rows), `globalSetup`/
    `globalTeardown` pointing into `tests-e2e/`.
  - `tests-e2e/global-setup.ts`: spawns `npx base44 dev --port 4491` (a
    pinned port, not auto-selected) from the repo root — this single
    process also starts the local Vite dashboard already wired to it, since
    `base44/config.jsonc` has `site.serveCommand` set (confirmed via the
    `base44-cli` skill's `dev.md` reference, not assumed) — registers one
    test owner through the real local `/auth/register` + `/verify-otp` flow
    (OTP read off the `base44 dev` process's own stdout), starts a
    dependency-free static file server
    (`tests-e2e/helpers/fixtures-server.mjs`) for the HTML fixtures, then
    launches a real persistent Chromium context with the extension loaded,
    logs the dashboard in via the real `base44.auth.loginViaEmailPassword`
    SDK method (through a new dev-only `window.__magpieBase44` hook — see
    below), drives the real "Pair extension" dialog, and saves the returned
    ingest URL + token into the extension's popup connection form — once
    for the whole run, not once per spec.
  - `tests-e2e/global-teardown.ts`: kills everything global-setup spawned by
    PID (`taskkill /t /f` on Windows) and clears the gitignored
    `tests-e2e/.auth/` scratch directory (credentials, runtime port/PID map,
    the paired Chrome profile).
  - `tests-e2e/fixtures/*.html`: local static pages — a listings index/card
    grid (`index.html`) plus three detail pages, deliberately shaped to
    reproduce the real B4 regression (element/link capture must resolve to
    the clicked card's own detail URL, not the index page's URL), and a
    plain text article page for selection/page modes.
  - `tests-e2e/helpers/`: `config.ts` (pinned ports, gitignored-file
    readers), `browser.ts` (extension-loading — see the headless finding
    below), `backend.ts` (direct-`fetch()` entities-API assertions, not
    `@base44/sdk` — see the finding below), `capture.ts` (popup/tab/
    context-menu-equivalent driving helpers, all reusing real production
    message types), `dashboard.ts` (login + pairing-dialog helpers),
    `extension-test.ts` (the extended Playwright `test`/`expect` every spec
    imports instead of `@playwright/test` directly, since the stock `page`
    fixture cannot load an extension at all).
  - `tests-e2e/specs/capture-{element,selection,page,link,visual,image}.spec.ts`:
    one per mode, each asserting `capture_mode`, `source_url`/`context_url`,
    bounded `raw_html`/`raw_text` against `clip.ts`'s real caps, and a real
    duplicate-retry proving the B8 content-hash dedupe check against a
    second identical capture.
  - `src/api/base44Client.js`: added a dev-only
    `if (import.meta.env.DEV) window.__magpieBase44 = base44;` hook so tests
    can drive the real SDK login method via `page.evaluate()` instead of
    hand-injecting a session — dead-code eliminated from production builds
    (verified: `grep -c __magpieBase44 dist/assets/*.js` is 0 after a real
    `vite build`). Full reasoning in `docs/DECISIONS.md`.
  - `package.json`: `@playwright/test` devDependency, `test:e2e` script.
    `.gitignore`: `test-results/`, `playwright-report/`, `tests-e2e/.auth/`.
  - Two real findings surfaced while building this (both documented in
    `docs/ENGINEERING_NOTES.md`, neither fixed here per this task's "found a
    bug, don't fix it silently" instruction):
    1. **Product bug, narrow:** page mode's `raw_text` is
       `document.body.innerText` wholesale, which includes the previous
       capture's own still-visible result toast — a same-page page-mode
       recapture within the toast's ~9s lifetime gets polluted `raw_text`
       and a different `content_hash`, silently defeating the B8 dedupe
       check for that one case. Confirmed the other 5 modes are structurally
       immune (they read a specific element/selection/anchor, not the whole
       body). The test works around it by waiting for the toast to clear
       before its own retry, to test the real dedupe contract rather than
       this gap.
    2. **Known gap, unchanged:** re-confirmed `captureInFlight` in
       `extension/service-worker.js` has no `chrome.alarms`/keep-alive
       backing it and would silently reset on a mid-capture MV3 worker
       restart — worker sleep/wake testing itself is explicitly deferred
       (`docs/DECISIONS.md`), this is only a re-confirmation from reading
       the code this pass touched indirectly (`waitForCaptureIdle()` polls
       the same lock from outside).
- **Risk:** L=1, I=2, score 2, Low (`docs/V3_1_PRODUCT_AND_RISK_PLAN.md` risk
  model) — new, additive test infrastructure with a build+regression-test
  control; the one production-file touch (`base44Client.js`) is inert
  outside a local dev session.
- **Environment findings** (full detail in `docs/ENGINEERING_NOTES.md`):
  Chromium's `headless: true` in Playwright 1.62 silently loads a separate
  binary that cannot load extensions at all (no error, the service worker
  just never registers) — fixed with `headless: false` +
  an explicit `--headless=new` arg, which still requires no virtual display.
  `@base44/sdk` cannot be imported from any file Playwright's test runner
  loads (crashes at collection time inside axios's `https-proxy-agent`/
  `agent-base`/`debug` chain, reproduced with a one-line import, works fine
  under plain Node) — worked around by having `tests-e2e/helpers/backend.ts`
  call the local entities REST API directly with `fetch()` instead, which is
  arguably closer to the issue's own "poll the local backend's entities
  API" wording anyway.
- **Files:** `playwright.config.ts` (new), `tests-e2e/**` (new),
  `src/api/base44Client.js`, `package.json`, `package-lock.json`,
  `.gitignore`, `docs/BUGS_AND_BEHAVIORS.md`, `docs/DECISIONS.md`,
  `docs/ENGINEERING_NOTES.md`.
- **Verify:** `npm run test:e2e` — 6/6 specs passing, confirmed across two
  full consecutive runs for stability (local AI-Gateway calls proxy to
  production and are occasionally slow/401, per
  `docs/ENGINEERING_NOTES.md`, but did not flake the final passing runs).
  Full existing release gate suite re-run and confirmed unaffected: `deno
  test --allow-env --allow-read tests` — 142/142 passing; `deno check` on
  every `base44/functions/**/entry.ts`; `node --check` on every
  `extension/**/*.js`; `rg -n "@base44/sdk" extension` — no matches; `npm
  run build` — passes.
- **Not deployed; nothing to deploy.** This checkpoint is test
  infrastructure and one dev-gated frontend hook with no production runtime
  effect — no entity, function, or site deploy is needed or was performed.
- **Not done this pass, deliberately:** CI wiring
  (`.github/workflows/ci.yml`), non-English keyboard layouts,
  tab-already-open-before-reload, worker sleep/wake, the hosted smoke test,
  and fixing either of the two findings above — all recorded as open in
  `docs/BUGS_AND_BEHAVIORS.md` (G3, G8) and `docs/DECISIONS.md`.

### 36. First-run onboarding: pairing checklist and first-capture status (G9, partial, #17)

- [x] **Build:** Added `src/onboarding/` — a pure state module (`state.js`,
  no React or `base44` import, unit-testable standalone) plus three
  components. `deriveOnboardingStage` maps `{ extensionInstalls, clips,
  dismissed }` to one of `NOT_PAIRED` / `AWAITING_FIRST_CAPTURE` /
  `FIRST_CAPTURE_RECEIVED` / `READY`; `dismissed` (persisted to
  `localStorage["magpie.onboarding.dismissed"]`) is checked first and is
  absorbing, so a returning user who has acknowledged their first capture
  never sees the checklist again even if their pairing state later changes —
  the G9 "returning users do not see the full first-run tour again"
  acceptance criterion. `OnboardingPanel` renders `PairingChecklist` for the
  first two stages and `CaptureStatusBanner` for `FIRST_CAPTURE_RECEIVED`,
  and is mounted in `src/App.jsx` directly above `workspace-grid`, reusing
  existing `handleCreatePairing`/`isPairing` pairing state and the existing
  review dialog (`setSelectedReviewClipId`/`setIsReviewOpen`) rather than
  adding new ones. `loadDashboard` now also pages `ExtensionInstall`
  (`base44.entities.ExtensionInstall`, already a deployed entity from the
  ten-gap release — no entity change here) alongside the other owner-scoped
  entities, through the same `fetchAllPages` helper as G1, and subscribes to
  it for realtime updates. `CaptureStatusBanner` derives its state from
  `Clip.routing_status` (`deriveCaptureOutcome`) and distinguishes
  routed-to-existing-Collection, created-new-Collection, needs-review (routes
  to the existing review dialog, never presented as an error, per G9), and
  failed (routes to the existing bug-report dialog) — matching the closed
  enum in `base44/entities/clip.jsonc`, falling back to `FAILED` for any
  unrecognized value so the banner never renders blank. The extension-install
  link only ever offers a plain link to the GitHub Releases page; per G9's
  "do not invent a state it cannot verify," the UI never claims the extension
  is installed, since there's no `externally_connectable` handshake to check
  that from the dashboard.
- **Scope cut (deliberate, not a bug):** this checkpoint implements 3 of
  G9's 7 required UI states — signed-in-not-paired, pairing-in-progress (via
  existing `isPairing`), and first-capture-processing/received. Still open,
  and not attempted in this pass: signed-out landing changes, a distinct
  "paired and ready" state, the wider recovery-state set (AI/routing
  unavailable, source blocked, empty-workspace-after-failed-attempt), and all
  of the acceptance criteria's fixture-driven UI tests plus the local
  Playwright happy-path test. See `docs/DECISIONS.md` and the updated G9
  entry in `docs/BUGS_AND_BEHAVIORS.md`.
- **Risk:** L=2, I=3, score 6, Medium (`docs/V3_1_PRODUCT_AND_RISK_PLAN.md`
  risk model) — additive UI on the dashboard's main authenticated view, reads
  one already-deployed entity the RLS policy already scopes to
  `data.owner_id`, no new writes, no extension or function changes.
- **Files:** `src/onboarding/state.js` (new), `src/onboarding/
  OnboardingPanel.jsx` (new), `src/onboarding/PairingChecklist.jsx` (new),
  `src/onboarding/CaptureStatusBanner.jsx` (new), `src/App.jsx`,
  `src/index.css`, `.gitignore`, `docs/BUGS_AND_BEHAVIORS.md`,
  `docs/DECISIONS.md`, `docs/BUILD_GUIDE.md`,
  `docs/CLAUDE_CODE_HANDOFF.md`.
- **Verify:** `npm run build` passes. No automated test coverage was added in
  this pass — `state.js` is written to be unit-testable but no test file
  exists yet (see scope cut above); this is a gap, not a claim of tested
  behavior. Not yet manually verified against a live pairing/capture flow in
  a browser.
- **Not yet deployed:** frontend-only change; needs a site deploy, which
  requires explicit owner approval per `CLAUDE.md`. No entity or function
  changes, nothing else to push.

### 37. Fix cascade delete orphaning child rows past one fetch page (B13)

- [x] **Build:** Found via a targeted code audit for a new P0 (not a user
  report), on branch `fix/p0-cascade-delete-pagination`. `cascadeRecord`
  (`base44/shared/record-removal.ts`) — the innermost cascade shared by
  `delete-record`, `delete-collection`, and `delete-mission` — fetched
  WatchRule/Enrichment/RoutingDecision children with a single hardcoded-limit
  `.filter()` call (100/200/10 respectively) instead of paging to completion,
  even though the outer Collection/Mission cascades one level up already use
  the `listAllOwned` pagination helper for exactly this reason. A Record with
  more than 200 Enrichment rows (realistic for a long-lived, actively-watched
  candidate — `persistFieldDiff` appends one row per changed field per check)
  or more than 100 WatchRules only had its newest page deleted; since the
  Record is deleted last as the retry anchor, a retry 404s immediately and
  the older child rows are permanently orphaned, silently breaking the
  documented "permanent full delete, not an archive" guarantee. Fixed by
  routing all three child fetches through `listAllOwned`, same as the outer
  cascades. Also fixed a latent gap in the test harness: the
  `tests/record-removal.test.ts` mock `filter()` ignored the `skip`
  parameter entirely, which is exactly why no fixture caught this — a
  >page-size fixture against the old mock would have made `listAllOwned`
  loop forever instead of failing loud. Fixed the mock to honor `skip` and
  added a regression fixture seeding 250 Enrichment + 150 WatchRule rows;
  confirmed by reverting the source fix that the new fixture fails exactly as
  predicted (200/100 deleted, the rest orphaned) before re-applying the fix.
- **Files:** `base44/shared/record-removal.ts`, `tests/record-removal.test.ts`,
  `BUGS.local.md`, `docs/BUGS_AND_BEHAVIORS.md`, `docs/BUILD_GUIDE.md`.
- **Verify:** `deno test --allow-env --allow-read tests` — 143/143 passing
  (was 142; one net new fixture). `deno check` passes on all 16
  `base44/functions/**/entry.ts`. `node --check` passes on every extension
  script and the `@base44/sdk`-in-`extension/` grep is clean (unaffected;
  backend-only change). `npm run build` passes.
- **Not yet deployed:** no entity/schema change — needs
  `npx base44 functions deploy delete-record delete-collection delete-mission`
  with explicit owner approval per `CLAUDE.md`.
  **2026-08-16 update:** this deploy has since happened — see checkpoint
  below.

### 38. Migrate the extension from a popup to a Chrome Side Panel (issue #46)

- [x] **Build:** `extension/manifest.json` now declares
  `side_panel.default_path: "sidepanel.html"` and the `sidePanel`
  permission, and drops `action.default_popup` entirely — clicking the
  toolbar icon opens the Side Panel via
  `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`,
  called once in `service-worker.js`'s existing `onInstalled` listener
  (wrapped in `.catch()` so an older-Chrome rejection can't block the
  context-menu/content-script setup that already lives there). The popup UI
  is renamed and rewritten as `extension/sidepanel.html`/`.css`/`.js`:
  - CSS drops the fixed 340px popup frame for a fluid width (`width: 100%;
    min-width: 280px`) with a flex-column `main` so the trust-boundary
    footer pins to the bottom of whatever height the panel is resized to.
  - Every `window.close()` call is removed — after a successful Save page,
    after starting the element picker or visual snip, and after opening the
    dashboard, the panel now updates its own status text and re-enables the
    capture buttons in a `finally` block instead of relying on the surface
    closing itself.
  - The setup-callout and status copy are now explicit about the two-step
    flow the acceptance criteria require: "Open the dashboard in a new tab
    and click Pair extension... come back to this side panel — it stays
    open — and paste both values below," and the Open-dashboard button is
    labeled "Open dashboard in a new tab."
  - No pairing field, Project/intent selector, auto-refresh toggle, or
    connection-pill logic was dropped — `chrome.storage.local` keys
    (`ingestUrl`, `extensionToken`, `activeMissionId`, `captureIntent`,
    `autoRefreshEnabled`, `savedUrls`) are untouched, so an existing paired
    profile stays paired across the upgrade with no migration step.
  - `content.js` and the rest of `service-worker.js` (capture lock,
    `submitCapture`, `addViewportScreenshot`, context menus, auto-refresh
    tab listener) are unmodified — the plain-`fetch` + opaque-pairing-token
    capture protocol did not move.
  - Dashboard copy that described "the popup" (`src/App.jsx`'s pairing
    dialog, `src/onboarding/PairingChecklist.jsx`'s waiting-state copy) now
    says "side panel" to match.
  - User docs (`README.md`, `docs/GETTING_STARTED.md`,
    `docs/PRODUCT_GUIDE.md`, `docs/API.md`) updated from popup to Side
    Panel language; `docs/GETTING_STARTED.md`'s pairing walkthrough was
    rewritten for the "side panel stays open, dashboard opens in a new tab"
    flow.
  - Added a new focused Deno fixture,
    `tests/extension-manifest.test.ts` (4 fixtures): manifest is valid
    JSON with no `action.default_popup`, declares
    `side_panel.default_path` and the `sidePanel` permission; every
    manifest-referenced file (`background.service_worker`,
    `side_panel.default_path`, top-level `icons`, `action.default_icon`,
    `content_scripts` js/css) exists on disk; the old `popup.html`/`.js`/
    `.css` files and manifest references are gone; `sidepanel.js` has no
    `@base44/sdk` import.
  - Updated `tests-e2e/helpers/capture.ts` and every
    `tests-e2e/specs/capture-*.spec.ts` file (all 6 capture-mode specs plus
    `global-setup.ts`) to open `sidepanel.html` (renamed `openPopup` ->
    `openSidePanel`) and to drop comments claiming the surface closes
    itself, since it no longer does. This suite was not executed in this
    pass — see the verification note below and `docs/DECISIONS.md`.
  - Bumped `extension/manifest.json` version `0.2.0` -> `0.3.0` (last
    released tag was `extension-v0.2.0`; this is a user-facing feature
    change, not a patch).
- **Files:** `extension/manifest.json`, `extension/service-worker.js`,
  `extension/sidepanel.html` (new), `extension/sidepanel.css` (new),
  `extension/sidepanel.js` (new), `extension/popup.html`/`.css`/`.js`
  (removed), `tests/extension-manifest.test.ts` (new), `src/App.jsx`,
  `src/onboarding/PairingChecklist.jsx`, `tests-e2e/helpers/capture.ts`,
  `tests-e2e/global-setup.ts`, `tests-e2e/specs/capture-*.spec.ts`,
  `README.md`, `docs/GETTING_STARTED.md`, `docs/PRODUCT_GUIDE.md`,
  `docs/API.md`, `docs/V3_1_PRODUCT_AND_RISK_PLAN.md`, `docs/DECISIONS.md`.
- **Verify:** `deno test --allow-env --allow-read tests` — 147/147 passing
  (was 143; 4 net new fixtures). `deno check` passes on all 16
  `base44/functions/**/entry.ts` (unaffected; extension-only change).
  `node --check` passes on every `extension/**/*.js`. The
  `@base44/sdk`-in-`extension/` grep is clean. `npm run build` passes.
  **Not performed:** any real-Chrome manual verification (toolbar click
  opening the actual Side Panel, panel persisting across a tab switch to
  the dashboard, worker-sleep/wake behavior) — this session had no way to
  launch real Chrome. See `docs/DECISIONS.md` for the full list of what was
  and was not verified.
- **Deployed:** merged to `main` 2026-08-15 (PR #50). No backend/entity/site
  change; no deploy needed. Ships as GitHub Release `extension-v0.3.0` after
  this checkpoint's tag push.

### 39. Pre-beta documentation audit (issue #47)

> Numbering note: this repository already has two checkpoints labeled
> "### 37" (the Chrome capture integration matrix, and this file's B13
> entry above) from earlier concurrent work landing out of strict order,
> and this entry was originally written as "### 38" before issue #46
> (Side Panel migration, the checkpoint immediately above) merged first and
> took that number — renumbered to 39 when reconciling the two PRs' merge
> conflicts. Not renumbering the pre-existing "### 37" duplicate, to avoid
> disturbing further history; flagged as a doc-audit finding.

- [x] **Build (docs-only, no runtime change):** Read

- [x] **Build (docs-only, no runtime change):** Read
  `docs/PRODUCT_CHARTER.md`, `docs/CLAUDE_CODE_HANDOFF.md`,
  `docs/API_AND_FAILURE_MAP.md`, `docs/BUILD_GUIDE.md`,
  `docs/ENGINEERING_NOTES.md`, `docs/DECISIONS.md`,
  `docs/GETTING_STARTED.md`, `docs/PRODUCT_GUIDE.md`, `docs/API.md`,
  `README.md`, and `docs/BUGS_AND_BEHAVIORS.md` in full, then verified their
  factual claims against current source (`base44/functions/`,
  `base44/shared/`, `extension/`, `src/`), the local release-gate commands,
  and `deploy-base44.yml`'s GitHub Actions run history rather than trusting
  prior doc text. Found and corrected: two stale test-count summaries
  (102/102 → 143/143 in `CLAUDE.md` and `docs/CLAUDE_CODE_HANDOFF.md`; the
  detailed docs already had 143/143), a stale backend-function count (16 →
  17, missing `report-bug`), several "not yet deployed"/"not merged" claims
  that GitHub Actions run history shows are now false (B13, G1, G9's site
  code, `report-bug`, and the `fix/p0-bugfix-pass`/`fix/p0-cascade-delete-
  pagination` branches, all confirmed merged via `git log origin/main` and/or
  deployed via successful `deploy-base44.yml` dispatches), a `refresh-capture`
  contract description that hadn't been updated for the canonical-URL-first
  lookup change, a misplaced paragraph in `docs/DECISIONS.md`, and two dead
  code paths (`enrichRecord` in `base44/shared/enrichment.ts`,
  `classifyStoredClip` in `base44/shared/classification.ts`) carrying a
  known-wrong "SDK `.get()` returns null" assumption that `docs/
  API_AND_FAILURE_MAP.md` itself documents as false for the hosted SDK —
  both unreachable from any current entry point, flagged for a follow-up
  cleanup issue rather than fixed here. **Correction (same day, after this
  audit's initial pass):** issue #46 (checkpoint 38, immediately above)
  merged to `main` as PR #50 before this audit's own PR merged, so the
  "no Chrome Side Panel code exists yet / every popup-based instruction
  remains accurate" claim below is stale as of that merge — `README.md`,
  `docs/GETTING_STARTED.md`, `docs/PRODUCT_GUIDE.md`, and `docs/API.md` now
  describe the Side Panel, not the popup, and that is correct. This audit's
  own doc patches (this file, `docs/CLAUDE_CODE_HANDOFF.md`) were updated to
  match at merge-conflict-resolution time rather than left pointing at a
  now-merged PR as still open.
- **Files:** `README.md`, `docs/README.md`, `docs/CLAUDE_CODE_HANDOFF.md`,
  `docs/API_AND_FAILURE_MAP.md`, `docs/API.md`, `docs/BUGS_AND_BEHAVIORS.md`,
  `docs/DECISIONS.md`, `docs/ENGINEERING_NOTES.md`, `docs/RELEASE_NOTES.md`,
  `docs/BUILD_GUIDE.md` (this entry), `docs/BETA_LIMITATIONS.md` (new),
  `CLAUDE.md`. No `base44/`, `extension/`, or `src/` file changed.
- **Verify:** `deno test --allow-env --allow-read tests` 143/143; `deno
  check` clean on all 17 `base44/functions/*/entry.ts`; `node --check` clean
  on every `extension/*.js`; `rg -n "@base44/sdk" extension` empty; `npm run
  build` passes. All re-run locally 2026-08-16 as part of the audit, not
  assumed from prior docs.
- **Deployed:** N/A — documentation only. See the audit table and
  `docs/BETA_LIMITATIONS.md` in the issue #47 PR for the full claim-by-claim
  status (source-only / locally-verified / deployed / live-verified /
  unknown) this checkpoint produced.

### 40. Fix picker/snip mode switching and a stale hint toast after Escape

- [x] **Build:** Two bugs found by manual use of the just-shipped Side Panel,
  both in `extension/content.js` and both present since before the Side
  Panel migration (reproduced on the prior `extension-v0.2.0` popup build
  too — neither is caused by that migration):
  - **Escape didn't visibly cancel the picker/snip hint.** `stopPicker()`
    and `stopSnip()` removed the highlight box / snip overlay and their
    listeners, but never touched the "Hover any element..." / "Drag to
    select..." hint toast `showToast()` had put on the page. That toast
    only self-clears via its own `setTimeout` (8s for a "hint"), so
    pressing Escape looked like it did nothing for up to 8 seconds. Added
    `hideToast()` (clears `toastTimer` and any `toastStageTimers`, removes
    the toast element) and call it from both `stopPicker()` and
    `stopSnip()`.
  - **Couldn't switch from Clip Element to Snip Area (or back) once one was
    active.** `startPicker(mode)` guarded with `if (pickerActive ||
    snipActive) return;` and `startSnip()` guarded with `if (snipActive ||
    pickerActive) return;` — so clicking the other mode's Side Panel button
    while a picker/snip session was already running silently no-opped in
    the content script. `sidepanel.js`'s `startPickerInTab` never learns
    this happened (`chrome.tabs.sendMessage` resolves once the listener is
    reached, not once the requested mode actually started), so the Side
    Panel status text still claimed the new mode had started. Changed both
    guards to only block re-starting the *same* mode, and to call the other
    mode's stop function first (`startPicker` calls `stopSnip()` if
    `snipActive`; `startSnip()` calls `stopPicker()` if `pickerActive`) so
    switching now tears down the old mode's DOM/listeners before starting
    the new one, including clearing its hint toast via the fix above.
  - Bumped `extension/manifest.json` version `0.3.0` -> `0.3.1` (bug fix,
    not a feature change).
- **Files:** `extension/content.js`, `extension/manifest.json`.
- **Verify:** `deno test --allow-env --allow-read tests` — 147/147 passing
  (unchanged; this fix has no Deno-covered surface, same as the rest of
  `content.js`'s DOM logic). `deno check` clean on all 17
  `base44/functions/**/entry.ts` (unaffected). `node --check` clean on
  every `extension/**/*.js`. `@base44/sdk`-in-`extension/` grep clean.
  `npm run build` passes. **Not performed:** real-Chrome manual
  verification of either fix (no way to launch real Chrome this session) —
  both are inferred correct by reading the full picker/snip/toast lifecycle
  in `content.js`, not observed in a live page.
- **No backend/entity/site change; no deploy needed.** Ships as GitHub
  Release `extension-v0.3.1` after merge and explicit owner approval — this
  task opens the PR only and does not push that tag.

### 41. Extension pairing lifecycle — research and design (issue #61)

- [x] **Build:** Discovery-only pass, per issue #61's explicit non-goal of
  not implementing revoke/rotate yet. Audited every file the issue named
  (`base44/entities/extension-install.jsonc`, `base44/shared/auth.ts`,
  `create-extension-pairing`, all three `requireExtensionPrincipal` callers,
  onboarding state/UI, `App.jsx` pairing dialog, extension service
  worker/side panel, `tests/extension-pairing.test.ts`, and the relevant
  sections of `API_AND_FAILURE_MAP.md`/`DECISIONS.md`/`BETA_LIMITATIONS.md`/
  `BUILD_GUIDE.md`/`BUGS_AND_BEHAVIORS.md`), plus issues #27, #38, #48, #20
  for overlap. Produced `docs/PAIRING_LIFECYCLE_DESIGN.md`: verified current
  behavior with evidence, a "multiple active pairings, explicit revoke only"
  product decision, a threat model, a proposed
  `list-extension-pairings`/`revoke-extension-pairing`/
  `revoke-all-extension-pairings` API contract plus an additive
  `replace_installation_id` option on `create-extension-pairing`, UI/UX
  proposal (including a real gap found: the extension never stores its own
  non-secret `extension_id` locally, so the dashboard currently has no way
  to highlight "this browser's" pairing), extension `403`-handling gap
  (current code shows a generic error and never clears the stale local
  token on revoke), compatibility/rollback/test-matrix/doc-impact sections,
  and resolved #27/#38/#48/#20 overlap (recommends closing #27 as
  superseded once follow-up PRs exist; #20's hosted two-owner gate is a
  hard prerequisite before calling any follow-up "hosted-verified").
- **Files:** `docs/PAIRING_LIFECYCLE_DESIGN.md` (new).
- **Verify:** Documentation-only; no code changed, so the standard release
  gates were not re-run (nothing in them exercises this file). No
  entity/function/site change; nothing to deploy.
- **Next:** owner review/approval of the design, then split
  implementation into small follow-up PRs per issue #61's acceptance
  criteria — not started in this pass.

**Review round 1 (2026-08-17, Hermes comments on PR #62):** three findings
addressed, still discovery-only (no code/schema/Function/Extension change):
(1) verified Base44 has no cross-entity transaction primitive
(`.agents/skills/base44-sdk/references/entities.md`) and rewrote
`replace_installation_id` from "atomic" to an honestly-described non-atomic
two-step sequence with explicit failure/retry semantics; (2) resolved a
mismatch where the design called `revoke-all-extension-pairings` an
"optional bulk action" while issue #27 requires it unconditionally — it is
now explicit MVP scope; (3) rewrote the rollback section's "manual
`active: true` production edit" from an implied normal recovery path to
`Unknown`/unverified status, stating plainly that no supported recovery
mechanism exists today and listing minimum requirements (owner-only
authorization, first-party Base44 tooling only, an audit trail, documented
operational ownership) a future break-glass mechanism would need before it
could be called supported. See `docs/PAIRING_LIFECYCLE_DESIGN.md`'s "Review
round 1" section for the full detail.

**Review round 2 (2026-08-17, Hermes comments on PR #62):** one remaining
gap addressed, still discovery-only: round 1's non-atomic
`replace_installation_id` design still left the *create* half of the
create-then-revoke sequence unsafe to retry after an ambiguous
timeout/network failure — retrying could mint a duplicate active pairing
while the first pairing's raw token, deliberately never persisted, would be
unrecoverable. A client-supplied idempotency key (this codebase's existing
`ingest-clip` pattern) can't fix this the way it fixes `ingest-clip`,
because `ingest-clip`'s retry safely re-returns already-stored data while
`create-extension-pairing`'s retry cannot re-return a secret that was never
stored. Resolution: `replace_installation_id` is deferred out of MVP
entirely — `create-extension-pairing` ships unmodified, and "replace this
browser's pairing" becomes a two-step, separately-confirmed UI flow over the
already-safe `create-extension-pairing` (unchanged) and
`revoke-extension-pairing` (idempotent) primitives, with no new backend
surface that could itself have an ambiguous-retry failure mode. The
pre-existing ambiguous-retry gap in plain `create-extension-pairing` is
recorded as a candidate future hardening item (§11.5 of the design doc), not
solved by this issue. See `docs/PAIRING_LIFECYCLE_DESIGN.md`'s "Review
round 2" section for the full detail.

### 42. Complete Welcome -> Project -> Method -> Capture -> Value onboarding flow

- [x] **Build:** Replaced the bare "jump straight to pairing" first-run
  panel with a full guided flow: Welcome (primary "Set up my first
  capture", secondary "Explore workspace"), an optional short Project step
  with a real Skip, and a Capture-method chooser covering Desktop (Chrome
  extension pairing, unchanged), iPhone (new iOS Shortcut setup doc),
  Android (PWA Share Target guidance, gated on real `serviceWorker`
  feature detection, not a claimed-installed state), and a Paste-URL
  fallback. First Capture / First Value reuse and extend the existing
  evidence-driven `CaptureStatusBanner` (now also shows the real
  `clip.source_url`/`clip.summary`, a "Save another capture" CTA, and a
  "Try again" retry action on `failed`). Returning users: fixed a real
  stage-derivation bug where `deriveOnboardingStage` gated exclusively on
  desktop Extension pairing, so a mobile-only user (iPhone/Android/paste
  capture, no Extension ever paired) stayed stuck in `NOT_PAIRED` forever
  and never saw the First Value screen — clip evidence now outranks
  pairing status. Also added a new `RECONNECT` stage: a dismissed
  (completed) onboarding no longer regresses to the full tour, but a real
  pairing revocation afterward now surfaces a short, non-blocking
  `ReconnectNotice` instead of going silent.
- **iOS Shortcut artifact:** `docs/IOS_SHORTCUT_SETUP.md` (also registered
  in the in-app Docs viewer at `?docs=ios-shortcut`, linked from the
  Method screen's iPhone card) gives exact, buildable Shortcut actions
  (URL Encode -> Text -> Open URLs) that hand a shared link to the
  existing `/share` page — no new mobile token, no background HTTPS POST,
  no change to `ingest-clip`/`mobile-capture`/auth. This reuses
  `src/App.jsx`'s pre-existing direct-query-param `/share` handling
  (`readShareDraft`'s `url`/`text`/`title` fallback, already covered by
  `tests/pwa-share.test.ts`) rather than the token-based Shortcut design
  PR #67 (`docs/mobile-capture-design.md`, open/draft as of this pass)
  proposes; see `docs/DECISIONS.md` for why.
- **Files:** `src/onboarding/state.js` (stage-derivation fix, `RECONNECT`
  stage), `src/onboarding/OnboardingWelcomeFlow.jsx` (new),
  `src/onboarding/ReconnectNotice.jsx` (new),
  `src/onboarding/CaptureStatusBanner.jsx`, `src/onboarding/OnboardingPanel.jsx`,
  `src/App.jsx`, `src/Docs.jsx`, `src/index.css`,
  `docs/IOS_SHORTCUT_SETUP.md` (new), `tests/onboarding-state.test.ts`
  (new), `tests/onboarding-flow-wiring.test.ts` (new).
- **Verify:** 208/208 Deno tests pass (13 new), all 17 `entry.ts` files
  type-check clean (no backend files touched), every `extension/**/*.js`
  parses, `rg "@base44/sdk" extension` returns no matches, `npm run build`
  passes, `git diff --check` clean. Manually verified in a real browser
  (Playwright, local `npm run dev`): the signed-out landing page and the
  new `?docs=ios-shortcut` page both render correctly with no app errors.
  The authenticated Welcome/Project/Method/First-Value/Reconnect screens
  were **not** click-tested live — this sandbox has no local `npx base44
  dev` backend to sign in against — verified instead by full test
  coverage, a production build, and a manual prop-by-prop cross-check
  between `App.jsx`'s `<OnboardingPanel>` call and every prop each child
  component destructures.
- **Not done:** real-device verification of the iOS Shortcut and the
  Android PWA Share Target (same category of gap as the existing G3/G8
  Chrome extension real-device items in "Known gaps"). Auth/OAuth,
  `ingest-clip`, `mobile-capture`, and Zyte were not touched.
- **Next:** owner real-device pass (iPhone Shortcut share -> saved Item;
  Android installed-PWA share -> saved Item), then a signed-in browser
  click-through of the full wizard once a backend session is available.

### 43. Owner click-through follow-ups: auth-callback URL cleanup, real onboarding walkthrough media, logout investigation

Owner ran `feat/onboarding-flow` for real via `npx base44 dev` and reported
four findings from an actual click-through:

- [x] **Build:** stray `/api/apps/auth/*` URL left in the address bar after
  OAuth login completed locally (session itself was valid). Added a mount
  effect in `src/App.jsx` that detects any `/api/*` path leaking into
  `window.location.pathname` and replaces it with `/` via
  `history.replaceState`, regardless of which auth call produced it
  (login or logout). Regression-guarded by
  `tests/auth-callback-routing.test.ts`.
- [x] **Build:** real onboarding walkthrough media, per "teach the user how
  to use Magpie, then let them use it." Rejected a coded/stylized
  illustration in favor of recording the actual product: extended the
  existing real-extension-against-real-local-backend Playwright harness
  (`tests-e2e/`, proven working — one existing spec re-run clean in this
  sandbox first as a feasibility check) with a parallel, deliberately
  separate `playwright.media.config.ts` +
  `tests-e2e/media-specs/record-desktop-capture.spec.ts` that drives one
  real page capture end to end and screenshots the real Side Panel
  (ready/capturing/captured) and the real dashboard once the Item lands.
  `scripts/encode-onboarding-gifs.mjs` (ffmpeg) turns the Side Panel
  sequence into `public/onboarding/desktop-capture.gif` (79KB) and saves
  the dashboard success frame as `public/onboarding/first-value.png`
  (117KB) — a static image, not a mismatched-aspect-ratio GIF (an
  intermediate version animating the 380x760 Side Panel frame together
  with the 1280x800 dashboard frame produced an ugly 8.8MB file; a real
  screenshot of the dashboard alone tells "it lands in your workspace"
  cleanly). `npm run record:onboarding-media` re-runs both steps. Added a
  new `LearnStep` to `src/onboarding/OnboardingWelcomeFlow.jsx`, wired
  between Project and Method (`docs/DECISIONS.md`'s "teach before setup"
  entry has the ordering rationale), showing both real images before
  asking the user to set up a capture method.
- **Investigated, not a code change:** owner reported logout redirecting to
  `app.base44.com` instead of staying on `localhost` in the same
  `npx base44 dev` session where login just worked. Traced as far as this
  repo's code can explain it: `src/api/base44Client.js`'s `appBaseUrl` is a
  single module-level value computed once per page load and used
  identically by both `loginWithProvider` and `logout()` (confirmed by
  reading the installed `@base44/sdk`'s `auth.js` — `logout(redirectUrl)`'s
  `redirectUrl` argument only becomes the `from_url` query param, not the
  navigation target host; the target host is always `options.appBaseUrl`).
  Since login's initial request demonstrably reached the local backend, the
  divergence — if reproducible — happens after that inside `npx base44
  dev`'s own local auth-route handling (most plausibly session
  cookies/logout needing to round-trip through the real platform host for
  local dev, then failing to bounce back the way the already-fixed
  production `from_url` case does), not in this repo's frontend or
  `base44/functions/*`. Not fixable by editing our source without further
  reproduction; flagged to the owner as a probable `base44 dev` CLI/local-
  tooling limitation rather than a product bug.
- **Decision, not a code change:** owner asked whether "Your first item
  landed" reappearing was a server-tracking gap. Confirmed
  `dismissOnboarding()` (`src/App.jsx`) only ever writes
  `localStorage["magpie.onboarding.dismissed"]` — no server field exists.
  Owner chose to keep this client-side (standard pattern, zero backend
  risk) rather than add server-side tracking; a fresh browser/profile/local
  session showing onboarding again is expected behavior, not a bug. See
  `docs/DECISIONS.md`.
- **Files:** `src/App.jsx`, `src/onboarding/OnboardingWelcomeFlow.jsx`,
  `src/index.css`, `playwright.media.config.ts` (new),
  `tests-e2e/media-specs/record-desktop-capture.spec.ts` (new),
  `scripts/encode-onboarding-gifs.mjs` (new),
  `public/onboarding/desktop-capture.gif`,
  `public/onboarding/first-value.png` (new binary assets),
  `tests/auth-callback-routing.test.ts`,
  `tests/onboarding-media.test.ts` (new), `package.json`.
- **Verify:** 211/211 Deno tests (3 new), all 17 `entry.ts` files
  type-check clean (no backend files touched), every `extension/**/*.js`
  parses, `rg "@base44/sdk" extension` clean, `npm run build` clean and
  confirmed `dist/onboarding/*` is present, `git diff --check` clean. The
  media-recording pipeline itself was run for real in this sandbox — a
  real local `npx base44 dev` backend, a real registered test owner, the
  real unpacked extension, and a real AI-routed capture (one run hit a
  transient local AI-Gateway-proxy step-limit and landed in
  `needs_review`; a re-run produced a clean `created_collection`, which is
  the frame actually shipped) — not a mock.
- **Not done:** the iOS/Android GIF-equivalent walkthrough content (this
  pass covered Desktop only, matching where the working recording harness
  already existed); a real-device click-through of the full onboarding
  wizard in a browser (still blocked on this sandbox having no phone and,
  for the base44.com logout question, no way to reproduce interactively).
- **Next:** owner decides whether to pursue the `npx base44 dev` logout
  divergence further (would need a fresh repro with network logs, since
  this repo's code cannot explain it further); optionally record
  matching walkthrough media for the iPhone Shortcut and Android Share
  Target methods once real-device passes exist for them.

### 44. Onboarding restructure: revisit entry point, pair-first ordering, capture-mode recordings, illustrative previews

Owner gave detailed feedback on checkpoint 43's onboarding flow after a
real click-through: no way to reopen the walkthrough once dismissed; the
Method screen's static cards were a weak substitute for showing the real
UI; the whole thing needed to be several distinct screens instead of one;
and mobile deserved better than a link to docs.

- [x] **Build (revisit + back nav):** `src/onboarding/OnboardingWelcomeFlow.jsx`
  now accepts `initialStep`/`onClose`. `src/App.jsx` adds a "How it works"
  topbar button (`isOnboardingTourOpen`) that reopens the wizard at the
  `pair` step in a modal, without touching the `dismissed` flag or forcing
  a returning user back through Welcome/Project. A `STEP_ORDER`-driven
  `BackLink` lets a user mid-wizard step backward instead of only forward.
- [x] **Build (reordered, expanded flow):** replaced the single Method
  screen with `welcome -> project -> pair -> modes -> collections -> agent
  -> sync`. `pair` is Download+Pair, moved earlier per owner direction
  (see `docs/DECISIONS.md`). `modes` shows three real recorded capture
  modes (`desktop-capture.gif`, plus two new recordings —
  `mode-element.gif` for the real content.js hover-highlight,
  `mode-snip.gif` for the real drag-selection rectangle — both recorded
  via a new `tests-e2e/media-specs/record-capture-modes.spec.ts`, driven
  the same way `capture-element.spec.ts`/`capture-visual.spec.ts` already
  do) plus the iPhone/Android/Paste-URL cards (unchanged functionality,
  moved out of the old Method screen). `collections`/`agent`/`sync` are
  new preview steps: one real screenshot (`first-value.png`, labeled
  "Real:") plus explicitly-labeled ("Example ...") illustrative content
  for a fuller workspace, an Ask Magpie conversation, and a price-change
  update — content that cannot be demonstrated for real in a one-shot
  recording. See `docs/DECISIONS.md` for the full reasoning on both the
  reordering and the mock-content approval.
- **Investigated, explicitly out of scope (tooling limitation):**
  animating the Side Panel actually being opened via a toolbar click, and
  a native right-click context menu appearing. Neither is drivable or
  screenshotable by Playwright/CDP — confirmed by the existing
  `tests-e2e/helpers/capture.ts`, which already documents and works around
  this same limitation for the regression suite. Not attempted.
- **Not done, blocked on the owner:** a one-tap iCloud Shortcut link for
  iOS (needs the Shortcuts app on a real Mac/iPhone, unavailable in this
  environment) — owner will build it once and hand back the link. See
  `docs/DECISIONS.md`.
- **Files:** `src/onboarding/OnboardingWelcomeFlow.jsx`, `src/App.jsx`,
  `src/index.css`, `tests-e2e/media-specs/record-capture-modes.spec.ts`
  (new), `scripts/encode-onboarding-gifs.mjs`,
  `public/onboarding/mode-element.gif`, `public/onboarding/mode-snip.gif`
  (new binary assets), `tests/onboarding-media.test.ts`,
  `tests/onboarding-flow-wiring.test.ts`.
- **Verify:** 213/213 Deno tests, all 17 `entry.ts` files type-check clean
  (no backend touched), every `extension/**/*.js` parses, `rg
  "@base44/sdk" extension` clean, `npm run build` clean. The two new
  capture-mode recordings were produced by a real run of
  `record-capture-modes.spec.ts` against a real local `npx base44 dev`
  backend and the real unpacked extension — not mocked. Visual layout of
  the new preview steps (Collections/Agent/Sync/Modes gallery) was sanity
  -checked by rendering the actual `src/index.css` and the real generated
  assets in a throwaway static-HTML harness via Playwright (screenshot
  reviewed directly), since this sandbox still has no way to sign in and
  drive the live authenticated wizard end to end.
- **Next:** owner sends the iCloud Shortcut link once built; a real
  signed-in browser click-through of the full 7-step wizard once a backend
  session is available to this session or the owner does it directly.

### 45. Onboarding polish: carousel for capture modes, persistent Back/Skip/Continue footer, teach-first order restored

Same-day further owner feedback on checkpoint 44's flow.

- [x] **Build:** Replaced the Modes step's static 3-column gallery with a
  single-slide carousel (`ModeCarousel` in
  `src/onboarding/OnboardingWelcomeFlow.jsx`) — one fixed-size, centered
  frame (`object-fit: contain` so the tall Side Panel recording and the
  wide page recordings render at the same box size), prev/next arrows, dot
  indicators. Replaced every step's own inline Continue/Skip/Create
  buttons with one persistent footer (`onboarding-wizard-footer`: Back ·
  Skip onboarding · Continue) that stays pinned at the bottom of the modal
  regardless of step content length — `.onboarding-wizard` is now a flex
  column with only `.onboarding-wizard-scroll` scrolling. Continue is
  step-aware (label/icon/handler keyed by the current step; the Project
  step's title input state moved up to the wizard component so Continue
  can read it and create-then-advance only when a title was actually
  typed). Reverted `STEP_ORDER` back to
  `welcome -> modes -> project -> pair -> collections -> agent -> sync`
  per the owner's explicit "first we teach, then we setup" — see
  `docs/DECISIONS.md` for why this is the second reversal on this same
  question in one session, and the note to ask rather than guess a third
  time.
- **Files:** `src/onboarding/OnboardingWelcomeFlow.jsx`, `src/index.css`,
  `tests/onboarding-media.test.ts` (rewritten to assert against the
  `STEP_ORDER` array literal directly instead of scanning render-order
  text, which produced a false positive against an unrelated `step ===
  "project"` check inside `handleContinue`).
- **Verify:** 215/215 Deno tests (3 new: carousel markup, persistent
  footer, corrected step order), `npm run build` clean. Visual layout
  (carousel centering/sizing, footer always visible under scrollable step
  content) sanity-checked the same way as checkpoint 44 — a throwaway
  static-HTML harness serving the real `src/index.css` and real generated
  assets over a local HTTP server, screenshotted via Playwright and
  reviewed directly, since this sandbox still can't sign in to drive the
  live wizard.
- **Not done:** still blocked on the owner for the iCloud Shortcut link
  (unchanged from checkpoint 44); the `npx base44 dev` logout-to-
  `app.base44.com` issue is now confirmed reproducible by the owner but
  still needs a fresh repro with network logs before it's actionable from
  this repo's code.
