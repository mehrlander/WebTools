#!/usr/bin/env python3
"""Run an extraction pass over a document source.

    python3 docstruct/run.py <source> -o out/ [--sample list.txt] [--workers 4]

`<source>` is a directory of per-page PDFs (one subdirectory per document), a
single PDF, or a directory of images. Output is one JSON record per page under
`out/<doc_id>/<page_id>.json`, holding every extraction taken of that page.

Two operational notes, both learned the hard way:

**Parallelize with processes and let `recognize` set `OMP_THREAD_LIMIT=1`.**
Tesseract links OpenMP and takes a thread per core by default, so four worker
processes on four cores means sixteen threads fighting over four cores. Measured
on a 45-page sample: over 600 seconds against 18 seconds with the limit set.

**Passes are resumable and that matters more than it sounds.** A full pass over
a few thousand pages runs in tens of minutes, which is short enough to rerun on
a whim and long enough to lose to a disconnect. Pages whose record already
exists are skipped unless `--force`.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pages as pages_mod       # noqa: E402
import prep as prep_mod         # noqa: E402
import recognize                # noqa: E402
from record import PageRecord, rotate_words  # noqa: E402


def read_sample(path: Path) -> tuple[set[str], set[str]]:
    """Read a selection file, returning (page keys, whole-document ids).

    One entry per line, `#` comments allowed. A line with a slash selects one
    page (`lbn_1991/p-122`); a line without one selects every page of that
    document (`lbn_1991`). The second form is what makes this usable as a
    corpus filter as well as a fixed sample, so a source directory holding two
    kinds of document can be split without a bespoke flag.
    """
    pages, docs = set(), set()
    for line in Path(path).read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        (pages if "/" in line else docs).add(line)
    return pages, docs


def process(page: pages_mod.Page, out_dir: Path, psm: list[int], no_prep: bool) -> dict:
    """Extract one page and write its record. Returns a small status dict."""
    started = time.time()
    try:
        image, ext, size = page.image_bytes()
        inherited = page.inherited_words()
        lossless = page.lossless()

        if no_prep:
            orientation = prep_mod.Orientation(0, 0, 0.0, verdict="skipped")
        else:
            image, orientation = prep_mod.deskew_rotate(image, psm=psm[0])

        applied = orientation.applied
        if applied:
            # The inherited layer was read in the pre-rotation frame; move it so
            # its boxes are comparable with everything taken after prep.
            inherited = rotate_words(inherited, applied, size)
            size = (size[1], size[0]) if applied in (90, 270) else size

        # One extraction per segmentation mode. These are independent methods in
        # the sense that matters: they disagree, and they disagree differently
        # on different rows. Measured on one line-printer row, psm 4 read
        # `-1,116` correctly where psm 6 gave `-1,1146`, while psm 6 read
        # `745 87,083` where psm 4 truncated both. Neither dominates, which is
        # exactly the condition under which a second opinion is worth having.
        extractions = [recognize.tesseract(image, psm=mode) for mode in psm]
        if inherited:
            extractions.append(
                recognize.Extraction(
                    recognize.Method("inherited", "", (("origin", "embedded-text-layer"),)),
                    inherited,
                    {"suspect": sum(1 for w in inherited if "suspect" in w.flags)},
                )
            )

        record = PageRecord(
            page.doc_id,
            page.page_id,
            source={
                "path": str(page.path),
                "lossless": lossless,
                "format": ext,
                "width": size[0],
                "height": size[1],
            },
            prep={"orientation": orientation.as_dict()},
            extractions=extractions,
        )
        record.write(out_dir)
        return {
            "key": page.key,
            "ok": True,
            "seconds": round(time.time() - started, 2),
            "rotated": applied,
            "verdict": orientation.verdict,
            "words": len(extractions[0].words),
            "mean_conf": extractions[0].mean_conf,
            "methods": len(extractions),
        }
    except Exception as exc:  # a bad page must not take down a 4,000-page pass
        return {"key": page.key, "ok": False, "error": f"{type(exc).__name__}: {exc}"}
    finally:
        page.close()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("source", help="directory of page PDFs, a PDF, or a directory of images")
    ap.add_argument("-o", "--out", required=True, help="output directory for page records")
    ap.add_argument("--sample", help="file listing doc_id/page_id to restrict the pass to")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--psm", default="6",
                    help="tesseract page segmentation mode(s), comma-separated. "
                         "Several modes record several extractions of each page, "
                         "which is what compose.py adjudicates between.")
    ap.add_argument("--no-prep", action="store_true", help="skip orientation correction")
    ap.add_argument("--force", action="store_true", help="re-extract pages already recorded")
    ap.add_argument("--limit", type=int, help="stop after N pages (for a quick probe)")
    args = ap.parse_args(argv)

    try:
        psm_modes = [int(x) for x in str(args.psm).split(",") if x.strip()]
    except ValueError:
        ap.error(f"--psm expects integers, got {args.psm!r}")
    if not psm_modes:
        ap.error("--psm needs at least one mode")

    out_dir = Path(args.out)
    all_pages = pages_mod.load_pages(args.source)

    if args.sample:
        want_pages, want_docs = read_sample(Path(args.sample))
        all_pages = [p for p in all_pages if p.key in want_pages or p.doc_id in want_docs]
        found = {p.key for p in all_pages}
        found_docs = {p.doc_id for p in all_pages}
        missing = (want_pages - found) | (want_docs - found_docs)
        if missing:
            print(f"warning: {len(missing)} selected entries not found in source, "
                  f"e.g. {sorted(missing)[:3]}", file=sys.stderr)

    if not args.force:
        all_pages = [
            p for p in all_pages
            if not PageRecord.path_for(out_dir, p.doc_id, p.page_id).exists()
        ]
    if args.limit:
        all_pages = all_pages[: args.limit]

    if not all_pages:
        print("nothing to do (all pages already recorded; --force to redo)")
        return 0

    print(f"{len(all_pages)} pages, {args.workers} workers, "
          f"psm {','.join(str(m) for m in psm_modes)}")
    started = time.time()
    done = failed = rotated = 0
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(process, p, out_dir, psm_modes, args.no_prep): p for p in all_pages
        }
        for future in concurrent.futures.as_completed(futures):
            status = future.result()
            done += 1
            if not status["ok"]:
                failed += 1
                print(f"  FAILED {status['key']}: {status['error']}", file=sys.stderr)
            elif status["rotated"]:
                rotated += 1
                print(f"  rotated {status['rotated']:>3} {status['key']} "
                      f"({status['verdict']})")
            if done % 250 == 0:
                rate = done / (time.time() - started)
                print(f"  {done}/{len(all_pages)}  {rate:.1f} pages/s")

    elapsed = time.time() - started
    print(f"\n{done} pages in {elapsed:.0f}s ({done / elapsed:.1f}/s), "
          f"{rotated} rotated, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
