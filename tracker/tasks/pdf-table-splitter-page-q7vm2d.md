---
id: pdf-table-splitter-page-q7vm2d
title: Draggable column boundaries with live reassignment, in pdf-inspect
status: backlog
opened: 2026-07-25
size: S
---
# Draggable column boundaries with live reassignment, in pdf-inspect

Add the one interaction the 2026-05-13 chat surface had that
`pages/pdf-inspect.html` does not: vertical splitters the user places, drags,
and deletes, with every text item recoloring live to the column it is assigned
to, and the extracted table updating to match. Filed as a standalone
column-splitter page; PR #294's `pdf-inspect` since shipped the page, the
rendering, the item overlay, hit testing, drag selection, and the two-way table
reading, so the surface exists and this task is the splitter interaction on it.

## What the kit already provides

`pdf.stream.split(items, boundaries)` is the assignment logic, including the
start-position rule the 2026-05 session arrived at (a value that overruns into
the next column belongs to the one it began in, not the one its centre lands
in). `pdf.stream.columns` and `pdf.stream.gutters` can both propose starting
boundaries. `pdf.view(viewport)` supplies coordinate conversion through the
viewport's real inverse transform, `at()` for point hit tests, `select()` for
drag rectangles, and `unbox()` to turn a dragged rectangle back into a
PDF-space region. The task is pointer events, rendering, and state over
settled logic: reuse `split()` rather than writing new assignment code.

## Known defects to carry across, not repeat

- **Unit mismatch.** The old surface stored splitters in raw PDF units and
  compared against viewport pixels, so they drifted from the text. Work in
  screen space, the space the pointer speaks, and call `unbox()` at the
  boundary; `pdf.view` is verified against pdf.js's own
  `convertToViewportPoint` to 0.02pt.
- **Header lumping.** The last message of the 2026-05-13 thread reports the
  colour overlay assigning header cells correctly while the data preview
  mashed them into one column: the visual layer and the extraction layer
  disagreeing. Diagnosed as the preview running on merged chunks rather than
  the assignment the overlay showed. Never confirmed fixed. Reproduce it
  first, because the disagreement is the interesting part.

## The shrink-wrap expectation, quantified

The reported box is a typographical container, not the ink. Measured at 12pt
across five standard fonts (`npm run test:pdf`): the box starts 0 to 1.0pt
before the ink, always, and an italic W overhangs its box on the right by up
to 1.01pt. So a "shrink wrapped" border will look loose on the left and can
clip an italic on the right, and that is the document, not a bug in the
drawing. Say so in the UI rather than trying to tighten it.

## Done when

pdf-inspect can place, drag, and delete column boundaries with items
recoloring live and the table extraction following the same assignment the
overlay shows, with the header-lumping case reproduced and then held by a
test. One-pointer selection keeps working alongside the new interaction.

## Progress log
- 2026-07-25: Filed alongside the kit (PR #294). The kit carries the logic;
  this is the surface.
- 2026-07-25: Unblocked. `pdf.view` landed on the same PR, which removes the
  coordinate work and the unit-mismatch defect from this task's scope. What
  remains is genuinely a component.
- 2026-07-26: Narrowed by PR #294. `pdf-inspect` covers the rendering, the
  overlay, hit testing, and selection, so this task is now only the draggable
  splitters and the live column reassignment they drive.
- 2026-08-07: refined per the 2026-08-07 assessment (rename-or-reframe).
  Retitled from "A column-splitter page for the pdf kit" to the residual the
  2026-07-26 narrowing already described: the body no longer argues for a
  page that exists, and the popup-era history (cross-window font rendering,
  the data-URL relay) is retired with the popup, surviving in this log and
  the 2026-05-13 chat rather than in current scope.
