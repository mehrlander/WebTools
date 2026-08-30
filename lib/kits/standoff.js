// The standoff annotation: its invariants, the four edits it admits, and the
// one serialization both of its writers must agree on.
//
// A standoff annotates a document without touching it. Units carry character
// spans into the target's bytes, so the annotation is only meaningful while
// those bytes are unchanged, which is what target.sha256 answers. Nothing here
// reads the network; the caller supplies the document text.
//
// TWO IMPLEMENTATIONS, ON PURPOSE, HELD TO EACH OTHER. This file is what a
// browser runs; skills/state-the-rule/ops.py is what a session runs, and it is
// the authority that writes. They are not a layering: they are the same rules
// in the two languages the work happens in, and
// tools/render/scenarios/audit-edit.mjs diffs their output over one patch so a
// drift is a failed comparison rather than a surprise months later.
//
// A PATCH IS KEYED BY UID, NOT BY ARRAY INDEX. RFC 6902 exists and is the wrong
// altitude: its paths are positions, so inserting one unit invalidates every
// later path and a split reads as two opaque array mutations nothing can check
// as a split. Keyed by uid, an operation says what it is and survives
// reordering.
(() => {
  const sorted = (so) => [...so.units].sort((a, b) => a.start - b.start);
  const words = (text, a, b) => text.slice(a, b).split(/\s+/).filter(Boolean).length;
  const at = (so, uid) => sorted(so).findIndex(u => u.uid === uid);

  // The invariants, in the order a reader would check them. Returns the
  // complaints; empty means valid. These are the same four
  // tools/test/audit-standoff.test.mjs holds a stored run to.
  function check(so, text) {
    const bad = [], units = sorted(so);
    const vocab = new Set((so.vocabulary || []).map(v => v.label));
    const seen = new Set();
    let prev = 0;
    for (const u of units) {
      if (seen.has(u.uid)) bad.push(`${u.uid}: duplicate uid`);
      seen.add(u.uid);
      if (!text.slice(u.start, u.end).trim()) bad.push(`${u.uid}: span resolves to nothing`);
      if (!vocab.has(u.label)) bad.push(`${u.uid}: label ${JSON.stringify(u.label)} is not in the vocabulary`);
      if (u.start > prev && text.slice(prev, u.start).trim())
        bad.push(`${u.uid}: unannotated text at ${prev}-${u.start}`);
      // The other way a boundary can be wrong, and the one nothing caught until
      // 2026-08-30: a unit starting before its predecessor ended. The units are
      // a PARTITION, one label per character, because the page's figure is a
      // word share and an overlap makes it double-count. Moving a boundary
      // cannot produce one (a boundary belongs to both sides at once), but a
      // patch authored anywhere else can.
      if (u.start < prev)
        bad.push(`${u.uid}: overlaps the unit before it by ${prev - u.start} chars`);
      prev = Math.max(prev, u.end);
    }
    if (text.slice(prev).trim()) bad.push(`unannotated tail from ${prev}`);
    return bad;
  }

  // Each operation mutates `so.units` and returns the uid to leave selected, or
  // null when it refuses. A refusal is not an error: the caller has offered
  // something the annotation cannot take, and nothing has changed.
  //
  // Three of the four preserve the invariants by construction. A split's halves
  // meet exactly where the parent was cut; a merge's survivor spans both; a note
  // touches no span. Only relabel and the uid space can break one, so those are
  // the two checked here. Anything authored elsewhere goes through apply().
  const ops = {
    // The halves suffix the parent, so splitting a half gives 046aa/046ab and
    // the uid stays a readable record of how the grain got here.
    split(so, text, o) {
      const i = at(so, o.uid), u = so.units[i];
      if (!u || !(u.start < o.at && o.at < u.end)) return null;
      if (!text.slice(u.start, o.at).trim() || !text.slice(o.at, u.end).trim()) return null;
      const half = (a, b, suf) => ({ ...u, uid: u.uid + suf, start: a, end: b,
        words: words(text, a, b), from: 'split:' + u.uid,
        ...(o.why ? { why: o.why } : {}) });
      so.units.splice(i, 1, half(u.start, o.at, 'a'), half(o.at, u.end, 'b'));
      return o.uid + 'a';
    },
    merge(so, text, o) {
      const i = at(so, o.uid), u = so.units[i], n = so.units[i + 1];
      if (!u || !n) return null;
      // A merge that kept either side's kind would state something false about
      // the span it now covers, and kind is what a view styles on.
      so.units.splice(i, 2, { ...u, end: n.end, kind: u.kind === n.kind ? u.kind : 'mixed',
        words: words(text, u.start, n.end), from: `merge:${u.uid}+${n.uid}`,
        ...(o.why ? { why: o.why } : {}) });
      return o.uid;
    },
    // A BOUNDARY IS THE OBJECT. `after` names the unit whose end it is, which is
    // also the next unit's start, so moving it keeps the partition by
    // construction rather than by a rule. Expressing it as merge-then-split
    // would work and would lose both uids, so the grain's history would read as
    // two units appearing where two units were already standing.
    move(so, text, o) {
      const i = at(so, o.after), u = so.units[i], n = so.units[i + 1];
      if (!u || !n) return null;
      if (!(u.start < o.to && o.to < n.end)) return null;
      if (!text.slice(u.start, o.to).trim() || !text.slice(o.to, n.end).trim()) return null;
      Object.assign(u, { end: o.to, words: words(text, u.start, o.to),
                         from: `move:${u.uid}/${n.uid}`, ...(o.why ? { why: o.why } : {}) });
      Object.assign(n, { start: o.to, words: words(text, o.to, n.end),
                         from: `move:${u.uid}/${n.uid}` });
      return o.after;
    },
    relabel(so, text, o) {
      const u = so.units.find(x => x.uid === o.uid);
      if (!u || !(so.vocabulary || []).some(v => v.label === o.label)) return null;
      u.label = o.label;
      if (o.why) u.why = o.why;
      return o.uid;
    },
    note(so, text, o) {
      const u = so.units.find(x => x.uid === o.uid);
      if (!u) return null;
      if (o.text) u.note = o.text; else delete u.note;
      return o.uid;
    },
  };

  // Run a patch on a COPY, refusing the whole of it if any operation is
  // rejected or breaks an invariant: a patch is valid against its base or it
  // does not run, so a bad last step cannot leave the earlier ones applied.
  // Returns { so, complaints }; complaints non-empty means so is unchanged.
  function apply(base, patch, text) {
    const so = JSON.parse(JSON.stringify(base));
    for (let n = 0; n < patch.length; n++) {
      const op = patch[n], run = ops[op.op];
      if (!run) return { so: base, complaints: [`op ${n + 1}: unknown operation ${JSON.stringify(op.op)}`] };
      if (run(so, text, op) === null)
        return { so: base, complaints: [`op ${n + 1}: ${op.op} ${op.uid} was refused`] };
      const bad = check(so, text);
      if (bad.length) return { so: base, complaints: bad.map(b => `op ${n + 1} (${op.op} ${op.uid}): ${b}`) };
    }
    return { so, complaints: [] };
  }

  // The bytes. tools/build/audit-payload.py writes the same file with Python's
  // json.dumps(indent=1, ensure_ascii=False) plus a trailing newline, and the
  // two agree character for character; a test holds them there, because a
  // disagreement makes every real change arrive inside a whole-file reformat.
  const serialize = (so) => JSON.stringify(so, null, 1) + '\n';

  // Where an edit may land. A commit is not a branch (the contents API's PUT
  // takes a branch name, and a toss link in a PR body carries a SHA on
  // purpose), and the default branch takes changes through a pull request, so
  // the writable ref is a branch that is not the default one.
  const isSha = (r) => /^[0-9a-f]{7,40}$/.test(r || '');
  function saveTarget(so, ref, defaultBranch = 'main') {
    if (!so || !so.self || !so.self.path)
      return { ref: null, why: 'this standoff carries no address of its own' };
    if (isSha(ref))
      return { ref: null, why: `reading ${ref.slice(0, 7)}, which is a commit. Open it at ?use=<branch> to save.` };
    if (!ref || ref === defaultBranch)
      return { ref: null, why: `reading ${ref || 'the default branch'}, and a change to it arrives `
        + 'through a pull request. Open the page at ?use=<branch> to edit that branch.' };
    return { ref, why: '' };
  }

  // The patch as judgments, for a commit message. The units already carry
  // `from`, so this is the reason rather than a second record of the result.
  function describe(patch) {
    return patch.map(o => o.op === 'split' ? `split ${o.uid} at ${o.at}`
      : o.op === 'merge' ? `merge ${o.uid} with its successor`
      : o.op === 'relabel' ? `relabel ${o.uid} ${o.label}`
      : `note ${o.uid}${o.text ? '' : ' (cleared)'}`);
  }

  window.Standoff = { check, ops, apply, serialize, saveTarget, describe, isSha };
})();
