#!/usr/bin/env python3
"""Inventory the carriers that already hold authored text, and how organized they are.

The companion to scripts/text-census.py, which finds text with no carrier. This
one looks at the text that DID make it into a data file and asks whether the
carrier is in any shape to be relied on.

A **prose field** is a CSV column or a JSON key whose values are sentences
rather than codes, ids, paths, or labels. The script finds them all, then
reports three things about each:

    declared    does anything in the repo name this carrier file: a registry,
                a README, CLAUDE.md, any .md. Undeclared means the text is
                filed but not accounted for.
    supplied    is it quoted source material (under a data/source/ tree or so
                declared in content.csv) rather than something written here.
                Supplied text is not the estate's voice and mostly should not
                move.
    field name  what the column is called.

The field-name census is the point of the run. One concept called `note` in one
carrier, `comment` in the next, `rationale` in a third and `why` in a fourth is
not a naming quibble: it means no reader and no tool can ask "show me the
authored rationale in this repo" and get an answer. A vocabulary that has never
been stated is the honest measure of how organized the carriers are.

Advisory and heuristic, like scripts/text-census.py: it WILL surface false
positives, and it exits 0 unless --check is given.

Portable: python3 stdlib only, argv-driven, runs from any repo root.

Usage:
    python3 text-carriers.py [ROOT] [prefix ...] [options]

    --fields     the field-name census: every prose field name, with how many
                 carriers use it and how much text it holds
    --carriers   one row per carrier file
    --undeclared only carriers nothing in the repo names
    --csv        emit rows as CSV
    --min N      a field is prose-bearing at N+ qualifying cells (default 3)
    --check      exit 1 if any non-supplied carrier is undeclared
"""
import csv
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict

WORD = re.compile(r"[A-Za-z][A-Za-z'’\-]+")
SKIP_DIRS = {".git", "node_modules", "dist", ".venv", "__pycache__", ".preview", "thumbs"}
MIN_WORDS = 6
# A value is prose only if it reads like language. Codes, paths, ids, and
# delimited lists all clear a word count and none of them is a sentence.
NOT_PROSE = re.compile(r"^https?://|^[./]|^[A-Z0-9_-]+$|^\d")


def is_prose(v):
    if not isinstance(v, str):
        return False
    v = v.strip()
    if len(v) < 12 or NOT_PROSE.search(v):
        return False
    words = WORD.findall(v)
    if len(words) < MIN_WORDS:
        return False
    toks = v.split()
    if sum(len(t) for t in toks) / len(toks) > 14:
        return False
    # a pipe- or semicolon-delimited list is a list, however long
    return v.count("|") < 3 and v.count(";") < 4


def tracked(root, exts):
    try:
        out = subprocess.run(
            ["git", "-C", root, "ls-files"], capture_output=True, text=True, check=True
        ).stdout
        return [f for f in out.splitlines() if f.endswith(exts)]
    except Exception:
        found = []
        for d, dn, fn in os.walk(root):
            dn[:] = [x for x in dn if x not in SKIP_DIRS]
            for f in fn:
                if f.endswith(exts):
                    found.append(os.path.relpath(os.path.join(d, f), root))
        return found


# ---------------------------------------------------------------- extraction

def csv_fields(path):
    """Yield (field, cells, words) for each prose-bearing column."""
    try:
        with open(path, encoding="utf-8-sig", newline="") as fh:
            rd = csv.DictReader(fh)
            rows = list(rd)
            names = rd.fieldnames or []
    except Exception:
        return
    if not rows:
        return
    for col in names:
        if col is None:
            continue
        vals = [(r.get(col) or "") for r in rows]
        hits = [v for v in vals if is_prose(v)]
        if hits:
            yield col, len(hits), sum(len(WORD.findall(v)) for v in hits)


def json_fields(path):
    """Yield (keypath, cells, words) for each prose-bearing key.

    Array indexes collapse to `[]` so a hundred rows of the same field report
    as one field, which is what a carrier's shape actually is.
    """
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception:
        return
    acc = defaultdict(lambda: [0, 0])

    def walk(node, keypath):
        if isinstance(node, str):
            if is_prose(node):
                acc[keypath or "(root)"][0] += 1
                acc[keypath or "(root)"][1] += len(WORD.findall(node))
        elif isinstance(node, dict):
            for k, v in node.items():
                walk(v, f"{keypath}.{k}" if keypath else k)
        elif isinstance(node, list):
            for v in node:
                walk(v, f"{keypath}[]")

    walk(data, "")
    for k, (cells, words) in acc.items():
        yield k.split(".")[-1].replace("[]", ""), cells, words


# ---------------------------------------------------------------- declaration

def naming_corpus(root):
    """Every byte of prose and registry data that could NAME a carrier."""
    blob = []
    for rel in tracked(root, (".md", ".json", ".csv", ".py", ".mjs", ".js", ".html")):
        if rel.endswith((".md",)) or "/design/" in rel or "/docs/" in rel or rel.count("/") == 0:
            try:
                with open(os.path.join(root, rel), encoding="utf-8", errors="replace") as fh:
                    blob.append((rel, fh.read()))
            except OSError:
                pass
    return blob


def named_by(corpus, rel):
    """Files that mention this carrier, by path or by distinctive basename."""
    base = os.path.basename(rel)
    generic = base in {"data.js", "data.json", "index.json", "README.md", "config.json"}
    out = []
    for src_rel, text in corpus:
        if src_rel == rel:
            continue
        if rel in text or (not generic and base in text):
            out.append(src_rel)
    return out


SUPPLIED_HINT = re.compile(r"(^|/)(data/)?source/|/raw/|/vendor|/pulls?/|/extracts?/")


def content_registry(root):
    p = os.path.join(root, "data", "design", "content.csv")
    if not os.path.exists(p):
        return []
    with open(p, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def registry_mode(reg, rel):
    best = None
    for r in reg:
        loc = r.get("locator", "")
        if loc.endswith("/") and rel.startswith(loc):
            if best is None or len(loc) > len(best.get("locator", "")):
                best = r
        elif rel == loc:
            return r
    return best


# ---------------------------------------------------------------- main

def main(argv):
    opts = {a for a in argv[1:] if a.startswith("--")}
    args = [a for a in argv[1:] if not a.startswith("--")]
    root = args[0] if args and os.path.isdir(args[0]) else "."
    prefixes = args[1:] if args and os.path.isdir(args[0]) else args
    global MIN_WORDS
    minc = 3
    for i, a in enumerate(argv):
        if a == "--min" and i + 1 < len(argv):
            minc = int(argv[i + 1])

    files = tracked(root, (".csv", ".json"))
    if prefixes:
        files = [f for f in files if any(f.startswith(p.rstrip("/")) for p in prefixes)]
    corpus = naming_corpus(root)
    reg = content_registry(root)

    carriers, fields = [], []
    for rel in sorted(files):
        full = os.path.join(root, rel)
        try:
            found = list(csv_fields(full) if rel.endswith(".csv") else json_fields(full))
        except Exception:
            continue
        found = [(f, c, w) for f, c, w in found if c >= minc]
        if not found:
            continue
        row = registry_mode(reg, rel)
        mode = (row or {}).get("creation_mode", "")
        # `mechanical` counts with `supplied` here: neither is the estate's
        # authored voice, and the question this script asks is about the voice.
        supplied = mode in ("supplied", "mechanical") or bool(SUPPLIED_HINT.search("/" + rel))
        namers = named_by(corpus, rel)
        carriers.append({
            "carrier": rel,
            "fields": len(found),
            "cells": sum(c for _, c, _ in found),
            "words": sum(w for _, _, w in found),
            "declared": int(bool(namers)),
            "named_by": namers[0] if namers else "",
            "supplied": int(supplied),
            "creation_mode": mode,
        })
        for f, c, w in found:
            fields.append({"carrier": rel, "field": f, "cells": c, "words": w,
                           "supplied": int(supplied), "declared": int(bool(namers))})

    authored = [c for c in carriers if not c["supplied"]]
    undeclared = [c for c in authored if not c["declared"]]

    if "--csv" in opts:
        rows = fields if "--fields" in opts else carriers
        w = csv.DictWriter(sys.stdout, fieldnames=list(rows[0]) if rows else ["carrier"])
        w.writeheader()
        for r in rows:
            w.writerow(r)
        return 0

    if "--fields" in opts:
        by_name = defaultdict(lambda: {"carriers": set(), "words": 0, "cells": 0})
        for f in fields:
            if f["supplied"]:
                continue
            e = by_name[f["field"]]
            e["carriers"].add(f["carrier"])
            e["words"] += f["words"]
            e["cells"] += f["cells"]
        print("Prose field names in authored carriers, by reach:\n")
        print("  %-24s %8s %7s %6s" % ("field", "carriers", "words", "cells"))
        for name, e in sorted(by_name.items(), key=lambda kv: (-len(kv[1]["carriers"]), -kv[1]["words"])):
            print("  %-24s %8d %7s %6d" % (name, len(e["carriers"]), f"{e['words']:,}", e["cells"]))
        print("\n%d distinct field names across %d authored carriers." % (
            len(by_name), len({f['carrier'] for f in fields if not f['supplied']})))
        singles = [n for n, e in by_name.items() if len(e["carriers"]) == 1]
        print("%d of them (%d%%) appear in exactly one carrier." % (
            len(singles), len(singles) / len(by_name) * 100 if by_name else 0))
        return 0

    if "--carriers" in opts or "--undeclared" in opts:
        show = undeclared if "--undeclared" in opts else carriers
        label = "Authored carriers nothing in the repo names" if "--undeclared" in opts else "Every prose-bearing carrier"
        print("%s (%d):\n" % (label, len(show)))
        for c in sorted(show, key=lambda c: -c["words"]):
            flag = "supplied" if c["supplied"] else ("declared" if c["declared"] else "UNDECLARED")
            print("  %7sw %3d fields  %-10s %s" % (f"{c['words']:,}", c["fields"], flag, c["carrier"]))
            if c["named_by"] and "--undeclared" not in opts:
                print("            named by %s" % c["named_by"])
        return 0

    sw = sum(c["words"] for c in carriers if c["supplied"])
    aw = sum(c["words"] for c in authored)
    print("Text carriers under %s\n" % (", ".join(prefixes) or "the whole repo"))
    print("  %d carriers hold prose in %d fields, %s words total" % (
        len(carriers), sum(c["fields"] for c in carriers),
        f"{sw + aw:,}"))
    print("    supplied   %7s words in %d carriers (quoted source, not the estate's voice)" % (
        f"{sw:,}", sum(1 for c in carriers if c["supplied"])))
    print("    authored   %7s words in %d carriers" % (f"{aw:,}", len(authored)))
    print("      declared %7s words in %d" % (
        f"{sum(c['words'] for c in authored if c['declared']):,}",
        sum(1 for c in authored if c["declared"])))
    print("      UNDECLARED %5s words in %d, nothing in the repo names them" % (
        f"{sum(c['words'] for c in undeclared):,}", len(undeclared)))

    # Count CARRIERS per name, not field occurrences: one carrier can reach the
    # same name down several key paths, and reporting 42 carriers in a repo with
    # 22 of them is the kind of number that discredits the rest of the report.
    per_name = defaultdict(set)
    for f in fields:
        if not f["supplied"]:
            per_name[f["field"]].add(f["carrier"])
    names = Counter({n: len(cs) for n, cs in per_name.items()})
    print("\n  %d distinct prose field names across the authored carriers." % len(names))
    print("  the ten with the widest reach:")
    for n, c in names.most_common(10):
        print("    %-22s %d carriers" % (n, c))
    once = sum(1 for n, c in names.items() if c == 1)
    print("  %d names (%d%%) are used by exactly one carrier." % (
        once, once / len(names) * 100 if names else 0))

    if undeclared:
        print("\n  largest undeclared authored carriers:")
        for c in sorted(undeclared, key=lambda c: -c["words"])[:8]:
            print("    %7sw  %s" % (f"{c['words']:,}", c["carrier"]))

    print("\n\"Undeclared\" is not \"wrong.\" It means no registry, README, or CLAUDE.md")
    print("names the file, so the text in it is filed without being accounted for. Read the")
    print("field-name spread first: a concept called four things across four carriers cannot")
    print("be asked for, and that is what disorganized carriers actually costs.")

    if "--check" in opts and undeclared:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
