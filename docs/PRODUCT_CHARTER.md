# Magpie product charter

> Read this before proposing a roadmap, redesigning the dashboard, or changing the data model.

## Why this project exists

Magpie is an entry for Base44's Dev Build-Off, due July 28, 2026. Winning the competition matters, but the product cannot exist only to demonstrate platform surfaces. Every Base44 capability must help solve the same user problem.

People research decisions across websites. They save bookmarks, screenshots, copied text, and half-maintained spreadsheets. Those captures lose structure, become difficult to compare, and silently become stale when the source changes.

Magpie turns selected pieces of the web into structured information that remains useful after the browser tab closes.

## North star

> **Magpie turns the messy web you encounter into structured information you can trust, compare, and keep current.**

The product loop is:

`clip -> understand -> organize -> review -> compare -> refresh`

This is not a generic bookmark manager, scraper, spreadsheet replacement, or autonomous-action platform.

## Product promise

The user should be able to clip first without manually deciding where the item belongs or recreating its fields. Magpie should:

1. preserve the original source and capture evidence;
2. understand what kind of thing was captured;
3. route it into an existing structured Collection or propose a new one;
4. extract only supported facts into comparable fields;
5. expose uncertainty instead of inventing data;
6. keep trustworthy fields current and show meaningful changes.

## Personas

### Primary: the active comparer

Someone making a bounded decision across many inconsistent websites: an apartment hunter, product buyer, job seeker, or travel planner. They need comparable options without maintaining a spreadsheet by hand.

### Secondary: the ongoing watcher

Someone whose saved options may change after capture. Price, availability, status, deadline, or listing state matters enough to revisit.

### Secondary: the web researcher

Someone collecting reference material such as recipes, articles, tools, vendors, or places. They want automatic organization and retrieval even when no formal decision Mission exists.

These personas share the same job: turn scattered web fragments into a reliable, organized working set.

## Why there are two product surfaces

### Chrome extension: capture

The extension removes filing and copying work at the moment of discovery. It is an intentionally untrusted, write-only capture client:

- capture an element, selected text, page/link context, or a bounded visual area;
- preserve the smallest useful evidence bundle: source URL, time, bounded text/context, optional sanitized HTML, and an optional screenshot or crop;
- optionally provide a Mission as context;
- submit through plain `fetch` with an owner-bound pairing token.

The extension must not import `@base44/sdk`, hold service credentials, or read the user's Collections and Records.
Capture modes are evidence inputs to the same organization pipeline, not separate filing systems. A URL-only capture does not authorize broad backend crawling.
If the extension does not provide a Project, the backend may propose one from the
owner's active Projects. It must never substitute "latest active Project." An explicit
Project always wins; an automatic Project assignment requires an owner-valid candidate,
at least `0.90` confidence, and at least a `0.15` lead over the next candidate. No clear
match remains global, while an ambiguous Project choice becomes review.

### Web dashboard: understanding and use

The dashboard is where captures become valuable:

- Collections appear and update in realtime;
- structured Records can be reviewed and compared;
- ambiguous routing and extraction can be corrected;
- source evidence, freshness, and history are visible;
- Missions provide optional purpose and decision context.

The dashboard uses the normal Base44 browser SDK because it has durable browser storage and can maintain realtime subscriptions.

The dashboard may also expose one configured **Magpie Agent** as a conversational
interface to the same product loop. It is broad across research domains but bounded
in authority: it can explain organization, compare owner-visible Items, and configure
explicit watches only through owner-validating backend functions. It does not replace
the event-driven routing code agent, receive direct entity-write tools, invent facts
that are absent from stored evidence, or expand the extension's permissions.

## Why this needs a real backend

An extension alone cannot reliably classify captures, enforce owner isolation, persist a structured model, run source checks after the browser closes, store screenshots, or stream updates into a separate dashboard.

Base44 is load-bearing:

- entities hold Clips, Collections, Records, Missions, routing decisions, watches, and history;
- backend functions authenticate the extension boundary and own all privileged writes;
- the AI gateway proposes routing, schemas, and extracted fields;
- deterministic server code validates every AI proposal;
- realtime sync produces the clip-to-live-table experience;
- file storage preserves screenshot evidence;
- scheduled functions keep supported fields current;
- RLS keeps owners isolated and preserves the asymmetric extension/dashboard trust boundary.

## Canonical product model

- **Mission:** an optional user goal or research context, such as "Move to Berlin" or "Choose a laptop." It owns constraints, preferences, and watch policy—not the identity of every captured object. The user may supply it explicitly, or the backend may assign it only through the bounded Project-routing rule above.
- **Collection:** an auto-organized type of thing with a reusable schema, such as Apartments, Neighborhoods, Moving companies, Laptops, or Recipes.
- **Record:** one structured item inside a Collection.
- **Clip:** the immutable source capture and evidence from which a Record was produced.
- **Routing decision:** the auditable decision to use an existing Collection, create a new Collection, or request review.
- **Enrichment:** a trusted source-backed change to a Record.
- **Folder:** an optional dashboard navigation group for Collections. Folders do not own Records, affect routing, replace Mission context, or cross into the extension.

The fixed hierarchy is:

```text
Mission (optional context)
└── Collection
    └── Record
        └── Clip and change evidence
```

A global Library can contain Collections that are not attached to a Mission.

V3.1 may present Collections through an additional bounded navigation tree:

```text
Folder
└── Subfolder (maximum one nested level)
    └── Collection reference
```

This is a view over Collections, not a second ownership hierarchy.

## Product principles

1. **Capture before filing.** Destination selection must not be required for the common capture path.
2. **AI proposes; code decides.** AI output is bounded, normalized, and validated before it changes durable state.
3. **Uncertainty is a product state.** Ambiguous clips go to review; unreachable or suspicious sources never create fictional changes.
4. **Evidence travels with data.** A structured value should remain traceable to its clip or verified source.
5. **Corrections improve future routing.** Moving a Record is feedback, not merely cleanup.
6. **The client is untrusted by design.** The extension can submit captures but cannot browse the owner's data.
7. **Automatic organization comes first.** Optional folders may improve navigation after capture, but they never become required filing, routing input, or canonical ownership.
8. **The demo must reveal backend depth.** Classification, entity creation, realtime state, enrichment, storage, auth, and RLS must be visible through one coherent user journey.
9. **Capture the smallest sufficient evidence.** Prefer a selected element or explicit visual crop; page and link captures remain bounded and never imply unrestricted crawling.
10. **Project inference is bounded organization, not recency.** A backend code agent may inspect only the current owner's active Projects and Collections, can submit only a proposal, has no entity-write tool, and cannot override deterministic validation.
11. **One intelligence layer, two execution modes.** Automatic capture routing is an
    event-driven backend workflow. The configured Magpie Agent is an authenticated
    user-facing interface over explicit, owner-validated capabilities. Both reuse the
    same canonical entities and deterministic authority boundaries.

## Non-goals for the competition build

- arbitrary-depth or routing-aware folders; V3.1 permits only a bounded two-level navigation tree for Collections;
- a general browser automation agent;
- autonomous purchasing, applications, or outreach;
- broad crawling of websites the user did not clip;
- automatic server-side retrieval of arbitrary user-submitted URLs without a separately approved SSRF and source-trust contract;
- a visual schema editor;
- team collaboration and permissions beyond owner isolation;
- many shallow connectors;
- replacing the evidence-backed workflow with an open-ended AI chat; the bounded
  Magpie Agent must remain grounded in owner-visible product data and approved tools.

## Version spine

- **V1 — Capture and structure:** clip web content; classify it; create structured Collections and Records; show them live.
- **V2 — Purpose and reliability:** add Missions, comparison context, capture intent, idempotency, and explicit enrichment failure states.
- **V3 — Automatic organization:** remove required destination selection; route to an existing Collection, safely create a new Collection, or request review; learn from corrections.
- **V3.1 — Product clarity and bounded organization:** improve naming, landing,
  onboarding, navigation, responsive polish, a bounded user-facing Magpie Agent, and
  optional two-level Collection folders without changing routing identity.
- **Later — Living knowledge:** strengthen field-level evidence, multi-source identity, deduplication, normalization, and collection-level questions.

Versions may change implementation details, but they must stay on the same product loop.

## Competition demo north star

Use one believable persona while demonstrating heterogeneous structure:

1. Create a Mission called **Move to Berlin**.
2. Clip an apartment listing, a neighborhood guide, and a moving company.
3. Magpie creates or selects **Apartments**, **Neighborhoods**, and **Moving companies** automatically.
4. The three structured Collections appear live in the dashboard.
5. A supported source field changes; Magpie updates the correct Record and shows the evidence-backed history.

This demonstrates breadth without presenting three unrelated novelty clips.

## Success criteria

- A paired user can clip without choosing a Collection.
- A high-confidence capture reaches the right existing Collection without manual work.
- A capture clearly related to one active Project is associated with it without requiring extension-side Project selection.
- A missing Project hint never means the latest or most recently created Project.
- A genuinely new type produces one sensible Collection rather than repeated near-duplicates.
- An ambiguous capture is visible in a review inbox and does not pollute a Collection.
- A failed or suspicious source check never mutates structured fields.
- A dashboard user can trace a Record to its source capture.
- A new user can understand Capture → Organize → Review → Refresh before signing in.
- Moving a Collection through an optional V3.1 folder never changes its Mission scope, schema, routing identity, or Records.
- The 60-second demo visibly uses Base44 backend depth to solve the user's problem.

## Authority and change policy

This charter is the durable source of product intent. Tactical handoffs and version plans may refine it but must not contradict it silently.

If a future decision changes the north star, personas, trust boundary, canonical model, or non-goals, update this file explicitly and record the reason in `docs/DECISIONS.md`.
