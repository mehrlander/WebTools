#!/usr/bin/env python3
"""Entity lab: where does a repo's entity layer already exist, and where is it only implied.

Sibling of termlab.py, and the complement to it. termlab asks what vocabulary a
repo *coins* (terms of art: "stage", "proviso", "toss"). This asks what the repo
*names* from the world outside it: agencies, funds, vendors, statutes, bills,
people. Two different populations, and they want opposite treatments, which is
the whole point of keeping them apart:

  a term of art  is authoritative only in the prose that declares it, so it is
                 harvested and ranked by how the prose marks it (termlab).
  a named entity is authoritative in a table somebody already curates, so
                 harvesting it from prose is a *fallback*, not the method.

So this tool runs both halves and reports the gap between them:

  declared   entity tables the repo already holds (a code/id column beside a
             name column: OFM's agency list, the fund reference manual,
             spend-wa's vendor crosswalk, home's people.json).
  mentioned  entity references harvested from the repo's prose, by pattern for
             the citation-shaped classes (RCW, bill ids, biennia) and by shape
             for the rest.
  resolved   a mention that a declared table can name. The interesting number
             is its complement: entities the repo talks about constantly and
             has never written down.

Dependency-free by default, like the rest of the lab. `--spacy` adds a model
pass over the prose classes for comparison; the citation classes never need it.

Usage:
  python3 entitylab.py bwa=/path/budget-wa --report bwa-entities.md
  python3 entitylab.py bwa=... spend=... home=... --json ents.json --report ents.md
  python3 entitylab.py home=/path/home --spacy      # compare model vs pattern
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

# ---------------------------------------------------------------- corpus walk

TEXT_SUFFIXES = {".md", ".markdown"}
TABLE_SUFFIXES = {".csv", ".json"}
SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
    ".concept-lab", "thumbs", ".pytest_cache", "site-packages",
}
SKIP_PATTERNS = [re.compile(r"\.min\.(js|css)$"), re.compile(r"^package-lock\.json$")]

# Files this large are bulk data, not prose or a reference table.
MAX_TABLE_BYTES = 4_000_000
MAX_PROSE_BYTES = 600_000


def iter_files(root: Path, suffixes: set[str], max_bytes: int):
    for path in root.rglob("*"):
        if path.suffix.lower() not in suffixes or not path.is_file():
            continue
        parts = path.relative_to(root).parts
        if any(p in SKIP_DIRS for p in parts):
            continue
        if any(pat.search(p) for p in parts for pat in SKIP_PATTERNS):
            continue
        try:
            if path.stat().st_size > max_bytes:
                continue
        except OSError:
            continue
        yield path


# ------------------------------------------------------- declared entity tables
#
# An entity table is a table whose rows *are* entities: one column keys them and
# another names them. That shape is the whole detector. It deliberately does not
# look at filenames, because the estate's real tables are named for their source
# (fund-reference-manual.csv, vendors.csv, agencies.csv) and a name-based rule
# would find the ones we already know about and nothing else.

KEY_COL = re.compile(r"^(.*_)?(id|code|number|no|key|uuid|swv|npi|url)$", re.I)
NAME_COL = re.compile(r"^(.*_)?(name|title|label|preferred_name|canonical_name)$", re.I)
ALIAS_COL = re.compile(r"^(.*_)?(alias|aliases|aka|variants|observed_name)$", re.I)


def sniff_csv(path: Path) -> dict | None:
    try:
        with path.open(newline="", encoding="utf-8", errors="replace") as fh:
            reader = csv.reader(fh)
            header = next(reader, None)
            if not header or len(header) > 60:
                return None
            rows = []
            for i, row in enumerate(reader):
                if i >= 20000:
                    break
                rows.append(row)
    except (OSError, csv.Error, StopIteration):
        return None
    if not rows:
        return None
    keys = [c for c in header if KEY_COL.match(c.strip())]
    names = [c for c in header if NAME_COL.match(c.strip())]
    aliases = [c for c in header if ALIAS_COL.match(c.strip())]
    if not names:
        return None
    idx = {c: i for i, c in enumerate(header)}
    values, alias_values = set(), set()
    for row in rows:
        for c in names:
            if idx[c] < len(row) and row[idx[c]].strip():
                values.add(row[idx[c]].strip())
        for c in aliases:
            if idx[c] < len(row) and row[idx[c]].strip():
                for part in re.split(r"[|;,]", row[idx[c]]):
                    if part.strip():
                        alias_values.add(part.strip())
    # A name column with almost no repetition across many rows is a data table
    # that happens to carry a name (a payment register), not an entity table.
    if len(values) < 2:
        return None
    return {
        "kind": "csv",
        "rows": len(rows),
        "key_cols": keys,
        "name_cols": names,
        "alias_cols": aliases,
        "names": values,
        "aliases": alias_values,
    }


def sniff_json(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except (OSError, ValueError):
        return None
    # An entity table in JSON is a list of objects with a name field, either at
    # the top level or under one obvious key.
    candidates = []
    if isinstance(data, list):
        candidates.append(data)
    elif isinstance(data, dict):
        for value in data.values():
            if isinstance(value, list) and len(value) >= 2:
                candidates.append(value)
        # A flat code->name mapping is an entity table too (rcw-titles.json).
        flat = [v for v in data.values() if isinstance(v, str)]
        if len(flat) >= 5 and len(flat) == len(data):
            return {"kind": "json-map", "rows": len(data), "key_cols": ["<key>"],
                    "name_cols": ["<value>"], "alias_cols": [],
                    "names": set(flat), "aliases": set()}
    for rows in candidates:
        objs = [r for r in rows if isinstance(r, dict)]
        if len(objs) < 2:
            continue
        fields = Counter(k for o in objs for k in o)
        names = [f for f in fields if NAME_COL.match(f)]
        keys = [f for f in fields if KEY_COL.match(f)]
        aliases = [f for f in fields if ALIAS_COL.match(f)]
        if not names:
            continue
        values, alias_values = set(), set()
        for o in objs:
            for f in names:
                v = o.get(f)
                if isinstance(v, str) and v.strip():
                    values.add(v.strip())
            for f in aliases:
                v = o.get(f)
                if isinstance(v, str):
                    alias_values.add(v.strip())
                elif isinstance(v, list):
                    alias_values.update(str(x).strip() for x in v if str(x).strip())
        if len(values) >= 2:
            return {"kind": "json", "rows": len(objs), "key_cols": keys,
                    "name_cols": names, "alias_cols": aliases,
                    "names": values, "aliases": alias_values}
    return None


def find_tables(root: Path, limit: int = 4000) -> list[dict]:
    found, seen = [], 0
    for path in iter_files(root, TABLE_SUFFIXES, MAX_TABLE_BYTES):
        seen += 1
        if seen > limit:
            break
        sniff = sniff_csv(path) if path.suffix.lower() == ".csv" else sniff_json(path)
        if sniff:
            sniff["path"] = str(path.relative_to(root))
            found.append(sniff)
    return found


# ------------------------------------------------------------ prose harvesting

FENCE = re.compile(r"```.*?```", re.S)
# An inline code span may wrap a line: markdown allows it, and a class that
# excludes \n silently forbids it. Measured cost of the stricter form: 24 of
# 582 gazetteer-confirmed names carried leaked markup, among them
# "`Agriculture &" (a wrapped span in wa-bills discussing XML entity escaping),
# "| Governor's Office", and "> - Office of Financial Management". The span is
# non-greedy and refuses a blank line, so adjacent spans stay separate and a
# stray backtick cannot swallow a paragraph.
INLINE_CODE = re.compile(r"`(?:[^`\n]|\n(?!\s*\n))*?`")
URL = re.compile(r"https?://\S+|\[[^\]]*\]\([^)]*\)")
FRONTMATTER = re.compile(r"\A---\n.*?\n---\n", re.S)
# Structural markdown that is not prose and must not enter a name: the leading
# run of blockquote, heading, and list markers, table pipes, and emphasis
# asterisks. Underscore is deliberately left alone, since it is load-bearing
# inside identifiers this corpus is full of.
LINE_MARKERS = re.compile(r"^[ \t]*(?:[>#]+[ \t]*|[-*+\u2022][ \t]+)+", re.M)
CELL_MARKS = re.compile(r"[|*]")


def mask(text: str) -> str:
    """Blank out code, links, frontmatter, and structural markdown.

    Length-preserving throughout, so character offsets into the result still
    address the original and a sampled mention quotes the right span.
    """
    text = FRONTMATTER.sub(lambda m: " " * len(m.group(0)), text)
    for pat in (FENCE, INLINE_CODE, URL, LINE_MARKERS, CELL_MARKS):
        text = pat.sub(lambda m: " " * len(m.group(0)), text)
    return text


# The citation classes. These are the entities that matter most in this estate
# and they are the ones a model is worst at: a general NER model has no notion
# of an RCW cite or an engrossed substitute bill. Pattern beats model outright
# here, which is the finding worth keeping.
PATTERNS: dict[str, re.Pattern] = {
    "rcw": re.compile(r"\b(?:chapter\s+)?RCW\s+\d+[A-Z]?\.\d+(?:\.\d+)?\b|\bchapter\s+\d+[A-Z]?\.\d+\s+RCW\b", re.I),
    "bill": re.compile(r"\b(?:E?[2-9]?S?[HS]B|SHB|ESHB|ESSB|SSB|EHB)\s?\d{4}\b"),
    # A biennium's second half is the year two on ("2025-27"), so it always
    # exceeds 12. Without that floor the pattern eats every ISO date, matching
    # the "2026-07" of a 2026-07-28 filename in 101 web-tools files.
    "biennium": re.compile(r"\b(?:19|20)\d{2}[-–](?:1[3-9]|[2-9]\d|(?:19|20)\d{2})\b(?!-\d)"),
    "fiscal_year": re.compile(r"\bFY\s?(?:19|20)?\d{2}\b"),
    "session_law": re.compile(r"\b\d{4}\s+c\s+\d+\b|\bLaws of \d{4}\b"),
    "usc_cfr": re.compile(r"\b\d+\s+(?:U\.?S\.?C\.?|C\.?F\.?R\.?)\s+§?\s?\d+\b"),
}

ACRONYM = re.compile(r"\b[A-Z][A-Z0-9]{1,7}(?:s)?\b")
PROPER = re.compile(
    r"\b[A-Z][a-z]+(?:\s+(?:of|for|and|the|de|von)\s+[A-Z][a-z]+|\s+[A-Z][a-z]+){1,5}\b"
)

# Acronyms that are markup, formats, or estate jargon rather than named entities.
ACRONYM_STOP = {
    "A", "I", "THE", "AND", "OR", "NOT", "TODO", "FIXME", "NOTE", "WARNING",
    "IMPORTANT", "TIP", "CAUTION", "HTML", "CSS", "JSON", "CSV", "TSV", "XML",
    "PDF", "URL", "URI", "API", "CLI", "UI", "UX", "SQL", "HTTP", "HTTPS",
    "GET", "POST", "PUT", "ID", "IDS", "OK", "YAML", "MD", "PNG", "SVG", "JPG",
    "GIF", "ZIP", "UTF", "ASCII", "REST", "CRUD", "DOM", "CDN", "NPM", "PR",
    "PRS", "CI", "CD", "MCP", "LLM", "LLMS", "NER", "NLP", "RAG", "GPU", "CPU",
    "RAM", "SSD", "OS", "IT", "AI", "ML", "TF", "IDF", "JS", "TS", "PY", "SH",
    "ADR", "README", "SKILL", "DOCS", "SHA", "UUID", "REGEX", "ISO", "RFC",
    "AM", "PM", "US", "USA", "WA", "Q1", "Q2", "Q3", "Q4", "FY", "GFS", "NA",
    "TBD", "N", "M", "K", "B", "X", "Y", "Z", "GB", "MB", "KB", "TB",
}
# Sentence-initial capitalization makes any word look proper; these lead often.
PROPER_STOP_HEADS = {
    "The", "This", "That", "These", "Those", "It", "There", "What", "When",
    "Where", "Which", "While", "Who", "Why", "How", "If", "But", "And", "For",
    "So", "Not", "No", "Yes", "One", "Two", "Three", "Both", "Each", "Every",
    "Any", "All", "Some", "Its", "Their", "His", "Her", "Our", "Your", "My",
    "A", "An", "In", "On", "At", "To", "By", "As", "Of", "Is", "Are", "Was",
    "Were", "Be", "Been", "Has", "Have", "Had", "Do", "Does", "Did", "Can",
    "Could", "Should", "Would", "Will", "Shall", "May", "Might", "Must",
    "Run", "Use", "Add", "See", "Read", "Write", "Keep", "Make", "Give",
    "Take", "Put", "Set", "Get", "Now", "Then", "Here", "Only", "Also",
}


def harvest(text: str) -> dict[str, Counter]:
    clean = mask(text)
    out: dict[str, Counter] = defaultdict(Counter)
    consumed = []
    for cls, pat in PATTERNS.items():
        for m in pat.finditer(clean):
            out[cls][re.sub(r"\s+", " ", m.group(0)).strip()] += 1
            consumed.append(m.span())
    # Blank the citation hits so their capitals do not re-enter as proper nouns.
    chars = list(clean)
    for a, b in consumed:
        for i in range(a, b):
            chars[i] = " "
    residue = "".join(chars)

    for m in ACRONYM.finditer(residue):
        tok = m.group(0)
        base = tok[:-1] if tok.endswith("s") and len(tok) > 2 else tok
        if base in ACRONYM_STOP or len(base) < 2:
            continue
        out["acronym"][base] += 1

    for m in PROPER.finditer(residue):
        phrase = re.sub(r"\s+", " ", m.group(0)).strip()
        head = phrase.split()[0]
        if head in PROPER_STOP_HEADS:
            parts = phrase.split()[1:]
            if len(parts) < 2:
                continue
            phrase = " ".join(parts)
        if len(phrase.split()) < 2:
            continue
        out["proper"][phrase] += 1
    return out


def spacy_harvest(texts: list[str], nlp) -> dict[str, Counter]:
    out: dict[str, Counter] = defaultdict(Counter)
    keep = {"ORG", "PERSON", "GPE", "LAW", "NORP", "FAC", "EVENT", "PRODUCT"}
    for doc in nlp.pipe((mask(t)[:100_000] for t in texts), batch_size=32):
        for ent in doc.ents:
            if ent.label_ in keep:
                out[ent.label_][ent.text.strip()] += 1
    return out


# ----------------------------------------------------------------- resolution


def fold(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def build_lexicon(tables: list[dict]) -> dict[str, list[str]]:
    """folded name -> the table paths that declare it."""
    lex: dict[str, list[str]] = defaultdict(list)
    for t in tables:
        for value in list(t["names"]) + list(t["aliases"]):
            f = fold(value)
            if len(f) >= 2:
                lex[f].append(t["path"])
    return lex


# --------------------------------------------------------------------- report


def analyze(name: str, root: Path, use_spacy=False) -> dict:
    tables = find_tables(root)
    lex = build_lexicon(tables)

    mentions: dict[str, Counter] = defaultdict(Counter)
    files_with: dict[str, set] = defaultdict(set)
    texts, prose_files = [], 0
    for path in iter_files(root, TEXT_SUFFIXES, MAX_PROSE_BYTES):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        prose_files += 1
        rel = str(path.relative_to(root))
        if use_spacy and prose_files <= 1200:
            texts.append(text)
        for cls, counter in harvest(text).items():
            for ent, n in counter.items():
                mentions[cls][ent] += n
                files_with[cls].add(rel)

    resolved = {}
    for cls, counter in mentions.items():
        hit = sum(n for ent, n in counter.items() if fold(ent) in lex)
        types_hit = sum(1 for ent in counter if fold(ent) in lex)
        resolved[cls] = {
            "types": len(counter), "tokens": sum(counter.values()),
            "types_resolved": types_hit, "tokens_resolved": hit,
            "files": len(files_with[cls]),
        }

    result = {
        "repo": name, "prose_files": prose_files,
        "tables": [
            {k: v for k, v in t.items() if k not in ("names", "aliases")}
            | {"distinct_names": len(t["names"]), "distinct_aliases": len(t["aliases"])}
            for t in tables
        ],
        "lexicon_size": len(lex),
        "classes": resolved,
        "top": {cls: counter.most_common(25) for cls, counter in mentions.items()},
        "unresolved": {
            cls: [(e, n) for e, n in counter.most_common(400) if fold(e) not in lex][:25]
            for cls, counter in mentions.items()
        },
    }
    result["_mentions"] = {cls: dict(c) for cls, c in mentions.items()}
    if use_spacy:
        try:
            import spacy
            nlp = spacy.load("en_core_web_sm", disable=["lemmatizer"])
        except Exception as exc:  # noqa: BLE001
            result["spacy_error"] = str(exc)
            return result
        sp = spacy_harvest(texts, nlp)
        result["spacy"] = {lbl: c.most_common(25) for lbl, c in sp.items()}
        result["spacy_counts"] = {lbl: {"types": len(c), "tokens": sum(c.values())}
                                  for lbl, c in sp.items()}
    return result


# The crosswalk is the reason to do any of this. An entity list per repo is a
# word cloud; the same entity found in four repos that cannot see each other is
# a join. Citation classes carry it because they are the only classes whose
# surface form is already canonical: "RCW 41.26.030" is spelled one way, while
# an agency is spelled four (see the acronym-vs-full-name gap in the report).
CROSSWALK_CLASSES = ("rcw", "bill", "session_law", "usc_cfr", "biennium", "acronym")


def crosswalk(results: list[dict], classes=CROSSWALK_CLASSES) -> dict:
    out = {}
    for cls in classes:
        by_entity: dict[str, dict[str, int]] = defaultdict(dict)
        for r in results:
            for ent, n in r.get("_mentions", {}).get(cls, {}).items():
                key = normalize_citation(ent) if cls in ("rcw", "bill") else ent
                by_entity[key][r["repo"]] = by_entity[key].get(r["repo"], 0) + n
        shared = {e: repos for e, repos in by_entity.items() if len(repos) >= 2}
        out[cls] = {
            "total": len(by_entity),
            "shared": len(shared),
            "top": sorted(shared.items(),
                          key=lambda kv: (-len(kv[1]), -sum(kv[1].values())))[:30],
        }
    return out


def normalize_citation(s: str) -> str:
    """Fold the spellings of one citation onto one key.

    "ESSB5092" and "ESSB 5092" are the same bill; "chapter 41.05 RCW" and
    "RCW 41.05" are the same chapter. Without this the crosswalk undercounts
    exactly the entities it exists to find.
    """
    s = s.strip()
    m = re.match(r"^(?:chapter\s+)?RCW\s+([\d.]+[A-Z]?)$", s, re.I) or \
        re.match(r"^chapter\s+([\d.]+[A-Z]?)\s+RCW$", s, re.I)
    if m:
        return "RCW " + m.group(1).rstrip(".")
    m = re.match(r"^([A-Z0-9]*[HS]B)\s?(\d{4})$", s)
    if m:
        return f"{m.group(1)} {m.group(2)}"
    return s


def render_crosswalk(cw: dict, results: list[dict]) -> str:
    out = ["## Cross-repo crosswalk", "",
           "The same entity named in more than one repo. This is the join the",
           "estate does not currently have: each repo holds its own tables and",
           "no index spans them.", "",
           "| class | distinct entities | in 2+ repos | share |",
           "| --- | ---: | ---: | ---: |"]
    for cls, d in cw.items():
        pct = f"{100 * d['shared'] / d['total']:.0f}%" if d["total"] else "-"
        out.append(f"| {cls} | {d['total']} | {d['shared']} | {pct} |")
    out.append("")
    for cls, d in cw.items():
        if not d["top"]:
            continue
        out.append(f"**{cls}, most widely shared:**")
        out.append("")
        for ent, repos in d["top"][:15]:
            spread = ", ".join(f"{k} {v}" for k, v in sorted(repos.items(), key=lambda kv: -kv[1]))
            out.append(f"- `{ent}` — {len(repos)} repos ({spread})")
        out.append("")
    return "\n".join(out)


def render(results: list[dict]) -> str:
    out = ["# Entity lab scan", ""]
    out.append("Per repo: the entity tables it already declares, the entity")
    out.append("references its prose makes, and the share of those references a")
    out.append("declared table can name. Heuristic throughout; evidence, not a verdict.")
    out.append("")
    out.append("## Summary")
    out.append("")
    out.append("| repo | prose files | entity tables | declared names | mention types | resolved |")
    out.append("| --- | ---: | ---: | ---: | ---: | ---: |")
    for r in results:
        types = sum(c["types"] for c in r["classes"].values())
        res = sum(c["types_resolved"] for c in r["classes"].values())
        pct = f"{100 * res / types:.0f}%" if types else "n/a"
        out.append(f"| {r['repo']} | {r['prose_files']} | {len(r['tables'])} | "
                   f"{r['lexicon_size']} | {types} | {pct} |")
    out.append("")
    for r in results:
        out.append(f"## {r['repo']}")
        out.append("")
        if r["tables"]:
            out.append("**Declared entity tables** (top 12 by distinct names):")
            out.append("")
            out.append("| path | rows | names | key columns | name columns |")
            out.append("| --- | ---: | ---: | --- | --- |")
            for t in sorted(r["tables"], key=lambda t: -t["distinct_names"])[:12]:
                out.append(f"| `{t['path']}` | {t['rows']} | {t['distinct_names']} | "
                           f"{', '.join(t['key_cols']) or '-'} | {', '.join(t['name_cols'])} |")
            out.append("")
        else:
            out.append("**No entity tables detected.** Every entity here is prose-only.")
            out.append("")
        out.append("**Mentions by class:**")
        out.append("")
        out.append("| class | types | tokens | files | types resolved |")
        out.append("| --- | ---: | ---: | ---: | ---: |")
        for cls, c in sorted(r["classes"].items(), key=lambda kv: -kv[1]["tokens"]):
            pct = f"{100 * c['types_resolved'] / c['types']:.0f}%" if c["types"] else "-"
            out.append(f"| {cls} | {c['types']} | {c['tokens']} | {c['files']} | {pct} |")
        out.append("")
        for cls in ("rcw", "bill", "acronym", "proper"):
            top = r["top"].get(cls)
            if not top:
                continue
            out.append(f"*top {cls}:* " + ", ".join(f"{e} ({n})" for e, n in top[:12]))
            out.append("")
        if r.get("spacy_counts"):
            out.append("**spaCy en_core_web_sm, same prose:**")
            out.append("")
            for lbl, c in sorted(r["spacy_counts"].items(), key=lambda kv: -kv[1]["tokens"]):
                sample = ", ".join(e for e, _ in r["spacy"][lbl][:8])
                out.append(f"- `{lbl}`: {c['types']} types / {c['tokens']} tokens. {sample}")
            out.append("")
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("corpora", nargs="+", metavar="name=path")
    ap.add_argument("--json", type=Path)
    ap.add_argument("--report", type=Path)
    ap.add_argument("--spacy", action="store_true",
                    help="also run spaCy NER over the prose, for comparison")
    args = ap.parse_args()

    results = []
    for spec in args.corpora:
        if "=" not in spec:
            print(f"expected name=path, got {spec!r}", file=sys.stderr)
            return 2
        name, path = spec.split("=", 1)
        root = Path(path).expanduser().resolve()
        if not root.is_dir():
            print(f"not a directory: {root}", file=sys.stderr)
            return 2
        print(f"scanning {name} ({root})…", file=sys.stderr)
        results.append(analyze(name, root, use_spacy=args.spacy))

    report = render(results)
    if len(results) > 1:
        report += "\n" + render_crosswalk(crosswalk(results), results)
    for r in results:
        r.pop("_mentions", None)
    if args.report:
        args.report.write_text(report, encoding="utf-8")
        print(f"wrote {args.report}", file=sys.stderr)
    else:
        print(report)
    if args.json:
        args.json.write_text(json.dumps(results, indent=1, default=list), encoding="utf-8")
        print(f"wrote {args.json}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
