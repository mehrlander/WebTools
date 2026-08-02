#!/usr/bin/env python3
"""Epistemic content registry: curated corpus membership per the ADR.

Implements the initial stage of the Epistemic Content and Provenance
Registry ADR (2026-08-02): a repo declares, in a small curated
`data/design/content.csv`, what its textual artifacts are (creation_mode)
and which corpora they belong to (analysis_use). Tools consult the
declaration first and fall back to heuristics for undeclared content, so
the registry is authoritative for what it covers without owing the repo
an inventory.

Columns: locator, creation_mode, analysis_use, description.

Locators are repo-relative paths. Two extensions beyond the ADR's file
default, both from estate practice:

- a trailing `/` declares a subtree (the `.paths.json` idiom); the most
  specific declaration wins, file over directory, longer prefix over
  shorter;
- component fragments use the ADR's controlled syntaxes:
  `#heading=<slug>` (Markdown section), `#column=<name>` (CSV column),
  `#html-id=<id>` (HTML element). A fragment row refines its file row.

Controlled vocabularies (validated hard; controlling fields):
  creation_mode: supplied | mechanical | human-authored | model-authored
                 | hybrid-authored | mixed
  analysis_use:  concept-vocabulary | prose-review | semantic-search
                 | source-corpus | exclude

CLI:
  python3 registry.py scaffold <repo-root>          # draft rows, judgment left TODO
  python3 registry.py verify <repo-root>
  python3 registry.py corpus <repo-root> <analysis_use> [--list]

Ships with the portable plugin's content-registry skill; the canonical
copy lives at .claude/skills/content-registry/ in mehrlander/web-tools.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

REGISTRY_PATHS = ("data/design/content.csv", "content.csv")
CREATION_MODES = {"supplied", "mechanical", "human-authored", "model-authored",
                  "hybrid-authored", "mixed"}
ANALYSIS_USES = {"concept-vocabulary", "prose-review", "semantic-search",
                 "source-corpus", "exclude"}
FRAGMENT = re.compile(r"^(heading|column|html-id)=(.+)$")


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


class Row:
    __slots__ = ("locator", "path", "fragment", "creation_mode", "analysis_use", "description")

    def __init__(self, locator, creation_mode, analysis_use, description):
        self.locator = locator
        self.path, _, frag = locator.partition("#")
        self.fragment = frag or None
        self.creation_mode = creation_mode
        self.analysis_use = analysis_use
        self.description = description

    @property
    def is_dir(self):
        return self.path.endswith("/")

    def specificity(self):
        return (2 if self.fragment else (1 if not self.is_dir else 0), len(self.path))


class Registry:
    def __init__(self, root: Path, rows: list[Row], source: Path):
        self.root = root
        self.rows = rows
        self.source = source
        self._files = [r for r in rows if not r.is_dir and not r.fragment]
        self._dirs = sorted((r for r in rows if r.is_dir), key=lambda r: -len(r.path))

    @classmethod
    def load(cls, root: Path):
        root = Path(root)
        for rel in REGISTRY_PATHS:
            p = root / rel
            if p.is_file():
                rows = []
                with p.open(encoding="utf-8") as fh:
                    for rec in csv.DictReader(fh):
                        rows.append(Row(rec["locator"].strip(), rec["creation_mode"].strip(),
                                        rec["analysis_use"].strip(), (rec.get("description") or "").strip()))
                return cls(root, rows, p)
        return None

    def classify(self, rel: str) -> Row | None:
        """Most specific whole-file declaration covering rel, or None."""
        best = None
        for r in self._files:
            if r.path == rel:
                return r
        for r in self._dirs:
            if rel.startswith(r.path):
                return r  # dirs pre-sorted longest first
        return best

    def extract(self, row: Row) -> str | None:
        """Resolve a locator to text; None when it cannot be extracted."""
        path = self.root / row.path
        if row.is_dir or not path.is_file():
            return None
        text = path.read_text(encoding="utf-8", errors="ignore")
        if not row.fragment:
            return text
        m = FRAGMENT.match(row.fragment)
        if not m:
            return None
        kind, val = m.groups()
        if kind == "heading":
            out, level, active = [], None, False
            for line in text.splitlines():
                h = re.match(r"^(#{1,6})\s+(.*)$", line)
                if h:
                    if active and len(h.group(1)) <= level:
                        break
                    if slugify(h.group(2)) == val:
                        active, level = True, len(h.group(1))
                        continue
                if active:
                    out.append(line)
            return "\n".join(out) if active else None
        if kind == "column":
            with path.open(encoding="utf-8") as fh:
                try:
                    recs = list(csv.DictReader(fh))
                except csv.Error:
                    return None
            if not recs or val not in recs[0]:
                return None
            return "\n".join(r[val] for r in recs if r.get(val))
        if kind == "html-id":
            m2 = re.search(rf'<[^>]+id="{re.escape(val)}"[^>]*>(.*?)</', text, re.S)
            return m2.group(1) if m2 else None
        return None

    def verify(self):
        findings = []
        seen = {}
        for r in self.rows:
            if r.creation_mode not in CREATION_MODES:
                findings.append(f"invalid creation_mode '{r.creation_mode}': {r.locator}")
            if r.analysis_use not in ANALYSIS_USES:
                findings.append(f"invalid analysis_use '{r.analysis_use}': {r.locator}")
            if r.locator in seen:
                findings.append(f"duplicate locator: {r.locator}")
            seen[r.locator] = r
            target = self.root / r.path
            if r.is_dir:
                if not target.is_dir():
                    findings.append(f"unresolved directory: {r.locator}")
            elif not target.is_file():
                findings.append(f"unresolved file: {r.locator}")
            elif r.fragment:
                if not FRAGMENT.match(r.fragment):
                    findings.append(f"unsupported fragment syntax: {r.locator}")
                elif self.extract(r) is None:
                    findings.append(f"fragment does not resolve: {r.locator}")
            if (r.analysis_use not in ("exclude",) and not r.is_dir
                    and target.is_file() and not (self.extract(r) or "").strip()):
                findings.append(f"corpus row extracts empty: {r.locator}")
        return findings

    def corpus(self, use: str):
        """(row, text) pairs for one analysis_use. Directory rows expand to
        their markdown files, minus any more specific declaration that
        reassigns or excludes them."""
        out = []
        for r in self.rows:
            if r.analysis_use != use:
                continue
            if r.is_dir:
                for p in sorted((self.root / r.path).rglob("*.md")):
                    rel = p.relative_to(self.root).as_posix()
                    if self.classify(rel) is r:
                        out.append((r, rel, p.read_text(encoding="utf-8", errors="ignore")))
            else:
                text = self.extract(r)
                if text:
                    out.append((r, r.locator, text))
        return out


def scaffold(root: Path):
    """Draft registry rows from mechanical observation only. Facts go in the
    description; creation_mode and analysis_use stay TODO, because the ADR
    forbids inferring authorship without evidence: that judgment belongs to
    the session and the user, row by row."""
    import re as _re
    dated = _re.compile(r"20\d\d-\d\d-\d\d")
    print("locator,creation_mode,analysis_use,description")
    skip = {".git", ".claude", ".concept-index", ".concept-lab", "node_modules", "dist", "vendor"}
    for entry in sorted(root.iterdir()):
        if entry.name in skip or entry.name.startswith("."):
            continue
        if entry.is_dir():
            suffixes = {}
            n = 0
            has_dated = False
            for f in entry.rglob("*"):
                if f.is_file():
                    n += 1
                    suffixes[f.suffix] = suffixes.get(f.suffix, 0) + 1
                    if dated.search(f.as_posix()):
                        has_dated = True
            top = ";".join(f"{k or 'noext'}x{v}" for k, v in sorted(suffixes.items(), key=lambda kv: -kv[1])[:3])
            facts = f"{n} files ({top})" + ("; contains dated paths" if has_dated else "")
            print(f"{entry.name}/,TODO,TODO,{facts}")
        elif entry.suffix.lower() in (".md", ".csv", ".html", ".json"):
            print(f"{entry.name},TODO,TODO,{entry.stat().st_size} bytes")


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sc = sub.add_parser("scaffold")
    sc.add_argument("root")
    v = sub.add_parser("verify")
    v.add_argument("root")
    c = sub.add_parser("corpus")
    c.add_argument("root")
    c.add_argument("use", choices=sorted(ANALYSIS_USES))
    c.add_argument("--list", action="store_true")
    args = p.parse_args()

    if args.cmd == "scaffold":
        scaffold(Path(args.root).resolve())
        return
    reg = Registry.load(Path(args.root))
    if reg is None:
        print("no registry found (data/design/content.csv)")
        sys.exit(1)
    if args.cmd == "verify":
        findings = reg.verify()
        for f in findings:
            print(f"- {f}")
        print(f"{len(reg.rows)} rows, {len(findings)} findings (advisory)")
    elif args.cmd == "corpus":
        items = reg.corpus(args.use)
        for row, rel, text in items:
            if args.list:
                print(f"{rel}  [{row.creation_mode}] {row.description}")
            else:
                print(f"\n===== {rel} [{row.creation_mode}]\n{text[:400]}")
        if args.list:
            print(f"{len(items)} items")


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        pass
