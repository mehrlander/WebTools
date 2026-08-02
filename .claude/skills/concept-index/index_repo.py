#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

VERSION = 1
TEXT_SUFFIXES = {".md", ".txt"}
SKIP = {".git", ".concept-index", "node_modules", "dist", "vendor", "archive"}
STOP = set("a an and are as at be been but by can do for from had has have he her here him his i if in into is it its may more most not of on one or our she so than that the their them then there these they this those to was we were what when where which who will with you your".split())
BOUNDARY = STOP | set("adds allows appears becomes builds calls carries changes contains creates defines describes drives enables explains finds gives has holds includes invokes keeps lands looks makes means moves needs offers organizes points provides reads records refers resolves runs says sees shows stores supports takes tells uses writes".split())
WORD = re.compile(r"[A-Za-z][A-Za-z0-9_-]*")
PHRASE = re.compile(r"\b(?:the|this|that|our|its)\s+([A-Za-z][\w-]*(?:\s+[A-Za-z][\w-]*){0,3})", re.I)
CODE = re.compile(r"`([^`\n]{2,80})`")
HEADING = re.compile(r"^#{1,6}\s+(.+)$", re.M)
LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
DEFINITION = re.compile(r"\b([A-Za-z][\w-]*(?:\s+[A-Za-z][\w-]*){0,3})\s+(?:is|means|refers to|describes)\b", re.I)


def git_head(root: Path) -> str | None:
    try:
        return subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return None


def files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if any(part in SKIP for part in path.relative_to(root).parts):
            continue
        yield path


def normalize(text: str) -> str:
    return " ".join(w.lower() for w in WORD.findall(text) if w.lower() not in STOP).strip()


def referential_phrase(raw: str) -> str:
    kept = []
    for word in WORD.findall(raw):
        lower = word.lower()
        if kept and lower in BOUNDARY:
            break
        if lower not in STOP:
            kept.append(lower)
    return " ".join(kept[:4])


def candidates(text: str):
    out = []
    out += [(referential_phrase(m.group(1)), "referential") for m in PHRASE.finditer(text)]
    out += [(normalize(m.group(1)), "code") for m in CODE.finditer(text)]
    out += [(normalize(m.group(1)), "heading") for m in HEADING.finditer(text)]
    out += [(normalize(m.group(1)), "link") for m in LINK.finditer(text)]
    out += [(normalize(m.group(1)), "definition") for m in DEFINITION.finditer(text)]
    return [(term, kind) for term, kind in out if term and len(term) > 2 and len(term.split()) <= 5]


def neighborhood(text: str, term: str, radius: int = 8):
    words = [w.lower() for w in WORD.findall(text)]
    needle = term.split()
    if not needle:
        return []
    hits = []
    for i in range(len(words) - len(needle) + 1):
        if words[i:i + len(needle)] == needle:
            hits.extend(w for w in words[max(0, i-radius):i] + words[i+len(needle):i+len(needle)+radius] if w not in STOP)
    return hits


def entropy(counter: Counter[str]) -> float:
    total = sum(counter.values())
    if total < 2 or len(counter) < 2:
        return 0.0
    h = -sum((n/total) * math.log(n/total) for n in counter.values())
    return round(h / math.log(len(counter)), 3)


def build(root: Path):
    terms = defaultdict(lambda: {"mentions": 0, "files": set(), "forms": Counter(), "contexts": Counter(), "examples": []})
    scanned = 0
    for path in files(root):
        scanned += 1
        rel = path.relative_to(root).as_posix()
        text = path.read_text(encoding="utf-8", errors="ignore")
        seen = set()
        for term, kind in candidates(text):
            data = terms[term]
            count = len(re.findall(rf"\b{re.escape(term)}\b", text, re.I))
            data["mentions"] += max(1, count if term not in seen else 0)
            data["files"].add(rel)
            data["forms"][kind] += 1
            data["contexts"].update(neighborhood(text, term))
            if len(data["examples"]) < 3:
                match = re.search(rf"[^\n]{{0,100}}\b{re.escape(term)}\b[^\n]{{0,140}}", text, re.I)
                if match:
                    data["examples"].append({"path": rel, "text": match.group(0).strip()})
            seen.add(term)

    rows = []
    for term, data in terms.items():
        mentions = data["mentions"]
        file_count = len(data["files"])
        forms = data["forms"]
        dispersion = entropy(data["contexts"])
        importance = round(math.log1p(mentions) + math.log1p(file_count) + 0.5 * bool(forms["heading"] or forms["code"]), 3)
        context_risk = round(dispersion + 0.35 * bool(forms["referential"]) + 0.25 * (file_count > 2) - 0.3 * bool(forms["definition"] or forms["link"]), 3)
        rows.append({
            "term": term,
            "mentions": mentions,
            "files": file_count,
            "importance": importance,
            "context_dispersion": dispersion,
            "context_risk": context_risk,
            "referential_uses": forms["referential"],
            "grounded_uses": forms["definition"] + forms["link"] + forms["code"],
            "top_context": [w for w, _ in data["contexts"].most_common(8)],
            "examples": data["examples"],
        })
    rows.sort(key=lambda x: (x["context_risk"], x["importance"]), reverse=True)
    return {"schema": VERSION, "source_head": git_head(root), "files_scanned": scanned, "terms": rows[:500]}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("root", nargs="?", default=".")
    p.add_argument("--output", default=".concept-index/index.json")
    args = p.parse_args()
    root = Path(args.root).resolve()
    output = root / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(build(root), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
