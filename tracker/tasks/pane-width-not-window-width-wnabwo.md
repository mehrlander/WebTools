---
id: pane-width-not-window-width-wnabwo
title: Audit the app's views for viewport breakpoints inside the content pane
status: backlog
project: repo
opened: 2026-08-23
size: S
---
# Audit the app's views for viewport breakpoints inside the content pane

Docking the swipe deck narrows the app's content pane through `--deck-dock-left`
and leaves the window where it was, so any `sm:`/`lg:`/`xl:` rule inside that
pane keeps answering a question nobody asked: how wide is the WINDOW. The Docs
tab was found this way (PR #480): its folder rail held a 20rem side column at
`lg:` while the pane was under 400px, the files column was pushed under the deck
and clipped, and the pane offered sideways scrolling to reach content it could
have stacked. Nothing was wrong at any window size, which is why it survived.

The Docs tab is fixed and is the worked example: `@container` on the block, then
`@2xl:`/`@5xl:` where the viewport variants were. What is unaudited is every
other view that can sit in that pane, plus any framed app view, since the same
gap opens wherever a pane and a window disagree.

**The rule is already written**, so this task is the sweep and nothing else.
`skills/daisy-alpine/references/mechanics.md` rule 10 states it: size a pane by
its container, not the viewport, `@container` on the column and `@md:`/`@xl:` in
place of `sm:`/`lg:`. (It is no longer in `docs/HTML-STYLE.md`, which became a
pointer on 2026-08-31 when the rules moved into the skill that fires on page
work.)

## Done when
Every view reachable in the content pane has been opened with the deck docked
and either reflows or is recorded as deliberately fixed-width.

## Progress log
- 2026-08-23: Filed from PR #480, which fixed the Docs tab and logged the class
  as `viewport-rule-blind-to-a-docked-pane` in SNAGS. `docs/HTML-STYLE.md`
  already carries the same lesson for a form in a split pane, so the rule exists
  and the sweep does not.
- 2026-08-23: The Stage bench converted, found the same way: a reader opened a
  stage of eight PDFs with the deck docked and the aside's `xl:` 26rem column
  laid itself out inside a 368px pane, overflowing it by 24px and painting over
  the deposit column. `@container` on the bench root, and the grid's three
  `lg:`/`xl:`/`2xl:` templates became `@2xl:`/`@5xl:`/`@7xl:`, each threshold the
  aside's own width plus the gap plus a lens column worth having. Measured
  before and after with a headless probe: 8 overlapping element pairs and 8
  elements past the pane's right edge, both to zero, with the undocked layout
  unchanged at every width. Still unaudited: every other view in the pane.
- 2026-09-03: The Files view converted, by PR #574, without this task being
  cited. Two independent width caps, not viewport breakpoints: `max-w-7xl` on
  the search pane in `app/index.html` and a `mx-auto` 65ch measure in
  `viewer.js`, composing into a 1280px pane inside a 1920px window with a 506px
  text column inside that. Both now `!max-w-none`. Worth noting for the sweep
  that this is a second mechanism: `npm run reading-column` reported "none" over
  the same screen, because a page-shell size and a standing opt-out are each
  exempt by design and still compose into a corridor. Recorded here on
  2026-09-04, during a refinement pass.
- 2026-09-04: Done-condition trimmed. The clause asking this task to state the
  rule in `docs/HTML-STYLE.md` is satisfied and then some: the rule exists as
  daisy-alpine mechanics rule 10, in the file a session loads unprompted on page
  work. Still unaudited: every view in the pane other than Docs, the Stage bench,
  and Files.
