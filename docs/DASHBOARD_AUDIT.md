# Dashboard structural audit (dashboard redesign, R1)

> Research note, not an implementation — the required first step before
> any layout change, per the owner's direction that the previous plan
> (an earlier draft of this document) wrongly assumed the current layout
> was sufficient and just added color on top of it. Findings below come
> from reading the actual rendered structure in `src/App.jsx` /
> `src/index.css`, plus a live screenshot of Linear's real issue-tracker
> UI (not its marketing page) captured the same session.

## What the real reference actually does

Linear's issue view (real app, signed-in-equivalent screenshot): one
primary content pane (title, one description paragraph, a compact
activity feed) plus one property panel that represents status, priority,
and assignee as **icon + one word** each — never a sentence. Rarely-used
actions live behind a menu, not rendered inline by default. Nothing is
color-coded arbitrarily; every color present (the amber "In Progress"
icon, the priority bars) corresponds to something specifically true about
that issue.

## Where Magpie's dashboard diverges, with evidence

**`RecordDetail` (`App.jsx:639-710+`) is the worst offender.** Opening one
Item unconditionally stacks: an eyebrow line, the title, a source link, a
`.structured-fields` list rendering *every* schema field as a plain row
(`.field-row span` and `.field-row b` are the same two neutral colors —
`#78857b` / `#304136` — regardless of what the field means or whether it
changed), the capture screenshot, `CapturedContext` (a 240-character text
preview plus a `<details>` toggle for the full raw capture), a
blocked-source paragraph when relevant, a watch-status sentence, an
**always-rendered** `<select>` for refresh strategy plus a "Last checked"
sentence, and a danger zone. That's 8-10 stacked text blocks with no
color or size signal distinguishing "the one fact that matters" from "a
control you'll use once a month." Compare to Linear's icon+word property
panel and menu-gated rare actions.

**Three panels render simultaneously, always** (`.workspace-grid`,
`index.css:50`: `215px minmax(0,1fr) 242px` — sidebar / table / activity
panel). Linear shows one primary pane plus one collapsible property
panel — two content areas competing for attention, not three permanent
columns.

**The table view is still the default `displayMode`** (`App.jsx:1811`,
`RecordTable` defaults to `"table"`), and the table (`index.css:69`)
renders every schema column as a plain unstyled text cell — no color, no
visual lead, no differentiation between a field that just changed and one
that's been stable for months. The card view (`RecordCardGrid`,
`App.jsx:566`) already renders roughly the right shape — one bold primary
fact, up to two short secondary lines, a source line — it's simply not
what a user sees by default.

## What already works, and should be generalized rather than replaced

`ActivityPanel` (`App.jsx:610-634`): a small icon-led heading, then a list
where every row is exactly one bold fact (`<b>{field}</b> changed to
<strong>{value}</strong>`) plus one muted timestamp (`<small>`), nothing
else. This is already the "guided by looking" pattern the rest of the
dashboard lacks — the fix isn't inventing a new pattern, it's applying
this one more broadly and giving it a real status color instead of
uniform gray/green.

## What this means for the redesign

- Give `.field-row` a status color when a field's value actually changed
  since the record was last viewed, instead of every row reading
  identically.
- Cut `RecordDetail` to primary content up top, rare controls (refresh
  strategy, danger zone, full raw-capture text) behind an explicit
  expand/menu instead of always rendered.
- Make the card view the default; keep the table as the explicit
  alternate for anyone who wants the dense view.
- Reconsider the three-always-visible-panel layout now that recent
  changes can surface as status color directly on the affected record,
  rather than only existing in a permanently-occupied activity column.

See `docs/DESIGN_SYSTEM.md` for the resulting color tokens and hierarchy
rules, and `docs/DECISIONS.md` for why the first version of this plan
(hash-based Collection color, layout left unquestioned) was wrong.
