#!/usr/bin/env python3
"""OCR a scanned PDF into text, and say how much to trust the result.

A PDF that carries no text layer is opaque to every text-extraction library:
pdfplumber, pypdf, and pdfminer all return empty strings, and a pipeline that
writes that empty string to disk ends up asserting "no content" when the truth
is "content we did not read". This script is the fallback for that case.

Two things beyond a plain tesseract wrapper:

- **It refuses to guess.** `--report` emits per-page mean word confidence and
  word counts from tesseract's own TSV output, so the caller can decide whether
  the OCR is worth committing rather than taking the text on faith. A page that
  comes back at 45% confidence is a finding, not a transcript.
- **It leaves an existing text layer alone.** By default a page that already
  extracts text is passed through unchanged, so a mixed PDF (born-digital pages
  plus inserted scans) does not get silently degraded to OCR everywhere. Use
  `--force` to OCR regardless.

Dependencies are system binaries, not Python packages: `pdftoppm` (poppler) and
`tesseract`. Both are one apt install and neither is present by default in a
fresh sandbox:

    apt-get update && apt-get install -y tesseract-ocr poppler-utils

Text extraction for the pass-through check uses `pdftotext` when available and
degrades to "assume no text layer" when it is not, so the script runs with
tesseract alone.

    python3 ocr-pdf.py scan.pdf                    # text to stdout
    python3 ocr-pdf.py scan.pdf -o out.txt         # text to a file
    python3 ocr-pdf.py scan.pdf --report r.json    # text plus a quality report
    python3 ocr-pdf.py scan.pdf --dpi 400 --force  # denser raster, OCR every page
"""
from __future__ import annotations

import argparse
import json
import shutil
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path


def need(binary: str) -> str:
    path = shutil.which(binary)
    if not path:
        sys.exit(f"{binary} not found. Install with:\n"
                 f"  apt-get update && apt-get install -y tesseract-ocr poppler-utils")
    return path


def existing_text(pdf: Path, page: int) -> str:
    """Text already in the PDF for one 1-indexed page, or '' if none/unknown."""
    if not shutil.which("pdftotext"):
        return ""
    out = subprocess.run(["pdftotext", "-f", str(page), "-l", str(page),
                          str(pdf), "-"],
                         capture_output=True, text=True)
    return out.stdout.strip() if out.returncode == 0 else ""


def page_count(pdf: Path) -> int:
    out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True)
    if out.returncode == 0:
        for line in out.stdout.splitlines():
            if line.startswith("Pages:"):
                return int(line.split()[1])
    # pdfinfo absent: rasterize everything and count what comes out
    return 0


def ocr_page(png: Path, lang: str) -> tuple[str, dict]:
    """Return (text, stats) for one rasterized page."""
    base = png.with_suffix("")
    subprocess.run(["tesseract", str(png), str(base), "-l", lang, "quiet"],
                   capture_output=True, check=True)
    text = base.with_suffix(".txt").read_text(encoding="utf-8", errors="replace")

    # tesseract's own per-word confidence, so the caller can judge the output
    subprocess.run(["tesseract", str(png), str(base), "-l", lang, "tsv", "quiet"],
                   capture_output=True, check=True)
    confs = []
    tsv = base.with_suffix(".tsv")
    if tsv.exists():
        for line in tsv.read_text(encoding="utf-8", errors="replace").splitlines()[1:]:
            parts = line.split("\t")
            if len(parts) >= 12 and parts[11].strip():
                try:
                    c = float(parts[10])
                except ValueError:
                    continue
                if c >= 0:
                    confs.append(c)
    return text, {
        "words": len(confs),
        "mean_confidence": round(statistics.mean(confs), 1) if confs else None,
        "low_confidence_words": sum(1 for c in confs if c < 60),
    }


def run(pdf: Path, dpi: int, lang: str, force: bool):
    need("pdftoppm")
    need("tesseract")
    pages, report = [], []

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        subprocess.run(["pdftoppm", "-r", str(dpi), "-png", str(pdf), str(tmp / "p")],
                       check=True, capture_output=True)
        pngs = sorted(tmp.glob("p-*.png")) or sorted(tmp.glob("p*.png"))
        if not pngs:
            sys.exit(f"{pdf}: pdftoppm produced no pages")

        for i, png in enumerate(pngs, 1):
            prior = "" if force else existing_text(pdf, i)
            if prior:
                pages.append(prior)
                report.append({"page": i, "source": "text-layer",
                               "chars": len(prior)})
                continue
            text, stats = ocr_page(png, lang)
            pages.append(text)
            report.append({"page": i, "source": "ocr", "chars": len(text.strip()),
                           **stats})

    return "\n\n".join(pages), {
        "file": pdf.name,
        "pages": len(pages),
        "dpi": dpi,
        "lang": lang,
        "ocr_pages": sum(1 for r in report if r["source"] == "ocr"),
        "text_layer_pages": sum(1 for r in report if r["source"] == "text-layer"),
        "mean_confidence": _overall(report),
        "per_page": report,
    }


def _overall(report):
    vals = [r["mean_confidence"] for r in report
            if r.get("mean_confidence") is not None]
    return round(statistics.mean(vals), 1) if vals else None


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", type=Path)
    ap.add_argument("-o", "--out", type=Path, help="write text here (default stdout)")
    ap.add_argument("--report", type=Path, help="write a JSON quality report here")
    ap.add_argument("--dpi", type=int, default=300,
                    help="raster density; 300 is a good default, 400+ for small type")
    ap.add_argument("--lang", default="eng", help="tesseract language (default eng)")
    ap.add_argument("--force", action="store_true",
                    help="OCR every page even where a text layer exists")
    a = ap.parse_args()

    if not a.pdf.exists():
        sys.exit(f"{a.pdf}: no such file")

    text, report = run(a.pdf, a.dpi, a.lang, a.force)

    if a.out:
        a.out.write_text(text, encoding="utf-8")
        print(f"wrote {a.out} ({len(text):,} chars)", file=sys.stderr)
    else:
        print(text)

    if a.report:
        a.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {a.report}", file=sys.stderr)

    conf = report["mean_confidence"]
    if report["ocr_pages"]:
        print(f"OCR {report['ocr_pages']}/{report['pages']} pages at {a.dpi} dpi; "
              f"mean confidence {conf if conf is not None else 'n/a'}",
              file=sys.stderr)
        if conf is not None and conf < 70:
            print("  low confidence: treat this as a lead, not a transcript",
                  file=sys.stderr)


if __name__ == "__main__":
    main()
