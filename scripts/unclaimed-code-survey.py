#!/usr/bin/env python3
"""Report code files that nothing in the repo names.

The cheapest signal that a file has drifted out of everyone's account: no doc,
README, registry, or CLAUDE.md mentions it, and no test exercises it. That is
not "wrong" and the script never says it is. A one-off tool, a shim, a demo
helper can all be fine unnamed. The point is to let your eye land on the files
you *thought* were accounted for and aren't, and to make a whole layer going
unnamed visible rather than remembered.

Two independent signals per file, because they fail differently:

    named    its path (or a distinctive basename) appears in prose: any .md,
             any registry .json under docs/, CLAUDE.md, a skill
    tested   its path or basename appears in a test file

A file can be tested but undocumented (it works, nobody says what it is for) or
documented but untested (it is described, nothing holds the description true).
Reporting one number would hide both.

The layer table is the point of the run: layers are directories, taken as they
are rather than from a list this script carries, so it says something true about
any repo and grows a row when a repo grows a folder.

Advisory, like scripts/link-survey.py's internal class and the surveys it is
modeled on: heuristic, WILL surface false positives, always exits 0. Portable:
python3 stdlib only, argv-driven, run from any repo root.

Scope it. Unscoped it reports every tracked code file, which is honest and
usually not what you want to read: a repo with an archive, a vendored skill
shelf, or a third-party drop will fill the table with layers that are unnamed on
purpose. Pass the path prefixes you actually maintain. The corpus that does the
NAMING is always the whole repo, so scoping narrows what is judged, never what
counts as evidence.

Usage:
    python3 unclaimed-code-survey.py [--all] [--ext .js,.mjs] [--root DIR] [prefix ...]

    --all   also list the named files under each layer, not just the unnamed
"""
import os
import subprocess
import sys

CODE_EXT = (".js", ".mjs", ".cjs", ".py", ".sh", ".ts")
PROSE_EXT = (".md",)
SKIP_DIRS = {".git", "node_modules", "dist", ".venv", "__pycache__", ".preview"}
# Tests are excluded from the CANDIDATES, not from the corpus: a suite whose
# every file is listed in a test registry would report as fully documented and
# bury the layers that are not. They still count as naming other files.
TEST_HINTS = ("/test/", "/tests/", ".test.", "_test.", "test_")


def tracked_files(root):
    """Prefer git's file list (respects .gitignore); fall back to a walk."""
    try:
        out = subprocess.run(
            ["git", "-C", root, "ls-files"],
            capture_output=True, text=True, check=True,
        ).stdout
        files = [l for l in out.splitlines() if l]
        if files:
            return files
    except (OSError, subprocess.CalledProcessError):
        pass
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for f in filenames:
            files.append(os.path.relpath(os.path.join(dirpath, f), root))
    return files


def is_skipped(rel):
    return any(part in SKIP_DIRS for part in rel.replace(os.sep, "/").split("/"))


def is_test(rel):
    p = "/" + rel.replace(os.sep, "/")
    return any(h in p for h in TEST_HINTS)


def read(root, rel):
    try:
        with open(os.path.join(root, rel), "r", encoding="utf-8", errors="ignore") as fh:
            return fh.read()
    except OSError:
        return ""


def main(argv):
    if "--help" in argv or "-h" in argv:
        print(__doc__.strip())
        return 0
    show_all = "--all" in argv
    argv = [a for a in argv if a != "--all"]
    exts = CODE_EXT
    if "--ext" in argv:
        i = argv.index("--ext")
        exts = tuple(e if e.startswith(".") else "." + e for e in argv[i + 1].split(","))
        del argv[i:i + 2]
    root = "."
    if "--root" in argv:
        i = argv.index("--root")
        root = argv[i + 1]
        del argv[i:i + 2]
    scopes = [s.rstrip("/") + "/" for s in argv[1:]]

    files = [f for f in tracked_files(root) if not is_skipped(f)]
    in_scope = (lambda f: True) if not scopes else \
        (lambda f: any(f.startswith(s) for s in scopes))
    candidates = [f for f in files if f.endswith(exts) and not is_test(f) and in_scope(f)]
    if not candidates:
        print("No code files in scope.")
        return 0

    # A basename shared by two candidates cannot be attributed to either, so
    # only path matches count for those. Without this rule a generic name
    # (index.js, build.mjs) reads as documented wherever the word appears.
    seen = {}
    for f in candidates:
        seen[os.path.basename(f)] = seen.get(os.path.basename(f), 0) + 1
    distinctive = {f: os.path.basename(f) for f in candidates if seen[os.path.basename(f)] == 1}

    prose_corpus, test_corpus = [], []
    for f in files:
        if f.endswith(PROSE_EXT) or (f.endswith(".json") and "/docs/" in "/" + f) \
                or os.path.basename(f) in ("CLAUDE.md", "docs.json", "tests.json"):
            prose_corpus.append(read(root, f))
        elif is_test(f):
            test_corpus.append(read(root, f))
    prose = "\n".join(prose_corpus)
    tests = "\n".join(test_corpus)

    def hit(blob, f):
        if f in blob:
            return True
        b = distinctive.get(f)
        return bool(b) and b in blob

    named = {f: hit(prose, f) for f in candidates}
    tested = {f: hit(tests, f) for f in candidates}

    layers = {}
    for f in candidates:
        layers.setdefault(os.path.dirname(f) or ".", []).append(f)

    print("Unclaimed code survey (advisory; heuristic, expect false positives)")
    print("Scope: %s   Extensions: %s   Tests excluded from candidates"
          % (" ".join(scopes) if scopes else "whole repo", ",".join(exts)))
    print()
    w = max(len(d) for d in layers) + 2
    print("%-*s %6s %6s %6s" % (w, "Layer", "files", "named", "tested"))
    for d in sorted(layers):
        fs = layers[d]
        print("%-*s %6d %6d %6d" % (
            w, d + "/", len(fs), sum(named[f] for f in fs), sum(tested[f] for f in fs)))
    print("%-*s %6d %6d %6d" % (
        w, "TOTAL", len(candidates), sum(named.values()), sum(tested.values())))

    unnamed = [f for f in candidates if not named[f]]
    print()
    if not unnamed:
        print("Every code file in scope is named somewhere. Nothing to eyeball.")
    else:
        print("Named nowhere in prose (%d). A '+' means a test exercises it anyway:" % len(unnamed))
        for d in sorted({os.path.dirname(f) or "." for f in unnamed}):
            print("\n%s/" % d)
            for f in sorted(f for f in unnamed if (os.path.dirname(f) or ".") == d):
                print("  %s %s" % ("+" if tested[f] else " ", os.path.basename(f)))
    if show_all:
        print()
        print("Named in prose (%d):" % (len(candidates) - len(unnamed)))
        for f in sorted(f for f in candidates if named[f]):
            print("  %s %s" % ("+" if tested[f] else " ", f))

    print()
    print("\"Named nowhere\" is not \"wrong.\" It means no doc, README, registry, or CLAUDE.md")
    print("mentions the file, which is the cheapest signal that a layer may have outgrown its")
    print("account. Read the layer table first: one unnamed file is noise, a column of them is a")
    print("category nobody has stated.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
