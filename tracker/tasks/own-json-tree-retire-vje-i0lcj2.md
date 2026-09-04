---
id: own-json-tree-retire-vje-i0lcj2
title: Build our own JSON tree for display, keep vanilla-jsoneditor for editing
status: backlog
opened: 2026-07-25
size: M
---
# Build our own JSON tree for display, keep vanilla-jsoneditor for editing

The viewer's `tree` mode loads vanilla-jsoneditor (VJE) from a CDN for every
JSON file anyone looks at. It is a full editor doing a read-only job almost
everywhere, it does not match this estate's UI, and it cannot participate in the
things the estate is growing. Filed from the 2026-07-25 `#data=` session.

## The fact that scopes it

Three mounts now load VJE, and only one of them is an editing workflow with a
consumer behind it. Measured 2026-09-04:

| Mount | Mode | Who edits |
| --- | --- | --- |
| `lib/alpineComponents/viewer.js` | editable tree, fires `viewer:tree-change` | [`popups/idb-nav.html`](../../popups/idb-nav.html) alone, which tracks `dirty`/`latestContent` and writes IndexedDB records back |
| `lib/alpineComponents/console.js` | `readOnly: true` | nobody; it is display |
| `lib/alpineComponents/transform-workbench.js` | editable tree | the workbench itself |

Every other consumer of `viewer.js`'s tree (the data route, the Files view, the
stage preview, chat-results) is read-only and reaches it through the one editable
mount. So this is not "VJE or ours"; it is "why is a 1.27 MB editor (373 KB
gzipped) the display path for readers who never type."

## Why build the reader

Four arguments, weakest first:

- **Consistency.** VJE ships its own CSS and does not read `data-theme`, so it
  renders bright blue chrome on an emerald DaisyUI page.
- **The offline bundle is not offline.** `dist/web-tools.js` is the library
  frozen into one self-booting offline artifact, and it contains
  `await import('https://cdn.jsdelivr.net/npm/vanilla-jsoneditor/standalone.js')`
  (four occurrences as of 2026-09-04, up from three). The tree mode punches a
  runtime CDN hole through the one artifact whose purpose is not needing the
  network, and the hole widens as mounts are added.
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
- VJE reachable as an explicitly requested mode; `idb-nav`'s edit round-trip and
  the workbench's still work, held by a test.
- `console.js` moves to the reader, since its mount is already `readOnly`.
- `dist/web-tools.js` no longer imports vanilla-jsoneditor on the default path.

**Before building, confirm the split with the user.** They were leaning toward
dropping VJE outright; the recommendation above is the counter-proposal and it
has never had an answer. That is what has held this task for its whole life, and
it is a one-line decision rather than work.

## Progress log
- 2026-07-25: filed from the `#data=` route session (PR #288). The single-editor
  finding, the bundle sizes, and the three `dist` occurrences were verified by
  grep, not recalled. User was leaning toward dropping VJE entirely; the split
  above is the counter-proposal and needs their call before anything is built.
- 2026-09-04: Scope facts corrected during a refinement pass. "Exactly one
  consumer edits" was true when filed and is not now: `transform-workbench.js`
  mounts VJE editable and `console.js` mounts it read-only, both since filing.
  The `dist` occurrence count moved three to four. The recommendation is
  unchanged and slightly stronger, since `console.js` is a second display-only
  mount paying the CDN cost. Sized M, and the pending decision moved out of a
  `next:` frontmatter key into the body where TRACKER.md puts it.
