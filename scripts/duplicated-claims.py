#!/usr/bin/env python3
"""Advisory scan: near-duplicated prose across the repo's markdown.

The one-owner-per-claim principle (a claim lives in one document; others
link, and docs/owners.csv records who owns a statement the coordination
layer repeats) fails quietly: the same paragraph gets restated across
README layers and the copies age at different rates. This detector is
mechanical, advisory, and never blocking, in the idiom of dead-links.py
and unclaimed-code.py: run it, read the pairs, assign an owner or
shrug. It reports candidates, not findings.

Ported 2026-08-16 from mehrlander/home's tools/duplicated-claims.py
(born there from PR #295's two hand-fixed duplicate rounds), promoted to the
hub because the hub's own doc pairs (show-repo.md against its page's
commentary, CONVENTIONS.md against its restatements) were being overlap-
checked by hand in docs/text-content.md. Home still runs its copy; when it
next drifts, the fix is to pull this one, per the no-private-to-private rule.

Method: strip fences, frontmatter, and tables; shingle the remaining prose
into overlapping 10-word windows; report file pairs sharing at least
SHARED_MIN shingles, with one sample per pair. Expect false positives
(boilerplate phrasing, quoted text, a contract quoting its own rule).

Exclusions lean on the repo's own registries rather than a hand list where
they can: any doc whose docs.csv status is `record` is out (a record may
legitimately restate what superseded it), as are generated projections and
the plugin's vendored copies of the conventions (byte-identical by a hook,
gated elsewhere, and they would drown the report).

Usage:
  python3 scripts/duplicated-claims.py [PATH]   # default: whole repo
  npm run claims-scan
"""

import csv
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

SHINGLE = 10        # words per window
SHARED_MIN = 3      # shared windows before a pair is reported

# The plugin's vendored conventions are byte-copies by hook (gated by
# portable-manifest.test.mjs), task files quote the docs they scope, and
# archive/ preserves retired projects whose exports contain copies of their
# own docs by construction (restatement there is the record, not the rot).
EXCLUDE_PREFIXES = (
    ".claude/", "tracker/tasks/", "archive/",
)
# Generated projections inherit their sources' text by construction.
EXCLUDE_PATHS = {
    "docs/README.md", "pages/README.md", "tracker/board.md",
}
TOP = 20            # report at most this many pairs

FENCE = re.compile(r"^(```|~~~)")
TABLE_OR_HR = re.compile(r"^\s*[|\-=+*_ ]+\s*$|^\s*\|")
WORD = re.compile(r"[a-z0-9']+")


def record_paths(root: Path) -> set:
    """Docs whose registry status is `record`: preserved moments, allowed to
    restate. Read from docs.csv so the exclusion cannot drift from the
    registry; a missing or unreadable registry excludes nothing."""
    try:
        with (root / "docs" / "docs.csv").open(encoding="utf-8", newline="") as fh:
            return {r["path"] for r in csv.DictReader(fh) if r.get("status") == "record"}
    except (OSError, ValueError, KeyError):
        return set()


def prose(text: str) -> str:
    out, fence, front = [], False, False
    for i, line in enumerate(text.split("\n")):
        if i == 0 and line.strip() == "---":
            front = True
            continue
        if front:
            if line.strip() == "---":
                front = False
            continue
        if FENCE.match(line):
            fence = not fence
            continue
        if fence or TABLE_OR_HR.match(line):
            continue
        out.append(line)
    return " ".join(out)


def main(argv):
    root = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"],
                               capture_output=True, text=True).stdout.strip())
    scope = argv[1] if len(argv) > 1 else "."
    files = subprocess.run(["git", "ls-files", "--", scope],
                           capture_output=True, text=True, cwd=root
                           ).stdout.splitlines()
    records = record_paths(root)
    files = [f for f in files if f.endswith(".md")
             and not any(f.startswith(p) for p in EXCLUDE_PREFIXES)
             and f not in EXCLUDE_PATHS
             and f not in records]

    index = defaultdict(set)          # shingle -> {file}
    for f in files:
        try:
            words = WORD.findall(prose((root / f).read_text(encoding="utf-8")).lower())
        except (UnicodeDecodeError, OSError):
            continue
        for i in range(len(words) - SHINGLE + 1):
            index[" ".join(words[i:i + SHINGLE])].add(f)

    pairs = defaultdict(list)
    for sh, fs in index.items():
        fs = sorted(fs)
        for a in range(len(fs)):
            for b in range(a + 1, len(fs)):
                pairs[(fs[a], fs[b])].append(sh)

    hits = sorted(((len(v), k, v) for k, v in pairs.items() if len(v) >= SHARED_MIN),
                  reverse=True)
    print(f"duplicated-claims scan: {len(files)} files scanned "
          f"({len(records)} record-status docs excluded via docs.csv), "
          f"{len(hits)} pair(s) at >= {SHARED_MIN} shared {SHINGLE}-word windows "
          f"(advisory; expect false positives; top {TOP} shown)")
    for n, (a, b), shs in hits[:TOP]:
        print(f"\n  {n:3} shared  {a}\n             {b}")
        print(f'             e.g. "...{shs[0][:90]}..."')
    if not hits:
        print("  none found in scope")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
