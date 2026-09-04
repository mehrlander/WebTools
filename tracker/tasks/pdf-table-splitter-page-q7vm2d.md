---
id: pdf-table-splitter-page-q7vm2d
title: Draggable column boundaries with live reassignment, in pdf-inspect
status: backlog
opened: 2026-07-25
size: S
---
# Draggable column boundaries with live reassignment, in pdf-inspect

Vertical splitters the user places, drags and deletes, with every text item
recoloring live to its assigned column and the extracted table following. The
one interaction the 2026-05-13 chat surface had that `pages/pdf-inspect.html`
does not.

## The logic already exists; this is the surface

`pdf.stream.split(items, boundaries)` is the assignment, including the
start-position rule (a value overrunning into the next column belongs to the one
it began in, not the one its centre lands in). `pdf.stream.columns` and
`.gutters` propose starting boundaries. `pdf.view(viewport)` gives coordinate
conversion, `at()`, `select()` and `unbox()`. Reuse `split()`; write no new
assignment code.

## Two defects to carry across, not repeat

- **Unit mismatch.** The old surface stored splitters in raw PDF units and
  compared against viewport pixels, so they drifted from the text. Work in
  screen space and call `unbox()` at the boundary; `pdf.view` is verified against
  pdf.js's `convertToViewportPoint` to 0.02pt.
- **Header lumping.** The 2026-05-13 thread ends with the colour overlay
  assigning header cells correctly while the data preview mashed them into one
  column, diagnosed as the preview running on merged chunks rather than the
  assignment the overlay showed. Never confirmed fixed. Reproduce it first: the
  disagreement between the two layers is the interesting part.

## Expect a loose fit, and say so rather than tightening it

The reported box is a typographical container, not the ink. Measured at 12pt
across five fonts (`npm run test:pdf`): the box starts 0 to 1.0pt before the ink,
always, and an italic W overhangs on the right by up to 1.01pt. A "shrink
wrapped" border looks loose left and can clip an italic right. That is the
document, not the drawing.

## Done when
Boundaries can be placed, dragged and deleted with items recoloring live and the
extraction following the same assignment the overlay shows; header lumping
reproduced and held by a test; one-pointer selection still works.

## Progress log
- 2026-07-25: Filed alongside the kit (PR #294), then unblocked the same day
  when `pdf.view` landed there, removing the coordinate work and the unit
  mismatch from scope.
- 2026-07-26: Narrowed. PR #294's `pdf-inspect` shipped the page, rendering,
  overlay, hit testing and selection, leaving only the splitter interaction.
- 2026-08-07: Retitled to that residual per the assessment. Popup-era history
  (cross-window font rendering, the data-URL relay) retired with the popup.
- 2026-09-04: Body cut from 595 words.
