# Landing page benchmark (de-templating pass, Phase 5)

> Research note, not an implementation. Three respected B2C/B2B product
> landing pages were opened live in a real browser (Linear, Raycast,
> Notion — 2026-08-22) specifically to find concrete, evidenced patterns,
> not to work from memory. See `docs/DECISIONS.md` for why this stayed
> research-only rather than an immediate edit.

## What all three actually do

- **The headline is a direct, literal sentence, never a metaphor
  template.** Linear: "The product development system for teams and
  agents." Notion: "Where teams and agents think together." Raycast:
  "Your shortcut to everything." None use a "Turn/Transform X into Y"
  formula — Magpie's own hero headline does.
- **No jargon eyebrow label above the headline.** None of the three have
  a small uppercase/mono label sitting above the H1. Magpie's `.eyebrow`
  pattern (e.g. "web intelligence, kept alive", "bounded AI, deterministic
  writes") has no equivalent on any of them.
- **One emphasis device, used once, and it isn't a second typeface.**
  Raycast highlights specific words in color within the same sans-serif
  weight. Notion puts one word in a colored rounded-pill background. Both
  are punchier and simpler than Magpie's approach (a separate italic serif
  font family, `Instrument Serif`, applied to an accent phrase) and neither
  repeats their device site-wide the way Magpie's italic accent currently
  does.
- **The hero visual is a real, high-fidelity product screenshot** — actual
  app chrome, actual-looking data (Linear: a real issue detail view with
  an AI panel; Notion: a real workspace with a kanban board named "Ramp
  HQ"). None of the three use an abstract, hand-built "fake UI" mockup
  (skeleton bars, placeholder gray lines) anywhere above the fold. This is
  the most consistent, most load-bearing pattern across all three.
- **No numbered "01/02/03" step badges** anywhere in any of their heroes.
- **CTAs are plain-text buttons.** Raycast's download buttons carry one
  functional platform icon (Apple/Windows) each — not decorative.
- **Notion also uses real customer logos** (OpenAI, Figma, Vercel, Nvidia,
  Volvo, L'Oréal, Discord) as social proof, plus small hand-drawn character
  illustrations for warmth — neither Linear nor Raycast do this, so it
  reads as optional rather than a pattern to copy.

## Where this lands for Magpie's actual page

`src/Landing.jsx` already avoids some of what the benchmark sites avoid —
its hero visual (the three floating apartment/camera/recipe cards) is at
least concrete, labeled data rather than abstract shapes. But three things
line up with real, cross-cutting tells already named in `docs/VOICE.md`:
the "Turn X into Y" headline formula, the jargon eyebrows, and the italic
accent device are all things zero of the three benchmarked sites do, not
just something Magpie does slightly differently.

The clearest, most corroborated finding — real screenshots over hand-built
mockups — is also the one item that **isn't** a safe mechanical swap for
Magpie specifically. `src/Landing.jsx`'s `ld-story` section (three scenes:
clipping an apartment, Collections building themselves, a rent change
propagating) is built entirely from `.ld-mock-*` CSS illustrations tied to
a specific fictional "moving to Berlin" narrative. Magpie's existing real
capture assets (`public/onboarding/first-value.png`,
`desktop-capture.gif`, etc.) are real, but they're generic capture-flow
demos, not a Berlin apartment listing — dropping them in as-is would
either break the narrative the surrounding copy tells, or require
rewriting that copy to fit whatever the real assets actually show. Either
path is a real content decision, not a mechanical asset substitution, so
it wasn't done without checking first.

## Punch list

Ranked by how mechanical the change actually is, not by how visible it is:

1. **Retire the two Landing jargon eyebrows** ("web intelligence, kept
   alive", "bounded AI, deterministic writes") for plainer language, same
   pattern already applied to onboarding/login in Phase 1's `docs/VOICE.md`
   pass. Mechanical, low-risk, no layout change.
2. **Cap the italic-accent-word device Landing already "owns" at once
   instead of three times** (currently used in the hero H1, the story H2,
   and the AI-section H2). Mechanical, low-risk — Phase 3 already proved
   this pattern out on the login page.
3. **Drop the "01/02/03" numbered badges from the `ld-scene-index` spans**
   in the story section (the `ld-steps` section's icon-based steps can
   stay, since an icon isn't the numbered-badge motif). Mechanical as long
   as it doesn't touch the mockups those badges sit next to.
4. **Replace the `ld-story` section's hand-built fake-UI mockups with real
   evidence** — the highest-value change and the one every benchmarked
   site actually does, but it needs a decision first: either record real
   capture footage matching the Berlin-apartment narrative specifically,
   or rewrite the story copy around Magpie's existing generic real
   screenshots. Not implemented this pass; needs your call on which.

Items 1–3 are ready to implement on your go-ahead. Item 4 needs a decision
on which path before any code changes.
