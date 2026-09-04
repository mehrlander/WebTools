---
id: files-pane-finds-deck-reads-ubu13s
title: Let the Files pane find and the deck read, and stop it doing both
status: backlog
opened: 2026-08-26
project: web-tools
size: M
---
# Let the Files pane find and the deck read, and stop it doing both

`lib/kits/file-deck.js` already declares the split in its opening comment: the
Files pane is a list, and a list is for scanning. What never happened is taking
the *reading* affordances out of the finder. Every row still carries a caret and
expands into the full four-tab dossier, so one component is both surfaces and
neither cleanly.

## Why, measured at 430px on PR #518

**Six rows of chrome sit above the first filename**: deck header, identity chip
line, facts strip, Look row, tab strip, verdict filter. Roughly a third of the
viewport before a file appears.

**Expansion is the part that fails.** A row opening in place pushes everything
below it, so reading several files means expand, scroll, collapse, expand.
`cardOpts` hedges around this already (`open: files.length <= 12 && innerWidth
>= 768`), which is the tell: the pane suppresses its own behaviour on exactly
the viewport where it matters most. The deck needs no such hedge, being one file
at a time, and its `read` host already collapsed the four source tabs to one
Compare pane with the second ref owned by the sidebar.

## Scope, three parts landing together

1. A row opens the deck at that file instead of expanding. Caret and in-place
   card go; the row collapses to status, path, `±`, and the one action icon.
   `openFileDeckAt(path)` is already the method the row's action calls.
2. Decide which of the six chrome rows earn their place when Files is active.
   Not necessarily fewer: the verdict strip is one line and is where the estate
   row's `11 missing` chip lands.
3. Settle the four-tab dossier. With the list no longer mounting it,
   `pages/review.html` is its only host, so either it keeps that shape or review
   adopts the deck too. Decide rather than leave two.

## Done when
A file is one tap from the deck, no row expands in place, and the chrome above
the first filename is a decision rather than an accumulation.
`tools/test/file-review-card.test.mjs` and `branch-brief-cards.test.mjs` pin the
current behaviour and move with it.

## Notes
Not a rewrite. The collapsed row is the output of
`file-review-collapsed-density-2rvxfn` and the deck's reading surface is
`sidebar-compare-view-lkjang`; this finishes the division those two started.

## Progress log
- 2026-08-26: Filed from PR #518, deferred on purpose: that branch made the
  caption link to the branch page rather than enumerating files, which raises
  traffic through this pane and is what made its shape worth looking at.
- 2026-09-04: Re-verified after PR #574 touched the Files view. Both facts hold:
  the `cardOpts` hedge is still there and `openFileDeckAt` is still the method.
  #574 changed widths, not this structure. Body cut from 683 words.
