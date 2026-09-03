#!/usr/bin/env python3
"""Project a standoff onto text: run the edits it states, report the ones it cannot.

    python3 materialize.py <standoff.json> <doc.md> [--out <file>] [--json]

WHAT IT EXECUTES IS EXACTLY WHAT THE ANNOTATION SPECIFIES, which is two of the
four verdicts and every insertion:

    KEEP      the span stands                            (nothing to do)
    DROP      the span is removed                        mechanical
    insert    the text is placed at its boundary         mechanical
    REWRITE   the span stands, and is REPORTED           no replacement is stored
    MOVE      the span stands, and is REPORTED           no destination is stored

`REWRITE` says the content earns its place and the sentence does not; `MOVE`
says the content belongs to a named owner. Neither names the resulting text, so
neither can be executed without inventing it, and inventing it is the one thing
a projection must not do. They are left standing and named, so what comes out is
a DRAFT for step 4 rather than a finished rewrite.

`MOVE` is left standing rather than removed on purpose, and this is the one
place this tool disagrees with check.py. That check reads DROP and MOVE together
as "should have left", which is right when it is JUDGING a rewrite a person
made: the person put the moved text somewhere. Here there is nowhere to put it,
so removing it would lose text with no record of where it went.

WHAT IT DOES NOT DO IS TIDY. Removing a span leaves the whitespace the span sat
in, so a join can produce a double space or a run of blank lines. Collapsing
those is neither specified by the annotation nor invariant over markdown (inside
a fenced block the whitespace is content), so the joins are counted and reported
instead of being cleaned up.
"""
import sys, json, pathlib, hashlib, re

BLANK = re.compile(r'\n\s*\n')


def _gap_after(text, units, i):
    """The characters standing between this unit and the next, which is what an
    insertion at that boundary has to agree with."""
    return text[units[i]["end"]:units[i + 1]["start"]] if i + 1 < len(units) else text[units[i]["end"]:]


def placements(so, text):
    """Every insertion as (offset, string-to-splice), the string carrying the
    separator ALREADY STANDING at that boundary rather than one chosen here.
    A boundary whose gap holds a blank line separates blocks, so the text
    arrives as its own block; anything else is a run, so it joins with a space.
    Reading the separator off the document is mechanical; picking one would be
    the same kind of guess as inventing a REWRITE.

    THE ANNOTATION MAY OVERRULE THE READING, and only the annotation: an `as` of
    "block" or "run" on the insertion is honored over the gap. That is not the
    same kind of guess, because it is not a guess: the annotator stated it. It
    exists because the reading is not always available. A document's final
    newline is a terminator rather than a paragraph break, so at the tail there
    is nothing to read and the gap answers "run" for a reason that has nothing
    to do with the author's intent; a closing paragraph was unsayable until
    `as` arrived."""
    units = sorted(so["units"], key=lambda u: u["start"])
    by_uid = {u["uid"]: i for i, u in enumerate(units)}
    out = []
    for ins in so.get("insertions", []):
        after = ins.get("after")
        if after is None:
            # The head follows nothing, so there is no separator to read. It is
            # a block by construction: text before the document's first unit
            # cannot be a continuation of anything.
            out.append((units[0]["start"] if units else 0, ins["text"] + "\n\n"))
            continue
        i = by_uid[after]
        block = (ins["as"] == "block") if ins.get("as") \
            else bool(BLANK.search(_gap_after(text, units, i)))
        out.append((units[i]["end"], ("\n\n" if block else " ") + ins["text"]))
    return out


def materialize(so, text):
    """The projected document, and the account of what was and was not run."""
    units = sorted(so["units"], key=lambda u: u["start"])
    # Removals and placements together, applied from the END so every offset
    # ahead of the cursor is still the one the annotation recorded.
    edits = [(u["start"], u["end"], "") for u in units if u.get("verdict") == "DROP"]
    edits += [(at, at, s) for at, s in placements(so, text)]
    out = text
    for start, end, s in sorted(edits, key=lambda e: (e[0], e[1]), reverse=True):
        out = out[:start] + s + out[end:]

    tally = {}
    for u in units:
        tally[u.get("verdict") or "KEEP"] = tally.get(u.get("verdict") or "KEEP", 0) + 1
    standing = [{"uid": u["uid"], "verdict": u["verdict"], "label": u.get("label", ""),
                 "text": " ".join(text[u["start"]:u["end"]].split())[:96]}
                for u in units if u.get("verdict") in ("REWRITE", "MOVE")]
    # What the removals left behind, counted rather than cleaned. Three shapes,
    # and the third is the one a first pass missed: cutting the LAST unit of a
    # line leaves the space that preceded it stranded before the newline, which
    # no mid-line run matches. A reporter blind to the commonest artifact of its
    # own edit is worse than none, since it reads as an all-clear.
    ARTIFACTS = {"double space": r'[^\S\n]{2,}',
                 "trailing space": r'[^\S\n]+\n',
                 "blank run": r'\n\s*\n\s*\n'}
    joins = {k: len(re.findall(p, out)) - len(re.findall(p, text))
             for k, p in ARTIFACTS.items()}
    return out, {
        "target": so.get("target", {}).get("path", ""),
        "bytes": {"before": len(text.encode()), "after": len(out.encode())},
        "verdicts": tally,
        "dropped_words": sum(u.get("words", 0) for u in units if u.get("verdict") == "DROP"),
        "inserted": len(so.get("insertions", [])),
        # HOW MANY OVERRULED THE DOCUMENT, because an honored override that the
        # account does not mention reads as a reading, and the two differ in
        # who is answerable for the shape.
        "stated": sum(1 for i in so.get("insertions", []) if i.get("as")),
        "standing": standing,
        "joins": {k: v for k, v in joins.items() if v > 0},
    }


def report(r):
    w = [f"materialize: {r['target']} -> {r['bytes']['after']:,} bytes "
         f"(was {r['bytes']['before']:,})"]
    for v, n in sorted(r["verdicts"].items()):
        note = {"DROP": f", {r['dropped_words']} words removed",
                "REWRITE": ", left standing: no replacement is stored",
                "MOVE": ", left standing: no destination is stored"}.get(v, "")
        w.append(f"  {v:<8} {n:>3} unit(s){note}")
    if r["inserted"]:
        shapes = (f", {r['stated']} stating a shape, "
                  f"{r['inserted'] - r['stated']} read off the document") if r["stated"] else ""
        w.append(f"  {'insert':<8} {r['inserted']:>3} placed{shapes}")
    for k, n in r["joins"].items():
        w.append(f"  {'joins':<8} {n:>3} {k}(s) left by a removal, not cleaned up")
    for s in r["standing"]:
        w.append(f"\n{s['verdict']:<8} {s['uid']}  {s['text']}")
    if r["inserted"]:
        # THE INSERTION'S LIFECYCLE, said where it becomes true. Writing this
        # output over the target changes the bytes, so the digest stops matching
        # and this tool refuses the second run: an insertion cannot be applied
        # twice. It is then ordinary text, annotated like any other, and the
        # standoff that proposed it is spent.
        w.append(f"\nApplying this over {r['target']} retires the {r['inserted']} insertion(s): "
                 "the text becomes\nordinary document text, and the digest below stops matching.")
    return "\n".join(w)


if __name__ == "__main__":
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    so = json.loads(pathlib.Path(a[0]).read_text())
    doc = pathlib.Path(a[1])
    raw = doc.read_bytes()
    text = raw.decode("utf-8")

    # THE DIGEST IS THE GATE, AND IT IS ALSO THE LIFECYCLE. A standoff's spans
    # are offsets into particular bytes, so projecting it onto anything else
    # would splice at the wrong places. The same refusal is what stops an
    # insertion being applied twice: once the output is written over the target,
    # these bytes are gone and this run is refused.
    want = so.get("target", {}).get("sha256")
    got = hashlib.sha256(raw).hexdigest()
    if want and want != got:
        sys.exit(f"{doc} is not the document this standoff annotates.\n"
                 f"  annotated {want[:12]}, found {got[:12]}\n"
                 "If the projection has already been applied, the insertions are spent and the\n"
                 "annotation needs re-anchoring (reanchor.py), not projecting again.")

    out, r = materialize(so, text)
    if "--json" in sys.argv:
        print(json.dumps(r, ensure_ascii=False, indent=1))
    else:
        print(report(r), file=sys.stderr)
    i = sys.argv.index("--out") if "--out" in sys.argv else None
    if i is not None:
        pathlib.Path(sys.argv[i + 1]).write_text(out, encoding="utf-8")
        print(f"wrote {sys.argv[i + 1]}", file=sys.stderr)
    elif "--json" not in sys.argv:
        sys.stdout.write(out)
