# Magpie design system

> The durable reference. Read this before changing color, iconography, or
> layout hierarchy anywhere in the product, so the next redesign starts
> here instead of re-deriving it. `docs/VOICE.md` covers copy; this
> covers visual language. `docs/DASHBOARD_AUDIT.md` and
> `docs/LANDING_BENCHMARK.md` are the research notes that produced the
> rules below — read them for the *why*, this doc for the *what*.

## Color: status only, never category

Color is reserved for something specifically, currently true about the
thing it's on. It is never assigned by hashing an id, rotating through a
palette, or otherwise standing in for "which group is this" — if color
doesn't correspond to real state, don't use it; use an icon or plain text
instead. This was a real mistake in an earlier draft of this system
(generalizing the sidebar's per-Collection dot color) and got corrected
before shipping — see `docs/DECISIONS.md`.

Tokens, defined in `src/index.css`'s `:root` (each has a `-solid` variant
for text/icons and a `-bg` tint for backgrounds/badges):

| Token | Meaning | Reused from |
|---|---|---|
| `--status-fresh` | Recently captured, matches an active watch | existing `.watch-chip.on` green |
| `--status-changed` | A field's value changed since last viewed | existing "review" amber |
| `--status-review` | In the needs-review queue | same amber family as `changed` |
| `--status-blocked` | Source requires sign-in / blocked | existing danger terracotta |
| `--status-live` | A sync is happening right now | new — the only genuinely new hue |

Brand green (`#254d32` primary, `#193d27` hover) stays reserved for
actionable UI — buttons, links — so color never has to compete with
itself over "is this clickable."

## Iconography

Six custom marks (`src/components/icons.jsx`) exist for Magpie-specific,
recurring concepts: the three capture modes, pairing/connection, the
Agent, and the empty-Collection state. Lucide-react covers everything
else — close, back, arrows, checks, trash. Don't add a custom icon for
something lucide already covers well; do add one for a concept that
recurs across the product and is specific to Magpie, following the same
"build to lucide's visual weight" rule (24x24 viewBox, 2px round stroke)
documented in `docs/DECISIONS.md`'s Phase 2 entry.

## Hierarchy: guided by looking, not reading

- **One bold primary fact, one muted secondary line**, by default, per
  card or row. Anything else moves behind a detail view, a hover, or an
  explicit expand — it does not render inline just because the data
  exists.
- **Icon + one word beats a sentence.** A status is `⚠ blocked`, not "This
  source requires sign-in and Magpie can't log in for you." Reserve full
  sentences for the one-time explanation a first-time user needs (an
  empty state, onboarding), not for a label a returning user will see
  hundreds of times.
- **Rarely-used controls live behind a menu or expand**, not always
  rendered. If a control is used less often than the primary action on
  that screen, it shouldn't cost the same visual weight.
- **A pattern that already works should be generalized, not reinvented.**
  `ActivityPanel` (`src/App.jsx`) — icon-led heading, one bold fact + one
  muted timestamp per row — is the model; apply it elsewhere instead of
  inventing a new density pattern per surface.

## Copy

See `docs/VOICE.md` for headline/eyebrow rules (banned templated
patterns, which surface owns which device). It exists for the same
reason this file does: so the next surface doesn't re-derive what's
already been decided.

## Change log

- 2026-08-22 — status color tokens + hierarchy rules established
  (`docs/DASHBOARD_AUDIT.md`), superseding an unshipped draft that
  proposed hash-based Collection color instead.
