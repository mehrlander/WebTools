#!/usr/bin/env python3
"""Score a termlab index against the gold polysemy set.

The gold set is the estate's known multi-sense terms, assembled by hand
while eyeballing v2 through v9 output. A ranking mechanism is judged by
where these land: median gold rank, and how many reach the top 100 of the
anchored-senses pool. Run after any scoring change so tuning stays
measured instead of anecdotal.

Usage: python3 exp_gold.py index.json [index2.json ...]
"""
from __future__ import annotations

import json
import statistics
import sys

GOLD = {
    "board": "retirement/investment boards vs tracker board vs board game",
    "stage": "show-repo staging vs structured-stage doctrine",
    "surface": "verb vs the cross-repo shelf",
    "deck": "slide deck vs on-deck backlog",
    "arc": "chat-archive arcs vs narrative arcs",
    "index": "pages index vs bill/database index",
    "workflow": "GitHub Actions vs Apple Shortcuts",
    "sweep": "repo-review sweep vs chat trawling",
    "component": "web component vs ACFR component units",
    "instrument": "show-repo cross-repo instrument vs procurement instrument",
    "spine": "document spine vs retired umbrella term",
    "caption": "surfacing caption vs figure caption",
}


def main():
    for path in sys.argv[1:]:
        data = json.loads(open(path, encoding="utf-8").read())
        t = data["terms"]
        pool = sorted(
            (r for r in t.values() if r.get("anchor_split", 0) > 0
             and r["living"] >= 6 and r["file_share"] <= 0.4),
            key=lambda r: -r["anchor_split"])
        names = [r["term"] for r in pool]
        ranks = {}
        for g in GOLD:
            ranks[g] = names.index(g) + 1 if g in names else None
        present = [v for v in ranks.values() if v]
        print(f"== {path}: pool {len(names)}, gold present {len(present)}/{len(GOLD)}")
        for g, v in sorted(ranks.items(), key=lambda kv: kv[1] or 10**9):
            print(f"   {g:12} {v if v else '-'}")
        if present:
            print(f"   median rank {statistics.median(present)}, top-100 count "
                  f"{sum(1 for v in present if v <= 100)}")


if __name__ == "__main__":
    main()
