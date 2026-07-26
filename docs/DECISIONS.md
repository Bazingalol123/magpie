# Deliberate decisions

## No direct entity access from the extension

The extension only calls `ingest-clip` with a random opaque pairing token. It cannot read collections, records, clips, or enrichments. The server stores only the token hash and resolves its owner binding, enforcing the asymmetric trust boundary rather than treating RLS as a generic checkbox.

## No SDK in the MV3 service worker

The worker uses `fetch` and `chrome.storage.local` to survive MV3 lifecycle termination. The SDK remains in the dashboard where browser storage and realtime sockets are appropriate.

## No visual schema editor

The classifier proposes a small schema and collection. A schema editor would not improve the 60-second demo enough to justify its complexity; schema changes can remain a follow-up capability.

## One reliable enrichment path first

The first enrichment implementation focuses on values represented in the captured text. General scraping, arbitrary selectors, and broad connector export are deferred until the ingestion-to-live-row path is dependable.

## No connector export in the first demo

Google Sheets and Notion export are intentionally absent. They would add OAuth setup and another presentation surface without making the core clip-to-live-row workflow more reliable. The README names this omission instead of presenting an unused connector as feature depth.

## Screenshot storage is retained

The extension captures a compressed viewport image. The backend turns that data URL into a `File`, uploads it through `integrations.Core.UploadFile`, and persists the returned URL in `Clip.screenshot_id`. Direct binary entity fields were rejected by the local Base44 entity API, so file storage is kept as a separate operation. Screenshot upload is best-effort: a temporary storage failure cannot discard the clip itself.

## Keep Collection as a compatibility layer in V2 (historical; superseded for V3)

## Add capture modes without adding a crawler

V3.1 treats element, selection, page, link, visual, and image capture as different evidence bundles for the same Clip and routing pipeline. Link capture uses the target URL plus browser-observed label/context and does not authorize the backend to retrieve arbitrary URLs. This avoids introducing SSRF, redirect, authentication-wall, content-size, and source-trust behavior into the critical capture path.

Visual and image modes upload actual browser-captured pixels through the existing screenshot boundary and expose that image only to the backend routing request. The extension remains write-only, imports no SDK, and receives only the existing safe routing status.

V2 made Mission the navigation, schema, and decision boundary because removing Collection would have forced a destructive migration and rewrite of stable enrichment code. V2 therefore hid Collection as an implementation detail and stamped Mission-queryable fields onto Record. This was a transitional implementation decision, not the durable product model.

## Restore Collection as the automatic organization boundary in V3

The V2 assumption that one Mission owns one extraction schema is too narrow for Magpie's original promise. A believable Mission such as moving to a city can contain apartments, neighborhoods, and moving companies. V3 therefore keeps Mission as optional purpose and makes Collection the schema-backed type selected or created by the classifier.

This supersedes the product direction in the V2 compatibility decision without requiring a destructive competition migration. Existing Mission schema fields and Records remain readable while new routing becomes canonical.

## No arbitrary nested folders in V3

Magpie's fixed hierarchy is optional Mission, auto-organized Collection, then Record. Arbitrary folder trees would restore manual filing work and weaken automatic organization. Search, archive, tags, and saved views should be exhausted before reconsidering another hierarchy level.

## Add bounded navigational folders in V3.1

V3.1 supersedes the blanket presentation-level folder omission without changing the canonical product hierarchy. Users may organize Collections into a Folder and one level of Subfolder, but folders remain optional dashboard navigation.

Folders cannot contain individual Records or Projects, cannot influence routing, and never appear in the extension. The backend keeps Folder writes behind validated functions to prevent cross-owner references, cycles, excessive depth, and duplicate sibling names. Arbitrary depth and routing-aware folders remain rejected.

## Use clearer UI labels without renaming backend resources

V3.1 presents Mission as Project, Record as Item, Clip as Capture, and routing review as Needs review. Collection remains Collection. Base44 entity and function names stay unchanged because a destructive naming migration would add data and deployment risk without improving the user experience.

## Infer a Project semantically, never by recency

An unscoped capture may be associated with one active owner-owned Project only when a
backend code-agent proposal passes deterministic owner/status validation, confidence
of at least `0.90`, and a lead of at least `0.15`. Explicit Project selection always
wins. No clear match remains global; ambiguity enters review.

This supersedes V3's global-only interpretation of a missing Mission hint, but it does
not restore the discarded "latest active Mission" shortcut. The agent is stateless,
has no entity-write tool, and cannot expand the extension's read permissions.

## Use one broad configured Agent with narrow authority

V3.1 adds one `magpie_organizer` Agent instead of separate camera, shopping, job, or
research assistants. Its domain breadth comes from the canonical Project,
Collection, Item, Capture, routing, update, and watch model—not from hard-coded
vertical rules.

The Agent receives no direct entity tools and no cross-conversation memory. It may
read bounded owner data and configure explicit watches only through backend
functions that authenticate and re-check ownership. Automatic capture routing
remains the existing deterministic code-agent workflow. This avoids both a narrowly
scoped product and an open-ended assistant with unbounded database authority.

## Resolve only review-state Captures, without undo

`resolve-routing` deliberately acts only on Clips whose routing status is
`needs_review`. Re-routing an Item that was already filed successfully, and
undoing a completed resolution, are both excluded from this first cut. A second
resolution attempt with a different target returns `409` instead of silently
overwriting the first decision; an identical retry is idempotent.

Undo was omitted because it forces design decisions that deserve their own
gate: whether an emptied owner-created Collection is deleted or archived,
whether reverting needs an audit trail beyond `corrected_at`, and how a revert
interacts with enrichment history on the created Record. The dashboard response
also intentionally omits Collection names from the extension's ingest reply;
toasts stay informative using only the already-permitted `routing_status` and
`routing_reason_code`, preserving the write-only extension contract.

## Full delete is the removal semantic, and dismiss deletes the capture

When an owner removes an Item, Magpie permanently deletes the Item, its
WatchRules, its Enrichment history, its RoutingDecision, and its Clip in one
server-owned cascade. When an owner dismisses an unwanted `needs_review`
capture, the RoutingDecision and Clip are deleted the same way. Soft archive
and a `dismissed` status were considered and rejected for V3.1: both require
entity enum changes and produce hidden state the competition build has no UI
to manage.

This is a deliberate, narrow exception to "evidence travels with data": the
owner of the evidence may destroy it, and only through an authenticated
owner-validated function. Nothing else in the product deletes evidence, and
enrichment failures still never mutate or remove anything.

## Collection and Project deletion reuse the same full-delete semantic

`delete-collection` and `delete-mission` extend the same owner-destroys-their-
own-evidence exception one and two levels up the hierarchy: deleting a
Collection permanently deletes every Record inside it (and each Record's
WatchRules, Enrichments, RoutingDecision, and Clip); deleting a Project
(Mission) does the same for every Collection scoped to it. Both reuse the
identical per-record cascade `delete-record` already established rather than a
second cascade implementation.

Deleting a Project deliberately does not reach `needs_review`/`failed` Clips
that only carried it as a routing hint and never became a Collection/Record.
Silently deleting unresolved review work because it once mentioned a Project
the owner is now removing would surprise a user trying to declutter their
organized structure, not their inbox. Those Clips keep a dangling `mission_id`;
this is safe because `resolve-routing`'s existing Project validation already
returns a typed `404` for an unknown Project id rather than crashing, and the
review UI simply shows the capture as no longer having a resolvable Project
hint. Global Collections (no `mission_id`) are never touched by Project
deletion.

## Blocked watches pause themselves after three consecutive blocked checks

A login-walled or bot-challenged source is a stable condition, not a transient
failure. After three consecutive `blocked` results, the sweep sets the watch
inactive with `AUTO_PAUSED_BLOCKED` instead of re-checking a source that
cannot succeed. Three was chosen over one so a single transient challenge or
misclassified page does not kill a healthy watch. The owner can resume at any
time; extension-assisted recapture-to-update remains future "Living knowledge"
scope.

## The extension's refresh memory is local-only and dies with the pairing token

Refresh-on-revisit needs the extension to recognize pages the owner previously
captured. It remembers only URLs it itself submitted, stored in
`chrome.storage.local` beside the pairing token. The server never sends the
captured-URL list (or any owner data) down to the extension: that would turn a
stolen pairing token from write-only into a read of the owner's research
history.

The accepted consequence is that uninstalling the extension wipes this memory
together with the token, so after re-pairing, automatic refresh resumes only
for newly captured or re-clipped pages, with dashboard source links as the
recovery path. The designated future fix is a bounded URL-hash seed handed to
the extension at pairing time by the authenticated dashboard — an explicit
owner action on the trusted surface — never a read capability for the token.

Auto-refresh defaults on with a popup toggle, is bounded to explicitly saved
pages, is rate-limited to once per URL per 12 hours, and announces itself with
a toast when it changes anything.

## No RLS admin bypass, and no scoped admin-audit replacement built

Discovered 2026-07-26 as a live incident: every owner-scoped entity's RLS
allowed `role: "admin"` to read/update/delete any owner's rows, and
`canAccessOwner()` gave the same bypass to `classify-clip`/`enrich-record`.
The app owner's own account carries `role: "admin"` (Base44's default for the
app creator), so the bypass was not theoretical — it was actively exposing
one real user's Clips to another during ordinary dashboard use, verified live.

The fix removes the bypass entirely rather than narrowing it to a dedicated
admin-audit function. Magpie's product promise is per-owner isolation with no
interpersonal visibility (`docs/PRODUCT_CHARTER.md`); nothing in the shipped
product needs an admin to see across owners, and nothing in the frontend or
backend depended on the bypass once removed. If a legitimate cross-owner
admin/support tool is ever needed, it should be a new, explicitly audited,
owner-facing-consent-aware function — never a blanket RLS or auth-helper
bypass — and that is a future decision, not part of this fix.

The reverse report from the same incident (a non-admin account allegedly
seeing another owner's data) has no matching code path in RLS or in any
backend function's ownership check; every non-admin path is a strict
`owner_id == caller.id` check with no alternative. This was not treated as a
second bug to fix — see `docs/API_AND_FAILURE_MAP.md` for the reasoning.
