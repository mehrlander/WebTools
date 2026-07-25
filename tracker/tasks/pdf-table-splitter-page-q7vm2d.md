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

## What the kit already provides

`pdf.stream.split(items, boundaries)` is the assignment logic, including the
start-position rule the 2026-05 session arrived at (a value that overruns
into the next column belongs to the one it began in, not the one its centre
lands in). `pdf.stream.columns` and `pdf.stream.gutters` can both propose
starting boundaries. So the page is a UI over settled logic, not a new
algorithm.

## Known defects to carry across, not repeat

- **Cross-window font rendering.** pdf.js registers fonts to the document
  that owns the canvas. Render in the main window and hand the popup a data
  URL, or the text silently fails to draw. On a same-document page this
  stops being an issue, which is another argument for the move.
- **Unit mismatch.** Splitters were stored in raw PDF units and compared
  against viewport pixels, so they drifted from the text. Store splitters in
  viewport pixels and convert the text coordinates to match.
- **Header lumping.** The last message of the 2026-05-13 thread reports the
  colour overlay assigning header cells correctly while the data preview
  mashed them into one column: the visual layer and the extraction layer
  disagreeing. Diagnosed as the preview running on merged chunks rather than
  the assignment the overlay showed. Never confirmed fixed. Reproduce it
  first, because the disagreement is the interesting part.

## Progress log
- 2026-07-25: Filed alongside the kit (PR #294). The kit carries the logic;
  this is the surface.
