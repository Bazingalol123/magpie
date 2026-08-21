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

## 2026-08-14 — a field that isn't part of RoutingResult still has to reach the Clip

`summary` (Build Guide 29.15) doesn't fit the existing `RoutingResult` type
(`base44/shared/routing.ts`) — that type exists to carry a *routing decision*
(existing/new/review, confidence, schema, fields) through `routeCapture`'s
deterministic validation, and threading an unrelated display field through
every branch of that validator (and its `ExistingRoutingResult`/
`NewRoutingResult`/`ReviewRoutingResult` variants) would have meant touching
code whose whole job is routing correctness for a feature that has nothing to
do with routing. Reading `summary` directly off the raw AI `proposal` object
in `processStoredClip`, before it's handed to `routeCapture`, and writing it
to `Clip` in one isolated try/catch kept the two concerns separate: routing
outcome is unaffected by whether the summary write succeeds, and a summary
exists (or doesn't) independently of whether the outcome was existing, new,
or review.

## 2026-08-14 — `new URL(undefined, base)` doesn't throw, it produces `"<origin>/undefined"`

Caught during manual Playwright testing of Build Guide 29.13 (B4):
`resolveDetailUrl`'s no-anchor-found path called `safeHttpUrl(anchor?.href)`,
and when `anchor` is `null`, `anchor?.href` is `undefined` — not a missing
argument. `new URL(undefined, "https://example.com/")` coerces `undefined` to
the string `"undefined"` via `ToString` and happily resolves it as a relative
path, returning `https://example.com/undefined` instead of throwing. Because
`safeHttpUrl` only returns `""` on a thrown exception, this bogus URL came
back as a truthy string and defeated the `|| window.location.href` fallback.
A real capture on books.toscrape.com reproduced it exactly. General lesson
for this codebase: `foo?.bar` passed into any `new URL(value, base)` call
needs an explicit null check first — optional chaining's `undefined` is not
the same as "no value" as far as the URL constructor is concerned.

## 2026-08-14 — a tool-calling `required` array is advisory, not enforced, without `strict: true`

Build Guide 29.15 (B1) added `summary` to `submit_route_proposal`'s
`required` array expecting the model to always include it, the same way
`ROUTING_RESPONSE_FORMAT`'s `required` array (used by the old
`response_format`-based rollback path) does. It didn't work: live testing
after deploying showed `Clip.summary` completely absent from captured
records — not even an empty string, the key was never written at all,
because `boundedSummary(proposal.summary)` was reading `undefined`. Root
cause: `ROUTING_RESPONSE_FORMAT.json_schema` has `strict: true` at the
top level, but the actual live path (`requestAgentRoutingProposal`, tool
calling via `ROUTING_AGENT_TOOLS`) never set `strict: true` on the
`submit_route_proposal` function definition itself — so its `required` list
was descriptive only, and the model skipped `summary` despite the system
prompt asking for it. Fixed by adding `strict: true` alongside
`description` on the tool's `function` object (the same
`additionalProperties: false` + `type: [x, "null"]` nullable pattern already
used elsewhere in this schema is what strict mode requires, and was already
in place). Confirmed via the actual entity data after redeploy: `summary` now
populates with real, sensible content. Lesson: OpenAI-compatible **tool**
schemas need their own `strict: true` — it does not inherit from a
`response_format` used elsewhere in the same file, and a field merely being
listed in `required` proves nothing without it.

## 2026-08-14 — `workflow_dispatch` builds whatever `--ref` you give it, not `main`

First real use of `deploy-base44.yml`'s `site` target (Build Guide 29.15,
via `gh workflow run "Deploy to Base44" --ref <branch> -f target=site`)
mis-fired once: dispatched with `--ref main` out of habit, which silently
would have built and deployed the *old* site bundle, since the frontend fix
lived on `fix/p0-bugfix-pass` and hadn't been merged — `workflow_dispatch`
checks out whatever ref you tell it to, not the default branch, and the
`verify`/`deploy` jobs have no way to know that isn't what you meant. Caught
before approval (the `production-deploy` environment gate held it), cancelled,
re-dispatched with `--ref fix/p0-bugfix-pass`. Confirmed working end to end:
release gates passed against the feature branch, the environment approval
gate held the `deploy` job until a manual click, and the deployed site was
owner-verified live afterward. Lesson for next time: when deploying via this
workflow from a branch that hasn't merged to `main`, double check `--ref`
before dispatching, and before approving in the GitHub UI.

## 2026-08-14 — B9: the sidebar Collection dot color was positional, not identity-based

Investigating "Collection dot color is inconsistent between the Library view
and a single Collection's detail view" (`BUGS.local.md` B9) found two
separate issues, not one:

1. The sidebar's dot (`CollectionSidebar`, `src/App.jsx`) picked a color with
   `dot-${index % 4}` — the collection's position in whichever (possibly
   filtered-by-Project) array was being rendered, not anything tied to the
   collection itself. The same Collection could render a different dot color
   after a Project switch or a reorder, since its index shifts.
2. The detail view's panel header (`RecordTable`) never rendered a
   per-collection color at all. Its `CircleDot` icon next to "live
   collection" is the same static green used by the topbar/footer "live"
   indicators elsewhere in the app — an app-wide sync-status color, not a
   per-collection identifier, despite sitting next to the collection name in
   a way that reads like one.

Fix: added `collectionDotIndex(collectionId)`, a small string hash of the
collection's own `id` mod 4, and used it in both the sidebar dot and a new
dot added next to the collection name in the detail panel header. The
"live collection" eyebrow's green `CircleDot` was left untouched — it's
correctly consistent with the app's other live-status indicators and isn't
what B9 was actually describing once the two dots were traced to different
code paths.

## 2026-08-14 — B10: LinkedIn link added to the dashboard footer

`BUGS.local.md` B10 asked for a "Follow on LinkedIn" CTA in the dashboard,
distinct from the one already on the landing page footer (a separate,
already-shipped PR). Added the same `linkedin.com/company/magpie-or-else`
link to `workspace-footer` in `src/App.jsx`, styled to match the existing
footer text.

## 2026-08-14 — a flex item's default `min-height: auto` can silently override `aspect-ratio`

Investigating B5 (Build Guide 29.17): `.record-card-media { aspect-ratio: 4/3 }`
looked correct in isolation, but `.record-card-media` is a flex item inside
`.record-card`'s `display:flex; flex-direction:column`. Flex items get an
implied `min-height: auto` on the cross/main axis that resolves to the
content's size unless overridden, and that content-based minimum won more
than the `aspect-ratio` did — the box grew to match whatever image it
contained instead of holding a fixed 4:3 tile. Confirmed with a standalone
repro: without `min-height: 0`, a 200px-wide card measured 339px tall (the
image's own natural aspect at that width); with `min-height: 0` added, it
measured the intended 150px. General lesson for this codebase: `aspect-ratio`
on any element that is also a flex item needs `min-height: 0` (or
`min-width: 0` for a row-direction flex item) alongside it, or the ratio is
only advisory.

## 2026-08-14 — G1: `loadDashboard`'s 200-row fetch cap, and what Base44's pagination actually looks like

**Backend contract note, written before production code, per the High-risk
gate in `docs/V3_1_PRODUCT_AND_RISK_PLAN.md`.**

### What the SDK actually supports (verified, not assumed)

Per `.agents/skills/base44-sdk/references/entities.md` (do not guess SDK
method names — CLAUDE.md): `EntityHandler.list(sort?, limit?, skip?, fields?)`
and `.filter(query, sort?, limit?, skip?, fields?)` are **offset-based**.
There is no cursor field anywhere in the returned array, no `hasMore` flag,
and no separate count/aggregate method — a `list()`/`filter()` call returns a
plain array and nothing else. The documented maximum is **5,000 rows per
single request**. So: offset (`skip`) is the only pagination mode to choose,
because it's the only one that exists; there was no cursor-vs-offset decision
to make once the reference was actually checked.

This is the identical contract `base44/shared/service-entities.ts`'s
`listAllOwned` already relies on server-side for `delete-collection` and
`delete-mission`'s cascades: page with `(query, sort, pageSize, skip)`, keep
going while a page comes back exactly `pageSize` long, stop on a short page.

### What changed

`loadDashboard` (`src/App.jsx`) used to issue one `list(sort, cap, )` call per
entity with a hardcoded cap (20 Missions, 100 Collections, 200 each for
Record/Clip/Enrichment/RoutingDecision/WatchRule) and silently drop everything
past that cap — the exact gap tracked as G1 in
`docs/BUGS_AND_BEHAVIORS.md` and previously called out as future work in
`docs/DECISIONS.md` ("B7 pagination is UI-only"). It now calls a new
`fetchAllPages` helper (`src/dashboard-pagination.js`) per entity, which pages
with `skip` in 200-row increments (matching `listAllOwned`'s own default
page size) until a short page is returned, up to a 5,000-row ceiling per
entity per load (25x the old largest single-entity cap). Every entity fetch
still runs in parallel via `Promise.all`, same as before — only each
individual entity fetch became a bounded loop instead of one request.

### Failure behavior on a partial/failed paginated fetch

If any page request for any entity throws, `fetchAllPages`'s rejection
propagates out of the `Promise.all` in `loadDashboard` before `setData`/
`setDataMeta` run — so a fetch that fails on, say, page 3 of Records never
partially overwrites the dashboard's state with an incomplete set silently
presented as complete. This is unchanged from before: `loadDashboard`'s only
caller (the effect in `App`) already wraps the call in `try/catch` and sets
`loadError` on any rejection, leaving the last successfully loaded `data`/
`dataMeta` in place rather than clearing the screen. No new failure state was
introduced; the existing one now also covers a failure on page 2+ of an
entity, not just page 1.

Read-only vs. destructive divergence from `listAllOwned`: the server helper
**throws** once it exceeds its row ceiling, because completing a partial
delete cascade would be actively wrong. A dashboard load is read-only, so
`fetchAllPages` instead returns `{ hasMore: true, total: null }` and keeps the
first 5,000 rows — a truncated-but-usable view beats an unusable error
screen for a browsing surface, and the truncation is now visible instead of
silent (`dataMeta.records.hasMore` drives a `+` suffix and tooltip on the
Items count in `src/App.jsx`; the other six entities carry the same
`hasMore`/`total` metadata for future UI, per G1's "surface hasMore" ask, but
aren't yet rendered anywhere else because nothing else currently displays a
raw count for those entities).

### No regression for the common case (owner under the old caps)

For any owner whose row count in an entity is still under the old cap (the
overwhelming common case today), `fetchAllPages` makes exactly **one**
request for that entity, identical request count to before — the loop's exit
condition (`page.length < pageSize`) is satisfied on the first page, same as
a plain `list()` call would have returned everything the old code showed.
The only owners who now issue more than one request per entity are exactly
the owners the old code was silently failing (more than 200/100/20 rows) —
i.e. more requests only happen when they fix a real, previously-silent bug.

### Scoping decision: Records stayed a full paginated fetch, not scoped to the active Collection

G1's task note suggested scoping Record queries to the active Collection
"where that's a reasonable design." Checked every consumer of `data.records`
in `src/App.jsx` before deciding: the Items count in `workspace-heading`
sums records across the whole Mission/owner, `CollectionSidebar` needs
per-collection counts across every Collection to render its list,
`ActivityPanel` shows recent activity across all Collections, and
`missionRecords`/`missionCollectionIds` derive Mission-level aggregates that
need every Record, not just the active Collection's. Scoping the fetch to
only the active Collection would break all four without a larger restructure
of those components into their own scoped queries — out of scope for a
data-completeness fix. Recorded as a deliberate decision in
`docs/DECISIONS.md` rather than silently doing the larger refactor.

### Risk

L=2 (mechanically mirrors the already-shipped, already-tested `listAllOwned`
pattern; purely additive/read-path; 6 new unit fixtures plus the full
existing suite green), I=5 (this is the single call gating every
authenticated page view for every owner — the highest-impact "core demo"
consequence the risk model has, per "impact uses the highest applicable
consequence rather than averaging," even though nothing here is destructive
or write-path). Score 10, High — same reasoning shape as the RLS-admin-bypass
fix (`docs/V3_1_PRODUCT_AND_RISK_PLAN.md`): a well-understood, low-likelihood
change whose blast radius alone crosses into the High band.

### Verification

`deno test --allow-env --allow-read tests` — 142/142 (136 previous + 6 new
`tests/dashboard-pagination.test.ts` fixtures, including one with 250 fake
rows in a single entity — the literal ">200 rows" fixture G1 asked for).
`deno check` on every `base44/functions/**/entry.ts` — unaffected, unchanged.
`node --check` on every extension script and the `@base44/sdk`-in-extension
grep — unaffected; this change is dashboard-only. `npm run build` — passes.
No entity, function, or Agent changes; nothing to deploy or push.

## 2026-08-14 — G4: live cross-owner verification against local `base44 dev`

`npx base44 dev` is not a thin proxy to hosted Base44 for entities/auth: the
CLI's dev server (`node_modules/base44/dist/cli/index.js`) runs a genuine
local, in-memory (`nedb`) `Database`, a local `authRouter`, and a local
`entityRoutes` that evaluates the *exact same* RLS engine format used in
`base44/entities/*.jsonc` (`checkRLS`/`evaluateCondition`, including
`user_condition` and `$or`/`$and`/`$nor`). Only routes it doesn't implement
locally fall through to a `remoteProxy` and log
`"<path>" is not supported in local development, passing call to production`
— entities and auth are not on that fallback path (confirmed: no such log
line appeared for any `/auth/register`, `/auth/login`, `/auth/verify-otp`, or
`/entities/*` call made during this test). One incidental miss: an early,
unauthenticated `curl` probe against a malformed path
(`/api/apps/me/auth/me`, using the literal string `me` instead of a real app
ID) didn't match the local route and *did* fall through to
`remoteProxy` — visible in the log as the one such warning line. It carried
no Authorization header and touched no owner data (a bare 404-shaped
introspection GET), but it did technically leave the "local only" boundary
for one harmless request; noted here for honesty rather than treated as a
real breach.

This made a genuinely live, non-production two-owner test possible without a
browser: `base44 dev`'s local auth seeds the currently-logged-in CLI
identity (the app creator's account) as `role: "admin"` on startup — the same
mechanism that made the 2026-07-26 incident possible in production (Base44
assigns `role: admin` to the app creator by default) — and its `/register` +
`/verify-otp` flow works fully locally, echoing the OTP to the dev server's
own stdout (`In order to complete registration use this verification code:
NNNNNN`) instead of sending real email, so two disposable, non-admin owner
accounts (`g4-owner-a@example.test`, `g4-owner-b@example.test`) could be
registered, verified, and logged in as distinct principals with real tokens
— no email inbox, no interactive OAuth.

Test script (`@base44/sdk` + axios, run from the project root so
`@base44/sdk` resolves, deleted after the run): logged in as admin, registered
and verified owner A and owner B, then used the admin client to seed one
`Clip` per owner (direct client `.create()` requires `role: admin` per
`clip.jsonc`'s `create` RLS — the same gate a backend function's
`asServiceRole` satisfies, so this mirrors how synthetic fixtures would be
seeded in production without a real capture pipeline). All 16 assertions
passed:

- owner A's `Clip.list()` returns exactly their own row, never owner B's, and
  vice versa;
- **the admin-role account's `Clip.list()` returns neither synthetic row** —
  this is the direct, live re-test of the exact 2026-07-26 bypass scenario
  (admin account, unfiltered `list()`, cross-owner data) and it stays fixed;
- `Clip.get(<other owner's id>)` fails with a typed 404 and no row data in
  the body, for both a non-admin cross-owner `get` and an admin `get` (the
  admin-bypass fix applies to `read` uniformly, not just `list`);
- owner A's `update()`/`delete()` against owner B's clip both 404;
- a `Bearer mp_...`-shaped (pairing-token-style) header on the entities API
  cannot read any `Clip` rows — `resolveCurrentUser()` can't decode a
  non-JWT bearer, so `currentUser` stays `undefined` and `checkRLS` denies
  every row (`if (!user) return false`) — there is no code path from a
  pairing-token-shaped bearer into entity reads, live-confirmed as well as
  visible in source.
- cleanup: both synthetic clips were deleted by their owning client
  (`update`/`delete` RLS is strict `data.owner_id === user.id`, so even the
  seeding *admin* client could not delete them — confirmed as a side effect
  of the point above) and a final `list()` as admin shows neither row
  remains.

Extension read-boundary (G4 point 3) is otherwise a static-code claim, not a
live one: `ingest-clip`, `refresh-capture`, and `extension-context` (the only
three functions that call `requireExtensionPrincipal`) were read end to end;
none of their response bodies include `Clip.raw_text`/`raw_html`,
`Record` fields, `Collection` contents, or `Enrichment` history —
`extension-context` returns only `{id, title, template}` per active Mission,
and `ingest-clip`/`refresh-capture` return only routing/outcome metadata
(`clip_id`, `routing_status`, `outcome`, etc.). This was not separately
exercised against a real pairing token end-to-end (that would need a real
extension install flow); the live pairing-token check above only proves the
*entities* API itself rejects that bearer shape, not that every function
response is bounded — the function-source read is what proves the latter.

Everything above ran only against the local `base44 dev` backend
(`http://localhost:4477`, in-memory, torn down with the dev server process at
the end of the session — nothing persisted to disk or to any hosted Base44
app). No production request carried an Authorization header or touched
owner data at any point.

## 2026-08-14 — G7: direct Dashboard entity-write audit

Exhaustive grep of `src/` for `base44.entities.\w+\.(create|update|delete|bulkCreate)`
(and a broader `base44\.entities\.\w+\.` sweep to catch anything the first
pattern might miss) turns up exactly one direct write, everywhere else in
`src/App.jsx` is `.list()`/`.subscribe()` (reads) or `base44.functions.invoke(...)`
(the intended pattern — `create-mission`, `report-bug`, `resolve-routing`,
`delete-record` all go through backend functions already):

```js
// src/App.jsx:1267, inside updateCandidateStatus()
await base44.entities.Record.update(selectedRecord.id, { decision_status: decisionStatus, next_action: nextAction });
```

Assessed as an accepted low-risk exception, left as-is:

- `record.jsonc`'s `update` RLS is `{"data.owner_id": "{{user.id}}"}` with no
  admin/service escape hatch (re-verified live today in the G4 pass above) —
  so even if `selectedRecord.id` were forged to point at another owner's
  Record, the write is rejected server-side by RLS regardless of this call
  going direct-to-entity instead of through a function. The "go through a
  backend function" convention is a defense-in-depth/consistency preference
  here, not the only thing standing between this call and a cross-owner
  write.
- The two fields it writes, `decision_status` and `next_action`, are
  presentational triage metadata (`record.jsonc`: `decision_status` is an
  `inbox|shortlisted|contacted|rejected|decided|expired` enum with a default
  set at creation time by `classification.ts`/`routing-persistence.ts`/
  `routing-resolution.ts`; `next_action` is a short human-readable string).
  Grepped every backend reference: the only place either field is read back
  is `agent-tools.ts`, which truncates it to 40 chars as bounded read-only
  context handed to the owner's own AI agent tool calls — nothing treats
  either field as an ownership, routing, or authorization signal.

No fix applied; see `docs/DECISIONS.md` for the corresponding decision
record. If a future change makes either field security-relevant (e.g. if
`decision_status` ever gated a notification, a share link, or another
owner-visible surface), this call should move to a small backend function at
that point.

## 2026-08-15 — Issue #19 Phase 1 / G8: building the Playwright Chrome capture harness

Real findings from building `tests-e2e/` (the first Playwright suite in this
repo), in the order they were hit.

### `npx base44 dev` runs the frontend too, when `site.serveCommand` is set

`base44/config.jsonc` already has `site.serveCommand: "npm run dev"`, and the
installed CLI's `base44 dev` reference doc (`.claude/skills/base44-cli/references/dev.md`)
confirms: when that field is set, `base44 dev` starts the frontend dev server
too, from the project root, and injects `VITE_BASE44_APP_ID` and
`VITE_BASE44_APP_BASE_URL` into that frontend process automatically. This
meant `tests-e2e/global-setup.ts` only has to spawn one process
(`npx base44 dev --port <pinned>`) to get both a live local backend and a
dashboard already wired to it — no separate `vite` invocation or manual env
file needed. The backend port is pinned (`--port`); the frontend port is not
(vite auto-increments past a busy 5173/5174), so global-setup parses the
actual port out of the combined `[base44 dev]` stdout stream instead of
assuming one.

### The gitignored `base44/.app.jsonc` link file is worktree-local

`npx base44 dev` requires a linked project (`base44/.app.jsonc`, containing
only `{"id": "<app id>"}`), and that file is intentionally gitignored
(`base44-cli` skill: "Do not commit this file"). A fresh `git worktree add`
checkout does not inherit it — `npx base44 dev` fails outright without it.
This is not a secret (the app id is also the public default baked into
`src/api/base44Client.js`), so the fix for a new worktree is just copying the
file from an already-linked checkout, which `tests-e2e/helpers/config.ts`'s
`readAppId()` now says explicitly in its error message if the file is
missing, instead of failing with an opaque CLI error.

### Local `/auth/register` + `/verify-otp` mechanics (used for the test owner)

Confirmed by reading `node_modules/base44/dist/cli/index.js`'s dev-server
`createAuthRouter`, same mechanism the 2026-08-14 G4 entry above already
documented: `POST /api/apps/:appId/auth/register` with `{email, password}`
(password must be >= 8 chars) creates a pending local user and prints
`In order to complete registration use this verification code: NNNNNN` to
the `base44 dev` process's own stdout — never sent anywhere. `POST
.../auth/verify-otp` with `{email, otp_code}` both creates the real local
`User` row and returns `{id, access_token}` in the same response — `id` here
*is* the row's real `owner_id` value, so no separate `auth.me()`/`User/me`
call is needed to learn the test owner's id. `global-setup.ts` extracts the
OTP by counting regex matches in the buffered stdout before/after each
register call rather than parsing the email out of the log line, since the
CLI's OTP log line doesn't include which email it's for.

### `headless: true` silently cannot load extensions — needs `--headless=new` instead

The single biggest surprise. Playwright 1.62's Chromium `headless: true`
launches a separate, lighter **"chromium-headless-shell"** binary (confirmed
present as its own download, `chromium_headless_shell-1234`, alongside the
full `chromium-1234` binary after `npx playwright install chromium`) — and
that shell binary does not support `--load-extension` at all. There is no
error: `chromium.launchPersistentContext(dir, {headless: true, args:
["--load-extension=..."]})` returns a context whose `serviceWorkers()` stays
empty forever and `waitForEvent("serviceworker")` just times out. Confirmed
by isolating it: the identical launch with `headless: false` registers the
service worker within a second.

The fix (now in `tests-e2e/helpers/browser.ts`) is to pass `headless: false`
(so Playwright launches the real, full Chromium binary, not the shell) plus
an explicit `--headless=new` argument, which makes that same full binary run
itself headless. This still requires no Xvfb/virtual display in this Windows
sandbox — confirmed working end to end, including real mouse drags
(visual-mode snip) and keyboard shortcuts (element-mode picker). This
appears to be specific to how Playwright 1.62 selects a browser binary for
`headless: true`, not a documented Chromium extension limitation, so it is
worth re-checking against future Playwright releases rather than assumed
permanent.

### `@base44/sdk` cannot be imported from a Playwright-loaded `.ts` file (but plain Node is fine)

Any spec/helper file that Playwright's test runner loads (even a one-line
`import { createClient } from "@base44/sdk"`) crashes at collection time:

```text
TypeError: debug_1.default is not a function
    at Object.<anonymous> (node_modules/agent-base/src/index.ts:9:26)
    at Object.<anonymous> (node_modules/https-proxy-agent/src/agent.ts:7:1)
```

Isolated with a minimal repro spec (just the one import line) — same crash.
The identical import works fine under plain Node (`node -e
"import('@base44/sdk').then(...)"` prints `OK function`), and dynamically
`import()`-ing a separate `.mjs` file that does the same import from inside
a Playwright spec crashes identically, so this is not specific to Playwright
transforming `.ts` syntax — it is something about the Playwright *test
worker's* module/runtime environment specifically, most likely related to
`debug@4.4.3`'s package.json declaring both `"main": "./src/index.js"` and
`"browser": "./src/browser.js"` (a real, if unconfirmed in full depth, lead:
axios 1.18.1 -> `https-proxy-agent` -> `agent-base` -> `debug`, and the
compiled `agent-base` code's `__importDefault(require("debug"))` pattern
only breaks under Playwright's worker, not plain Node, for that same
resolved `debug` version). Not pursued further given the fix below.

Fix: `tests-e2e/helpers/backend.ts` does not use `@base44/sdk` at all. It
calls the local dev server's own entities REST API directly with `fetch()`
(`GET /api/apps/:appId/entities/Clip?q=<json filter>&sort=&limit=` and
`GET .../entities/Clip/:id`, both confirmed against the same CLI dev-server
source used for the auth mechanics above), authenticated with the test
owner's real `access_token` from `/verify-otp`. This is arguably a closer
match to the issue's own wording ("poll the local backend's entities API")
than going through the SDK would have been, and the entities route still
enforces `clip.jsonc`'s real `read` RLS (`data.owner_id ===
{{user.id}}`) server-side per row, so it is not a lower-fidelity check.

### Local AI-routing calls proxy to real production, and can be slow or 401

`base44 dev`'s local backend does not run AI Gateway calls locally: every
`classify-clip` routing call during this suite logged `"/api/apps/.../ai/
openai/v1/chat/completions" is not supported in local development, passing
call to production`, and several runs also logged a `[Base44 SDK Error]
401: Request failed with status code 401` around that same call (visible in
`base44 dev`'s own backend log, not surfaced to the extension/test). Two
consequences worth flagging for anyone extending this harness:

- The extension's own `fetch()` to `ingest-clip` does not resolve until the
  *entire* server-side handler finishes, including this proxied AI call —
  the `Clip` row is created and visible over the entities API well before
  that response comes back (`ingest-clip/entry.ts` creates the row, then
  calls `processStoredClip`). A test that treats "the Clip exists in the
  backend" as "the extension's request is done" and immediately fires a
  second capture can find `extension/service-worker.js`'s single-flight
  `captureInFlight` lock still held, disabling `popup.js`'s buttons for the
  whole 90s test timeout. `tests-e2e/helpers/capture.ts`'s
  `waitForCaptureIdle()` (poll the real `magpie:capture-status` message
  until `inFlight` is false) is the fix, used by `capture-page.spec.ts`
  before its retry.
- A capture whose AI routing throws all the way up still lands as
  `routing_status: "failed"`, and `ingest-clip`'s own dedupe check
  deliberately skips matching against a `"failed"` row
  (`identicalClips[0] && identicalClips[0].routing_status !== "failed"` in
  `base44/functions/ingest-clip/entry.ts`) so a genuinely failed capture can
  be retried instead of being permanently un-retriable. This did not end up
  mattering for the final passing runs (both retried captures in every
  passing run got a real `routed_existing`/`created_collection` outcome,
  never `failed`), but it is a real, occasionally-observed source of
  content_hash mismatch between "identical" captures in this environment,
  separate from the toast-pollution finding below, and worth knowing about
  if this harness ever runs against a slower or more rate-limited network.

### Product finding: the capture-result toast pollutes a same-page "page" mode re-capture (not fixed, per scope)

While debugging why `capture-page.spec.ts`'s duplicate-retry check kept
seeing a second `Clip` (`content_hash` differed between the two "identical"
captures even with `routing_status` healthy on both), the actual cause
turned out to be real and worth recording as its own finding, distinct from
the AI-Gateway flakiness above: `extension/content.js`'s own result toast
(`#magpie-capture-toast`, id `content.css`'s `position: fixed; right: 20px;
bottom: 20px`) is appended to `document.body` and stays there for its
`showToast()` lifetime (9 seconds when the result includes a
`dashboard_url`, which most successful captures do) before it removes
itself. **Page mode** builds `raw_text` from `document.body?.innerText`
wholesale (`buildContextPayload("page", ...)` in `content.js`) — so a second
page-mode capture of the same page fired while the first capture's own
result toast is still on screen captures the toast's own text
("Saved — Magpie created a new Collection for this. Open Magpie →" or
similar) as part of `raw_text`, producing a different `content_hash` than a
"clean" capture of the same page and silently defeating the B8 dedupe check
for that narrow case.

Confirmed the other five modes are not affected, and why: `element` reads
`element.innerText` on the specific clicked node (a different DOM subtree
from the toast, which lives directly under `<body>`); `selection` reads the
explicit selection range; `link`/`image` read `anchor`/`figure`-scoped text;
`visual` samples `document.elementFromPoint()` at fixed pixel offsets inside
the user's drawn rect, which in this suite's fixture never geometrically
overlaps the toast's bottom-right corner. Only `page` mode's
"whole-body-innerText" approach is exposed to this.

Per this task's scope (do not fix a surfaced product bug silently in this
PR), `capture-page.spec.ts` instead waits for the toast to be fully removed
from the DOM (`waitForToastGone()` in `tests-e2e/helpers/capture.ts`) before
firing its retry, so the test verifies the real dedupe contract under normal
conditions rather than being confounded by this gap. The gap itself — a
user who captures the same page twice within roughly 9 seconds gets a
polluted, non-deduped second `Clip` — is a real, narrow, low-severity
product bug that should be scoped as its own follow-up (candidate fix:
either exclude the toast subtree from `document.body.innerText` collection,
e.g. by temporarily detaching it before reading text, or move the toast
outside `document.body` into a dedicated container the capture path
explicitly ignores).

### The known worker-keep-alive gap, confirmed still present (not touched this pass)

Per this task's scoping conversation: `captureInFlight` in
`extension/service-worker.js` is an in-memory `let` with no
`chrome.alarms`/keep-alive mechanism backing it, so it silently resets to
`false` if the MV3 service worker is terminated and restarted mid-capture by
Chrome (worker sleep/wake is explicitly deferred out of this Phase 1 pass,
per the prompt). Re-reading `service-worker.js` for this task confirms the
gap is still exactly as described and untouched by anything in this
harness — noting it here again only because this was the closest this pass
came to touching that code path (the same `withCaptureLock`/`captureInFlight`
mechanism this harness's `waitForCaptureIdle()` polls from the outside).
Not tested or fixed here; still open for a dedicated worker-sleep/wake test
in a later phase.

## 2026-08-15 — B13: cascade delete's single-page child fetch, found by code audit

Proactive P0 hunt (no user report) targeted the destructive-delete cascade
because it's the one write path where a silent truncation is unrecoverable
by design: the parent row is deleted last specifically so a retry that finds
it missing reads as "already done" and stops. That property is exactly what
makes a partial child-row delete permanent instead of self-healing.

`cascadeRecord` (`base44/shared/record-removal.ts`) fetched WatchRule/
Enrichment/RoutingDecision children with:

```ts
await service.Enrichment.filter({ owner_id: ownerId, record_id: record.id }, "-created_date", 200)
```

— a single page, hardcoded limit, no `skip`. Meanwhile `collection-removal.ts`
and `mission-removal.ts`, one cascade level up, already call `listAllOwned`
(`base44/shared/service-entities.ts`) to page Records/Collections to
completion, with a code comment explicitly about destructive cascades. The
per-record cascade — the thing every one of those outer loops calls once per
row — never got the same treatment. Same shape of bug as G1 (a single
hardcoded-limit `list()`/`filter()` call silently dropping rows past the
cap), but on a write path instead of a read path, which is worse: G1 degrades
to a truncated dashboard view; this one leaves orphaned rows nothing will
ever revisit.

**Why no existing fixture caught it:** the shared test mock's `filter()` in
`tests/record-removal.test.ts` accepted a `skip` parameter but ignored it —
`.slice(0, limit ?? length)` regardless of the fourth argument. Had someone
already written a >200-row Enrichment fixture against the old mock, it
wouldn't have exposed the bug — it would have made `listAllOwned`'s
pagination loop (which relies on `skip` advancing) request the same first
page forever, since `page.length` never drops below `pageSize`. That's an
infinite loop, not a clean assertion failure, which is a worse failure mode
for a test suite than "no coverage." Fixed the mock to slice on
`skip`/`skip + limit` before adding the regression fixture, and confirmed
(by reverting just the source fix) that the fixture fails cleanly — 200/100
deleted instead of 250/150 — rather than hanging.

**Verification of the fix itself:** `deno test` 143/143 (net +1 fixture over
the prior 142), `deno check` clean across all 16 entry points, `npm run
build` clean. No entity/schema change — the fix is pure logic inside an
already-deployed shared module, so it only needs a targeted
`functions deploy delete-record delete-collection delete-mission` (owner
approval required, not yet run).

## 2026-08-16 — Side Panel migration (issue #46): what actually needed to change vs. what didn't

The MV3 Side Panel API turned out to be a small, additive surface, not a
rewrite. The only non-UI-file change needed was one call —
`chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` — added
once inside the existing `chrome.runtime.onInstalled` listener in
`service-worker.js`, next to the existing `installContextMenus()` and
`reinjectContentScripts()` calls. Per Chrome's documented behavior, this
setting persists across service-worker restarts once set at install/update
time, so it does not need to run on every wake, matching how the two
existing calls in that same listener already behave. `action.default_popup`
and `side_panel.default_path` are mutually exclusive in practice — an action
with both a popup and Side Panel behavior enabled just opens the popup on
click and the Side Panel only via the toolbar icon's separate menu — so this
migration removed `default_popup` entirely rather than layering the two.

The real work was in the UI file itself, not the manifest: every one of the
old popup's four `window.close()` calls (Save page success, element-picker
start, visual-snip start, Open dashboard) was there specifically because a
Chrome action-popup is a transient overlay that Chrome auto-closes on
outside interaction, so the code proactively closed it rather than leaving a
stale "Capturing…" popup floating over a page a person had already clicked
away from. A Side Panel has the opposite lifecycle — it is a persistent
per-window surface that Chrome does not auto-close — so keeping any of the
old `window.close()` calls would have been actively wrong: it would close
the one surface the whole migration exists to keep open. The fix in each
spot was symmetrical: replace the close with a status-text update, and move
`setCaptureButtonsBusy(false)` into a `finally` block so the buttons
re-enable regardless of outcome instead of relying on the surface
disappearing.

One easy trap avoided: `chrome.storage.local` state (`ingestUrl`,
`extensionToken`, `activeMissionId`, `captureIntent`, `autoRefreshEnabled`,
`savedUrls`) is keyed by name only, not by which HTML page reads it, so
renaming `popup.html`/`popup.js` to `sidepanel.html`/`sidepanel.js` needed no
migration step — an already-paired install upgrades in place. This was
verified by inspection (every `chrome.storage.local.get`/`.set` call in the
old `popup.js` and the new `sidepanel.js` uses the identical key names), not
by an actual browser reload, since this session had no way to launch real
Chrome — see `docs/DECISIONS.md` for the full list of what was and was not
verified for this change. **Merged to `main` 2026-08-16 as PR #50.**

## 2026-08-16 — Issue #47 pre-beta documentation audit: deployment status was stale, not the code

Re-ran the full release-gate suite from a clean worktree and cross-checked
`deploy-base44.yml`'s GitHub Actions run history (`gh api
repos/Bazingalol123/magpie/actions/runs`, `gh run view <id> --json ...jobs`)
against `git log origin/main`, because several docs (this file's own last
entry included, plus `docs/CLAUDE_CODE_HANDOFF.md` and
`docs/BUGS_AND_BEHAVIORS.md`) asserted "not yet deployed"/"needs owner
approval, not yet run" for work that had, in fact, already gone through a
CI-dispatched, approval-gated deploy since those notes were written. This is
a docs-audit finding, not new engineering work; no source changed.

**What re-running the gates found:** `deno test --allow-env --allow-read
tests` is 143/143 (matches the last checkpoint above; unchanged). `deno
check` on `$(find base44/functions -name entry.ts)` is clean across all
**17** entry points — one more than the "16" figure this file, `README.md`,
and `docs/CLAUDE_CODE_HANDOFF.md` had been citing; the seventeenth is
`report-bug` (Build Guide checkpoint 34), which existing counts had stopped
including. `node --check` is clean on every `extension/*.js` file. `rg -n
"@base44/sdk" extension` is empty. `npm run build` succeeds
(`dist/assets/index-*.js` is ~527 kB pre-gzip, unchanged from prior builds —
Vite already warns about this; not addressed here, out of scope for a docs
audit).

**What the GitHub Actions history showed, that the docs didn't reflect:**
`gh run list --workflow=deploy-base44.yml` shows 12 successful dispatches in
the visible history, the last three of interest here:

- Run `31849671121` — `target=functions` at commit `f542c4e` (the B13
  cascade-delete-pagination fix, PR #40), 2026-08-14T23:14:53Z, succeeded.
  `npx base44 functions deploy --force` (see `.github/workflows/
  deploy-base44.yml`) redeploys every function unconditionally, regardless of
  which one changed — so this single dispatch put all 17 functions'
  then-current source into production, not just the three the B13 fix
  touched. `report-bug` (previously documented as "not yet deployed" in
  Build Guide checkpoint 34) went live in the same dispatch.
- Run `31850021926` — `target=site` at the same commit `f542c4e`,
  2026-08-14T23:20:40Z, succeeded, shipping the G1 dashboard-pagination
  frontend fix (which predates `f542c4e` in `main`'s history, so it was
  already included).
- Run `31852725909` — `target=site` at commit `e2a4f84` (current `main`
  HEAD as of this audit), 2026-08-15T00:09:16Z, succeeded.
  `git diff f542c4e..e2a4f84 -- base44/` is empty, so the functions deployed
  by the first run above are still the current backend source — no function
  code has changed since.
- No `target=entities` or `target=agents` dispatch appears in the visible
  run history checked, so this audit could not independently confirm entity
  schema or Agent sync status beyond what earlier entries in this file
  already documented as run locally.

**What this does and doesn't establish:** a successful CI deploy run is
verifiable evidence that code was pushed to the production Base44 app — it
is not the same claim as "a human clicked through the resulting UI in
production and it worked." Every place this correction touches a "not yet
deployed" claim, it upgrades the status to "deployed" (with the run ID as
evidence) while leaving "browser/live-verified" as a separate, still-mostly-
open claim. See `docs/BUGS_AND_BEHAVIORS.md` (B13, G1),
`docs/CLAUDE_CODE_HANDOFF.md`, `docs/DECISIONS.md`'s dated entry, and
`docs/BETA_LIMITATIONS.md` for where each correction landed.

**getOrNull 404 sweep (mentioned as outstanding in `CLAUDE.md`):** checked
which `base44/functions/*/entry.ts` files call `.get(id)` directly instead of
through `getOrNull` (`base44/shared/service-entities.ts`), since
`docs/API_AND_FAILURE_MAP.md` documents that the hosted SDK throws rather
than returning null on a missing ID. Two call sites use the unsafe raw
pattern — `enrichRecord` in `base44/shared/enrichment.ts` and
`classifyStoredClip` in `base44/shared/classification.ts` — but neither is
imported by any current entry point (`grep -rln` across `base44/functions`
returns nothing for either); `enrich-record`'s entry point uses
`enrichment-v2.ts` instead, and nothing calls `classifyStoredClip`. Both are
dead code carrying a known-wrong error-handling assumption. Recommend a
follow-up cleanup issue to delete them; not fixed here since this pass is
docs-only and neither is reachable in production.

## 2026-08-16 — Picker/snip mode-switch bug: the re-entrancy guard was too broad

`content.js`'s `startPicker`/`startSnip` each guarded against double-starting
with `if (pickerActive || snipActive) return;` — correct for stopping a
second click on the *same* button from re-adding listeners, but it also
silently blocked switching from one mode to the other, since the guard
doesn't distinguish "already in this mode" from "in the other mode." The
Side Panel UI had no way to detect this: `startPickerInTab` in `sidepanel.js`
resolves as soon as `chrome.tabs.sendMessage` reaches the content script's
listener, not once the requested mode actually starts, so the status text
optimistically claimed success regardless. Fix: each start function now only
guards against its own mode already being active, and tears down the other
mode first (`stopSnip()`/`stopPicker()`) if it's running. Same root file also
had a related toast bug: `stopPicker()`/`stopSnip()` never dismissed the
"Hover any element..."/"Drag to select..." hint toast on Escape — it only
self-cleared via its own timer (8s for a "hint" toast), so Escape looked
inert for up to 8 seconds. Added `hideToast()` and call it from both stop
functions, which also fixes the visual handoff when switching modes (the old
mode's hint disappears immediately instead of overlapping the new one).

## 2026-08-17 — New pairings get the custom-domain ingest URL (issue #59)

`create-extension-pairing`'s `ingest_url` was the only place the
`magpieorelse.base44.app` hostname is chosen for a live client, and it's a
one-way handout: the returned URL is stored client-side (`chrome.storage.local`)
and never re-fetched, so changing the constant only affects pairings created
after the change — already-paired Extensions keep using whatever URL they
were minted with and never see this code path again. Moved the constant into
a pure `buildIngestUrl()` in `shared/auth.ts` (was inlined in the entry point)
so a test can assert the exact returned string without spinning up
`Deno.serve`, matching the existing pattern of testing pure functions
directly (`clip.test.ts`'s `canonicalizeUrl`/`validateCapture`) rather than
invoking entry points.

Verified live (2026-08-17, re-checked after PR #60 opened): an
unauthenticated POST to `https://magpieorelse.base44.app/functions/ingest-clip`
returns `401 {"error":"A Magpie pairing token is required"}` — unchanged,
confirming the old endpoint keeps working for already-paired Extensions. An
unauthenticated POST to `https://magpiecapture.com/functions/ingest-clip`
now returns the identical safe `401 {"error":"A Magpie pairing token is
required"}` response — the custom domain has finished connecting to the
Base44 app since the code was first written (an earlier check that same day
still saw Squarespace's placeholder `404`; PR #54's note about the pending
DNS hookup no longer applies). Both endpoints are confirmed live and
correctly reject unauthenticated requests. An authenticated pairing +
capture round-trip through the new URL was not performed, and no deployment
or merge was performed as part of this work.

## 2026-08-21 — OAuth sign-in loop: relative appBaseUrl + service worker (PR #75)

Owner reported Google/Apple sign-in on `magpiecapture.com` redirecting back
to the landing page instead of completing; email/password sign-in kept
working. `feat/zyte-refresh-option` had spent five rapid-fire commits
(`7fe605e`→`9397a86`) chasing this by flipping `src/api/base44Client.js`'s
`appBaseUrl` between the Base44 host, the page origin, and `''`, without
anyone testing end-to-end in a browser with the service worker active.

Root cause was two compounding regressions live on that branch:

1. `appBaseUrl` had settled on `''` in production. The SDK builds
   `loginWithProvider`/`redirectToLogin` URLs as
   `${appBaseUrl}/api/apps/auth/login?...`; empty `appBaseUrl` makes that a
   same-origin **relative** URL instead of pointing at
   `https://app.base44.com`.
2. `public/sw.js` (new in this same PR, for the PWA share target) intercepts
   *every* GET navigation with a blanket `fetchWithNavigationFallback`. Once
   the login URL became same-origin, this service worker owned it too:
   whenever its own `fetch()` of the resulting
   `magpiecapture.com → app.base44.com → accounts.google.com` cross-origin
   redirect chain didn't cleanly resolve (fragile from inside a service
   worker vs. a genuine top-level navigation), it silently served the
   cached `"/"` shell instead of the real redirect. The address bar kept
   showing the login URL because no real navigation occurred — only a body
   swap — matching the reported symptom exactly. `loginViaEmailPassword` is
   a plain async API call (not a navigation), so it was never touched by
   the service worker, which is why password sign-in kept working.

Separately, and unrelated to this fix: production was found to be serving
this same not-yet-merged PR's bundle (confirmed via `mobile-capture` and the
PWA share-target `postMessage` handler present in the live JS, both absent
from `main`) despite no `Deploy to Base44` Action run since 2026-08-18 —
owner confirmed this was an intentional out-of-band deploy via another
agent channel, not an accident.

Fix (`a62a56e`): `appBaseUrl` now falls back to `base44ServerUrl`
(`https://app.base44.com`) instead of `''`, so provider login is a genuine
absolute cross-origin redirect from the first hop — outside the service
worker's own origin scope, so it can never intercept it. Also hardened
`public/sw.js` itself to skip `/api/*` paths entirely, so this class of bug
can't recur even if `appBaseUrl` regresses to relative again. Verified the
redirect chain server-side with `curl` (`magpiecapture.com/api/apps/auth/login`
→ 307 → `app.base44.com` → 302 → Google) before and after; the backend was
never the problem. Deployed (owner-approved, `target=site`,
`32432637638`) and confirmed live via the new bundle hash.

## 2026-08-21 — Logout stranded on app.base44.com; bfcache showed a stale, unauthenticated dashboard

Owner confirmed the redirect fix above worked, then reported two follow-on
bugs on the freshly deployed site: (1) Sign out lands on `app.base44.com`
instead of back on the dashboard, and (2) pressing the browser Back button
afterward shows the dashboard shell with no data, and every action 403s.

**Logout host.** `base44.auth.logout()` builds its redirect as
`${appBaseUrl}/api/apps/auth/logout?from_url=...`. Unlike login (which
honors an explicit `from_url` via the `app_id` query param regardless of
which host receives the request — confirmed via `curl` against both
`app.base44.com` and the `magpiecapture.com` proxy), the logout endpoint
only honors `from_url` when the request itself hits the app's registered
public domain: hit directly on `app.base44.com` it always responds
`location: /` (relative to `app.base44.com` itself, ignoring `from_url`,
`app_id` present or not). Confirmed by `curl`-ing both hosts directly.
Fixed by pointing `appBaseUrl` at `window.location.origin` instead of
`base44ServerUrl` — safe now that `public/sw.js` no longer intercepts
`/api/*`, so this doesn't reopen the same-origin service-worker hijack the
prior note describes. This also matches what `29da48d`, the very first of
today's flip-flopping commits, already tried — it was directionally right
but got abandoned before the service worker was fixed, so it never got a
fair test.

**bfcache stale dashboard.** A `pageshow` listener already existed to
re-check auth (`event.persisted` → `base44.auth.me()` → `setUser(...)`),
but on catch it only patched `user`, not the dependent `data`/collection
state — those effects don't re-run on a bfcache resume the way they do on a
fresh mount, so the restored page kept rendering the old (now
unauthenticated) dashboard shell with stale/empty data and 403s on every
action. Replaced the patch with an unconditional `window.location.reload()`
on `event.persisted`, forcing the same fresh-mount path (and its existing
`base44.auth.me()` check) that a normal page load takes.

**Also restored `/login`** (`src/LoginPage.jsx` — email/password,
signup+OTP, Google, Apple): it existed as complete, styled, unused dead
code, stripped out of the render path in `c425c6b` while chasing the
original redirect bug and never wired back in. Landing's "Sign in" /
"Sign in to start" now push `/login` instead of redirecting straight to
Google, per the SDK's own guidance to prefer custom login UI over
`redirectToLogin`.

Fix in `b9dbacd`. Deployed (owner-approved, `target=site`) alongside the
above.

## 2026-08-21 — P0: every base44.functions.invoke() call 403s in production (platform-domain block)

Owner reported the iOS Shortcut `/share` save hit `403 Forbidden`, and on
follow-up confirmed every function-backed write in the deployed dashboard
was failing the same way (New Project, mobile capture, and by extension
delete/resolve-routing/review accept-dismiss — anything routed through
`base44.functions.invoke()`).

Root cause confirmed live via `curl`, unauthenticated, same exact SDK path
(`POST /api/apps/{appId}/functions/create-mission`) against both hosts:

- `https://app.base44.com/...` → `403 {"message":"Backend functions cannot
  be accessed from the platform domain. Use the app's subdomain instead."}`,
  `request_id: null` — rejected before `entry.ts` ever ran.
- `https://magpiecapture.com/...` → `401 {"error":"Authentication is
  required", request_id: "req_..."}` — a real response from
  `requireUser()` in `entry.ts`, i.e. the request reached our code.

`entities` and `/auth/me` were verified to behave identically on both
hosts (both `200`/`401` alike), so this block is specific to the
`functions` route, not a blanket platform-vs-custom-domain split. Base44
appears to have started enforcing "use the app's own domain for function
calls" now that the custom domain is fully connected (see the 2026-08-17
issue #59 note above, which made the same shift for the Extension's
`ingest_url` but didn't touch the browser SDK's own `functions.invoke()`
base URL).

`src/api/base44Client.js`'s `base44ServerUrl` was hardcoded to
`https://app.base44.com` in production (only local dev with
`VITE_BASE44_APP_BASE_URL` set escaped it), and the SDK's `functions`
module always posts through that same shared `serverUrl` — there is no
separate per-module base URL in `@base44/sdk`'s `createClient()`. Fixed by
making `base44ServerUrl` prefer the deployed page's own browser origin
(mirroring the pattern `appBaseUrl` already used for the login/logout
redirect bug above), falling back to the platform host only when there's
no browser origin or it's `localhost`/`127.0.0.1` (so local frontend dev
without a sandbox keeps hitting the real hosted backend as before).
`tests/base44-client-config.test.ts` updated to match the new source
lines. Gated locally: 193/193 Deno tests, all 17 `entry.ts` type-check
clean, `npm run build` clean. Branch
`fix/functions-invoke-platform-domain-403`, merged to `main` as #76.

## 2026-08-21 — Three dashboard bug reports: Project-scoped Collections, stale 0 count, hidden phone CTA

Owner reported three issues while reviewing the dashboard: (1) switching
Projects still showed Collections belonging to other/no Project, with a `0`
count; (2) Collection item counts flash `0` before settling; (3) on iOS
(installed PWA or Safari tab) there's no "save with phone" button, though
one exists on desktop.

**(1) Global Collections leaking into every Project.** `src/App.jsx`'s
`missionCollections` filter was `collection.mission_id === activeMission.id
|| !collection.mission_id` (added in `0764e31`, #72, to stop global
Collections "disappearing" from the sidebar). The `|| !collection.mission_id`
clause means *every* Collection with no `mission_id` shows under *every*
Project regardless of relevance, and since `data.records` is only ever the
currently-viewed Collection's page (not a Project-wide list), there's no
honest client-side way to tell whether a given global Collection "really"
belongs under the active Project — it always renders `0`. Per
`docs/PRODUCT_CHARTER.md`, unattached Collections belong to the top-level
Library, not to every Project's own view — fixed by dropping the
`!collection.mission_id` clause entirely so only explicitly Project-scoped
Collections appear under a Project; the no-Project (Library) view is
unaffected and still shows everything. (`0764e31`'s original flicker bug —
why it widened this filter in the first place — was rooted in the *same*
`data.records`-is-single-Collection-scoped limitation as this bug; a real
fix for both would need a lightweight per-Project Collection-membership
query that doesn't exist yet, tracked as a follow-up, not built here.)

**(2) Transient `0` count on the active row.** `CollectionSidebar`
computed the active row's count as `records.filter(r => r.collection_id ===
collection.id).length` — while a new Collection's page is loading, `records`
still holds the *previous* Collection's rows, which filters to `0` and
flashes a false count before the real page lands. Fixed by also gating on
the existing `isLoadingRecords` state (now passed down as a prop): the
active row shows `—` (same as any inactive row) while loading, instead of a
misleading `0`.

**(3) No phone-capture CTA reachable on mobile.** `src/index.css`'s
`@media (max-width: 680px)` block set `.heading-actions { display: none; }`
— but `.heading-actions` is the only place the "Add from phone" button
lives (alongside "New Project"). Every phone falls under this breakpoint,
so the one button meant for phone users was the one thing this rule hid.
`.capture-status` (the Items count) inside that same container is already
hidden by a separate, unaffected rule. Fixed by reflowing `.heading-actions`
into a full-width wrapped flex row of 44px-min-height buttons instead of
hiding it.

**(4, found by owner testing (1)'s fix) Switching to "All Collections" showed
a Collection stuck at 0 until manually clicked.** `WorkspaceSwitcher`'s
`onSelect` picked the Collection to auto-select on Project switch via
`data.collections.find(c => c.mission_id === missionId)` — for the
"All Collections" case `missionId` is `""`, which no real Collection's
`mission_id` ever equals, so this always found nothing and called
`selectCollection(null)`. `fetchRecordsPage` short-circuits on a falsy
`collectionId` and returns an empty page without ever fetching, so
`data.records` stayed empty while the render's own fallback
(`missionCollections.find(...) ?? missionCollections[0]`) still picked a
real Collection to show as active — rendering it with a false `0` until the
user clicked it themselves and triggered a real fetch. Fixed by mirroring
`missionCollections`' own derivation (filter by `mission_id` when a Project
is active, otherwise use the full list) instead of the narrower `.find`.

**(5) Root-caused (1) and (4) by fetching Records like every other entity.**
Owner's own diagnosis: the real reason these kept surfacing was that
`data.records` was only ever the single active Collection's fetched page
(`fetchRecordsPage`/`loadRecordPage`, one `base44.entities.Record.filter({
collection_id }, ...)` network call per switch) instead of a bounded
account-wide set like every other entity (`missions`, `collections`,
`clips`, etc. all already load through `listDashboardPage`'s single-page
`.list(sort, 100, 0)`). Every count/scoping bug above was a symptom of that
one gap. Replaced it: `loadDashboard` now fetches Records the same way,
except through `fetchAllPages` (`src/dashboard-pagination.js`) instead of a
single 100-row page — that helper already existed, tested, and documented
for exactly this purpose (G1: "loadDashboard used to fetch a single page
per entity ... silently missing" rows past the cap) but was never actually
wired into `loadDashboard`. It pages to a 5,000-row ceiling instead of
silently truncating at one page.

`selectCollection`/`changeRecordPage` are now pure client-side state
changes (no fetch, no `isLoadingRecords`) — `activeRecords` filters the
already-loaded set by `collection_id` and slices client-side by
`recordPage`; `CollectionSidebar` now shows a real, always-live count for
every Collection (not just the active one) instead of `—` for inactive
rows. `dataMeta.records.hasMore`/`total` now come from `fetchAllPages`'s
own honest ceiling-hit signal, reused as the "+" suffix everywhere a count
is shown. `fetchRecordsPage`/`loadRecordPage`/`isLoadingRecords` and the
now-unused `fetchPageWindow` import are deleted; `RecordTable`'s Prev/Next
no longer needs an `isLoading`-gated disabled state since paging is
synchronous now. `ActivityPanel` (record lookup for enrichment activity
items) incidentally gets the same completeness improvement for free, since
it was already being passed `data.records` directly.

Branch `fix/dashboard-project-scoping-and-mobile-cta`. Gated locally:
193/193 Deno tests, `npm run build` clean, `@base44/sdk` extension grep
clean. Not yet merged, deployed, or owner-approved for deploy. No manual
browser click-through performed this pass (no phone/local backend in this
sandbox, same limitation noted throughout this file for other mobile/PWA
work) — the CSS reflow in particular should get a real narrow-viewport
check before shipping.
