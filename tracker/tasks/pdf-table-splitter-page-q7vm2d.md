---
id: pdf-table-splitter-page-q7vm2d
title: A column-splitter page for the pdf kit
status: backlog
opened: 2026-07-25
---
# A column-splitter page for the pdf kit

Port the interactive column-designation surface built in chat on 2026-05-13
onto a real page under `pages/`, driven by `lib/kits/pdf.js`.

## What it was

A popup, written as a template literal inside a `PdfHelper.prototype`
method, that rendered a page to canvas in the main window, pushed it to the
popup as a data URL, and laid an HTML text overlay on top. Over it:

- draggable vertical splitters, click to place and click again to delete
- a thin border around every text item ("shrink wrap"), so the gap between
  where a container starts and where the ink starts is visible
- colour coding: each item takes the colour of the column it is assigned to,
  updating live as a splitter moves
- a Tabulator preview of the resulting table, and a CSV export

## Why it belongs in `pages/`

The popup form was a consequence of the console being the only delivery
channel, not a design choice. A page gets the repo's whole apparatus for
free: daisyUI conventions, a thumbnail, `?use=` branch preview, and
`npm run shot` for headless screenshots.

That last one is the real argument. This is a geometry problem that was
debugged by looking at screenshots and describing them in prose, over
several sessions. On a page, a session can render it and check the pixels
itself.

## What the kit already provides (updated)

`pdf.stream.split(items, boundaries)` is the assignment logic, including the
start-position rule the 2026-05 session arrived at (a value that overruns
into the next column belongs to the one it began in, not the one its centre
lands in). `pdf.stream.columns` and `pdf.stream.gutters` can both propose
starting boundaries. `pdf.view(viewport)` supplies the rest: PDF space to screen and back through
the viewport's real inverse transform, `at()` for a point hit test, and
`select()` for a drag rectangle in either contained or intersecting mode.
`unbox()` turns a dragged rectangle back into a PDF-space region the pure
layers accept, so a selection feeds straight into `columns` or `grids`.

So the page is a UI over settled logic, not a new algorithm. What is left is
pointer events, rendering, and state, which is exactly what an Alpine
component is for; `cm-editor.js` over `cm6.js` is the shape to copy.

## Known defects to carry across, not repeat

- **Cross-window font rendering.** pdf.js registers fonts to the document
  that owns the canvas. Render in the main window and hand the popup a data
  URL, or the text silently fails to draw. On a same-document page this
  stops being an issue, which is another argument for the move.
- **Unit mismatch.** Splitters were stored in raw PDF units and compared
  against viewport pixels, so they drifted from the text. Fixed at the source:
  `pdf.view` does the conversion through the true inverse transform, verified
  against pdf.js's own `convertToViewportPoint` to 0.02pt. Work in screen
  space, which is the space the pointer speaks, and call `unbox()` at the
  boundary.
- **Header lumping.** The last message of the 2026-05-13 thread reports the
  colour overlay assigning header cells correctly while the data preview
  mashed them into one column: the visual layer and the extraction layer
  disagreeing. Diagnosed as the preview running on merged chunks rather than
  the assignment the overlay showed. Never confirmed fixed. Reproduce it
  first, because the disagreement is the interesting part.

## The shrink-wrap expectation, now quantified

The reported box is a typographical container, not the ink. Measured at 12pt
across five standard fonts (`npm run test:pdf`): the box starts 0 to 1.0pt
before the ink, always, and an italic W overhangs its box on the right by up
to 1.01pt. So a "shrink wrapped" border will look loose on the left and can
clip an italic on the right, and that is the document, not a bug in the
drawing. Say so in the UI rather than trying to tighten it.

## What pdf-inspect already covers

PR #294 shipped `pages/pdf-inspect.html`, which overlaps this task more than it
looked like it would. It already renders the page with the item boxes drawn,
resolves what is under the pointer, selects by drag, and reads the table two
ways side by side.

What is left that is genuinely this task: **draggable column boundaries with
live reassignment**. That is the one thing the 2026-05 session had that the
inspector does not, and it is the interaction the header-lumping defect was
found in. Re-scope accordingly rather than rebuilding the surrounding page.

## Progress log
- 2026-07-25: Filed alongside the kit (PR #294). The kit carries the logic;
  this is the surface.
- 2026-07-25: Unblocked. `pdf.view` landed on the same PR, which removes the
  coordinate work and the unit-mismatch defect from this task's scope. What
  remains is genuinely a component.
- 2026-07-26: Narrowed by PR #294. `pdf-inspect` covers the rendering, the
  overlay, hit testing, and selection, so this task is now only the draggable
  splitters and the live column reassignment they drive.
