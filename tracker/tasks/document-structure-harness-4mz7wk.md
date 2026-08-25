---
id: document-structure-harness-4mz7wk
title: A multi-method harness for extracting structure from scanned documents
status: backlog
opened: 2026-07-25
---
# A multi-method harness for extracting structure from scanned documents

Build the general, reusable front end that turns a scanned document into a
structured representation: regions, tables, cells, and text with coordinates
and per-method confidence. It stops short of what any cell *means*, which is
always corpus-specific.

## Why this is portable and not a corpus-side script

`mehrlander/budget-wa` has the first real corpus: 3,984 pages of scanned
Washington budget documents, 1979-1995, under
`sources/legislative-budget-notes/`. But the work splits cleanly, and only the
second half is about budgets:

| stage | general | corpus-specific |
| --- | --- | --- |
| image prep (deskew, denoise, binarize) | ✓ | |
| layout analysis, region segmentation | ✓ | |
| table detection | ✓ | |
| table structure recognition (rows, cols, cells, spans) | ✓ | |
| text recognition per region | ✓ | |
| reading order and logical structure | ✓ | |
| semantic labeling (this cell is an agency, this is NGF dollars) | | ✓ |

Stages one through six travel. `scripts/ocr-pdf.py` is already the smallest
piece of this, and it lives here for the same reason.

## Multi-method by design, not as a fallback

The intent is not to pick the best OCR engine. It is to run several methods,
let each contribute what it can, and assess across them. So the output format
is the design problem: it must hold **several extractions of the same region at
once**, each tagged with its method, settings, and confidence.

Two properties follow, and they are the reason for the shape:

- **Agreement between independent methods is stronger evidence than any single
  engine's self-reported confidence.** Two unrelated recognizers reading the
  same figure is a real control. One engine's 95% is an opinion.
- **Disagreement is a finding.** A cell three methods read three ways is where
  attention belongs. A schema storing one answer per cell cannot express it.

For numeric tables this is the whole game. A misread digit assigned confidently
to the right cell is worse than a dropped one, and character-level confidence
does not catch it. Cross-method agreement does.

Consumer-side counterpart, which defines what this must emit:
`mehrlander/budget-wa` task `text-provenance-vocabulary-p8n4qc` (closed
2026-07-25; the settled model is `sources/legislative-budget-notes/extract/PROVENANCE.md`).

## Environment, measured 2026-07-25 (Claude Code web sandbox)

- **Installed:** tesseract 5.3.4 (eng + osd only), poppler, qpdf, ghostscript,
  PyMuPDF, pdfplumber, Pillow. No numpy, no OpenCV, no ML stack by default.
- **Installable:** PyPI is reachable. Confirmed available:
  `opencv-python-headless` 5.0, `easyocr` 1.7.2, `paddleocr` 3.7,
  `torch` 2.13, `transformers` 5.14, `img2table` 2.0, `camelot-py` 2.0.
- **Hardware:** 4 cores, 15 GB, **no GPU**.
- **Tesseract throughput:** 1.2-3.3 s per 300 DPI page (measured on three real
  pages, 2482x3322 to 3328x2552). About 2.5 s average, so a 3,984-page corpus
  is ~2.8 h single-threaded, under an hour across 4 cores.
- **Neural recognizers are unpriced** and CPU-only here; expect several times
  tesseract. Budget accordingly before committing to a full pass.

**Design consequence:** iterate against a fixed sample of 30-50 pages spanning
document types, not the full corpus. Only a settled combination earns a full
run. This keeps a cycle in minutes.

## Input affordance worth knowing

A scanned PDF page is usually a thin wrapper around one JPEG.
`fitz.Document.extract_image(xref)` returns that stream **byte for byte with no
re-encode** (verified: raw stream == extracted, 220,580 of a 225,462-byte page
file). So full-quality pixels are one call away and rasterizing the PDF is
neither necessary nor desirable.

Many scanned PDFs also carry an inherited text layer drawn invisibly
(`3 Tr`), word-positioned by `Tm` matrix, plus `/Suspect` marked-content tags
where the original engine doubted itself. That is a free baseline extraction
*and* a free quality signal on it, both readable without running anything.
Sampled across one corpus: 42% of words flagged suspect.

## Spike findings, 2026-07-25 (45 pages, 3 per scanned edition)

A half-day probe against the scanned LBN corpus. Sample sizes are small and
stated per finding; none of this establishes corpus-wide accuracy.

**The container does not persist.** A fresh session has no tesseract, no
poppler, no PyMuPDF, no Pillow, no numpy. Rebuilding the baseline measured 18 s
total (9 s apt for `tesseract-ocr tesseract-ocr-eng tesseract-ocr-osd
poppler-utils qpdf`, 8 s pip for `pymupdf pillow numpy`). Cheap, but it is a
bootstrap script the harness owns, not a note in a task file.

**`OMP_THREAD_LIMIT=1` is mandatory, and worth more than any engine choice.**
Tesseract links OpenMP and defaults to one thread per core, so running it under
`xargs -P4` puts 16 threads on 4 cores. The 45-page sample took over 600 s that
way (4 pages finished in ten minutes) against 18 s with the variable set, on
identical inputs: better than a 33x difference. That moves a full 3,984-page
pass from the ~2.8 h estimated above to about 27 minutes.

> **Stale 2026-07-25:** 27 minutes is recognition alone. A real pass also runs
> orientation detection, reads the inherited layer, and writes a record per
> page. Measured end to end: 3,984 pages in 2,945 s on 4 cores, 1.4 pages/s,
> about 50 minutes. The conclusion below is unchanged.

The design consequence is the opposite of the one recorded below. A full pass is
cheap enough to run on a whim, so the fixed sample earns its place by keeping a
cycle in seconds rather than by rationing an expensive run.

**Orientation is a live source of silent corruption.** 3 of 45 pages came back
misoriented (two 180, one 270), about 7%. On one of them mean word confidence
was 34.9 with the page upside down and 94.1 after rotation, with every figure in
its table correct afterward, including parenthesized negatives.

> **Stale 2026-07-25:** the 7% is a small-sample artifact. The full 3,984-page
> pass corrected 38 pages, 1.0%. The finding holds and the rate does not.

**But OSD's own confidence does not settle it.** `--psm 0` reported 180 on a
fourth page at orientation confidence 0.88; rotating it dropped mean word
confidence from 81.7 to 25.8. A false positive asserted with a number attached.
The cheap robust rule is to recognize the page both ways and keep the higher
mean confidence, which costs a second pass only on flagged pages and is decided
by an independent measurement rather than by the detector's self-report. This is
the task's own agreement principle applied one stage earlier than expected.

**Recognition is not the bottleneck on this corpus.** The scans are clean,
well-printed originals at 300 DPI, not degraded documents. Stock tesseract at
`--psm 6` with no preprocessing read every figure correctly on the pages checked
by eye (a 1979 monospaced appropriation list, a 1991 ruled financial table, a
1991 table recovered from upside down). Where the inherited layer gave
`F e d d bcumbran~ea~ ($ oo(9`, tesseract gave `Federal Encumbrances ($ 000)`
and the correct 36,216 / 51,216. The inherited layer also has outright holes:
5 of 45 sample pages carry zero or near-zero words in it while tesseract finds
69 to 452.

This does not mean recognition is solved corpus-wide, and word count is not
quality: tesseract returned fewer words than the inherited layer on 13 of 45
pages. It means effort spent comparing neural recognizers is likely to buy
little here, at a cost (CPU-only inference on 4 cores over 3,984 pages) several
times the whole tesseract pass.

**Region segmentation is the first real problem, as filed.** Clustering numeric
tokens across a whole page fails for two distinct reasons, both observed on one
page: prose below the table contributes numbers (`1993`, `$0.4`), and bill
numbers inside row labels (`5653)`, `5583)`, `(ESSB 5025)`) are shaped exactly
like money. Isolating the table region and then keeping only column positions
that recur on most rows rejected both, cutting 8 candidate columns to the 3 real
ones.

**Column geometry is clean once the region is right.** On the recovered 1991
page the three money columns right-align at x 2032, 2521, 3015 with a spread of
under 20 px across 11 rows. This is the same technique `lbn/gridlib.py` already
uses on the born-digital editions, applied to tesseract word boxes instead of
embedded text.

**Arithmetic is a stronger control than cross-method agreement, and it is
free.** These documents check themselves: rows carry `GF-S + OTHER = TOTAL`,
tables carry column totals, and the 1979 line-printer reports carry
`HOUSE - SEN-R2 = DIFF` across four fund groups at once. On the recovered page,
11 of 11 rows reconciled, including the biennium total row
(277,041 + 180,792 = 457,833) and two parenthesized negatives.

Worth being precise about why this beats two engines agreeing: agreement between
recognizers is evidence about *characters*, and two engines trained on similar
data share failure modes. Arithmetic tests the *cell assignment* as well, which
is the failure this task names as the one that matters (a digit read correctly
and filed under the wrong fund). Cross-method agreement remains useful where no
arithmetic relation exists, which is most non-table text.

## Deliberately not decided

Which methods, how to score them, how results compose. Those are the
exploration. Fixing them now would defeat the purpose. The spike above narrows
the question but does not answer it: it argues the harness should spend its
budget on prep and geometry rather than on a recognizer bake-off, and it says
nothing yet about how competing extractions compose.

## Progress log
- 2026-07-25: Filed from spend-wa PR #25 wrap-up. The consuming corpus is
  ready (sources committed, per page, 300 DPI); this is the general half,
  filed here rather than in spend-wa so it does not grow inside one corpus.
  Environment and throughput figures measured that day.
- 2026-08-05: Repointed at `mehrlander/budget-wa`, from a cross-tracker read run
  in a home session. The corpus and its provenance task were in spend-wa when
  this was filed; both moved to budget-wa in the 2026-08-01 estate shuffle, and
  this task was the one pointer nobody repositioned, which left the harness
  naming the wrong repo for the corpus it exists to read. The counterpart task
  has since closed, so what it "must emit" is settled rather than pending: see
  `PROVENANCE.md` above. Nothing about the design changed. The dated entries
  below stay as written, since spend-wa is where this was filed from.
- 2026-07-25: Spike over 45 pages (see findings above). Three results change
  the plan: parallel tesseract needs `OMP_THREAD_LIMIT=1` and a full pass is
  then ~27 minutes rather than hours; ~7% of pages are misoriented and OSD's
  own confidence misjudges which; and the documents carry internal arithmetic
  that validates cell assignment, not just characters. Net effect is to move
  the harness's center of gravity from recognizer comparison toward page prep,
  region segmentation, and geometry.
- 2026-07-25: `docstruct/` built and a full pass run over all 3,984 scanned
  pages (2,945 s on 4 cores, 0 failures). Two figures above are marked stale by
  it: rotation is 1.0% not 7%, and an end-to-end pass is ~50 min not 27. The
  arithmetic control is validated at corpus scale, and the two checks turn out
  to be worth very different amounts: row relations hold on 96.8% of 12,635
  tested rows, column totals on only 39.0% of 4,965, so the latter is advisory
  and excluded from the headline figure. It caught a real misread that
  character confidence did not: `564` read as `504` at 91.2% confidence on
  `lbn_1979/p-061`, confirmed against the page image. 399 candidate findings
  landed in spend-wa `lbn/extract/relation-findings.tsv`, with the derived
  40-page fixed sample beside them.
