#!/usr/bin/env python3
"""The four edits a standoff annotation admits, and the patch that declares them.

    python3 ops.py <standoff.json> <patch.json> <doc.md> [--write]

A patch is a list of DOMAIN operations keyed by uid, not RFC 6902. The standard
exists and is the wrong altitude: its paths are array indices, so a split reads
as two opaque array mutations, nothing can validate it as a split, and inserting
one unit invalidates every later path. Keyed by uid, an operation says what it
is, survives reordering, and is reviewable as a judgment rather than a result.

    {"op": "split",   "uid": …, "at": <offset into the document>, "why": …}
    {"op": "merge",   "uid": …}                 with its successor
    {"op": "relabel", "uid": …, "label": …}
    {"op": "note",    "uid": …, "text": …}

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
    seen, prev = set(), 0
    for u in units:
        if u["uid"] in seen:
            bad.append(f"{u['uid']}: duplicate uid")
        seen.add(u["uid"])
        if not text[u["start"]:u["end"]].strip():
            bad.append(f"{u['uid']}: span resolves to nothing")
        if u["label"] not in vocab:
            bad.append(f"{u['uid']}: label {u['label']!r} is not in the vocabulary")
        if u["start"] > prev and text[prev:u["start"]].strip():
            bad.append(f"{u['uid']}: unannotated text at {prev}-{u['start']}")
        prev = max(prev, u["end"])
    if text[prev:].strip():
        bad.append(f"unannotated tail from {prev}")
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
    # A sentence that absorbs a heading is not a sentence. Keeping the first
    # unit's kind would make the field a lie, so a cross-kind merge says so.
    kind = u["kind"] if u["kind"] == nxt["kind"] else "mixed"
    joined = {**u, "end": nxt["end"], "kind": kind,
              "words": len(text[u["start"]:nxt["end"]].split()),
              "from": f"merge:{uid}+{nxt['uid']}"} | ({"why": why} if why else {})
    so["units"] = units[:i] + [joined] + units[i + 2:]
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


def note(so, text, uid, text_, **_):
    _, u = _at(so, uid)
    if text_:
        u["note"] = text_
    else:
        u.pop("note", None)
    return so


HANDLERS = {"split": lambda so, t, o: split(so, t, o["uid"], o["at"], o.get("why")),
            "merge": lambda so, t, o: merge(so, t, o["uid"], o.get("why")),
            "relabel": lambda so, t, o: relabel(so, t, o["uid"], o["label"], o.get("why")),
            "note": lambda so, t, o: note(so, t, o["uid"], o.get("text", ""))}


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
