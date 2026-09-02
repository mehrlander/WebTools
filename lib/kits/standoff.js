// The standoff annotation: its invariants, the six edits it admits, and the
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
    // Only where the second axis is DECLARED. An annotation carrying one axis
    // is not thereby invalid, so an absent `verdicts` block waives the check
    // rather than failing every unit in it.
    const verds = new Set((so.verdicts || []).map(v => v.verdict));
    const seen = new Set();
    let prev = 0;
    for (const u of units) {
      if (seen.has(u.uid)) bad.push(`${u.uid}: duplicate uid`);
      seen.add(u.uid);
      if (!text.slice(u.start, u.end).trim()) bad.push(`${u.uid}: span resolves to nothing`);
      if (!vocab.has(u.label)) bad.push(`${u.uid}: label ${JSON.stringify(u.label)} is not in the vocabulary`);
      if (verds.size && !verds.has(u.verdict)) bad.push(`${u.uid}: verdict ${JSON.stringify(u.verdict || '')} is not declared`);
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

    // THE THIRD GEOMETRY, AND THE REASON IT NEEDS ITS OWN LINES. An insertion
    // anchors to a boundary, so it neither tiles nor covers and not one of the
    // checks above can see it: it holds text the document does not contain, so
    // it has no span to resolve, no characters to partition and no share to
    // count. What can go wrong instead is an anchor naming a unit that is gone,
    // a second insertion at one boundary (the anchor is the identity, so a
    // duplicate makes the address ambiguous), and text that says nothing.
    // `after: null` is the head of the document, which follows no unit and is
    // therefore not a dangling anchor.
    const anchors = new Set();
    for (const ins of so.insertions || []) {
      const a = ins.after ?? null;
      const name = a === null ? 'the head of the document' : `after ${a}`;
      if (a !== null && !seen.has(a)) bad.push(`insertion ${name}: no such unit`);
      if (!(ins.text || '').trim()) bad.push(`insertion ${name}: no text`);
      if (anchors.has(a)) bad.push(`insertion ${name}: a second insertion at one boundary`);
      anchors.add(a);
    }
    return bad;
  }

  // Each operation mutates `so.units` and returns the uid to leave selected, or
  // null when it refuses. A refusal is not an error: the caller has offered
  // something the annotation cannot take, and nothing has changed.
  //
  // Most preserve the invariants by construction. A split's halves meet exactly
  // where the parent was cut; a merge's survivor spans both; a note touches no
  // span. Only relabel, verdict and the uid space can break one, so those are
  // checked here. Anything authored elsewhere goes through apply().
  //
  // TWO GEOMETRIES, AND THE KEY SAYS WHICH. An op over a span is keyed by `uid`
  // (split, merge, relabel, verdict, note); an op over a boundary is keyed by
  // `after`, the unit the boundary follows (shift, insert). Reading the key is
  // how a caller knows what it is holding, which is what describe() got wrong.
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
      for (const h of so.units.slice(i, i + 2)) h.kind = kindOf(text, h.start, h.end);
      // An insertion anchored to this unit's END is anchored to the SECOND
      // half's end now, which is the same boundary in the document. The first
      // half's end is a boundary the split just made, and nobody asked to put
      // text at one that did not exist when they asked.
      for (const ins of so.insertions || []) if (ins.after === o.uid) ins.after = o.uid + 'b';
      return o.uid + 'a';
    },
    merge(so, text, o) {
      const i = at(so, o.uid), u = so.units[i], n = so.units[i + 1];
      if (!u || !n) return null;
      // A merge DESTROYS the boundary between the two, and an insertion there
      // said text belongs at it. Losing the text would be the smaller problem:
      // the survivor keeps `u`'s uid, so the anchor would still RESOLVE, now
      // naming the boundary past the absorbed unit. It would pass every check
      // and be in the wrong place. Refusing states the disagreement instead.
      if ((so.insertions || []).some(x => (x.after ?? null) === u.uid)) return null;
      so.units.splice(i, 2, { ...u, end: n.end, kind: kindOf(text, u.start, n.end),
        words: words(text, u.start, n.end), from: `merge:${u.uid}+${n.uid}`,
        ...(o.why ? { why: o.why } : {}) });
      return o.uid;
    },
    // A BOUNDARY IS THE OBJECT. `after` names the unit whose end it is, which is
    // also the next unit's start, so moving it keeps the partition by
    // construction rather than by a rule. Expressing it as merge-then-split
    // would work and would lose both uids, so the grain's history would read as
    // two units appearing where two units were already standing.
    //
    // NOT `move`, which named three things at once: this operation, the MOVE
    // verdict, and any future drag-a-span. The op gave up the name because its
    // object is the one thing the other two are not.
    shift(so, text, o) {
      const i = at(so, o.after), u = so.units[i], n = so.units[i + 1];
      if (!u || !n) return null;
      if (!(u.start < o.to && o.to < n.end)) return null;
      if (!text.slice(u.start, o.to).trim() || !text.slice(o.to, n.end).trim()) return null;
      Object.assign(u, { end: o.to, kind: kindOf(text, u.start, o.to),
                         words: words(text, u.start, o.to),
                         from: `shift:${u.uid}/${n.uid}`, ...(o.why ? { why: o.why } : {}) });
      Object.assign(n, { start: o.to, kind: kindOf(text, o.to, n.end),
                         words: words(text, o.to, n.end),
                         from: `shift:${u.uid}/${n.uid}` });
      return o.after;
    },
    relabel(so, text, o) {
      const u = so.units.find(x => x.uid === o.uid);
      if (!u || !(so.vocabulary || []).some(v => v.label === o.label)) return null;
      u.label = o.label;
      if (o.why) u.why = o.why;
      return o.uid;
    },
    // The other axis. Same shape as relabel because it is the same kind of
    // edit, and separate from it because the two are orthogonal: a unit can be
    // WHY and DROP at once, and neither answer constrains the other.
    verdict(so, text, o) {
      const u = so.units.find(x => x.uid === o.uid);
      if (!u) return null;
      const declared = so.verdicts || [];
      if (declared.length && !declared.some(v => v.verdict === o.verdict)) return null;
      u.verdict = o.verdict;
      if (o.why) u.why = o.why;
      return o.uid;
    },
    note(so, text, o) {
      const u = so.units.find(x => x.uid === o.uid);
      if (!u) return null;
      if (o.text) u.note = o.text; else delete u.note;
      return o.uid;
    },
    // TEXT THE DOCUMENT DOES NOT HAVE, placed at a boundary rather than over a
    // span. The other five ops move boundaries and labels and leave the bytes
    // alone, which is what lets target.sha256 stay true across a session; this
    // one states a change to those bytes without making it, so it stays a
    // proposal until something materializes it.
    //
    // THE ANCHOR IS THE IDENTITY, so there is no id to keep unique and an empty
    // text clears it: the same shape as `note`, which is addressed by its unit.
    // Keyed by `after` like shift, never by an offset, so a boundary that moves
    // under it carries it along and a patch's own edits cannot invalidate it.
    insert(so, text, o) {
      const after = o.after ?? null;
      const units = sorted(so);
      if (after !== null && !units.some(u => u.uid === after)) return null;
      so.insertions = (so.insertions || []).filter(x => (x.after ?? null) !== after);
      if (o.text) so.insertions.push({ after, text: o.text, ...(o.why ? { why: o.why } : {}) });
      // Ordered by where the anchor sits, head first, so the file is stable and
      // a reader meets them in the order the document would.
      const rank = (a) => a === null ? -1 : units.findIndex(u => u.uid === a);
      so.insertions.sort((x, y) => rank(x.after ?? null) - rank(y.after ?? null));
      if (!so.insertions.length) delete so.insertions;
      // Selection follows the anchor. The head anchors to no unit, so it leaves
      // the first one selected; a standoff with no units at all has nothing to
      // select and nothing to anchor to, which is a real refusal.
      return after ?? (units[0] || {}).uid ?? null;
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

  // Where a boundary is, in words. `after` names the unit it follows, and null
  // is the one boundary that follows nothing.
  const boundary = (after) => after ? `the boundary after ${after}` : 'the head of the document';

  // The patch as judgments, for a commit message. The units already carry
  // `from`, so this is the reason rather than a second record of the result.
  //
  // A TABLE, NOT A TERNARY CHAIN. The chain this replaces ended in a default
  // that rendered `note ${o.uid}`, so a boundary op (keyed by `after`, never by
  // `uid`) came out as "note undefined (cleared)" in the commit message that is
  // the patch's ONLY surviving record: nothing keeps the patch file. It went
  // unnoticed because a default branch cannot be missing. A table's can.
  const SAID = {
    split: (o) => `split ${o.uid} at ${o.at}`,
    merge: (o) => `merge ${o.uid} with its successor`,
    shift: (o) => `shift ${boundary(o.after)} to ${o.to}`,
    insert: (o) => `insert at ${boundary(o.after)}${o.text ? '' : ' (cleared)'}`,
    relabel: (o) => `relabel ${o.uid} ${o.label}`,
    verdict: (o) => `${o.uid} ${o.verdict}`,
    note: (o) => `note ${o.uid}${o.text ? '' : ' (cleared)'}`,
  };
  function describe(patch) {
    return patch.map(o => (SAID[o.op] || (x => `${x.op}: undescribed operation`))(o));
  }

  // ── THE SOURCE MAP ───────────────────────────────────────────────────────
  // A boundary is a character offset into the document, and a reader should be
  // able to place one while looking at the document RENDERED. Those are two
  // coordinate systems, and mapping between them is what this does.
  //
  // NOT through the parser's tokens. Walking marked's token tree and adding up
  // `raw` lengths does work, and it binds this to one library's token shape
  // across versions the page and the tests do not share. The rendered text is a
  // SUBSEQUENCE of the source (markdown deletes delimiters and keeps content,
  // in order), so a moving cursor and indexOf answer the same question with no
  // dependency at all.
  //
  // WHAT IT REFUSES IS THE POINT. A text node that cannot be found is left
  // unwrapped, and an unwrapped node carries no offset, so no boundary can land
  // in it. Markup is unfindable by construction, since `**`, `[`, `](url)` and a
  // fence's backticks are in no text node at all: the reader cannot put a
  // boundary inside the syntax because the syntax is not a place. Entity
  // decoding and any typographic substitution fail the same way, safely.
  //
  // This is a PLACEMENT rule and not an invariant. check() cannot hold it,
  // since skills/state-the-rule/ops.py is stdlib Python with no markdown parser
  // and a second, disagreeing implementation is worse than none. A patch
  // authored by hand can still put a boundary inside markup; the interface
  // cannot.
  // An inline construct is ATOMIC: a boundary anywhere inside it, its label
  // included, leaves one side holding an unclosed delimiter. `[one way](url)`
  // split after "one" gives `…[one` and ` way](url)…`, and neither renders as
  // itself. So the label of a link is one place, not several, and the map
  // offers no offsets from inside one.
  const ATOMIC = 'a, strong, em, code, del, ins, sub, sup, abbr, mark';

  function mapText(root, src, from = 0) {
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    let cur = from, mapped = 0, unmapped = 0;
    for (const node of nodes) {
      const t = node.data;
      if (!t) continue;
      // A WHITESPACE NODE CARRYING A NEWLINE IS THE RENDERER'S FORMATTING, not
      // content, and mapping one is worse than skipping it. marked puts a
      // newline between `<ol>` and `<li>`, so a block unit's FIRST run is
      // "\n"; indexOf then finds the next newline in the SOURCE, which is past
      // the whole item, and the cursor advances beyond every real run behind
      // it. The unit maps nothing at all, which is why a list item had no
      // draggable boundary and no offset under the pointer: not because its
      // edges sat in markup, which is what the page said, but because the
      // mapping had been eaten before it reached them. A whitespace node
      // WITHOUT a newline is a real inline separator and still maps.
      if (!t.trim() && t.includes('\n')) continue;
      const i = src.indexOf(t, cur);
      if (i < 0) { unmapped++; continue; }
      const span = doc.createElement('span');
      span.dataset.src = i;
      const host = node.parentNode;
      host.replaceChild(span, node);
      span.appendChild(node);
      if (span.parentElement && span.parentElement.closest(ATOMIC)) span.dataset.atomic = '1';
      cur = i + t.length;
      mapped++;
    }
    return { mapped, unmapped,
             atomic: root.querySelectorAll('[data-atomic]').length };
  }

  // ── WHAT KIND OF THING A SPAN IS ─────────────────────────────────────────
  // `kind` is DERIVED, not remembered. It was written once by segment.py and
  // then carried through every edit, so an operation that moved a boundary left
  // it describing a span that no longer existed: splitting `## Scope and
  // precedence` gave a unit reading "nd precedence" still labelled `heading`,
  // and three of the nine headings in CONVENTIONS.md offer that split one tap
  // away. merge's own rule (differing kinds become `mixed`) was a partial
  // version of the same fix: it caught heterogeneity of the two stored LABELS
  // and missed the kind the joined SPAN introduced, so merging two sentences
  // across a blank line kept `sent`.
  //
  // THE ORDER IS segment.py's OWN DISPATCH, read against a span rather than a
  // block, which is what lets a browser answer without a segmenter. A structural
  // marker outranks heterogeneity: putting the blank-line test first reclassifies
  // any fence with a blank line in its body as `mixed`. Measured over six of the
  // repo's documents, 873 units including 12 fences and 9 tables: this order
  // agrees with segment.py on all 873, the other on 870.
  // tools/test/state-the-rule.test.mjs holds the two together over that corpus,
  // since a drift would make a patched unit and a rebuilt one disagree.
  const ATX = /^[ \t]*#{1,6} /;
  function kindOf(text, start, end) {
    const s = text.slice(start, end).trim();
    if (s.startsWith('```')) return 'code';
    if (/\n[ \t]*\n/.test(s)) return 'mixed';
    if (s.startsWith('|')) return 'table';
    if (ATX.test(s)) return 'heading';
    return 'sent';
  }

  // ── LIST CONTINUATIONS ───────────────────────────────────────────────────
  // The same `\d+\.` skills/state-the-rule/segment.py guards and BULLET splits
  // on, so the kit and the segmenter agree on what a list marker is.
  const MARKER = /^[ \t]{0,3}(?:[-*+]|\d+\.)[ \t]/;

  // Does the text AT this offset carry a list item's marker?
  const opensList = (text, at) => MARKER.test(text.slice(at, at + 8));

  // Is this offset inside a list item? Walk back to the last blank line, which
  // is where markdown ends a list, and read the marker off the first line after
  // it. Going back to the line-block rather than to the line reaches a
  // hanging-indent continuation, whose own line carries no marker.
  function inList(text, at) {
    const head = text.slice(0, at), blank = /\n[ \t]*\n/g;
    let from = 0, m;
    while ((m = blank.exec(head))) from = m.index + m[0].length;
    return MARKER.test(text.slice(from, from + 8));
  }

  // A CONTINUATION IS A SENTENCE FROM INSIDE A LIST ITEM that does not carry the
  // item's marker. The marker went to the first sentence, so every later one
  // renders as bare prose and hangs unindented under the item it belongs to; a
  // view gives it the item's indent by wrapping it in a marker-less list.
  //
  // IT IS A PROPERTY OF THE OFFSET, and taking one is the whole point. The page
  // used to ask this of the first unit of the paint block a unit landed in,
  // which is the same answer only while every unit in a block sits in one
  // line-block of the source. A shift can end that: moving the boundary after a
  // paragraph forward into the list below it gives that block a first unit
  // opening with prose, and every continuation in the block lost its indent at
  // once. An offset cannot be told about blocks.
  const isContinuation = (text, at) => inList(text, at) && !opensList(text, at);

  // The document offset under a client point, or null where the point is not
  // over mapped text. One rule for both views: Source stamps one span per unit,
  // Read stamps one per text node, and both answer to data-src.
  function offsetAt(doc, x, y) {
    let node = null, off = 0;
    if (doc.caretRangeFromPoint) { const r = doc.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
    else if (doc.caretPositionFromPoint) { const p = doc.caretPositionFromPoint(x, y); if (p) { node = p.offsetNode; off = p.offset; } }
    if (!node || node.nodeType !== 3) return null;
    const span = node.parentElement?.closest('[data-src]');
    if (!span || span.firstChild !== node || span.dataset.atomic) return null;
    return +span.dataset.src + off;
  }

  // The inverse, for placing a pinhead: the span holding the offset, and how
  // far into it the offset sits. Returns null where the offset is in markup or
  // in a unit that is not on screen.
  function nodeAt(root, at) {
    for (const span of root.querySelectorAll('[data-src]:not([data-atomic])')) {
      const n = span.firstChild;
      if (!n || n.nodeType !== 3) continue;
      const s = +span.dataset.src;
      if (at >= s && at <= s + n.length) return { node: n, offset: at - s };
    }
    return null;
  }

  window.Standoff = { check, ops, apply, serialize, saveTarget, describe, isSha,
                      mapText, offsetAt, nodeAt, kindOf, opensList, inList, isContinuation };
})();
