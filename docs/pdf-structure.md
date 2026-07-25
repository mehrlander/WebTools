# Recovering structure from a PDF, in the browser

Reference for [`lib/kits/pdf.js`](../lib/kits/pdf.js). What a PDF actually
contains, the two independent ways to read a table out of one, the tolerances
that decide whether either works, and the failure modes that are specific to
government and legislative documents.

Written to be read once before using the kit and reached for again when a table
comes out wrong. The kit's own header covers the API; this covers the reasoning.

## The problem, stated honestly

A PDF is a list of instructions for putting marks on a page. It says "draw this
glyph at this point" and "stroke a line from here to there." It does not say
"this is a table," "this is a column heading," or "these two numbers belong to
the same row." Every structure you get back is inferred, and every inference can
be wrong.

That is not a defect in any particular tool. It is the format. A PDF was
designed so a document looks the same everywhere, and it succeeds at that by
discarding exactly the information a reader reconstructs effortlessly and a
program cannot.

Two consequences follow, and the kit is shaped by both:

- **Extraction is a measurement, not a lookup.** It has error, and the error is
  not uniform: it concentrates in particular places for particular reasons.
- **A single answer with no dissent is the dangerous case.** A number read
  correctly and filed under the wrong heading is worse than a number dropped,
  because nothing downstream can tell.

## Coordinates

PDF user space: origin bottom-left, **y increases upward**, units are points
(1/72 inch). The browser's origin is top-left with y increasing downward. Every
mistake in this area comes from mixing the two, and they mix invisibly because
both produce plausible-looking numbers.

The kit stays in PDF space throughout. Boxes are `{x1, y1, x2, y2}` with `y1`
the bottom edge, so `y1 < y2` always holds. Text items also carry `base`, the
baseline, which is what pdf.js reports and what decoration detection needs.
Convert to screen space at the render boundary and nowhere else.

**Each element is drawn in its own transform space.** A rule's raw coordinates
say nothing about where it sits relative to the text until you project it
through the current transformation matrix. The kit tracks the `save` /
`restore` / `transform` stack while walking the operator list, which is the
step that makes "is this line under that word" answerable at all. Get it wrong
and the lines land somewhere unrelated to the text, consistently enough to look
like a different bug.

## Two readings of the same page

The kit implements both classical methods and keeps them separate on purpose.

|  | `stream` | `lattice` |
| --- | --- | --- |
| Evidence | where the text sits | the rules drawn on the page |
| Source | `getTextContent` | `getOperatorList` |
| Works when | alignment is consistent | the table is ruled |
| Fails when | a full-width row bridges the columns; nothing aligns | rules are missing, decorative, or invisible |
| Output | column boundaries, rows | cells with spans, a matrix |

They are not a primary and a fallback. They draw on unrelated evidence, so
**running both and comparing is a control you cannot get from one of them run
twice.** Where they agree, you have two independent readings; where they
disagree, you have found the part of the page worth looking at.

The kit does not adjudicate between them, because the right resolution depends
on the document. It gives you both, in the same coordinate space, with the same
item objects, so the comparison is a `deepEqual` rather than a project.

### Inside `stream`

Two column detectors, and they fail in opposite directions:

- **`columns`, by alignment frequency.** Histogram every item's left and right
  edge; coordinates that recur are column edges. Labels align left, money
  aligns right, so both edges are histogrammed and each column reports the edge
  it was found on. A candidate supported by a subset of another candidate's
  items is the same column seen from both sides, and is dropped.
- **`gutters`, by whitespace.** Project every item's horizontal extent onto the
  x-axis and look at what is left. A band of unoccupied x is a gutter, and
  gutters divide columns.

Frequency sees columns that whitespace cannot, because a single wide row (a
title, a footnote) bridges every gutter and collapses the page to one column.
Whitespace sees columns that frequency cannot, because a column whose members
have ragged edges never registers a recurring coordinate. Disagreement between
these two is itself informative and costs one extra call.

`split` then assigns text to columns **by where a chunk starts, not where its
centre lands**. A value that overruns into the next column still belongs to the
one it began in. Centre-based assignment gets this wrong on exactly the cases
that matter, which are long values in narrow columns.

### Inside `lattice`

Five stages, in dependency order:

1. **Geometric reduction.** Filter unusable strokes, dedupe doubled ones, join
   collinear segments. This is the stage that gets skipped and then blamed on
   tolerances. Everything downstream is only as good as the line set it walks.
2. **Junctions.** Every crossing of a horizontal and a vertical rule, keyed by
   snapped position, each carrying the ids of the lines through it. "Are these
   two corners connected" is then a set intersection, not a geometry test.
3. **Atomic cells.** From each junction as a top-left corner, step right to the
   nearest junction sharing a horizontal rule, down to the nearest sharing a
   vertical, project the fourth corner, and require that it exists **and** is
   connected both ways. Taking the nearest neighbour is what makes the result
   atomic: an enclosing rectangle is never reached, because the walk stops at
   the first interior corner. The fourth-corner check is load-bearing; an L of
   rules yields three corners and no cell, and three corners prove nothing.
4. **Clustering.** Group cells into tables by **shared corner**, not shared
   edge. Corner-touching keeps a table whole across a row whose interior rules
   are fragmented, where edge-matching splits it in two.
5. **The anchor grid.** Collect every distinct cell boundary, sort, and the gaps
   between consecutive anchors *are* the logical rows and columns. A cell
   covering several gaps is a span.

The anchor system is the part worth understanding, because it changes what you
do rather than only what you know: the grid is **derived from the data, not
assumed**. Nothing needs to know the table's shape in advance, ragged row
heights simply produce more anchors, and merged cells fall out as spans.

The price is that one stray coordinate does not merely shift an index, it
**inserts a phantom row or column** that every later cell then straddles. When a
grid comes out with one more column than the table has, suspect a stray
boundary before suspecting the cell finder.

Text lands in cells by **majority overlap**, not centroid. A line whose baseline
sits on a rule has a box straddling two cells and a centroid that can fall in
the wrong one, while the overlap areas are not close. Cells grow by `pad` first,
because text routinely overruns its cell by a fraction of a point through
nothing but coordinate rounding.

## Tolerances

Four values, each failing in its own direction. Defaults are in `pdf.config`,
and every function takes an override.

| Name | Default | What it does | What breaks when it is too large |
| --- | --- | --- | --- |
| `snap` | 1.5 | merges near-identical coordinates | a thin column collapses into its neighbour |
| `join` | 3.0 | bridges gaps between collinear segments | two tables merge into one |
| `intersect` | 1.0 | how close H and V must come to cross | grid bleed: one table's rules join another's |
| `minEdge` | 5.0 | shortest segment that counts as a rule | checkboxes and tick marks vanish |

Clustering is single-link, which has a consequence worth stating: values chain.
With `snap: 1.6`, coordinates at 10, 11.5, and 13 all land together, because
11.5 bridges them, even though 10 and 13 are further apart than the tolerance.
This is how a generous snap tolerance quietly eats a column. The behaviour is
pinned by a test.

Reach for these in order. Most bad grids are a reduction problem (`join`,
`minEdge`) rather than a snapping problem, and almost none are a cell-finder
problem.

## What breaks on government documents

These are born-digital, well-printed, and single-column, which makes them easier
than most inputs in every way except three.

- **White strokes.** A shaded header row gets its column separators drawn in the
  page background colour: invisible to a reader, fully visible to an extractor,
  which then rules the header into cells that bisect its text. The kit filters
  by stroke colour in `geom.usable`, before the junction walk. Extraction stays
  faithful and captures the white rule; filtering is a lattice-layer decision,
  which is the right place for it, because a reader might want to know the rule
  is there.

  There is a bug worth remembering here, because nothing about it announces
  itself. pdf.js hands colour operands over as a `Uint8ClampedArray`, and
  mapping one in place returns another typed array that coerces each hex string
  back to a number. Every colour therefore becomes `#000`, white included, and
  the filter silently does nothing. Caught only by running a real PDF with a
  known white rule through the whole pipeline; pinned now by a test in both
  suites.

- **Dotted leaders.** `Appropriations..........$1,000,000` is often not a dashed
  line but thousands of discrete one-point segments. A single budget page can
  carry tens of thousands. Without an aggressive collinear join before the
  junction walk, the network is unusable. `geom.joinCollinear` handles this, and
  a 120-segment leader is in the browser fixture for that reason.

- **Missing perimeters.** Outer borders are frequently not drawn, so the
  top-left corner the cell walk starts from does not exist and the table yields
  nothing. Not yet handled. The fix is to close the table with the bounding box
  of the text overlapping the discovered interior rules, and it is the main
  known gap.

## The visual layer, measured

The reason to care about any of this is usually an overlay: boxes drawn on a
rendered page, a splitter dragged across a column, text highlighted under the
pointer. Two questions decide whether that lines up, and they have different
answers.

### Does the reported box sit where the ink is?

No, and the gap is systematic. `getTextContent` reports a **typographical
container**, which includes side bearings, not an ink extent.

Measured by `npm run test:pdf`, which renders a page at 3x and scans for real
ink, at 12pt across five standard fonts:

| | leading gap | trailing gap |
| --- | --- | --- |
| Helvetica | 0.67 to 1.0 pt | 0.4 to 0.65 pt |
| Helvetica-Bold | 0.67 pt | 0.4 to 0.68 pt |
| Times-Roman | 0.33 pt | 0.01 to 0.34 pt |
| Times-Italic | 0 to 0.67 pt | **-1.01 pt** |
| Courier | 0.67 to 1.0 pt | 0 to 0.87 pt |

Two things to take from it. The container starts **before** the ink, always, by
up to a point at 12pt, which is why a shrink-wrapped box looks loose on the left
and why a naive left-edge column rule fires slightly early. And the trailing side
is **not symmetric**: an italic W leans past its own advance width, so ink exits
the box on the right. Any overlay that clips to the reported box will cut it off.

The invariant worth relying on is only the first one: ink never starts before the
box. Build containment rules on the leading edge and treat the trailing edge as
approximate. Both are pinned as assertions, including a check that the fixture
still exercises the overhang, so the asymmetry cannot quietly stop being tested.

### Do the per-character positions land on the characters?

Only if you measure them. The boundary after `iiiii` in `iiiiiWWWWW` at 12pt,
against the font's own metrics:

| font | true | measured | evenly divided | measured error | even error |
| --- | --- | --- | --- | --- | --- |
| Helvetica | 13.32 | 13.33 | 34.98 | **0.01** | 21.66 |
| Helvetica-Bold | 16.68 | 13.97 | 36.66 | **-2.71** | 19.98 |
| Times-Roman | 16.68 | 16.67 | 36.66 | **-0.01** | 19.98 |
| Times-Italic | 16.68 | 15.16 | 33.33 | **-1.52** | 16.65 |
| Courier | 36.00 | 36.00 | 36.00 | **0** | 0 |

Even division is not approximately right, it is wrong by more than half the run:
about 20pt out on a 36pt string. Canvas measurement is essentially exact when the
browser's substitute font is metrically close (Helvetica, Times-Roman), and off
by 1.5 to 2.7pt when it is not (bold, italic). Courier is the control: a
monospaced font has genuinely uniform advances, both strategies agree, and the
measured path must not make it worse.

So per-character geometry is good enough for decoration matching and column
assignment, and not good enough for exact character-level hit testing in an
unusual font. That is the same conclusion the March 2026 research reached from
the other direction, now with numbers.

### Projecting to the screen

`pdf.view(viewport)` converts between PDF space and screen pixels, in both
directions, through the viewport's real transform and its true inverse. Give it
a pdf.js viewport or any `{width, height, transform}`; the latter is why it
tests without pdf.js in the room, and `npm run test:pdf` separately confirms it
agrees with pdf.js's own `convertToViewportPoint` to 0.02pt on a real viewport.

```js
const v = d.viewOf(1, { scale: 1.5 });      // same scale you pass to page.render()
const boxes = v.items(d.page(1));           // {left, top, right, bottom, w, h, glyphs}
v.at(px, py, boxes);                        // point hit test
v.select(dragRect, boxes, { mode: 'contain' });
v.unbox(dragRect);                          // back to PDF space, for the pure layers
```

This exists in the kit because every previous overlay rewrote it inline, and the
2026-05 splitter did it by dividing mouse pixels by the scale. That ignores the
transform's translation, so the splitters drifted away from the text they were
supposed to divide, in a way that looked like a rendering problem. Going through
the actual inverse is exact, and `unbox` closes the loop: a rectangle the user
dragged comes back as a PDF-space region the `stream` and `lattice` functions
accept unchanged.

### One thing extraction keeps that looks like noise

pdf.js emits blank items: empty strings and lone spaces, each with a real
position. The kit keeps them. A zero-width item between two runs is often the
only mark a column break leaves behind, and an earlier generation of this code
used exactly that to insert separators. Filter them at the consumer
(`items.filter(i => i.str.trim())`) rather than at the source.

## What the kit does not do

Stated plainly, because the honest limit is more useful than the feature list.

- **No OCR.** `getTextContent` returns nothing for a scanned page. The lattice
  may still find the rules, but the cells come back empty. Scanned documents are
  the Python harness's problem, not this one.
- **Glyph advances are measured, not authoritative.** Per-character positions
  come from measuring the item's text with the browser's own engine using the
  resolved `fontFamily`, then scaling the run so the advances sum to the width
  pdf.js reported. Font substitution shifts the proportions; it cannot shift the
  total. The authoritative source is the font's own widths via `charsToGlyphs`,
  which lives on the worker side and is not reachable from the main thread.
  Measured error is under 0.02pt where the substitute is metrically close and up
  to 2.7pt where it is not, which is the table above.
- **No reading order for multi-column prose.** `rows` groups by baseline, which
  merges two side-by-side columns of body text into one line.
- **No semantic labelling.** Nothing here decides that a cell is an agency name
  or a dollar figure. That is always corpus-specific and belongs with the corpus.

## Where this sits

The Python side of the same problem (scanned pages, OCR, multi-method
agreement) is tracked as
[a multi-method harness for extracting structure from scanned documents](../tracker/tasks/document-structure-harness-4mz7wk.md).
This kit is the born-digital front end of the same question: it handles the case
where a text layer exists and the difficulty is geometry. The two want the same
output vocabulary, and settling that vocabulary is open work on both sides.

## Testing

- `node --test tools/test/pdf-kit.test.mjs` covers `geom`, `stream`, and
  `lattice` under jsdom with hand-built fixtures. Hand-built on purpose: with a
  real PDF, a failure is ambiguous between the extractor and the analysis, and
  the analysis is what those tests are about.
- `npm run test:pdf` runs two browser passes, both against PDFs built with
  pdf-lib at coordinates the test chooses. This is the only way to have an answer
  key, and it is where the typed-array colour bug surfaced. Needs a browser, so
  neither is part of `npm test`.
  - `tools/test/pdf-kit-browser.mjs` opens a ruled table with a white rule and a
    dotted leader in it, and checks the kit returns what went in.
  - `tools/test/pdf-ink-alignment.mjs` renders the page and scans the pixels, so
    the box-versus-ink and glyph-boundary numbers above are measurements rather
    than claims. Run it with `--keep` to retain the fixture PDF.
