#!/usr/bin/env python3
"""Where a repo's documentation sits, and what sits outside the four slots.

The rule is docs/CONSTELLATION.md, principle 6. This counts it.

Six buckets, in the order a file is tested:

    docs        any markdown under a `docs/` folder at any depth
    readme      basename README.md, anywhere
    contract    CLAUDE.md or AGENTS.md
    skill       under .claude/ or a skills/ folder, which answer to their own
                registry
    residual    an ALL-CAPS basename outside all of the above
    content     everything else: the repo's own subject matter

The residual test is basename shape, and it cannot see the fourth slot: a
document that describes the files sitting with it belongs in its folder, and
looks from here exactly like one that has drifted there. So the second table
reports what else is in the directory and stops. Eight capitalised documents
beside sixteen CSVs is a data-design folder documenting itself; one beside an
empty directory is a document with nowhere to be.

Shape also cuts the other way in both directions. A lowercase document outside
`docs/` is invisible here, and a capitalised data file is a false positive.

Advisory, exits 0 always. Reads `git ls-files`, so an uncommitted file is
invisible. python3 stdlib only, argv-driven, runs against any repo path.

    doc-placement.py [--list] [repo ...]
"""
import os, re, subprocess, sys
from collections import Counter, defaultdict

CAPS = re.compile(r"^[A-Z][A-Z0-9_-]*\.md$")
CONTRACTS = {"CLAUDE.md", "AGENTS.md"}
BUCKETS = ["docs", "readme", "contract", "skill", "content", "residual"]


def tracked(root, pattern=None):
    args = ["git", "-C", root, "ls-files"] + ([pattern] if pattern else [])
    out = subprocess.run(args, capture_output=True, text=True).stdout
    return [f for f in out.splitlines() if not f.startswith("node_modules/")]


def bucket(path):
    parts = path.split("/")
    base = parts[-1]
    if "docs" in parts[:-1]:
        return "docs"
    if base == "README.md":
        return "readme"
    if base in CONTRACTS:
        return "contract"
    if ".claude" in parts or "skills" in parts[:-1]:
        return "skill"
    return "residual" if CAPS.match(base) else "content"


def report(root, show_list):
    name = os.path.basename(os.path.abspath(root))
    files = tracked(root, "*.md")
    if not files:
        print("%-20s no tracked markdown" % name)
        return
    held = defaultdict(list)
    for f in files:
        held[bucket(f)].append(f)
    print("%-20s %5d md   " % (name, len(files))
          + "".join("%s %-5d " % (b, len(held[b])) for b in BUCKETS))

    res = held["residual"]
    if not res:
        return
    everything = tracked(root)
    by_dir = Counter(os.path.dirname(f) or "." for f in res)
    print("        docs-shaped   beside it   directory")
    for d, count in by_dir.most_common(10):
        here = [f for f in everything if os.path.dirname(f) == d]
        other = sum(1 for f in here if not CAPS.match(os.path.basename(f)))
        print("        %9d %11d   %s" % (count, other, d or "."))
    rest = by_dir.most_common()[10:]
    if rest:
        print("        %9d               in %d further directories"
              % (sum(c for _, c in rest), len(rest)))
    if show_list:
        for f in sorted(res):
            print("            %s" % f)


def main(argv):
    show_list = "--list" in argv
    roots = [a for a in argv[1:] if a != "--list"] or ["."]
    for r in roots:
        report(r, show_list)
    print()
    print("A residual is documentation-shaped markdown that no docs/ folder, README,")
    print("or agent contract accounts for. It is a question rather than a defect: read")
    print("the directory rows, and see CONSTELLATION.md principle 6 for the two answers.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
