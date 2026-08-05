#!/usr/bin/env python3
"""Build the committed entity index, end to end, in one command.

The steps were all committed before this existed; the pipeline chaining them
was not. Going from a scan to `web-tools-private/state/entities.json` took
three ad-hoc scripts and a hand-typed metadata block, which meant the index
could not be reproduced without re-deriving the glue from the findings log.
That is the failure this file exists to prevent: a derived artifact whose
builder lives only in somebody's terminal history is not derived, it is
authored, and it goes stale silently.

    python3 tools/concept-lab/build-entity-index.py \
        --repos wt=/path/web-tools home=/path/home [...] \
        --gaz-from bwa=/path/budget-wa spend=/path/spend-wa \
        --out /path/web-tools-private/state/entities.json \
        [--sample 1200] [--profile-cache /tmp/profiles.json]

`--profile-cache` reuses an existing scan rather than spending half an hour
re-running the model, which is what makes iterating on the gazetteer or the
metadata cheap. Delete the cache to force a fresh scan.

The precision block is data, declared in PRECISION below rather than retyped
per run, because those numbers are adjudications with sample sizes attached
and retyping them is how a measured figure turns into a remembered one.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from gazetteer import build as build_gazetteer, confirm, trim_span  # noqa: E402
from entityprofile import build_index  # noqa: E402
from entitylab import iter_files, mask, TEXT_SUFFIXES, MAX_PROSE_BYTES, PATTERNS  # noqa: E402

# Adjudicated figures. Each carries how many names were judged, because a
# precision claim without its sample size is not a measurement.
PRECISION = {
    "note": "One rater, judged against the OntoNotes definitions. Flag rate is a "
            "different measurement and is not this number: Pearson r between them "
            "was -0.54 over 14 repo/label pairs.",
    "ORG_head": 0.23, "ORG_stratified": 0.19,
    "PERSON_head": 0.07, "PERSON_stratified": 0.09,
    "GPE_stratified": 0.21, "GPE_judged": 63,
    "LAW_stratified": 0.37, "LAW_judged": 57,
    "ORG_confirmed": {
        "typeErrors": 0, "judged": 24,
        "note": "0 type errors in 24 sampled, which bounds the rate loosely rather "
                "than establishing 100%. Measured after the masking fix but before "
                "the de-articled fold, which added 310 confirmations, so the sample "
                "predates the current set. Three of the 24 carry a span-boundary "
                "defect with the type still correct.",
    },
    "unjudged": ["NORP", "EVENT", "PRODUCT", "FAC", "LOC", "WORK_OF_ART",
                 "LANGUAGE", "all value classes"],
    "labelNotes": {
        "LAW": "The best non-ORG label at 37%, because statutory prose genuinely "
               "names sections and acts: Title 51 RCW, the Climate Commitment Act, "
               "chapter 265 Laws of 2017, the Public Records Act. Its failures are "
               "software version strings (daisyUI 5, Windows 11) and headings.",
        "GPE": "21%. Real places are there (Seattle, Spokane, Okanogan County, "
               "Karnataka, Washington State) under a flood of library and format "
               "names (JSON, React, Roboto, Meriyah). Organizations are routinely "
               "mistyped into it (UW, WSU, Bloomberg, NRA).",
    },
}

METHOD = {
    "model": "spacy en_core_web_sm (OntoNotes 5)",
    "corpus": "markdown prose; code spans (including ones wrapping a line), links, "
              "frontmatter and structural markdown masked length-preservingly; files "
              ">200KB skipped; the repo's data/design/content.csv decides membership, "
              "`exclude` drops a file and analysis_use tags every extraction with its "
              "corpus; sampling is per corpus so a large corpus cannot crowd out a small one",
    "confirmation": "gazetteer.confirm(): span trimmed of trailing possessives and "
                    "dangling punctuation and rejected if brackets do not balance, no "
                    "markup in the name, case match on short acronym keys, table class "
                    "must be agency/acronym/vendor, and a de-articled fold as fallback "
                    "since statutory prose says 'the department of health' where the "
                    "tables say 'Department of Health'. A trimmed name keeps its raw "
                    "span in rawSpan, so the correction is recorded not applied silently",
    "notResolved": "names are never merged; OFM and Office of Financial Management "
                   "stay separate names of a possibly-shared entity",
    "mentionsDropped": "counts only; the working profile carries 3 sampled mentions per name",
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repos", nargs="+", required=True, metavar="name=path")
    ap.add_argument("--gaz-from", nargs="+", required=True, metavar="name=path",
                    help="repos whose curated tables build the gazetteer")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--sample", type=int, default=1200)
    ap.add_argument("--profile-cache", type=Path,
                    default=Path("/tmp/entity-profiles.json"))
    a = ap.parse_args()

    if a.profile_cache.exists():
        print(f"reusing scan: {a.profile_cache}", file=sys.stderr)
    else:
        print(f"scanning {len(a.repos)} repos (tens of minutes)…", file=sys.stderr)
        subprocess.run([sys.executable, str(HERE / "entityprofile.py"), "scan",
                        *a.repos, "--sample", str(a.sample),
                        "--out", str(a.profile_cache)], check=True)
    profiles = json.loads(a.profile_cache.read_text())

    gaz = build_gazetteer(dict(s.split("=", 1) for s in a.gaz_from))
    print(f"gazetteer: {gaz['size']} keys", file=sys.stderr)

    confirmed, names, mentions = {}, 0, 0
    for p in profiles:
        rows = []
        for e in (p["labels"].get("ORG") or {}).get("entries", []):
            cls = confirm(e["name"], gaz)
            if cls:
                # Store the trimmed name, and keep the raw span beside it where
                # they differ. The four-level model says a name is a surface
                # form and is never merged, but a trailing possessive is a span
                # error rather than a form the prose used, so the correction is
                # recorded rather than applied silently.
                name = trim_span(e["name"])
                row = {"name": name, "mentions": e["mentions"],
                       "files": e["files"], "gaz_class": cls, "type_agrees": True}
                if name != e["name"]:
                    row["rawSpan"] = e["name"]
                rows.append(row)
        confirmed[p["repo"]] = rows
        names += len(rows)
        mentions += sum(r["mentions"] for r in rows)

    total_names = sum((p["labels"].get("ORG") or {}).get("names", 0) for p in profiles)
    total_ment = sum((p["labels"].get("ORG") or {}).get("mentions", 0) for p in profiles)
    precision = json.loads(json.dumps(PRECISION))
    precision["coverage"] = {
        "names": names, "ofNames": total_names,
        "mentions": mentions, "ofMentions": total_ment,
        "caveat": "high precision, low recall: a trustworthy core, not a complete index",
    }

    # RCW citations per repo, harvested by regex over the same prose. This is
    # the half of the cross-repo join that lives on the reading side: wa-bills
    # holds which bills cite a chapter, and this holds which repos discuss it.
    # Neither is useful alone. Cheap enough to do unconditionally (regex over
    # ~4,000 markdown files), and deliberately not a model's job.
    rcw_by_repo: dict[str, dict[str, int]] = {}
    for spec in a.repos:
        name, path = spec.split("=", 1)
        counts: Counter = Counter()
        for f in iter_files(Path(path), TEXT_SUFFIXES, MAX_PROSE_BYTES):
            try:
                text = mask(f.read_text(encoding="utf-8", errors="replace"))
            except OSError:
                continue
            for m in PATTERNS["rcw"].finditer(text):
                chapter = re.search(r"(\d+[A-Z]?\.\d+)", m.group(0))
                if chapter:
                    counts["RCW " + chapter.group(1)] += 1
        rcw_by_repo[name] = dict(counts.most_common())
    print(f"rcw: {sum(len(v) for v in rcw_by_repo.values())} chapter mentions across "
          f"{len(rcw_by_repo)} repos", file=sys.stderr)

    idx = build_index(profiles, confirmed,
                      {"generatedAt": date.today().isoformat(),
                       "method": METHOD, "precision": precision})
    # The per-corpus breakdown and the registry facts ride alongside the pooled
    # labels, so one scan answers the per-category question.
    for p in profiles:
        idx["repos"][p["repo"]].update({
            "registry": p.get("registry", False),
            "excludedByRegistry": p.get("excluded_by_registry", 0),
            "corpusFiles": p.get("corpus_files", {}),
            "corpora": p.get("corpora", {}),
        })

    idx["rcwByRepo"] = rcw_by_repo
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(idx, indent=1), encoding="utf-8")
    kb = a.out.stat().st_size / 1024
    print(f"wrote {a.out} ({kb:.0f} KB): {names}/{total_names} names confirmed, "
          f"{mentions}/{total_ment} mentions", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
