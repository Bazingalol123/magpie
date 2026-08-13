# Engineering notes

## 2026-07-23 — MV3 authentication boundary

The extension service worker must not import `@base44/sdk`. The SDK persists tokens behind `window`-based storage guards, while MV3 workers have no `window` and can be terminated after roughly 30 seconds. This fails silently: the first authenticated call may work, then a later worker wake becomes anonymous.

The extension therefore stores its scoped token in `chrome.storage.local` and uses plain `fetch` to call `ingest-clip`. The backend function creates an authenticated request client, checks the caller, then performs entity writes via `asServiceRole`. The dashboard runs in a normal browser page and is the only client that uses the full SDK and realtime subscriptions.

## 2026-07-23 — Base44 conventions checked before implementation

- Backend functions live at `base44/functions/<kebab-case-name>/entry.ts` and use `Deno.serve()`.
- Backend imports use `npm:@base44/sdk`; browser imports use `@base44/sdk`.
- Service-role entity access is `base44.asServiceRole.entities.<Entity>`.
- Email/password login is `loginViaEmailPassword`; Google sign-in is `loginWithProvider`.

## 2026-07-23 — Classification must degrade safely

`classify-clip` calls the AI gateway through its OpenAI-compatible chat-completions endpoint with the `automatic` model. The response is normalized to a bounded set of safe field names. If the gateway is unavailable or returns invalid JSON, the function creates a deterministic `Saved clips` record instead of losing the capture.

## 2026-07-23 — Screenshot storage at the function boundary

The MV3 worker captures a compressed JPEG with `chrome.tabs.captureVisibleTab`. It forwards the data URL as part of the bounded ingestion payload. The backend validates the image MIME type, constructs a `File`, and persists it through the Base44 binary field so the extension never receives a storage credential.

## 2026-07-23 — CLI auth command differs from the skill reference

The installed CLI reports the signed-in user with `npx base44 whoami`. `npx base44 auth whoami` is not supported because `auth` manages application authentication settings rather than the local CLI session.

## 2026-07-23 — Browser pairing is application-specific, not a second user login

The Base44 SDK can return a login JWT for the dashboard user but cannot mint a restricted second user token for an MV3 extension. Magpie instead creates a random opaque token through an authenticated dashboard function, stores only a SHA-256 hash in `ExtensionInstall`, and resolves its owner server-side during ingestion. This preserves a separate principal without exposing dashboard credentials to the extension.

## 2026-07-24 — V2 keeps physical V1 storage during the Mission migration

The V2 product treats `Record` as a candidate and makes Mission the user-facing workspace, but it keeps `Collection`, `collection_id`, and `fields_json` as the physical V1 compatibility layer. Mission schemas are copied into the backing Collection when a candidate is first classified. Existing apartment Missions without `schema_json` use the legacy apartment schema at extraction time, while new Missions own a versioned schema directly.

Existing enum values (`classified`, `contact`, and `ignore`) remain accepted so pushing the expanded entity definitions does not invalidate deployed V1 rows. New code writes the V2 states.

## 2026-07-24 — Extension Mission context is deliberately read-minimal

The extension still cannot read records, clips, collections, or enrichments. `extension-context` authenticates the opaque pairing token and returns only active Mission IDs, titles, and template labels. The popup persists the selected Mission in `chrome.storage.local`; the service worker includes it in the plain-fetch ingestion payload, and `ingest-clip` verifies owner and active status before accepting it.

## 2026-07-24 — Local auth must use the Base44-managed Vite process

Running `npm run dev` starts only Vite and does not inject the local Base44 backend address. The frontend client must consume `VITE_BASE44_APP_ID` and `VITE_BASE44_APP_BASE_URL`, and local development must start with `npx base44 dev`. That command launches the backend and then runs the configured frontend command with both values injected.

The local backend also requires Deno. On this Windows machine Base44 initially stopped with `Deno is required to run backend functions locally`; installing Deno allowed the backend to start on port 4400. Because a stale plain-Vite process already occupied port 5173, the Base44-managed frontend selected port 5174. The verified local login endpoint redirects through Base44 with `from_url=http://localhost:5174/`.

## 2026-07-24 — Raw extension calls need local app routing metadata

The local Base44 gateway does not infer function app context from a raw extension request. For local URLs shaped `/api/apps/<app-id>/functions/<name>`, the extension now derives and sends `X-App-Id`; hosted app-domain URLs continue without it. `extension-context` accepts both POST and PUT because connection refreshes may arrive as an update request, and context reads no longer mutate `last_used_at`.

The origin visible inside a locally spawned function is its temporary worker port, not the stable Base44 gateway. The dashboard therefore constructs local pairing URLs from the Vite-injected backend URL and app ID. Picker startup also falls back to programmatic content-script injection, covering tabs that were already open when the unpacked extension was installed or reloaded.

## 2026-07-24 — Binary entity fields are not a file-upload path

The local entity API rejected a `File` assigned to `Clip.screenshot` with `422 Error in field screenshot: Unsupported field type binary`. Screenshots now use `integrations.Core.UploadFile`, with the resulting public URL stored in `screenshot_id`. Upload is best-effort so capture text and classification survive a storage outage.

After a local resource reload, the gateway also stopped translating `X-App-Id` into the `Base44-App-Id` header required by `createClientFromRequest`. Raw extension requests now send both names, and CORS explicitly permits both. Changing an entity schema clears Base44's local development data, so local pairings must be recreated after such a reload.

## 2026-07-24 — Enrichment failures are product state, not field changes

The V1 refresher treated every successful HTML response as trustworthy and overwrote candidate `title` from the document `<title>`. This produced plausible but unrelated changes when a source redirected, served a challenge, or used a generic page title. V2 enrichment never updates title from page metadata. It classifies blocked, missing, throttled, unreachable, invalid, unsupported, and suspicious sources into persisted Record states; only trusted price/rent/value and availability changes can mutate `fields_json` or create Enrichment rows. Retryable watch failures use bounded exponential backoff.

## 2026-07-24 — V3 Phase 0 audit supersedes fallback Collection creation

The earlier deterministic `Saved clips` fallback remains an accurate description of the current V2-shaped implementation, but it is not valid V3 behavior. The product charter makes uncertainty a product state, so AI outage, malformed output, ambiguous candidates, mixed content, and unsafe schemas must route to review without creating a Collection or Record.

The audit also found that the current classifier silently selects the latest active Mission when no Mission hint is supplied, generates `Mission · <title>` Collections, matches Collections only by lowercased name, and can create another Record when `classify-clip` is retried. These are explicit migration targets, not accepted V3 compatibility behavior.

Phase 1 is therefore a pure routing gate. It must prove owner/scope eligibility, Mission-versus-global precedence, name/schema equivalence, bounded reason codes, and review outcomes before any routing entity or production function is edited. Persistence-level duplicate retries belong to Phase 2, where one Clip must resolve to exactly one RoutingDecision and at most one Record.

The audit confirmed that the MV3 boundary is already correct and must not move during V3: the extension worker still has no SDK import, uses its owner-bound pairing token through plain `fetch`, and cannot read Collections or Records.

## 2026-07-24 — Phase 1 routing fixtures and missing Deno binary

The pure V3 routing engine now validates existing/new/review proposals without entity access. Seventeen fixtures cover clear existing and new routes, ambiguity, malformed output, cross-owner and cross-Mission IDs, synonym aliases, schema equivalence, Mission/global precedence, mixed content, unsafe fallback names, low confidence, weak field support, and AI outage. Review results deliberately contain no Collection ID or extracted fields.

The current shell could not find `deno`, including the usual user, AppData, Program Files, and workspace locations, despite the earlier local-development session having installed it. To keep the gate checkable without downloading tools, the tests ran under Node 22's TypeScript stripping with a minimal in-memory `Deno.test` compatibility harness; all 17 passed. The installed esbuild also bundled both `routing.ts` and the refactored `classification.ts`, and the Vite production build passed. Native Deno execution remains a pre-hardening check rather than an assumed success.

Later the same day, Deno 2.9.4 was restored with the official Windows installer to `C:\Users\omerk\.deno\bin\deno.exe`. Native `deno test tests/routing.test.ts` passed all 17 routing fixtures, and `npx base44 dev` then started the backend on port 4400 and its managed Vite frontend on port 5173.

## 2026-07-24 — Collection origin cannot reuse Base44's `created_by`

The V3 draft called the agent/user provenance field `Collection.created_by`, but Base44 already provides `created_by` as a built-in row attribute for creator identity. The V3 field is now `origin` with `agent`, `user`, and `legacy` values. `schema_signature` is also persisted explicitly because safe Collection reuse needs a deterministic signature without reparsing every candidate schema during lookup.

## 2026-07-24 — Phase 2 stores the contract but does not activate it

The original V3 phase wording called the entity-only step “add routing persistence” and then asked it to prove retry idempotency, even though none of the listed files executed writes. The phase is now explicit: Phase 2 defines additive storage and generates types; Phase 3 activates the server workflow and owns the exactly-one-decision/record retry proofs.

`RoutingDecision` allows owner-scoped reads but restricts create, update, and delete to the server/admin path so dashboard corrections cannot rewrite audit history through direct entity calls. The Collection and Clip changes are additive for V2 compatibility. The schemas were parsed and types generated locally without starting the Base44 backend, pushing entities, or deploying, which also avoids the known local-data reset during this documentation and fixture pass.

## 2026-07-24 — V3.1 folders are navigation, not routing

The V3.1 product request reintroduced nested folders, which directly conflicted with the product charter and V3 decision record. The bounded design allows only Folder → Subfolder → Collection, with two visible folder levels. Folder membership is optional and excluded from Mission scope, normalized routing keys, schema signatures, AI prompts, correction memory, and extension context.

This keeps the auto-organization promise intact: users clip first and may tidy Collections later. A separate Folder entity plus optional `Collection.folder_id` is safer than adding recursive parent fields to every product entity. Folder writes require backend validation because RLS cannot by itself prevent cycles, excessive depth, duplicate sibling names, or cross-owner parent references.

User-facing terminology will improve without renaming Base44 resources. Project, Item, and Capture are presentation labels for Mission, Record, and Clip; retaining backend names avoids a destructive migration immediately before competition hardening.

## 2026-07-24 — V3 routing is active locally, but concurrency is still a gate

The production function source now routes before it extracts or writes a Record. Unscoped captures remain global; the newest active Mission is never selected implicitly. AI outage, malformed output, ambiguity, and unsafe proposals create one review decision and no Collection or Record. Sequential retries reuse an existing RoutingDecision/Record, and a partial Record write can reconstruct its missing decision.

Seven persistence fixtures bring the routing total to 24 and the full Deno suite to 33 passing tests. Modified backend functions pass `deno check`, extension scripts pass syntax checks, the MV3 directory still has no SDK import, and the Vite production build passes.

Base44 entity definitions currently expose no declared unique constraint or transaction/CAS primitive for `RoutingDecision.clip_id` or the scoped Collection key. The workflow re-reads before creation and is safe for ordinary retries, but truly simultaneous duplicate requests still need a live integration proof or server-side serialization before we claim hard exactly-once behavior. No resources were pushed and nothing was deployed.

## 2026-07-24 — V3.1 starts with presentation-only Library and Project navigation

The first UI slice changes no backend resource name or permission. The dashboard now opens to the global Library instead of silently focusing the newest Mission, displays Mission as Project and Record/Candidate as Item, and keeps the underlying SDK/entity calls unchanged. The extension likewise defaults to Auto-organize with optional Project context. Nested folders remain blocked behind their separate backend validation and risk gate.

## 2026-07-25 — English plural validation blocked a valid Hebrew camera route

A live local capture of a Hebrew camera page entered review even with an explicit Camera Project. The routing safety gate required every new Collection name to end in the English letter `s`, so a valid Hebrew proposal such as `מצלמות` could never create a Collection. Formatted numeric values were also dropped when the model returned a visible price such as `8,499 ₪` as a string while the schema required a number.

The name guard now applies the English plural-suffix heuristic only to Latin-only names; safe non-Latin names retain the same length, character, fallback-name, URL, and Mission-prefix protections. Numeric normalization removes bidirectional marks and currency/grouping formatting before validating a finite number. Two pure regressions and one durable persistence fixture cover the Hebrew camera route.

Ingestion now returns the allowlisted `routing_reason_code` alongside status, and the extension maps review reasons to user-safe explanations. It still receives no Collection, Record, raw routing proposal, or owner data. Extension version `0.1.3` preserves the MV3 plain-fetch trust boundary. At that checkpoint the full suite passed 36/36 tests, modified Deno modules type-checked, extension scripts parsed, and the production frontend build passed. Nothing was deployed.

Follow-up live testing returned `unsupported_schema`. The router was incorrectly treating the model's self-reported structural reason as authoritative before validating the proposal itself, and it rejected the complete schema when otherwise safe fields used common aliases such as `currency`, `integer`, `text`, `url`, or `date`. Model reason codes are now limited to semantic observations (`mixed_content`, `ambiguous_candidates`, and non-blocking match/scope hints); owner, scope, name, schema, field-support, and confidence decisions are server-owned. Safe type aliases normalize to string/number/boolean, while genuinely nested or unknown shapes return the more precise `invalid_schema`; unsafe names return `unsafe_collection_name`. Extension version `0.1.4` explains both states without exposing data. Three additional regressions bring the full local suite to 39/39 passing tests.

Live follow-up then showed `invalid_schema` together with the correct non-blocking `no_equivalent_collection`. The remaining problem was all-or-nothing schema normalization: one nested camera `specifications` field poisoned otherwise safe `title` and `price` fields. Normalization now drops individual invalid/unsupported fields and creates a Collection whenever two safe canonical fields remain; only proposals with fewer than two surviving fields enter review. RoutingDecision also persists bounded proposed name/schema metadata, excluding extracted values, so future review outcomes can be diagnosed without raw capture leakage. The full suite passes 40/40 tests, and the updated `ingest-clip` and `classify-clip` functions were deployed successfully after explicit approval.

## 2026-07-25 — Systemic hosted triage replaced the ambiguous AI contract

Repeated hosted review outcomes proved the problem was not Hebrew, pluralization, or one unsupported field. The latest camera decision had confidence `0.95`, proposed `מצלמות`, found no equivalent Collection, but stored no schema and created no Record. The associated Clip contained enough evidence (`Nikon D500`, body-only, DSLR/reflex, Nikon, official importer), while its `mission_id` was null because the extension's optional Project was not explicitly selected.

Replaying that exact capture through the Base44 AI gateway exposed the contract failure: the model returned `schema: "camera_inventory"` and placed field definitions inside `fields`, with no extracted-value object. The prompt overloaded “schema” and “fields”; deterministic validation was correctly rejecting a malformed proposal, but the application contract made malformed output likely.

The classifier now requests Base44's supported `json_schema` response format with distinct `schema_fields` and `record_fields`. `schema_fields` always describes reusable columns; `record_fields` always carries visible values as strings. A compatibility adapter still accepts the canonical legacy array/object shape and common JSON Schema objects, while the observed swapped response remains review rather than polluting data. A live diagnostic gateway call using the exact camera text produced `model=Nikon D500` and `camera_type=DSLR` under the new contract, which the routing engine validates as a new Cameras Collection.

The same triage found a separate hosted ingest error: 50 KB HTML fragments can exceed Base44's entity string limit. Extension and server now bound structural HTML evidence to 12 KB while preserving raw text and screenshot evidence. Extension version `0.1.5` contains that capture-side bound. Four classifier-contract fixtures plus the HTML-bound regression bring the full suite to 45/45 passing; Deno checks, extension syntax checks, the Vite build, and the MV3 SDK boundary all pass. This recalculated fix is local and is not deployed without a new explicit approval.

## 2026-07-25 — First V3 routing deployment

After explicit owner approval, the verified source was deployed to the linked Base44 app. The release included eight entities, seven backend functions, public visibility, and the production site bundle. Base44 reported every function deployed successfully and published `https://magpieorelse.base44.app`; a post-deployment HTTP smoke check returned `200 OK`. Immediately before deployment, 39/39 Deno tests passed, the Vite production build passed, and the extension MV3 SDK-import check was clean.

## 2026-07-25 — V3.1 capture modes keep URLs passive and images explicit

The multi-mode audit found that link convenience and visual understanding are separate backend risks. V3.1 now supports element, selection, page, link, visual, and image evidence through one Clip contract, but it deliberately does not retrieve arbitrary submitted URLs server-side. Link captures store the target as `source_url`, retain the containing page as optional `context_url`, and submit only browser-observed label/context. This avoids adding SSRF and untrusted crawling behavior to ingestion.

Visual and right-click image modes capture actual visible pixels. The MV3 worker crops the visible-tab screenshot to the browser-provided element rectangle, uploads it through the existing backend file boundary, and the routing request includes the uploaded image only for `visual` or `image` modes. Element screenshots remain stored evidence but are not sent to the model, bounding model cost and unnecessary image disclosure.

`Clip.capture_mode` and `Clip.context_url` are additive, and missing mode defaults to `element` for deployed-row compatibility. The Base44 CLI was also added as a local dev dependency, matching the skill requirement and making type generation reproducible. Generated types contain both fields. The full Deno suite passes 50/50, modified backend entry points pass `deno check`, extension scripts parse, the Vite build passes, and the extension directory contains no SDK import. Chrome interaction, real crop dimensions, and live multimodal gateway behavior remain manual/integration gates. Nothing was pushed or deployed.

## 2026-07-25 — V3.1 capture backend deployment

After explicit approval, the Base44 CLI synchronized the existing eight-entity definition set; Base44 reported each definition updated, with the intentional additive product delta on `Clip.capture_mode` and `Clip.context_url`. The release then deployed only `classify-clip` and `ingest-clip`, leaving the hosted site and the other five functions untouched.

Immediately before the remote mutation, 50/50 Deno tests passed, both backend entry points passed `deno check`, extension scripts parsed, the production frontend built, and the MV3 SDK-import check was clean. Post-deployment checks against `https://magpieorelse.base44.app` returned `200` for the app, `204` for ingestion CORS preflight, and `401` for an unauthenticated ingestion attempt, confirming reachability and the write boundary. A paired Chrome capture is still required to verify real crop geometry and hosted multimodal model behavior.

## 2026-07-25 — Auto-organize needs semantic Project assignment, not “latest”

Hosted triage proved the current Collection router behaves as implemented: when the
extension sends no `mission_id`, persistence considers only global Collections and
creates a global Record/Collection. The dashboard's selected Project is a separate
browser surface and does not propagate to the extension. The removed V2 shortcut that
picked the latest active Mission would hide this gap but would misfile unrelated
captures.

The recalculated V3.1 contract permits one semantic Project assignment inside the
backend organization decision. It is rated Critical (L=4, I=4) because a false match
changes durable scope. The control is a bounded AI Gateway code-agent loop with
read-only tools over preloaded owner-scoped Projects/Collections and a finish tool
that returns a proposal only. Explicit Project context wins; automatic assignment
requires confidence `>= 0.90` and a lead `>= 0.15`; no match stays global; ambiguity
enters review. Deterministic code performs every write.

This needs no managed `base44/agents` resource, no external API key, and no extension
permission change. Entity audit fields are additive. Deployment remains separately
gated.

The local implementation retains the pre-agent structured classifier as a rollback
provider. The active provider requires `list_projects` and `list_collections` results
from a prior model step before accepting `submit_route_proposal`; calling reads and
submit in one batch is rejected so the model cannot pretend it saw tool output. The
loop rejects more than six tool calls in one step and stops after four metered steps.

Eight pure Project fixtures, four agent-loop fixtures, and two Project persistence
fixtures bring the full Deno suite to 64/64 passing. The camera persistence fixture
proves `mission_id` is stamped on Collection, Record, Clip, and RoutingDecision, while
the ambiguity fixture proves no Collection or Record is created. Both routing entry
points pass `deno check`, generated types include the additive audit fields, the Vite
build and extension syntax checks pass, and the MV3 SDK-import check remains clean.
Nothing was pushed or deployed.

After explicit approval later that day, Base44 synchronized all eight local entity
definitions (the CLI cannot target only RoutingDecision) and deployed only
`classify-clip` and `ingest-clip`. The hosted site and extension were not redeployed.
Smoke checks returned `200` for the app, `204` for ingestion preflight, and `401` for
an unauthenticated ingestion POST. A paired Auto-organize camera capture is the
remaining semantic Project-assignment verification.

## 2026-07-25 — Configured Agent is a product interface, not the capture router

The Base44 AI Gateway code agent and a configured Base44 Agent solve different
problems. The code agent runs inside capture processing, sees preloaded bounded
owner context, submits a route proposal, and cannot converse with the user. The
configured `magpie_organizer` Agent is an authenticated dashboard conversation that
helps users understand, compare, review, and monitor already captured information.

The first configured-Agent contract deliberately exposes no direct entity tools.
Four backend functions authenticate the dashboard user, re-check every referenced
owner through the service role, bound all returned data, and own the only mutation:
WatchRule configuration. Agent memory is explicitly disabled because Projects,
Collections, Records, RoutingDecisions, WatchRules, and conversation history are the
auditable sources of truth. This keeps the Agent broad across domains without making
its authority broad.

`npx base44 agents push` synchronizes the complete local Agent directory and may
delete remote Agents absent locally. Therefore local configuration and validation do
not authorize an Agent push. Function deployment, Agent synchronization, and site
deployment remain separate explicit approval gates.

The local slice now includes four owner-validating function entry points, shared
bounded-output and WatchRule helpers, a `magpie_organizer` configuration, and an
authenticated dashboard panel using `createConversation`, `addMessage`, and
`subscribeToConversation`. Sequential retries of the same create-watch request reuse
the existing owner/Record watch instead of creating a second row. The complete Deno
suite passes 72/72, all eleven backend entry points type-check, the production
frontend builds, extension scripts parse, and no extension file imports
`@base44/sdk`. No remote resource was changed.

## 2026-07-25 — Configured Agent deployment and hosted auth failure state

After explicit approval, Base44 deployed only the four new Agent tool functions,
created the single local `magpie_organizer` Agent through the documented full-sync
operation, and deployed the verified dashboard bundle. The Agent synchronization
reported no deletions. Entities and extension files were not part of this release.

The first unauthenticated hosted probes exposed a failure-map mismatch:
`base44.auth.me()` throws `Base44Error: Authentication required to view users` rather
than returning null. The shared `requireUser` helper allowed that exception to reach
the generic handler, producing a safe but incorrect `500`. It now converts only
authentication-shaped SDK errors into `HttpError(401)` and rethrows unrelated SDK
failures. Four focused auth fixtures raise the full suite to 76/76.

After redeploying the four functions, the hosted app returned `200` and each Agent
tool returned `{"error":"Authentication is required"}` with status `401` for an
unauthenticated POST. Hosted OPTIONS requests were accepted by the Base44 gateway
with `200`. The remaining release check is a signed-in dashboard conversation that
causes the Agent to call one read tool and receive owner-scoped context.

## 2026-07-25 — Claude Code handoff reconciles the documentation surface

The repository-level `CLAUDE.md` and public README still described the original
V1 apartment-only brief even though the authoritative Product Charter, deployed
runtime, and later engineering notes described broad V3.1 automatic
organization and the configured Agent. This was a handoff hazard: a new coding
agent could correctly follow the nearest instructions and still regress product
scope.

`CLAUDE.md` now points to the Product Charter and a dated
`docs/CLAUDE_CODE_HANDOFF.md`. The handoff records the deployed resources,
release evidence, immediate signed-in Agent check, known gaps, safe work order,
PowerShell verification commands, Deno path quirk, full Agent-sync warning, and
MV3 boundary. The visible README and new `docs/README.md` now describe the
current broad product and documentation authority. The historical V1 README
body remains hidden temporarily in an HTML comment so no historical content was
destroyed during the handoff.

## 2026-07-25 — Signed-in Agent verification and the `resolve-routing` release

The pending signed-in Agent check was completed without a browser by piping a
script to `base44 exec`, which runs server-side with the SDK authenticated as
the current user — the same principal and code path as the dashboard. The
conversation exercised all four tools with grounded results, an ambiguity
clarification instead of a guess, and an idempotent watch retry verified
directly against the WatchRule entity (exactly one row).

Two platform findings from this session:

1. **Hosted `entity.get()` throws on a missing ID.** The hosted service-role
   SDK raises `Base44Error: Entity <name> with ID <id> not found` instead of
   returning null, so any `if (!row) throw new HttpError(404, ...)` guard is
   dead code in production and the error escapes as a `500`. The local fake
   services return null, so pure fixtures cannot catch this by default.
   `routing-resolution.ts` now wraps `get()` with a `getOrNull` helper and a
   fixture simulates the throwing behavior. Other deployed functions
   (`classify-clip`, the `agent-*` tools via `requireOwned`) share this latent
   pattern for their `404` paths and should be swept in a follow-up.
2. **`base44 logs --env prod` returns nothing for this app.** All real function
   traffic, including production dashboard calls, appears only under the
   default `--env preview`. Use `--env preview` when checking logs here.

The extension toast path had a latent inconsistency: context-menu captures
bypassed the reason-code messaging that picker captures already had. Both paths
now share one `describeCaptureResult` mapping, and toasts carry a
`?review=<clip_id>` dashboard deep link built from the already-stored ingest
URL origin — no new data crosses the extension boundary.

## 2026-07-25 — Ten-gap release findings

The blocked-watch defect was worse than "no auto-pause": because `blocked` is
non-retryable, the sweep passed a zero failure count to the backoff calculator,
so a login-walled source was re-checked at full cadence forever — non-retryable
outcomes received *less* backoff than retryable ones. The fix pairs a pure
`shouldAutoPauseWatch` helper (threshold 3) with an `active: false` +
`AUTO_PAUSED_BLOCKED` update in the sweep.

Deletion needed a server function for RLS reasons: owners may delete Record,
Clip, and WatchRule rows directly, but Enrichment and RoutingDecision deletes
are admin-only, and orphaned Enrichment rows would keep rendering in the
dashboard Activity panel. `removeRecord` validates every row's owner before
the first delete and removes the Record last, so a retry that cannot find the
anchor row reads as already done. The dashboard treats a `404` from
`delete-record` or a dismiss retry as success.

The Agent chat rendered markdown tables as plain text; `react-markdown` +
`remark-gfm` (~48KB gzip) now renders assistant messages only — user messages
stay plain text, and tables scroll horizontally inside the bubble.

## 2026-07-25 — getOrNull sweep and live happy-path verification

Every remaining bare `entity.get()` on a possibly-missing ID was converted to
the `getOrNull` pattern, now housed in `base44/shared/service-entities.ts`:
`classify-clip`, `ingest-clip` (unknown extension `mission_id` now returns the
documented `409` instead of `500`), `enrich-record`/`enrichment-v2`, all four
`agent-*` functions, `configureWatch`, and all five sites in
`routing-persistence.ts`. One deliberate improvement: the workspace summary now
skips a Record whose Collection was deleted instead of failing the whole
overview. Two fixtures pin the throwing-get behavior in `processStoredClip`
and `configureWatch`; the suite is 104/104.

After deployment, a synthetic live happy-path run (admin-created throwaway
rows, all removed by the test itself) verified in production: dismiss deletes
the capture and decision with a `404`-as-done retry, and `delete-record`
returned exact cascade counts (1 watch, 1 decision, 1 clip, 1 record) with an
idempotent `404` retry. Zero synthetic rows remained.

## 2026-07-25 — Layout-independent shortcuts and the snip tool

The picker's press-C instruction silently failed on non-English keyboard
layouts: `event.key` is layout-dependent, so the physical C key produces "ב"
under a Hebrew layout and the comparison never matched. Shortcut checks now use
`event.code` ("KeyC"/"KeyM"), which identifies the physical key on any layout.

Visual capture is now a real snipping tool: a dimmed overlay with a
drag-to-select rectangle replaces the hover-an-element crop. The selection
tears down and the page repaints (two animation frames plus a short delay)
before the worker screenshots, so the overlay never contaminates the crop.
Text evidence is sampled from a 3×3 grid of points inside the rectangle. No
backend change was needed — the deployed `visual` mode already accepts a
`capture_rect` with a cropped screenshot and routes it multimodally.

## 2026-07-26 — RLS admin bypass caused a live cross-owner data leak

A user report ("I can see my friend's data and he can see mine") traced to
one root cause: every owner-scoped entity's RLS included
`{"user_condition": {"role": "admin"}}` as an `$or` alternative to the
`data.owner_id` check on `read`, and on `update`/`delete` for `Clip`,
`Record`, `Collection`, `Mission`, and `WatchRule`. Base44 assigns
`role: "admin"` to the app creator by default, so the project owner's own
account could — and, verified live, did — read another signed-up user's
Clips through an ordinary unfiltered `Clip.list()` call from the dashboard
SDK. `shared/auth.ts`'s `canAccessOwner()` carried the identical bypass,
extending it to `classify-clip` and `enrich-record`.

The reported reverse direction (a plain `role: "user"` account seeing the
admin's data) has no matching code path: RLS and every backend
ownership check (`requireOwned` in `delete-record`, `resolve-routing`, the
agent tools) only ever add rows for an admin caller — they never remove the
strict owner check for a non-admin caller. The likely explanation is a
shared browser/session during joint testing, not a second bug; see
`docs/DECISIONS.md` for why this was not pursued as a separate fix.

The fix removes the bypass outright rather than narrowing it to an
admin-audit path, since nothing in the shipped frontend or backend
functions depended on it (`requireOwned`/strict `owner_id` checks were
already the pattern everywhere except the two functions using
`canAccessOwner`). `create` stays admin-(service-role-)only on every entity,
unchanged — all writes already go through `asServiceRole` in backend
functions, never a direct client create. `Enrichment`, `RoutingDecision`,
and `ExtensionInstall` — entities the dashboard only ever reads, never
writes, directly — now set client `update`/`delete` to `false` outright
rather than admin-only, since only the service role should ever mutate them.

Live verification after deploy: an unfiltered `Clip.list()` call from the
admin account, which previously returned 13 of its own Clips mixed with 6
belonging to another owner, now returns only its own 13.

## 2026-07-26 — Owner Collection/Project deletion (Build Guide 29.10)

Extended `delete-record`'s full-delete cascade to Collections and Projects
(Missions) on branch `feature/cascade-delete`, local only. The per-record
cascade (watches → enrichments → decision → clip → record) was extracted out
of `base44/shared/record-removal.ts` into a reusable `cascadeRecord`, so
`delete-collection` and `delete-mission` reuse the exact same primitive
instead of a second implementation. A new `listAllOwned` pagination helper
(`base44/shared/service-entities.ts`) pages through `entity.filter(query,
sort, limit, skip)` so a Collection or Project with more rows than one page
still gets a complete cascade, and fails loud (a plain thrown `Error`, mapped
by `errorResponse` to a generic `500`) rather than silently truncating a
destructive delete past a 2000-row bound.

Real local gate results:

- `deno test --allow-env --allow-read tests`: 123 passed, 0 failed (was 102
  before this work; +21 from `tests/collection-removal.test.ts` (6),
  `tests/mission-removal.test.ts` (6), and `tests/service-entities.test.ts`
  (4), plus the existing `record-removal.test.ts` suite (7) still green
  unmodified after the `cascadeRecord` extraction — confirming the refactor
  was behavior-preserving).
- `deno check` passed on all 16 `base44/functions/*/entry.ts` files, including
  the two new ones.
- `rg -n "@base44/sdk" extension`: no matches, unaffected by this change.
- `npm run build`: passed (Vite production build, pre-existing >500kB chunk
  warning unrelated to this change).
- `npx base44 dev`: local backend booted and logged `delete-collection` and
  `delete-mission` alongside the other 14 functions with no load errors;
  frontend Vite dev server started cleanly. This confirms the new functions
  parse and register locally, but is not a substitute for exercising them.

The one remaining item from the plan is a real manual browser pass (sign in,
delete a Collection with Items, delete a Project with Collections, confirm a
hint-only `needs_review` capture survives) — deferred by the owner for now
rather than performed in this session, since it requires an interactive
Google login this agent cannot complete.

Deployed with owner approval: `delete-collection`/`delete-mission` via a
targeted `functions deploy`, and the site via `npx base44 site deploy -y`.
Live smoke checks passed (`401` unauthenticated on both functions, `200` on
the site). No entities or Agents changed or were pushed.

## 2026-07-26 — Realtime reload burst caused live Base44 429s

Live use immediately after the above deploy surfaced Base44 `429` responses.
`npx base44 logs --level error` (and unfiltered) returned no matches, which
ruled out `delete-collection`/`delete-mission` themselves — the 429s were
happening at the platform API layer, not inside our functions.

The actual cause was in `src/App.jsx`'s dashboard-loading effect: 6 realtime
subscriptions (`Collection`, `Record`, `Clip`, `Enrichment`,
`RoutingDecision`, `WatchRule`) each independently called the full
7-query `loadDashboard()` on every row change, with no debouncing. This was
already fragile — even one `delete-record` cascade (~5 row deletes) could
fire several redundant full reloads — but it was never acute enough to hit a
rate limit before. A `delete-collection`/`delete-mission` cascade over a
Collection or Project with real data can delete dozens of rows across those
same 5 entity types in quick succession, so if Base44's realtime layer emits
one change event per row, that is dozens of subscription callbacks each
firing a 7-call reload: a burst of potentially hundreds of near-simultaneous
list requests, comfortably past Base44's rate limiter.

Fixed by debouncing the realtime callback (400ms trailing debounce, single
shared timer across all 6 subscriptions) so a burst of row changes during a
cascade collapses into one reload instead of one per row. Explicit
`loadDashboard()` calls after an owner's own action (delete, resolve, toggle
watch, etc.) are unaffected — they still call `loadDashboard` directly and
immediately, since those need to resolve before updating local selection
state. Site-only change (`src/App.jsx`), no entity or function impact;
`npm run build` passed and it was deployed via `npx base44 site deploy -y`,
smoke-checked `200`.

## 2026-08-13 — CI pins Deno 2.9.4 with no lockfile to anchor it

The repo has never had a `deno.json`/`deno.lock` — the only record of which
Deno version this project actually runs on is prose in this file and in
`docs/BUILD_GUIDE.md` ("Deno 2.9.4 was restored with the official Windows
installer"). GitHub Actions' `denoland/setup-deno@v2` needs an explicit
`deno-version` input, so `.github/workflows/ci.yml` and
`deploy-base44.yml` both hardcode `"2.9.4"` to match local dev rather than
floating on `2.x`, so a Deno minor release can't silently change CI behavior
out from under a still-unpinned local install. If a `deno.json` is ever
added, switch the workflow to read the version from it instead of
duplicating the string in three places.

Also worth knowing: `base44/.app.jsonc` (the Base44 app id) and the
`.agents/skills/` docs are both gitignored and therefore invisible to any
GitHub Actions checkout. The Base44 CLI resolves the app id from a
`BASE44_APP_ID` env var before it looks at that local file, which is what
lets `deploy-base44.yml` work from a plain `actions/checkout` without ever
committing the id — see `docs/DECISIONS.md` for why the deploy workflow
still requires a manual approval click rather than running unattended.

## 2026-08-14 — every capture path but `link` mode used the page URL, not the target's URL

Only the context-menu `link` capture mode (`extension/content.js`,
`buildContextPayload`'s `link` branch) ever resolved a specific link out of
the DOM (`lastContextTarget.closest("a[href]")`). Every other capture path —
picker/`captureElement`, the visual snip flow, and the `selection`/`image`
context-menu modes — used `window.location.href` unconditionally. That's
correct for whole-page or free-text captures, but wrong for
`captureElement`, since a user picking one element out of many (list cards,
grids) usually means the element itself has its own destination. Fixed by
adding `resolveDetailUrl()` and using it in `captureElement` only (Build
Guide 29.13) — the other paths weren't part of the reported bug and changing
them risks altering intentional whole-page-capture behavior.

## 2026-08-14 — a schema field can be committed and coded against before it exists on the hosted entity

Adding `canonical_url` to `base44/entities/clip.jsonc`/`record.jsonc` (Build
Guide 29.14) is a local file edit only — Base44 doesn't see it until
`npx base44 entities push` runs, which needs explicit owner approval per
`CLAUDE.md`. Until that push happens, `base44.asServiceRole.entities.Clip.create({..., canonical_url: ...})`
in `ingest-clip` just writes a field the hosted schema doesn't declare (Base44
appears to accept and store undeclared properties rather than rejecting the
write — worth confirming explicitly during the next `entities push` cycle
rather than assuming), and every read of `record.canonical_url` on existing
rows is `undefined`. `refresh-capture`'s canonical-then-fallback lookup
(29.14) was written specifically so this half-deployed state degrades to the
old exact-`source_url` behavior instead of breaking.
