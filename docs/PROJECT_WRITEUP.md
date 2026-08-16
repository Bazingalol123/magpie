# Magpie — project write-up

## Short version (submission form)

Magpie turns web pages — listings, products, jobs, recipes — into
structured, owner-scoped Items that stay current: capture, understand,
organize, review, compare, refresh. It's a Chrome MV3 extension, a Base44
backend, and a React dashboard.

The extension never imports the Base44 SDK. It holds one opaque pairing
token and talks to the backend over plain `fetch` — it can submit captures
and read nothing else, so a stolen token can only spam junk into its own
owner's account. Every write goes through a backend function using the
service role. An AI Gateway call proposes where a capture belongs; code
validates confidence, ownership, and schema safety before anything is
written — the AI has no write access anywhere in the system. When it isn't
confident, the capture waits in "Needs review" instead of guessing.

Biggest decision I'd defend: full delete over soft-archive for Items — no
undo, but no hidden state either. Biggest thing I got wrong: every entity's
row-level security had an admin bypass, so my own (default-admin) account
could read another signed-up user's data. Found it live mid-build, wrote up
the incident before touching code, removed the bypass from all eight
entities, verified the leak was closed.

Not done: bounded folders (designed, not built), and no proof of behavior
under truly concurrent capture requests.

---

## Full version

Magpie turns pieces of the web — listings, products, jobs, recipes — into
structured, owner-scoped Items that stay current. `capture → understand →
organize → review → compare → refresh`. It's a Chrome extension, a Base44
backend, and a React dashboard. The intended public app URL after the Base44
custom-domain connection is
<https://magpiecapture.com>.

## How it's built

- **Extension (MV3)**: element/snip/page/right-click capture. It never
  imports the Base44 SDK — it holds one opaque pairing token in
  `chrome.storage.local` and talks to the backend over plain `fetch`. It can
  submit captures and nothing else; it has no code path that reads a
  Collection, an Item, or anyone's data.
- **Backend (Base44 functions + entities)**: every write goes through a
  backend function using the service role, never a direct client write. An
  AI Gateway call proposes where a capture belongs (an existing Collection,
  a new one, or "I'm not sure"); deterministic code validates that proposal
  — ownership, confidence thresholds, safe naming, schema shape — before
  anything is written. The AI has no write tool anywhere in the system.
- **Dashboard (React)**: normal authenticated SDK, realtime subscriptions,
  and a bounded conversational agent ("Ask Magpie") that can read owner data
  and configure watches through four backend functions, but has no direct
  entity access and no memory between conversations.

## Decisions I'd defend

- **Uncertainty is a state, not a guess.** When the router isn't confident,
  the capture sits in "Needs review" instead of filing itself somewhere
  wrong or inventing a plausible-looking Collection. This cost UI work
  (accept/redirect/create/dismiss) but it's the difference between a tool
  you can trust and one you have to double-check.
- **Full delete, not soft-archive.** Removing an Item permanently deletes
  its capture, watches, and update history in one cascade. No undo. I
  considered a `dismissed`/archived state and rejected it — it adds hidden
  state the current build has no UI to manage, and the owner explicitly
  asking to delete their own evidence is a narrow, deliberate exception to
  "evidence stays with the data," not a precedent for deleting anything else.
- **The extension is write-only, permanently.** Every feature that could
  have been "just let the extension read a little" (showing existing
  Collections in the picker, letting it show dedupe hints) was rejected in
  favor of routing that need back through an authenticated backend call. A
  stolen pairing token should only ever be able to submit junk, never read
  anything.
- **Refresh-on-revisit instead of promising server-side monitoring for
  everything.** Most listing sites block anonymous server checks (login
  walls, bot challenges). Rather than silently failing or scraping around
  the block, Magpie says so plainly and, when the owner naturally revisits
  a saved page in their own logged-in browser, quietly re-captures it
  through the same guarded diff a server check would use. It's honest about
  what it can't do and closes the gap the one legitimate way available.
- **No server-side fetching of arbitrary submitted URLs.** Link captures
  store the browser-observed label and context, not a server-side crawl of
  the target. Fewer features, no SSRF surface.

## What I got wrong and had to fix

**A real cross-owner data leak.** Every entity's row-level security had an
admin bypass clause (`role: "admin"` could read/write any owner's rows,
alongside the normal owner check). Base44 assigns that role to the app
creator by default, so my own account could see another signed-up user's
captures — I found this live, mid-build, when a friend testing the app
flagged that our libraries looked mixed. I traced it to the RLS rule, wrote
up the incident and the fix in the risk plan before touching anything,
removed the bypass from all eight entities and the one backend helper that
mirrored it, and verified live that the leak was closed. It's documented in
full in `docs/DECISIONS.md` and `docs/ENGINEERING_NOTES.md` rather than
quietly folded in — it's the most serious bug this project had.

**The hosted SDK throws instead of returning null.** `entity.get()` on a
missing ID raises rather than resolving to `null`, so a naive `if (!row)`
guard was dead code in production and 404s were escaping as 500s. Found via
a live smoke test, fixed with a small `getOrNull` helper, and swept across
every function with the same pattern.

**Classifier field selection isn't guaranteed to include the field you'd
want.** While building the demo I found a Collection whose AI-inferred
schema never included a price field at all, so "Check source now" had
nothing to check. Not a bug in the letter of the spec — the classifier did
what it was asked, infer fields from what's visible — but it's a real gap:
nothing forces an obviously useful field like price into a shopping-type
schema. Worked around it for the demo; didn't have time to fix the
underlying inference before the deadline.

## What's not done

- Bounded two-level Collection folders — designed, not built.
- No proof of correct behavior under truly simultaneous capture requests;
  sequential retries are idempotent, concurrent ones are untested.
- The full Chrome integration matrix (every right-click mode, real crop
  geometry, multimodal routing) has been exercised manually but not against
  a formal browser test matrix.
- No undo for deletion or routing resolution — a deliberate, recorded
  omission, not an oversight (see `docs/DECISIONS.md`).

## Testing

123 Deno tests covering routing (existing/new/review/cross-owner/ambiguous),
persistence idempotency, deletion cascades, resolution, enrichment outcomes,
and the RLS-adjacent auth helpers — all pure fixtures against in-memory fake
services, including ones that pin the hosted SDK's throw-on-missing
behavior. Every backend entry point type-checks; every deploy was smoke-
tested against production before being called done.
