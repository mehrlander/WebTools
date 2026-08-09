#!/usr/bin/env python3
"""Render a PDF page as overlapping horizontal strips a vision model can read.

A scanned budget table is unreadable to a model as a whole page and perfectly
readable as a band. The reason is a display cap, not resolution: the harness
downscales an attached image to roughly 2000 px on its long edge, so a 300 DPI
landscape page arrives at about a quarter of the density it was scanned at and
the thousands commas go first. Cutting the page into horizontal strips keeps
each strip's *width* at the cap, which is where the density has to survive, and
spends the page's height across several images instead of throwing it away.

That is the whole trick, and it is why this is a separate script from
`ocr-pdf.py`. That one reads a page mechanically and reports how much to trust
the reading. This one hands the page to a reader who will look at it, which is
what you want when the mechanical reading is the thing under dispute.

Strips overlap, by default 12% of a strip's height on each side, so a table row
cut by one boundary is whole in the neighbour. Without the overlap a reader
loses exactly the rows nearest each cut, and it loses them silently.

    python3 page-strips.py scan.pdf -o img/            # 4 strips of page 1
    python3 page-strips.py scan.pdf -p 12 --strips 6   # page 12, finer slicing
    python3 page-strips.py page.pdf --width 2400       # denser, if the cap allows

Requires PyMuPDF (`pip install pymupdf`) and nothing else: no poppler, no
tesseract, no image library. Prints the files written, one per line, so a
caller can pipe them.
"""
from __future__ import annotations

import argparse
import pathlib
import sys

try:
    import pymupdf
except ImportError:  # pragma: no cover - environment guard
    sys.exit("page-strips.py needs PyMuPDF: pip install pymupdf")


def strip_page(pdf: pathlib.Path, page_no: int, outdir: pathlib.Path,
               strips: int, overlap: float, width: int, stem: str | None) -> list[pathlib.Path]:
    doc = pymupdf.open(pdf)
    if not 1 <= page_no <= doc.page_count:
        sys.exit(f"{pdf}: no page {page_no} (has {doc.page_count})")
    page = doc[page_no - 1]

    # Zoom so the rendered width lands on the cap. Capped at 4x because past
    # that the raster outruns the scan and only the file size grows.
    zoom = min(width / page.rect.width, 4.0)
    height = page.rect.height * zoom
    band = height / strips
    pad = band * overlap

    outdir.mkdir(parents=True, exist_ok=True)
    stem = stem or pdf.stem
    written = []
    for k in range(strips):
        y0 = max(0.0, k * band - pad) / zoom
        y1 = min(height, (k + 1) * band + pad) / zoom
        clip = pymupdf.Rect(0, y0, page.rect.width, y1)
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip)
        f = outdir / f"{stem}-s{k}.png"
        pix.save(f)
        written.append(f)
    doc.close()
    return written


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", type=pathlib.Path)
    ap.add_argument("-p", "--page", type=int, default=1, help="1-indexed page (default 1)")
    ap.add_argument("-o", "--outdir", type=pathlib.Path, default=pathlib.Path("."))
    ap.add_argument("--strips", type=int, default=4, help="horizontal strips (default 4)")
    ap.add_argument("--overlap", type=float, default=0.12,
                    help="strip overlap as a fraction of strip height (default 0.12)")
    ap.add_argument("--width", type=int, default=2200,
                    help="target rendered width in px (default 2200, near the display cap)")
    ap.add_argument("--stem", help="output filename stem (default the PDF's)")
    a = ap.parse_args()

    if a.strips < 1:
        sys.exit("--strips must be at least 1")
    if not 0 <= a.overlap < 0.5:
        sys.exit("--overlap must be in [0, 0.5)")
    if not a.pdf.exists():
        sys.exit(f"no such file: {a.pdf}")

    for f in strip_page(a.pdf, a.page, a.outdir, a.strips, a.overlap, a.width, a.stem):
        print(f)


if __name__ == "__main__":
    main()
