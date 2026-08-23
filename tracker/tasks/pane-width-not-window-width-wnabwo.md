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

## Done when
Every view reachable in the content pane has been opened with the deck docked
and either reflows or is recorded as deliberately fixed-width. Convert the ones
that do not, and if the pattern is general enough, state it once in
[`docs/HTML-STYLE.md`](../../docs/HTML-STYLE.md) beside the form-in-a-split-pane
rule it repeats.

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
