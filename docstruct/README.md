# docstruct

Turning scanned documents into structured data, by running several methods over
the same page and keeping all of their answers.

This is the general half of the problem. Image prep, layout analysis, table
detection, table structure recognition, text recognition and reading order all
travel between corpora; only semantic labeling (this cell is an agency, this one
is dollars) is specific to a document family. Everything here stops short of
meaning.

Its first consumer is `mehrlander/spend-wa`, which holds 3,984 scanned pages of
Washington State budget documents from 1979 to 1995. Nothing here knows that.

## Why several methods rather than the best one

The output format is the design decision, and it is built to hold **several
extractions of the same page at once**, each tagged with the method, its
settings, and its confidence. Two properties follow:

**Agreement between independent methods is stronger evidence than any single
engine's self-reported confidence.** Two unrelated recognizers reading the same
figure is a real control. One engine's 95% is an opinion, and a badly calibrated
one: measured on this corpus, tesseract's orientation detector reported a
rotation at confidence 0.88 that was flatly wrong, and would have corrupted the
page had anything believed it.

**Disagreement is a finding, not noise to average away.** A cell three methods
read three ways is exactly where attention belongs, and a schema that stores one
answer per cell cannot express it.

For numeric tables this is the whole game. A misread digit placed confidently in
the right cell is bad; a correctly read digit placed in the wrong column is
worse, and character confidence cannot see it at all.

### The control that beats both: ask the table to check itself

Budget tables carry totals, along rows and down columns. `tables.py` discovers
those relations from the numbers rather than assuming them, then reports which
rows break them. This is stronger than cross-method agreement, because agreement
between recognizers is evidence about *characters* (and engines trained on
similar data share failure modes), while arithmetic also tests *cell
assignment*.

It is not theoretical. On page 61 of the 1979 edition, tesseract read `564` as
`504` **at 91.2% confidence**. Nothing in the recognizer's own output flags it.
The relation the rest of the table obeys does:

```
ST HIST SOCIETY   569 + -5 = 504   (expected 564)
```

Verified against the page image: it reads 564.

Measured over all 3,984 scanned pages, the two controls turn out to be worth
very different amounts, which is why they are reported apart:

| control | rows tested | hold | read it as |
|---|---|---|---|
| row relation (`c_a op c_b = c_c`, discovered) | 17,158 | **96.8%** | a finding worth acting on |
| column total (a total row against the block above) | 5,753 | 41.8% | advisory triage only |

`Table.reconciled` speaks only for the first. The column-total check fails far
more often than the data is wrong, mostly because a column dropped below the
frequency threshold leaves the block sum short, so averaging the two would hide
which control is which. A control with that false-positive rate is worse than no
control, because it teaches you to ignore it.

## Getting started

```bash
./docstruct/bootstrap.sh              # ~18s: tesseract, poppler, PyMuPDF, Pillow
./docstruct/bootstrap.sh --check      # report what is present, install nothing
python3 docstruct/test_docstruct.py   # 56 tests, ~2s

python3 docstruct/run.py <source> -o out/       # a pass
python3 docstruct/survey.py out/ --by-doc      # what it found
python3 docstruct/survey.py out/ --attention   # which pages need a look
python3 docstruct/survey.py out/ --sample 40   # a stratified page list
```

The sandbox container does not persist, so `bootstrap.sh` is the first step of
every session, not a one-time setup.

`<source>` is a directory of per-page PDFs (one subdirectory per document), a
single PDF, or a directory of images. Output is one JSON record per page at
`out/<doc_id>/<page_id>.json`.

Useful flags: `--sample <file>` to restrict the pass (see below), `--workers N`,
`--psm N` for tesseract's page-segmentation mode, `--limit N` for a quick probe,
`--force` to redo pages already recorded.

### Selecting pages

A selection file takes one entry per line, `#` comments allowed. A line with a
slash picks one page; a line without one picks every page of that document:

```
lbn_1991/p-122     # one page
lbn_1979           # the whole edition
```

That covers both jobs: a fixed iteration sample, and a filter that splits a
source directory holding two kinds of document.

## The pieces

| Module | What it does |
|---|---|
| [`pages.py`](pages.py) | input: enumerate pages, extract pixels losslessly, read the inherited text layer |
| [`prep.py`](prep.py) | page preparation: orientation, decided by measurement rather than by the detector's claim |
| [`recognize.py`](recognize.py) | text recognition as a swappable method, plus the `line_axis` geometry test |
| [`record.py`](record.py) | the per-page record holding several extractions, and right-angle box rotation |
| [`run.py`](run.py) | the pass runner: parallel, resumable, one JSON per page |
| [`tables.py`](tables.py) | rows, columns and cells from word boxes, then the arithmetic the table asserts about itself |
| [`compose.py`](compose.py) | adjudicate between several readings of a page, using the table's arithmetic rather than a vote |
| [`survey.py`](survey.py) | read a pass back: what it saw, which pages need a look, and a stratified sample |
| [`test_docstruct.py`](test_docstruct.py) | tests for the silent-failure parts, mainly the coordinate transforms |

## Five things measured the hard way

**Invoke tesseract with `-c tessedit_create_tsv=1`, never the `tsv` config-file
name.** Naming the config file makes `--psm` a silent no-op *and* drops the last
character of a token, sometimes. Measured on one line-printer row against the
page image:

```
truth          745  87,083  86,712  -371
`tsv` config    74  87,08   85,71   -37     (0 of 4 correct)
`-c` form      745  87,083  85,712  -371    (3 of 4 correct)
```

The loss ran at 14.5% of shared tokens on a dense 1979 page and 0% on clean
1990s pages, so it concentrated exactly where the hard pages were and read as
OCR difficulty rather than as a caller bug. A full 3,984-page pass completed
with psm ignored and tokens quietly truncated before this surfaced. Fixing it
took checked row relations from 13,468 to 17,158 at an unchanged hold rate.
A regression test pins that `--psm` has an observable effect, because the
failure was silent by construction.

**`OMP_THREAD_LIMIT=1` is mandatory when parallelizing.** Tesseract links OpenMP
and takes one thread per core, so four worker processes on four cores means
sixteen threads contending for four cores. A 45-page sample took over 600
seconds that way against 18 seconds with the limit set, on identical inputs.
`recognize` sets it on every subprocess call, so parallelize with processes and
this stays handled.

**Extract embedded images, do not rasterize.** A scanned PDF page is usually a
thin wrapper around one JPEG, and `extract_image()` returns that stream byte for
byte. Rasterizing instead decodes, composites at some DPI, and re-encodes: both
slower and lossy. `Page.image_bytes()` takes the lossless path when it exists
and says so via `Page.lossless()`.

**Orientation is a silent corruption source, and the detector cannot be
trusted to fix it.** 34 of 3,984 real pages arrived misoriented, 0.9%. Tesseract's
OSD finds them, but its self-reported confidence does not separate true from
false: it called 180 degrees at confidence 0.88 on an upright page (applying it
cut mean word confidence from 81.7 to 25.8) and at 4.66 on a genuinely upside
down one (where the correction raised 34.9 to 94.1). A threshold would have to
sit between those two numbers, which is fitting noise. `prep.deskew_rotate`
recognizes the page both ways and keeps the better reading. Over the corpus it
accepted 34 rotations and rejected 79, so the check does more work than the
detector it second-guesses.

**Which "better" means depends on the rotation.** A half turn garbles the text,
so mean word confidence separates it cleanly. A quarter turn does not: tesseract
orients each text line for itself and reads a sideways page about as well
(measured 91.3 against 93.0 on the same page), while still reporting word boxes
in the sideways frame. Judging that page by confidence keeps correct words and
transposed geometry, losing every column. So quarter turns are judged by
`recognize.line_axis`, which asks whether the recognizer's own text lines run
along x or along y, and separates the same page 0.04 against 1.0.

## The record

```json
{
  "schema": "docstruct/page-record@1",
  "doc_id": "lbn_1991", "page_id": "p-122",
  "source": {"lossless": true, "format": "jpeg", "width": 3332, "height": 2466},
  "prep": {"orientation": {"applied": 180, "proposed": 180, "osd_confidence": 4.66,
                           "verdict": "corrected", "measure": "mean_conf",
                           "before": 34.9, "after": 94.1}},
  "extractions": [
    {"method": {"name": "tesseract", "version": "5.3.4", "settings": {"psm": "6"}},
     "words": [{"text": "457,833", "box": [2958, 1150, 152, 43], "conf": 96.1}],
     "word_count": 451, "mean_conf": 94.1},
    {"method": {"name": "inherited", "settings": {"origin": "embedded-text-layer"}},
     "words": [{"text": "EE8'LSV", "box": [2515, 1357, 109, 75], "flags": ["suspect"]}],
     "word_count": 129, "notes": {"suspect": 124}}
  ]
}
```

`extractions` is a list even when it holds one entry. The document's own
inherited text layer is stored as just another extraction, because that is what
it is: an independent reading by an unknown engine, useful as a second opinion
and not privileged. Words carry no confidence when the producing method reports
none, rather than defaulting to full marks.

`prep` is recorded because a figure read from a page that was rotated first is a
different claim from one read off a page that arrived upright, and the record has
to be able to say which. When a rotation is applied, every extraction taken
before it (the inherited layer) is rotated into the new frame so all boxes stay
comparable.

## Composing a result from several readings

`compose.py` is where holding competing extractions pays. Where methods disagree
on a cell, it prefers the reading that makes the row reconcile, and where none
does it reports the disagreement and changes nothing.

**The rule is deliberately not a vote.** Methods sharing a lineage share failure
modes, so two tesseract passes at different segmentation modes are often wrong
the same way on the same glyph, and a vote counts that as confirmation. The
table's arithmetic is independent of every method, so it is what decides.

A worked case, verified against the page image (`lbn_1993/p-240`):

| method | read | outcome |
|---|---|---|
| tesseract psm 6 | `684` | baseline, breaks the relation |
| tesseract psm 4 | `98,684` | **closes it**: 867,311 + 98,684 = 965,995 |
| inherited layer | `94684` | rejected, does not close it |

The page reads 98,684. Note that a majority vote could not have chosen here:
two methods disagreed with the baseline and with each other. Note also that the
column above independently sums to 98,684, which is the sort of corroboration
that only exists once geometry is right.

It can only ever promote a reading some method actually produced. If no method
read the right digits, it finds nothing, which is the honest outcome. Solving
for one unknown in a relation is the whole move: two bad cells in the same
relation are not recoverable and are not guessed at.

## Known limits of the table layer

Stated because a quiet limit is worse than a loud one.

- **A consistent misread survives arithmetic.** On the page above, `6,323` and
  `6,343` were both read with the comma as a `5`, giving `65323` and `65343`.
  Their difference is still 20, so the relation holds and nothing is flagged.
  Arithmetic catches errors that break a relation, not errors that preserve it.
- **A short table cannot establish a relation it breaks.** Support is a share,
  so one bad row in four is 75% and falls under the default. No relation found
  means "not established," never "checked and fine," which is why
  `Table.reconciled` is None rather than 1.0 in that case.
- **Only relations among the discovered columns are checked.** On the page
  above, the same table also misread `6,323` as `65323` (a comma read as a
  digit), and no discovered relation touched that column, so nothing caught it.
  Reconciliation is a floor on quality, not a certificate.
- **Single-column figure lists are not tables.** A page of `General Fund-State
  ....... $ 326,000` has one money column, so `find_table` returns nothing. The
  cell-assignment risk does not exist there, but neither does the extraction.

## Not built yet

Full region segmentation and reading order. `tables.py` finds the dominant table
on a page; it does not yet separate several regions, order them, or attach a
table to the heading above it. Page furniture is handled defensively at token
level rather than segmented out, which is enough for column geometry but leaves
page-level confidence figures untrustworthy on furniture-heavy pages.

A second recognizer is deliberately not wired up. On a clean corpus the marginal
gain over a tesseract that already reads the digits looks small against the cost
of CPU-only neural inference, so the case for one should come from pages where a
control actually fails. Adding one means writing a function that returns
`(Method, list[Word])`; nothing else changes.

Tracked as `document-structure-harness-4mz7wk` in [`tracker/`](../tracker/), with
the consumer side as `text-provenance-vocabulary-p8n4qc` in `mehrlander/spend-wa`.
