#!/usr/bin/env python3
"""Report what a pass found, so the next decision is made against data.

    python3 docstruct/survey.py <records_dir> [--by-doc] [--attention] [--sample N]

A detector, not a judge. It reports and ranks; it decides nothing and writes no
data. Expect to read the output as a prompt, in the same spirit as a coverage
report: some of what it flags will be fine.

Three questions it answers:

**What did the pass see?** Page counts, confidence, how the recognizer compared
with the document's own inherited text layer, and how the orientation step
ruled. `--by-doc` breaks it down per document, which is where era differences
show up.

**What deserves a human?** `--attention` ranks pages by trouble: low confidence,
an orientation call that was close, a page where the recognizer found far less
than the inherited layer did.

**Which pages should the fixed sample hold?** `--sample N` picks N pages that
span the corpus rather than favouring any one document or page shape,
stratified by document and by a coarse page profile. Deriving the sample from a
real pass beats hand-picking pages blind, which was the alternative.
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

MONEY = re.compile(r"^\(?\$?[\d][\d,]*\)?$")


def load(records_dir: Path) -> list[dict]:
    out = []
    for path in sorted(Path(records_dir).rglob("*.json")):
        try:
            out.append(json.loads(path.read_text()))
        except (json.JSONDecodeError, OSError):
            print(f"warning: unreadable record {path}", file=sys.stderr)
    return out


def summarize(rec: dict) -> dict:
    """Reduce one page record to the handful of numbers worth comparing."""
    by_name = {e["method"]["name"]: e for e in rec.get("extractions", [])}
    primary = by_name.get("tesseract", {})
    inherited = by_name.get("inherited", {})
    words = primary.get("words", [])
    numeric = [w for w in words if MONEY.match(w["text"]) and any(c.isdigit() for c in w["text"])]
    confs = [w["conf"] for w in words if "conf" in w]
    orient = rec.get("prep", {}).get("orientation", {})
    width = rec.get("source", {}).get("width", 0)
    height = rec.get("source", {}).get("height", 1)
    return {
        "key": f"{rec['doc_id']}/{rec['page_id']}",
        "doc": rec["doc_id"],
        "words": len(words),
        "numeric": len(numeric),
        "numeric_share": len(numeric) / len(words) if words else 0.0,
        "mean_conf": primary.get("mean_conf"),
        "low_conf": sum(1 for c in confs if c < 70),
        "inherited": inherited.get("word_count", 0),
        "suspect": inherited.get("notes", {}).get("suspect", 0),
        "rotated": orient.get("applied", 0),
        "verdict": orient.get("verdict", ""),
        "osd_conf": orient.get("osd_confidence", 0.0),
        "landscape": width > height,
    }


def profile(row: dict) -> str:
    """A coarse page shape, for stratifying a sample.

    Deliberately crude and computed only from what a pass already recorded. It
    separates the cases that behave differently downstream: a dense numeric
    table needs column geometry, prose needs reading order, and a near-empty
    page needs neither.
    """
    if row["words"] < 40:
        return "sparse"
    if row["numeric_share"] >= 0.25:
        return "table-dense"
    if row["numeric_share"] >= 0.08:
        return "table-light"
    return "prose"


def fmt_conf(value) -> str:
    return f"{value:.1f}" if isinstance(value, (int, float)) else "-"


def report_overall(rows: list[dict]) -> None:
    confs = [r["mean_conf"] for r in rows if r["mean_conf"] is not None]
    tess = sum(r["words"] for r in rows)
    inh = sum(r["inherited"] for r in rows)
    print(f"pages                 {len(rows)}")
    if confs:
        confs_sorted = sorted(confs)
        print(f"mean confidence       {statistics.mean(confs):.1f} "
              f"(median {statistics.median(confs):.1f}, "
              f"p10 {confs_sorted[len(confs_sorted) // 10]:.1f})")
    print(f"words, recognizer     {tess:,}")
    print(f"words, inherited      {inh:,}" + (f"  ({tess / inh:.2f}x)" if inh else ""))
    suspect = sum(r["suspect"] for r in rows)
    if inh:
        print(f"inherited suspect     {suspect:,}/{inh:,} ({suspect / inh * 100:.1f}%)")
    print(f"pages inherited empty {sum(1 for r in rows if r['inherited'] == 0)}")
    print()
    verdicts = Counter(r["verdict"] for r in rows)
    print("orientation:", ", ".join(f"{k} {v}" for k, v in verdicts.most_common()))
    corrected = [r for r in rows if r["rotated"]]
    if corrected:
        turns = Counter(r["rotated"] for r in corrected)
        print(f"  corrected {len(corrected)} ({len(corrected) / len(rows) * 100:.1f}%): "
              + ", ".join(f"{k} deg x{v}" for k, v in sorted(turns.items())))
    print()
    print("page profiles:", ", ".join(
        f"{k} {v}" for k, v in Counter(profile(r) for r in rows).most_common()))
    print(f"landscape: {sum(1 for r in rows if r['landscape'])}/{len(rows)}")


def report_by_doc(rows: list[dict]) -> None:
    print(f"\n{'document':12} {'pages':>5} {'conf':>6} {'words':>7} {'inher':>7} "
          f"{'ratio':>6} {'num%':>5} {'rot':>4}")
    for doc in sorted({r["doc"] for r in rows}):
        d = [r for r in rows if r["doc"] == doc]
        confs = [r["mean_conf"] for r in d if r["mean_conf"] is not None]
        tess = sum(r["words"] for r in d)
        inh = sum(r["inherited"] for r in d)
        num = sum(r["numeric"] for r in d)
        print(f"{doc:12} {len(d):5} {fmt_conf(statistics.mean(confs) if confs else None):>6} "
              f"{tess:7,} {inh:7,} {(tess / inh if inh else 0):6.2f} "
              f"{(num / tess * 100 if tess else 0):5.1f} {sum(1 for r in d if r['rotated']):4}")


def report_attention(rows: list[dict], limit: int = 25) -> None:
    """Rank pages by how much they look like they need a human.

    The score is a sum of independent smells rather than a calibrated measure.
    Its job is ordering, not a number anyone should quote.
    """
    def score(r: dict) -> float:
        s = 0.0
        if r["mean_conf"] is not None:
            s += max(0.0, (85 - r["mean_conf"]) / 85)
        if r["words"]:
            s += min(1.0, r["low_conf"] / r["words"])
        if r["inherited"] > 40 and r["words"] < r["inherited"] * 0.6:
            s += 0.5          # recognizer found far less than the layer already had
        if r["verdict"] == "osd_overruled":
            s += 0.25         # a rotation was proposed and rejected: a close call
        if r["verdict"] == "undecided":
            s += 0.5
        return s

    ranked = sorted(rows, key=score, reverse=True)[:limit]
    print(f"\n{'page':24} {'score':>5} {'conf':>6} {'words':>6} {'inher':>6} {'verdict':>14}")
    for r in ranked:
        print(f"{r['key']:24} {score(r):5.2f} {fmt_conf(r['mean_conf']):>6} "
              f"{r['words']:6} {r['inherited']:6} {r['verdict']:>14}")


def pick_sample(rows: list[dict], n: int) -> list[str]:
    """Choose n pages spanning documents and page profiles.

    Round-robins over (document, profile) buckets so no single edition or page
    shape dominates, and takes the median-word page from each bucket visited, on
    the reasoning that a typical page teaches more than an extreme one. Pages
    the orientation step acted on or hesitated over are seeded in first: they
    are rare, and a sample without them cannot exercise the code that handles
    them.
    """
    picked: list[str] = []
    seen = set()

    for row in sorted(rows, key=lambda r: (r["verdict"] != "undecided", -abs(r["rotated"]))):
        if row["rotated"] or row["verdict"] in ("undecided", "osd_overruled"):
            if row["key"] not in seen:
                picked.append(row["key"])
                seen.add(row["key"])
        if len(picked) >= max(3, n // 5):
            break

    buckets: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in rows:
        buckets[(row["doc"], profile(row))].append(row)
    for rows_in in buckets.values():
        rows_in.sort(key=lambda r: r["words"])

    order = sorted(buckets, key=lambda k: (-len(buckets[k]), k))
    while len(picked) < n and order:
        progressed = False
        for key in list(order):
            if len(picked) >= n:
                break
            candidates = buckets[key]
            if not candidates:
                order.remove(key)
                continue
            row = candidates.pop(len(candidates) // 2)
            if row["key"] not in seen:
                picked.append(row["key"])
                seen.add(row["key"])
                progressed = True
        if not progressed:
            break
    return sorted(picked)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("records", help="directory of page records from run.py")
    ap.add_argument("--by-doc", action="store_true", help="per-document breakdown")
    ap.add_argument("--attention", action="store_true", help="rank pages needing a look")
    ap.add_argument("--sample", type=int, metavar="N", help="emit a stratified N-page list")
    args = ap.parse_args(argv)

    records = load(Path(args.records))
    if not records:
        print("no records found", file=sys.stderr)
        return 1
    rows = [summarize(r) for r in records]

    if args.sample:
        print(f"# {args.sample}-page sample, stratified by document and page profile")
        print(f"# derived from {len(rows)} records by docstruct/survey.py --sample")
        for key in pick_sample(rows, args.sample):
            print(key)
        return 0

    report_overall(rows)
    if args.by_doc:
        report_by_doc(rows)
    if args.attention:
        report_attention(rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
