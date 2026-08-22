# Voice guardrails

> Read this before writing headline, eyebrow, or CTA copy anywhere in the
> product. It exists because Magpie's marketing, onboarding, and login copy
> had independently converged on the same handful of generic-AI-SaaS
> templates — see `docs/DECISIONS.md` "De-templating pass, Phase 1" for the
> audit that prompted it.

## The actual problem

Not any single phrase — repetition. When the onboarding wizard, the landing
page, and the login screen all reach for the identical rhetorical device,
the product reads as scaffolded rather than designed, even if each instance
is individually fine. Each surface should sound like it was written for that
moment, not filled in from a shared template.

## Banned by default

Don't reach for these reflexively. They're not permanently forbidden, but
each one may appear in **at most one surface** across the whole product —
check `docs/DECISIONS.md` for which surface currently "owns" it before
adding another instance.

- **The "Turn X into Y" headline formula.** ("Turn the messy web into living
  structured collections", "Turn what you find into an organized
  workspace".) Landing's hero currently owns this one. Nowhere else should
  use it — say what the surface actually does instead.
- **A single italicized/serif accent word for emphasis.** Landing's hero
  currently owns this. It stops reading as a deliberate accent and starts
  reading as a tic once it shows up in every H1/H2 in the product.
- **Numbered "01 / 02 / 03" step badges.** Fine as a one-off; not fine
  repeated across the login page, the landing steps section, and the
  landing story section simultaneously.
- **Abstract jargon eyebrows** ("bounded ai, deterministic writes", "web
  intelligence, kept alive"). These describe the product from the outside,
  in the vocabulary of a pitch deck, rather than saying the concrete thing
  a user is about to see.

## Write from the actual product, not the pitch

Ground copy in the real loop from `docs/PRODUCT_CHARTER.md`: `clip ->
understand -> organize -> review -> compare -> refresh`, and in Magpie's
real nouns — Project, Collection, Item, Capture, watch. If a sentence would
be equally true of a generic "AI-powered" tool, it's too abstract; say the
specific thing Magpie does.

**Before / after, from this pass:**

- Onboarding welcome headline. Before: "Turn what you find into an
  organized workspace." (duplicated Landing's formula, said nothing Magpie-
  specific). After: "Save it once. Magpie keeps it organized and current."
  (two concrete claims — filing and staying current — that the lede right
  below it immediately backs up).

## What's out of scope for this doc

Landing page copy (`src/Landing.jsx`) is intentionally not touched by this
pass — the owner confirmed the landing page reads fine as-is and asked for
a benchmark pass against real B2C product sites before editing it further.
Its two flagged jargon eyebrows and its "Turn X into Y" / italic-accent
usage stay as the one deliberate instance of each, pending that benchmark
punch list.
