# Redesign UI parity audit

Audited 2026-08-24 against the complete local
`design_handoff_magpie_redesign/Magpie Redesign.dc.html`, its corrected handoff
README, and the supplied 390px mobile screenshots. The source of truth is the
3b corrected screens plus the audit table; superseded Turn 1/2 concepts are not
requirements when they conflict with 3b.

| Surface or rule | Corrected target | Audit result | Resolution |
|---|---|---|---|
| Status color | Dots/colors describe current state, never Collection identity | Implemented | Keep |
| Collection density | Cards by default; Table is explicit | Implemented | Keep |
| Changed fields | Changed value leads and uses amber state | Implemented | Keep |
| Item detail hierarchy | Evidence, fields, history; rare controls behind one row | Implemented | Keep |
| Workspace layout | One navigation rail plus one content area | Implemented | Keep |
| Nest semantics | Only ambiguous/failed routing waits in Nest | Implemented | Keep |
| Nest card actions | Accept, Move, Create Collection, Dismiss with real reasons | Implemented | Keep |
| Mobile Nest | One-card triage deck with swipe affordances and position | Implemented | One actionable card, position, and the same real Keep/Re-route writes |
| Signals feed | Real changes/blocked/unreachable/revisit states grouped by day | Implemented | Keep |
| Watch manager | Real state/schedule plus pause/resume | Implemented | Keep |
| Manual watch creation | Item/field/frequency form that writes through the guarded watch contract | Implemented and locally exercised | Item details, Signals, Search, and contextual CTAs open the direct form |
| One-task onboarding | Usable Nest, one pairing modal, real capture recordings | Implemented | Keep |
| Pairing completion | Close only after a real extension handshake | Implemented | Keep |
| Search evidence | Item fields, captured text and sources; matched field named | Implemented | Keep |
| Typed numeric search | `under`/`over` applies to numeric values | Implemented | Keep |
| Search command surface | Items, Collections, actions and Ask while searching | Implemented and locally exercised | Typed results retain scopes, direct Watch, Ask, and live-Collection save |
| Saved search | Persisted live `saved_search` Collection excluded from routing | Implemented | Keep |
| Login | Existing auth with the one-live-record example | Implemented | Keep |
| Landing | Page → fields → changed value visible before scroll | Implemented | Keep |
| Mobile Collection discovery | Every owner-visible Collection can be selected | Implemented and locally exercised | The phone title is a real all-Collection selector that also repairs Project scope |
| Mobile Collection density | Changed-first compact cards with counts and sorting | Implemented and locally exercised | Counts, Browse all, sorting, 86px evidence thumbnails, and compact fields |
| Multi-item comparison | Select Items, compare differing fields, use real loaded Records | Implemented and locally exercised | Two-to-four selected Records open a real-field matrix with differences and watch state |
| iPad evidence correction | Evidence and structured fields side by side; drag/pencil correction | Implemented with captured evidence, not a fake embedded cross-origin page | Keep |
| Duplicate capture | Say “Already in Magpie” from the real duplicate response | Implemented in capture/share results | Keep |
| Push notifications | Lock-screen delivery | Not implemented | Requires subscription storage, VAPID secrets and delivery infrastructure; never fake in UI |

## Intentionally not copied from superseded mockups

- Per-Collection category colors.
- Table-first browsing, Timeline, and uppercase mono eyebrows.
- Archive status for removed Items.
- Threshold watch rules such as “price falls 3%”; watches are schedules.
- A permanent third activity column.
- Magic-link authentication.
- A schema editor or “Add column” workflow.

## Rendered verification

At 390×844, a real local account switched between `Camera Listings` and
`Recipes` from the Collection title, showed honest `Changed 0` / `All 1`
counts, and rendered the recipe as a compact row card. From that Item's detail
surface, a daily server Watch was created without opening chat; the persisted
rule immediately appeared in both Item details and Signals. At 1280×820, two
real camera Records opened the compare tray and a five-differing-field matrix.
A populated `camera` Search retained scope counts, direct Watch, Ask, Items,
and Collection results; its Watch action preselected the matching `model`
field. No deployment was run.
