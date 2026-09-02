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
        [--addr owner/repo@ref:path] [--self owner/repo] [--question <text>] [--reset]
    python3 tools/build/audit-payload.py payload <doc.md> <run-dir> \
        [--inject <page.html>]
"""
import sys, json, csv, re, hashlib, pathlib

# state-the-rule's labels. A different question ships a different list, and
# check.py never reads the label column, so the vocabulary is data.
#
# TWO AXES, BOTH DECLARED. `vocabulary` says what a unit IS; `verdicts` says
# what was decided about it. They are orthogonal: WHY is a kind of content and
# DROP is a disposition, and a unit carries one of each. Carrying only the
# label was right while the second axis would have arrived CLOSED, hardcoded
# into an artifact whose whole generality is that its vocabulary is declared.
# Declaring it beside the first answers that objection on its own terms.
#
# labels.tsv SEEDS both and owns neither, exactly as it already did for the
# label: the pass writes it, the builder copies it in, and from then on the
# standoff is the live one, because a relabel or a reverdict in the page lands
# there. check.py still reads labels.tsv, so a pass that ends in the page
# re-exports it rather than the two drifting.
#
# WHY is one label, not two. It was split into an operative reason and a
# motivating one, and the split asked a reader to decide, per clause, whether a
# reason changes how the rule applies at a boundary. That is the same judgement
# the rewrite step already makes when it lifts a criterion into the
# declaration, so the second label was paying twice for one call. One why, and
# where it is blunt it is blunt. The criterion guidance survives in the skill,
# which is where the lifting happens.
#
# CUT WAS A VERDICT WEARING A LABEL'S CLOTHES. It said the text should not be
# here, which is a disposition, and it sat on the axis that says what a unit
# is. It is DROP now, on the axis that owns removal, and the label axis is a
# reading again.
VOCAB = [
    ("WHAT", "declaration", "a rule, a fact of the system, a value it may hold"),
    ("HOW",  "declaration", "syntax, a procedure, an invocation"),
    ("WHY",  "hinge",       "the reason behind the rule"),
    ("PROV", "explanation", "when it changed, what it replaced, what failed"),
    ("EVID", "explanation", "a measurement, a probe, an observation"),
    ("NAV",  "apparatus",   "a pointer to the document or gate that owns something"),
    ("META", "apparatus",   "a statement about this document"),
]

# The dispositions, in the order a pass walks them: leave it, say it better,
# it belongs elsewhere, it should not be here. DROP is last and is the only
# destructive one, which is why the page strikes it through under either lens.
VERDICTS = [
    ("KEEP",    "stands as written"),
    ("REWRITE", "the content earns its place; the sentence does not"),
    ("MOVE",    "belongs in another document"),
    ("DROP",    "says nothing the document needs"),
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

def build_standoff(doc, run, addr, self_repo, question):
    raw = pathlib.Path(doc).read_bytes()
    ann = {r["uid"]: r for r in csv.DictReader(open(f"{run}/labels.tsv"), delimiter="\t")}
    units = []
    for line in open(f"{run}/units.jsonl"):
        u = json.loads(line)
        a = ann.get(u["uid"], {})
        units.append({"uid": u["uid"], "start": u["start"], "end": u["end"],
                      "kind": u["kind"], "words": u["words"],
                      "label": a.get("label", ""),
                      "verdict": a.get("verdict") or "KEEP"})
    # `self` is the annotation's own address, which `target` cannot supply: the
    # target is the DOCUMENT. Without it a page that edits the annotation has
    # nowhere to put the result and has to be told the run directory out of
    # band. No ref: the ref is whatever the reader is looking at, and a stored
    # one would name the branch the run was made on forever.
    me = {"path": f"{run}/standoff.json"}
    if self_repo or addr.get("repo"):
        me["repo"] = self_repo or addr["repo"]
    return {"kind": "standoff/1",
            "question": question,
            "self": me,
            "target": addr | {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()},
            "vocabulary": [{"label": l, "side": s, "gloss": g} for l, s, g in VOCAB],
            "verdicts": [{"verdict": v, "gloss": g} for v, g in VERDICTS],
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
    self_repo = opt("--self")
    cmd, doc, run = a[0], a[1], a[2].rstrip("/")

    if cmd == "standoff":
        out = pathlib.Path(f"{run}/standoff.json")
        # A REBUILD IS A RESET, NOT A REFRESH. units.jsonl and labels.tsv record
        # steps 1 and 2; once a patch has moved the grain (skills/state-the-rule/
        # ops.py), the standoff carries units those inputs never held, and `from`
        # is the tell. Rebuilding would silently undo that work, so it refuses.
        #
        # INSERTIONS ARE THE SECOND TELL, and reading only the first was a hole:
        # an insertion is anchored to a boundary rather than carried on a unit,
        # so a standoff holding nothing but insertions has no `from` anywhere and
        # rebuilt clean, losing every one of them without asking. What the guard
        # is really for is work the two inputs cannot reconstruct, and that is
        # both kinds.
        if out.exists():
            prior = json.loads(out.read_text())
            moved = [u["uid"] for u in prior["units"] if "from" in u]
            added = prior.get("insertions", [])
            lost = ([f"{len(moved)} patched unit(s) ({', '.join(moved[:4])}"
                     f"{'…' if len(moved) > 4 else ''})"] if moved else []) + \
                   ([f"{len(added)} insertion(s)"] if added else [])
            if lost and "--reset" not in sys.argv:
                sys.exit(f"{out} carries {' and '.join(lost)} that units.jsonl and labels.tsv "
                         f"do not hold.\nRebuilding resets the grain. Pass --reset to mean it.")
        s = build_standoff(doc, run, parse_addr(addr), self_repo, question)
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
