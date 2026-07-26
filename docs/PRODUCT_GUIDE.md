# Magpie product guide

Magpie's product loop is:

`capture → understand → organize → review → compare → refresh`

You clip evidence from the web; Magpie understands what kind of thing it is,
files it with its siblings as structured data, routes uncertainty to you
instead of guessing, and keeps watching sources so the data stays true.

## Core concepts

| Concept | What it is |
|---|---|
| **Capture** | The immutable evidence you clipped: source URL, selected text, optional screenshot, timestamp. Everything else traces back to one of these. |
| **Collection** | A reusable *type* of thing with a field schema — Apartments, Cameras, Recipes. Magpie creates and reuses these automatically. |
| **Item** | One structured row inside a Collection, extracted from a Capture. |
| **Project** | Optional purpose context — "Move to Berlin", "Getting a new camera". Collections and Items can live under a Project or in the global Library. |
| **Update** | A trusted, source-backed field change with before/after values and a timestamp. |
| **Watch** | A schedule (hourly/daily/weekly) for re-checking an Item's source. |

The hierarchy: a Project (optional) contains Collections, a Collection contains
Items, and every Item keeps its Capture evidence and Update history attached.

## Capturing

Six evidence modes, one pipeline — you never pick a destination:

- **Element** (`Alt+Shift+M`, hover, `C` or click): the bounded HTML and text
  of exactly the element you point at, plus a screenshot. The default and most
  precise mode.
- **Snip area**: drag a rectangle like a screenshot tool. Magpie gets the
  cropped pixels *and* the text under them, and can route from what it sees —
  useful for visual layouts, maps, and stubborn markup.
- **Save page**: title, description, and bounded visible text of the whole
  page. No full-page HTML is ever sent.
- **Right-click → selection / link / image**: capture selected text with its
  surrounding context, a link target with its label (the linked page is *not*
  fetched server-side — a URL is evidence, not permission to crawl), or an
  image with its caption and a crop.

Every mode is size-bounded in the browser *and* re-bounded on the server
(20,000 characters of text; 12,000 of element HTML). Capturing the identical
thing twice reports **"Already in Magpie"** instead of filing a twin.

## Automatic organization

When a capture arrives, an AI agent proposes where it belongs — an existing
Collection, a brand-new Collection with an inferred schema, or an active
Project match. Then deterministic server code decides:

- Proposals are validated for ownership, scope, schema safety, and confidence
  thresholds. The AI has **no write access** — it only suggests.
- A clearly matching existing Collection is reused; equivalent names and
  schemas are detected so you get one "Apartments", not five near-duplicates.
- A genuinely new type creates one Collection with a sensible schema, and the
  Item's fields are extracted only from what the capture actually supports.
- A capture obviously belonging to one of your active Projects is filed under
  it automatically — but only at high confidence with a clear margin.
  Ambiguity never guesses.

## Needs review

Anything Magpie couldn't place confidently — mixed content, low confidence,
unsafe proposals, an AI outage — waits in **Needs review** rather than
polluting a Collection. Nothing is created until you decide. For each capture
you see the evidence, Magpie's reasons in plain language, and its confidence,
with four actions:

- **Accept** Magpie's stored suggestion (shown only when it had one);
- **Move** into any existing Collection;
- **Create** a Collection yourself — name it, tune the fields, optionally
  place it under a Project (or create the Project inline);
- **Dismiss** — permanently discards the capture and its routing history.

The extension's "needs review" toast deep-links straight to the waiting
capture.

## Items, comparison, and removal

A Collection renders as a live table — new captures appear in realtime, URL
fields are clickable, and a lock badge marks Items whose source is
login-walled. An Item's detail panel shows its fields, the original screenshot
and captured text, freshness, update history, and per-Project decision status
(shortlist / contacted / rejected).

**Remove this item** permanently deletes an Item along with its watches,
update history, capture, and routing record — after an explicit confirmation.
There is no undo; removal is a real deletion, not an archive.

The same permanent-delete action is available one and two levels up: removing
a Collection from the sidebar deletes every Item inside it, and removing a
Project from the switcher deletes every Collection (and Item) scoped to it,
each behind the same two-step confirmation. Deleting a Project never touches
a Needs-review capture that only had it as a hint — only Collections and
Items actually filed under the Project are removed.

## Staying current

- **Check source now** re-reads a source on demand.
- **Watches** re-check automatically on your schedule. Only trusted, plausible
  changes touch your data: suspicious values (a rent dropping 90%), unreachable
  pages, and bot walls *never* mutate fields — they surface as typed states.
- **Blocked sources**: login walls and anti-bot checks are a stable fact, not
  an error. After three consecutive blocked checks a watch pauses itself
  instead of burning checks forever, and the Item explains why.
- **Refresh-on-revisit** closes the loop the server can't: when you naturally
  visit a page you've saved, the extension re-captures it *in your logged-in
  browser* and Magpie applies the same guarded field-diff a server check would
  have. Real changes land in history, freshness recovers, and an auto-paused
  watch wakes back up. Bounded to pages you explicitly saved, rate-limited to
  once per page per 12 hours, announced by a toast when it changes anything,
  and switchable off in the popup.

## Ask Magpie

The dashboard's conversational agent works across everything you own: summarize
the workspace, compare Items side by side, explain any routing decision with
its actual reason codes, and create or adjust watches. Its boundaries are
strict by design: it reads only bounded, owner-checked data through four
backend tools, has no direct database access and no memory between
conversations, and never claims an action a tool didn't confirm.

## Trust model

Two principals, deliberately unequal:

| | Extension | Dashboard |
|---|---|---|
| Identity | Opaque pairing token (server stores only its hash) | Your Google sign-in |
| Can | Submit captures and refreshes for its paired owner | Read and manage everything you own |
| Cannot | Read *any* workspace data — collections, items, captures, watches | See any other owner's data |

Consequences you can rely on: a stolen pairing token can at worst submit junk
into its own owner's account — it reads nothing. The extension's
refresh-on-revisit memory is a local list of URLs *it* captured, stored next to
the token; the server never sends your data down to the extension. Deleting
the extension wipes both together — after re-pairing, refresh coverage rebuilds
as you capture and re-clip. And Magpie never crawls: the only pages it reads
server-side are exact source URLs you explicitly saved, and the only pages the
extension reads are ones you're looking at.
