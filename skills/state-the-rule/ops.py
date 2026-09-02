#!/usr/bin/env python3
"""The six edits a standoff annotation admits, and the patch that declares them.

    python3 ops.py <standoff.json> <patch.json> <doc.md> [--write]

A patch is a list of DOMAIN operations keyed by uid, not RFC 6902. The standard
exists and is the wrong altitude: its paths are array indices, so a split reads
as two opaque array mutations, nothing can validate it as a split, and inserting
one unit invalidates every later path. Keyed by uid, an operation says what it
is, survives reordering, and is reviewable as a judgment rather than a result.

Two geometries, and the key says which. An op over a SPAN is keyed by `uid`;
an op over a BOUNDARY is keyed by `after`, the unit that boundary follows.

    {"op": "split",   "uid": …, "at": <offset into the document>, "why": …}
    {"op": "merge",   "uid": …}                 with its successor
    {"op": "relabel", "uid": …, "label": …}   what the unit IS
    {"op": "verdict", "uid": …, "verdict": …} what to DO about it
    {"op": "note",    "uid": …, "text": …}
    {"op": "shift",   "after": …, "to": <offset>}   the boundary after that unit
    {"op": "insert",  "after": …, "text": …}    text the document does not have

Every operation is checked against the invariants the stored run is already held
to (tools/test/audit-standoff.test.mjs): units tile the document with no gap,
every span resolves, every label is in the declared vocabulary, uids are unique.
An operation that would break one is refused rather than applied, so a patch is
either wholly valid against its base or it does not run.
"""
import sys, json, pathlib


def check(so, text):
    """The invariants. Returns a list of complaints; empty means valid."""
    bad, units = [], sorted(so["units"], key=lambda u: u["start"])
    vocab = {v["label"] for v in so["vocabulary"]}
    # Only where the second axis is DECLARED. An annotation that carries one
    # axis is not thereby invalid, so an absent `verdicts` block waives the
    # check rather than failing every unit in it.
    verds = {v["verdict"] for v in so.get("verdicts", [])}
    seen, prev = set(), 0
    for u in units:
        if u["uid"] in seen:
            bad.append(f"{u['uid']}: duplicate uid")
        seen.add(u["uid"])
        if not text[u["start"]:u["end"]].strip():
            bad.append(f"{u['uid']}: span resolves to nothing")
        if u["label"] not in vocab:
            bad.append(f"{u['uid']}: label {u['label']!r} is not in the vocabulary")
        if verds and u.get("verdict", "") not in verds:
            bad.append(f"{u['uid']}: verdict {u.get('verdict', '')!r} is not declared")
        if u["start"] > prev and text[prev:u["start"]].strip():
            bad.append(f"{u['uid']}: unannotated text at {prev}-{u['start']}")
        # The other way a boundary can be wrong, and the one nothing caught
        # until 2026-08-30: a unit starting before its predecessor ended. The
        # units are a PARTITION, one label per character, because the figure
        # they produce is a word share and an overlap makes it double-count.
        if u["start"] < prev:
            bad.append(f"{u['uid']}: overlaps the unit before it by {prev - u['start']} chars")
        prev = max(prev, u["end"])
    if text[prev:].strip():
        bad.append(f"unannotated tail from {prev}")

    # THE THIRD GEOMETRY, AND THE REASON IT NEEDS ITS OWN LINES. An insertion
    # anchors to a boundary, so it neither tiles nor covers and not one of the
    # checks above can see it: it holds text the document does not contain, so
    # it has no span to resolve, no characters to partition and no share to
    # count. What can go wrong instead is an anchor naming a unit that is gone,
    # a second insertion at one boundary (the anchor is the identity, so a
    # duplicate makes the address ambiguous), and text that says nothing.
    # `after: null` is the head of the document, which follows no unit and is
    # therefore not a dangling anchor.
    anchors = set()
    for ins in so.get("insertions", []):
        a = ins.get("after")
        name = "the head of the document" if a is None else f"after {a}"
        if a is not None and a not in seen:
            bad.append(f"insertion {name}: no such unit")
        if not (ins.get("text") or "").strip():
            bad.append(f"insertion {name}: no text")
        if a in anchors:
            bad.append(f"insertion {name}: a second insertion at one boundary")
        anchors.add(a)
    return bad


def _at(so, uid):
    for i, u in enumerate(sorted(so["units"], key=lambda x: x["start"])):
        if u["uid"] == uid:
            return i, u
    raise KeyError(f"no unit {uid}")


def split(so, text, uid, at, why=None):
    """One unit becomes two at a document offset. Tiling is preserved by
    construction: the halves meet exactly where the parent was cut."""
    i, u = _at(so, uid)
    if not u["start"] < at < u["end"]:
        raise ValueError(f"{uid}: {at} is not inside {u['start']}-{u['end']}")
    for a, b in ((u["start"], at), (at, u["end"])):
        if not text[a:b].strip():
            raise ValueError(f"{uid}: splitting at {at} leaves an empty half")
    # The halves suffix the parent, so splitting a half gives 046aa/046ab and
    # the uid stays a readable record of how the grain got here.
    halves = []
    for suf, (a, b) in zip("ab", ((u["start"], at), (at, u["end"]))):
        halves.append({**u, "uid": f"{uid}{suf}", "start": a, "end": b,
                       "words": len(text[a:b].split()), "from": f"split:{uid}"}
                      | ({"why": why} if why else {}))
    units = sorted(so["units"], key=lambda x: x["start"])
    so["units"] = units[:i] + halves + units[i + 1:]
    # An insertion anchored to this unit's END is anchored to the SECOND half's
    # end now, which is the same boundary in the document. The first half's end
    # is a boundary the split just made, and nobody asked to put text at one
    # that did not exist when they asked.
    for ins in so.get("insertions", []):
        if ins.get("after") == uid:
            ins["after"] = f"{uid}b"
    return so


def merge(so, text, uid, why=None):
    """A unit absorbs its successor. Refused where they are not adjacent, since
    merging across a gap would swallow text nobody annotated."""
    units = sorted(so["units"], key=lambda x: x["start"])
    i, u = _at(so, uid)
    if i + 1 >= len(units):
        raise ValueError(f"{uid}: nothing follows it")
    nxt = units[i + 1]
    if text[u["end"]:nxt["start"]].strip():
        raise ValueError(f"{uid}: not adjacent to {nxt['uid']}; text lies between")
    # A merge DESTROYS the boundary between the two, and an insertion there said
    # text belongs at it. Losing the text would be the smaller problem: the
    # survivor keeps this unit's uid, so the anchor would still RESOLVE, now
    # naming the boundary past the absorbed unit. It would pass every check and
    # be in the wrong place. Refusing states the disagreement instead.
    if any(ins.get("after") == uid for ins in so.get("insertions", [])):
        raise ValueError(f"{uid}: an insertion sits on the boundary this merge removes")
    # A sentence that absorbs a heading is not a sentence. Keeping the first
    # unit's kind would make the field a lie, so a cross-kind merge says so.
    kind = u["kind"] if u["kind"] == nxt["kind"] else "mixed"
    joined = {**u, "end": nxt["end"], "kind": kind,
              "words": len(text[u["start"]:nxt["end"]].split()),
              "from": f"merge:{uid}+{nxt['uid']}"} | ({"why": why} if why else {})
    so["units"] = units[:i] + [joined] + units[i + 2:]
    return so


def shift(so, text, after, to, why=None):
    """A BOUNDARY IS THE OBJECT. `after` names the unit whose end it is, which
    is also the next unit's start, so moving it keeps the partition by
    construction rather than by a rule. Expressing it as merge-then-split would
    work and would lose both uids, so the grain's history would read as two
    units appearing where two units were already standing.

    Not `move`, which named this operation, the MOVE verdict, and any future
    drag-a-span at once. The op gave up the name: its object is the one thing
    the other two are not."""
    units = sorted(so["units"], key=lambda x: x["start"])
    i, u = _at(so, after)
    if i + 1 >= len(units):
        raise ValueError(f"{after}: nothing follows, so there is no boundary after it")
    n = units[i + 1]
    if not u["start"] < to < n["end"]:
        raise ValueError(f"{after}: {to} is outside {u['start']}-{n['end']}")
    for a, b in ((u["start"], to), (to, n["end"])):
        if not text[a:b].strip():
            raise ValueError(f"{after}: moving the boundary to {to} empties a side")
    tag = f"shift:{u['uid']}/{n['uid']}"
    u.update({"end": to, "words": len(text[u["start"]:to].split()), "from": tag})
    n.update({"start": to, "words": len(text[to:n["end"]].split()), "from": tag})
    if why:
        u["why"] = why
    return so


def relabel(so, text, uid, label, why=None):
    vocab = {v["label"] for v in so["vocabulary"]}
    if label not in vocab:
        raise ValueError(f"{label!r} is not in the vocabulary: {sorted(vocab)}")
    _, u = _at(so, uid)
    u["label"] = label
    if why:
        u["why"] = why
    return so


def verdict(so, text, uid, value, why=None):
    """The other axis. Same shape as relabel because it is the same kind of
    edit, and separate from it because the two are orthogonal: a unit can be
    WHY and DROP at once, and neither answer constrains the other."""
    declared = {v["verdict"] for v in so.get("verdicts", [])}
    if declared and value not in declared:
        raise ValueError(f"{value!r} is not declared: {sorted(declared)}")
    _, u = _at(so, uid)
    u["verdict"] = value
    if why:
        u["why"] = why
    return so


def insert(so, text, after, text_, why=None):
    """TEXT THE DOCUMENT DOES NOT HAVE, placed at a boundary rather than over a
    span. The other five ops move boundaries and labels and leave the bytes
    alone, which is what lets target.sha256 stay true across a session; this one
    states a change to those bytes without making it, so it stays a proposal
    until something materializes it.

    THE ANCHOR IS THE IDENTITY, so there is no id to keep unique and an empty
    text clears it: the same shape as `note`, which is addressed by its unit.
    Keyed by `after` like shift, never by an offset, so a boundary that moves
    under it carries it along and a patch's own edits cannot invalidate it.
    `after=None` is the head of the document, the one boundary following no
    unit."""
    units = sorted(so["units"], key=lambda x: x["start"])
    if after is not None and not any(u["uid"] == after for u in units):
        raise ValueError(f"{after}: no such unit to anchor an insertion to")
    ins = [x for x in so.get("insertions", []) if x.get("after") != after]
    if text_:
        # Key order matches lib/kits/standoff.js, because the two serializations
        # have to agree BYTE for byte: audit-payload.py and the page both write
        # this file, and a disagreement makes every real change arrive inside a
        # whole-file reformat. deepEqual cannot see this, so the parity test
        # compares the serialized bytes.
        ins.append({"after": after, "text": text_} | ({"why": why} if why else {}))
    # Ordered by where the anchor sits, head first, so the file is stable and a
    # reader meets them in the order the document would.
    order = {u["uid"]: i for i, u in enumerate(units)}
    ins.sort(key=lambda x: -1 if x.get("after") is None else order[x["after"]])
    if ins:
        so["insertions"] = ins
    else:
        so.pop("insertions", None)
    return so


def note(so, text, uid, text_, **_):
    _, u = _at(so, uid)
    if text_:
        u["note"] = text_
    else:
        u.pop("note", None)
    return so


HANDLERS = {"split": lambda so, t, o: split(so, t, o["uid"], o["at"], o.get("why")),
            "merge": lambda so, t, o: merge(so, t, o["uid"], o.get("why")),
            "shift": lambda so, t, o: shift(so, t, o["after"], o["to"], o.get("why")),
            "relabel": lambda so, t, o: relabel(so, t, o["uid"], o["label"], o.get("why")),
            "verdict": lambda so, t, o: verdict(so, t, o["uid"], o["verdict"], o.get("why")),
            "note": lambda so, t, o: note(so, t, o["uid"], o.get("text", "")),
            "insert": lambda so, t, o: insert(so, t, o.get("after"), o.get("text", ""),
                                              o.get("why"))}


def apply(base, patch, text):
    """Run a patch on a COPY, refusing the whole of it if any operation breaks
    an invariant: a patch is valid against its base or it does not run, so a bad
    last step cannot leave the earlier ones applied. Returns the new standoff.

    lib/kits/standoff.js is the same rules in JavaScript, for the browser that
    authors a patch. tools/render/scenarios/audit-edit.mjs diffs the two over
    one patch, so a drift between them is a failed comparison."""
    so = json.loads(json.dumps(base))
    for n, op in enumerate(patch, 1):
        kind = op.get("op")
        if kind not in HANDLERS:
            raise ValueError(f"op {n}: unknown operation {kind!r}")
        HANDLERS[kind](so, text, op)
        bad = check(so, text)
        if bad:
            raise ValueError(f"op {n} ({kind} {op.get('uid')}) breaks the standoff:\n  "
                             + "\n  ".join(bad))
    return so


if __name__ == "__main__":
    a = [x for x in sys.argv[1:] if x != "--write"]
    sofile, patchfile, doc = (pathlib.Path(x) for x in a[:3])
    so = json.loads(sofile.read_text())
    text = doc.read_text(encoding="utf-8")
    before = len(so["units"])
    so = apply(so, json.loads(patchfile.read_text()), text)
    print(f"{before} units -> {len(so['units'])}, invariants hold")
    if "--write" in sys.argv:
        sofile.write_text(json.dumps(so, ensure_ascii=False, indent=1) + "\n")
        print(f"wrote {sofile}")
