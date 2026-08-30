#!/usr/bin/env python3
"""The standoff annotation, and the delivery payload that carries it to a page.

Two commands, because they make two different things and only one of them is
the artifact:

  standoff   doc.md + units.jsonl + labels.tsv -> standoff.json
             The annotation itself. It does NOT contain the document. It names
             its target and carries a sha256 of the bytes it was made against,
             so "does this annotation still describe that file" is a question
             with an answer rather than an assumption. This is the durable
             thing; a run directory keeps it beside the two inputs that made it
             so the pass can be re-run rather than only its result surviving.

  payload    doc.md + standoff.json -> audit/1, optionally --inject into a page
             Delivery only. It joins the standoff to a copy of the source so a
             page can render offline, inside a toss, with no fetch. The standoff
             rides VERBATIM under its own key: what the page shows in its
             Standoff view is the committed file, not a re-derivation of it.

    python3 tools/build/audit-payload.py standoff <doc.md> <run-dir> \
        [--addr owner/repo@ref:path] [--question <text>]
    python3 tools/build/audit-payload.py payload <doc.md> <run-dir> \
        [--inject <page.html>]
"""
import sys, json, csv, re, hashlib, pathlib

# state-the-rule's labels. A different question ships a different list, and
# check.py never reads the label column, so the vocabulary is data.
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

def build_standoff(doc, run, addr, question):
    raw = pathlib.Path(doc).read_bytes()
    ann = {r["uid"]: r for r in csv.DictReader(open(f"{run}/labels.tsv"), delimiter="\t")}
    units = []
    for line in open(f"{run}/units.jsonl"):
        u = json.loads(line)
        a = ann.get(u["uid"], {})
        units.append({"uid": u["uid"], "start": u["start"], "end": u["end"],
                      "kind": u["kind"], "words": u["words"],
                      "label": a.get("label", ""), "verdict": a.get("verdict", "")})
    return {"kind": "standoff/1",
            "question": question,
            "target": addr | {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()},
            "vocabulary": [{"label": l, "side": s, "gloss": g} for l, s, g in VOCAB],
            "units": units}

def build_payload(doc, run):
    text = pathlib.Path(doc).read_text(encoding="utf-8")
    standoff = json.loads(pathlib.Path(f"{run}/standoff.json").read_text())
    digest = hashlib.sha256(text.encode()).hexdigest()
    if digest != standoff["target"]["sha256"]:
        sys.exit(f"the document has changed since the annotation was made:\n"
                 f"  annotated {standoff['target']['sha256'][:12]}\n"
                 f"  on disk   {digest[:12]}\n"
                 f"Re-segment and re-label, or the spans no longer mean anything.")
    return {"kind": "audit/1", "title": pathlib.Path(doc).name,
            "standoff": standoff, "text": text}

if __name__ == "__main__":
    a = sys.argv[1:]
    def opt(flag, default=None):
        if flag in a:
            i = a.index(flag); v = a[i + 1]; del a[i:i + 2]; return v
        return default
    addr, question, inject = opt("--addr"), opt("--question", "is this unit binding?"), opt("--inject")
    cmd, doc, run = a[0], a[1], a[2].rstrip("/")

    if cmd == "standoff":
        s = build_standoff(doc, run, parse_addr(addr), question)
        out = pathlib.Path(f"{run}/standoff.json")
        out.write_text(json.dumps(s, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"wrote {out}: {len(s['units'])} units over {s['target']['bytes']} bytes "
              f"(sha256 {s['target']['sha256'][:12]})")
    elif cmd == "payload":
        p = build_payload(doc, run)
        blob = json.dumps(p, ensure_ascii=False, indent=1)
        if inject:
            f = pathlib.Path(inject)
            f.write_text(re.sub(r"(?s)(/\* AUDIT:BEGIN \*/).*?(/\* AUDIT:END \*/)",
                                lambda m: m.group(1) + "\nwindow.__audit = " + blob + ";\n" + m.group(2),
                                f.read_text(encoding="utf-8")), encoding="utf-8")
            print(f"injected {len(p['standoff']['units'])} units, {len(blob)} chars into {inject}")
        else:
            print(blob)
