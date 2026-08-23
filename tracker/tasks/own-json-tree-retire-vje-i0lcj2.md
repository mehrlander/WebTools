---
id: own-json-tree-retire-vje-i0lcj2
title: Build our own JSON tree for display, keep vanilla-jsoneditor for editing
status: backlog
opened: 2026-07-25
next: user was leaning toward replacing it outright; the recommendation is the split below, so confirm the split before building
---
# Build our own JSON tree for display, keep vanilla-jsoneditor for editing

The viewer's `tree` mode loads vanilla-jsoneditor (VJE) from a CDN for every
JSON file anyone looks at. It is a full editor doing a read-only job almost
everywhere, it does not match this estate's UI, and it cannot participate in the
things the estate is growing. Filed from the 2026-07-25 `#data=` session.

## The fact that scopes it

Exactly one consumer edits: [`popups/idb-nav.html`](../../popups/idb-nav.html)
listens for `viewer:tree-change`, tracks `dirty`/`latestContent`, and writes
IndexedDB records back. Every other mount (the data route, show-repo's Files
view, the stage preview, chat-results) is read-only. So this is not "VJE or
ours"; it is "why is a 1.27 MB editor (373 KB gzipped) the display path."

## Why build the reader

Four arguments, weakest first:

- **Consistency.** VJE ships its own CSS and does not read `data-theme`, so it
  renders bright blue chrome on an emerald DaisyUI page.
- **The offline bundle is not offline.** `dist/web-tools.js` is the library
  frozen into one self-booting offline artifact, and it contains
  `await import('https://cdn.jsdelivr.net/npm/vanilla-jsoneditor/standalone.js')`
  (three occurrences). The tree mode punches a runtime CDN hole through the one
  artifact whose purpose is not needing the network.
- **It cannot cooperate with the FAB.** VJE owns its viewport, ships its own
  toolbar with its own mode switcher, and has no way to contribute to our FAB.
  The double-switcher problem in `data-view-mobile-chrome-x5plcv` is not
  negotiable with VJE; it is fixed by owning the component.
- **It cannot grow the affordances we want.** Copy a node's JSON-path, toss a
  subtree as its own `#data=` link, jump to a key, deep-link a node through the
  fragment once `toss-fragment-passthrough-558xcw` lands. None of these are
  things a general-purpose editor will ever have, because they are specific to
  how this estate addresses content. This is the compounding argument and it is
  invisible on day one.

## What is actually hard

Not the rendering: a collapsible typed tree is a couple hundred lines, and
collapse-by-default makes it naturally lazy, since a closed node builds no DOM.

- **Breadth, not depth.** Collapse-by-default handles nesting for free but not a
  single array of 100k rows at one level. Prefer an honest "showing 100 of
  100,000" affordance over windowing: ten lines, and it does not lie. VJE solves
  this properly, so dropping it means accepting a cruder answer here.
- **Number precision.** `JSON.parse` mangles integers past 2^53 and VJE has a
  lossless mode. For budget data that is not academic. Note this is not a
  regression (the table mode already does a plain `JSON.parse`), and a
  hand-built tree could improve on it by parsing to strings where precision
  would be lost.

## The shape recommended

A split, not a removal:

- **Ours becomes `tree`**, the display mode, a normal registry module. Themed,
  FAB-aware, no CDN.
- **VJE becomes `edit`**, requested explicitly. `idb-nav` asks for it by
  `defaultMode` and its editing workflow is untouched. It stops loading for
  everyone else, which is most of the time.

The registry already supports per-page mode selection, so this needs no new
mechanism.

## The judgment behind it

Writing either component is cheap now; owning them differs by an order of
magnitude. A reader that renders a node wrong shows something ugly and gets
fixed. A writer that saves a mangled value costs data, and its edge cases
(precision, key order, undefined vs null, partial edits mid-keystroke) are the
ones nobody thinks to test. Build the reader, keep the writer.

## Definition of done

- A `tree` module in `lib/alpineComponents/viewer.js` (or a kit it loads) that
  renders JSON with no network call, honors the DaisyUI theme, and caps
  large-array expansion visibly.
- VJE reachable as an explicitly requested mode; `idb-nav`'s edit round-trip
  still works, held by a test.
- `dist/web-tools.js` no longer imports vanilla-jsoneditor on the default path.

## Progress log
- 2026-07-25: filed from the `#data=` route session (PR #288). The single-editor
  finding, the bundle sizes, and the three `dist` occurrences were verified by
  grep, not recalled. User was leaning toward dropping VJE entirely; the split
  above is the counter-proposal and needs their call before anything is built.
