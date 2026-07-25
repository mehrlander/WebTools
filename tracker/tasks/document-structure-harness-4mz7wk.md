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

## Why this is portable and not a spend-wa script

`mehrlander/spend-wa` has the first real corpus: 3,984 pages of scanned
Washington budget documents, 1979-1995. But the work splits cleanly, and only
the second half is about budgets:

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
`mehrlander/spend-wa` task `text-provenance-vocabulary-p8n4qc`.

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

## Deliberately not decided

Which methods, how to score them, how results compose. Those are the
exploration. Fixing them now would defeat the purpose.

## Progress log
- 2026-07-25: Filed from spend-wa PR #25 wrap-up. The consuming corpus is
  ready (sources committed, per page, 300 DPI); this is the general half,
  filed here rather than in spend-wa so it does not grow inside one corpus.
  Environment and throughput figures measured that day.
