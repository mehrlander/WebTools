---
id: files-pane-finds-deck-reads-ubu13s
title: Let the Files pane find and the deck read, and stop it doing both
status: backlog
opened: 2026-08-26
project: web-tools
size: M
---
# Let the Files pane find and the deck read, and stop it doing both

The split is already declared. `lib/kits/file-deck.js` opens by stating it:

> The Files pane is a LIST, and a list is for scanning: thirty hairline rows,
> each one a `fileReview` card that expands in place. Reading a diff through it
> means expanding a row, scrolling past it, collapsing, expanding the next. That
> is a good way to find a file and a poor way to read one.

What never happened is taking the *reading* affordances out of the finder. Every
row still carries a caret and expands in place into the full four-tab dossier,
so one component is both surfaces at once and neither cleanly.

## Why

Two measurements, both at 430px, from the session that shipped PR #518.

**Six rows of chrome sit above the first filename**: the deck header, the
identity chip line, the facts strip, the Look row, the tab strip with its three
buttons, and the verdict filter strip. That is roughly a third of the viewport
before a single file appears.

**The expansion is the part that does not work.** A row opening in place pushes
everything below it, so reading several files means expand, scroll, collapse,
expand. `cardOpts` already hedges around this (`open: files.length <= 12 &&
innerWidth >= 768`), which is the tell: the pane is carrying a behaviour it has
to suppress on exactly the viewport where it matters most.

The deck has no such hedge, by construction. It is one file at a time, so its
cards start open, it renders a file as itself (a doc rendered, an image shown, a
`.gz` inflated), and its `read` host already collapsed the four source tabs to
one Compare pane with the second ref owned by the sidebar. That treatment is the
simpler one, and it survives today only alongside the older one rather than
replacing it.

## Scope

One outcome, three parts that land together:

- A row opens the deck at that file instead of expanding in place. The caret and
  the in-place card go; the row collapses to status, path, `±`, and the one
  action icon the density pass left it. `openFileDeckAt(path)` is already the
  method and is already what the row's action calls.
- Audit the six chrome rows against a phone viewport and decide which earn their
  place when Files is the active pane. Do not assume the answer is "fewer": the
  verdict strip is one line, it is cheap, and it is where the estate row's
  `11 missing` chip lands.
- Settle what happens to the four-tab dossier. With the list no longer mounting
  it, `pages/review.html` is its only remaining host, so either it stays as
  review's own shape or review adopts the deck too. Decide rather than leave two.

## Done when

A file in the Files pane is one tap from the deck, no row expands in place, and
the chrome above the first filename is a stated decision rather than an
accumulation. `tools/test/file-review-card.test.mjs` and
`tools/test/branch-brief-cards.test.mjs` both pin the current behaviour and will
need to move with it.

## Notes

Deferred from PR #518 on purpose. That branch made the surfacing caption link to
the branch page instead of enumerating files in chat, which raises the traffic
through this pane and is what made its shape worth looking at; the two are
separable and the caption change was the one asked for.

Do not read this as a rewrite. The collapsed row is the *output* of
`file-review-collapsed-density-2rvxfn`, which took a control off every row for
the reason a filter beats a badge, and the deck's own reading surface is
`sidebar-compare-view-lkjang`. This finishes the division those two started
rather than reopening either.

## Progress log
- 2026-08-26: Filed from the session that shipped PR #518, where the pane was
  read on a phone and rendered headless at 430px. The two measurements above are
  that session's; the argument is `file-deck.js`'s own and predates it.
