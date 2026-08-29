#!/usr/bin/env python3
"""Build an audit/1 payload: a document, its units, and one label per unit.

    python3 tools/build/audit-payload.py <doc.md> <units.jsonl> <labels.tsv> \
        [--addr owner/repo@ref:path] [--question <text>] [--inject <page.html>]

Units carry spans, not text: the payload already holds the source, so a unit is
(start, end) into it. That keeps the payload roughly the size of the document.

The vocabulary travels WITH the payload rather than being hardcoded in the page.
check.py never reads its label column, so a question supplies its own labels and
the receipt is unchanged; the render answers to the same rule, which is what lets
one page show any of doc-audit's questions.
"""
import sys, json, csv, re, pathlib

# state-the-rule's labels. A different question ships a different list.
VOCAB = [
    ("WHAT",    "declaration", "a rule, a fact of the system, a value it may hold"),
    ("HOW",     "declaration", "syntax, a procedure, an invocation"),
    ("WHY-OP",  "hinge",       "a reason that changes how the rule applies at a boundary"),
    ("WHY-MOT", "explanation", "a reason that makes the rule feel right but changes nothing"),
    ("PROV",    "explanation", "when it changed, what it replaced, what failed"),
    ("EVID",    "explanation", "a measurement, a probe, an observation"),
    ("NAV",     "apparatus",   "a pointer to the document or gate that owns something"),
    ("META",    "apparatus",   "a statement about this document"),
]

def build(doc, unitf, labelf, addr, question):
    text = pathlib.Path(doc).read_text(encoding="utf-8")
    ann = {r["uid"]: r for r in csv.DictReader(open(labelf), delimiter="\t")}
    units = []
    for line in open(unitf):
        u = json.loads(line)
        a = ann.get(u["uid"], {})
        units.append({"uid": u["uid"], "start": u["start"], "end": u["end"],
                      "kind": u["kind"], "words": u["words"],
                      "label": a.get("label", ""), "verdict": a.get("verdict", "")})
    return {"kind": "audit/1",
            "title": pathlib.Path(doc).name,
            "question": question,
            "addr": addr,
            "text": text,
            "vocabulary": [{"label": l, "side": s, "gloss": g} for l, s, g in VOCAB],
            "units": units}

def parse_addr(spec):
    if not spec:
        return {}
    m = re.match(r"(?:([^/]+/[^@:]+)(?:@([^:]+))?:)?(.+)", spec)
    repo, ref, path = m.group(1), m.group(2) or "main", m.group(3)
    out = {"path": path}
    if repo:
        out |= {"repo": repo, "ref": ref,
                "url": f"https://github.com/{repo}/blob/{ref}/{path}"}
    return out

if __name__ == "__main__":
    a = sys.argv[1:]
    def opt(flag, default=None):
        if flag in a:
            i = a.index(flag); v = a[i + 1]; del a[i:i + 2]; return v
        return default
    addr, question, inject = opt("--addr"), opt("--question", "is this unit binding?"), opt("--inject")
    payload = build(a[0], a[1], a[2], parse_addr(addr), question)
    blob = json.dumps(payload, ensure_ascii=False, indent=1)
    if inject:
        p = pathlib.Path(inject); s = p.read_text(encoding="utf-8")
        new = re.sub(r"(?s)(/\* AUDIT:BEGIN \*/).*?(/\* AUDIT:END \*/)",
                     lambda m: m.group(1) + "\nwindow.__audit = " + blob + ";\n" + m.group(2),
                     s)
        p.write_text(new, encoding="utf-8")
        n = len(payload["units"])
        print(f"injected {n} units, {len(blob)} chars into {inject}")
    else:
        print(blob)
