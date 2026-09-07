// lib/kits/standoff.js — the standoff's rules as a browser runs them.
//
// skills/state-the-rule/ops.py is the same rules in Python and is the authority
// that writes; tools/render/scenarios/audit-edit.mjs diffs the two over one
// patch end to end. What is held here is the half a comparison cannot show: the
// refusals. A patch that half-applies, a label off the vocabulary, a merge that
// keeps a kind it no longer describes, a save aimed at a commit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const win = {};
new Function('window', readFileSync(path.join(repoRoot, 'lib/kits/standoff.js'), 'utf8'))(win);
const S = win.Standoff;

// One rule with its reason fused on, and a second sentence after it. Small
// enough that every offset below is countable by hand.
const DOC = 'Close the lid, because the contents spoil.\n\nCheck it twice.';
const base = () => ({
  kind: 'standoff/1',
  self: { repo: 'o/r', path: 'runs/x/standoff.json' },
  target: { path: 'doc.md' },
  vocabulary: [{ label: 'WHAT', side: 'declaration' }, { label: 'WHY-MOT', side: 'explanation' }],
  units: [
    { uid: 'u-001', start: 0, end: 42, kind: 'sent', words: 7, label: 'WHAT' },
    { uid: 'u-002', start: 44, end: 59, kind: 'sent', words: 3, label: 'WHAT' },
  ],
});

test('a valid annotation has nothing to complain about', () => {
  assert.deepEqual(S.check(base(), DOC), []);
});

test('each invariant is reported, and by name', () => {
  const gap = base(); gap.units[0].end = 20;
  assert.match(S.check(gap, DOC).join('\n'), /unannotated text at 20-44/);

  const tail = base(); tail.units.pop();
  assert.match(S.check(tail, DOC).join('\n'), /unannotated tail from 42/);

  const dup = base(); dup.units[1].uid = 'u-001';
  assert.match(S.check(dup, DOC).join('\n'), /duplicate uid/);

  const off = base(); off.units[0].label = 'NOPE';
  assert.match(S.check(off, DOC).join('\n'), /not in the vocabulary/);

  // A span inside the blank line between the two sentences resolves to
  // whitespace, which is an annotation pointing at nothing.
  const empty = base(); empty.units[0].start = 42; empty.units[0].end = 43;
  assert.match(S.check(empty, DOC).join('\n'), /resolves to nothing/);
});

test('a split leaves the halves tiling the parent, and names its parent', () => {
  const { so, complaints } = S.apply(base(), [{ op: 'split', uid: 'u-001', at: 15 }], DOC);
  assert.deepEqual(complaints, []);
  const [a, b] = so.units;
  assert.deepEqual([a.uid, a.start, a.end, b.uid, b.start, b.end],
                   ['u-001a', 0, 15, 'u-001b', 15, 42]);
  assert.equal(a.from, 'split:u-001');
  assert.deepEqual(S.check(so, DOC), []);
});

test('splitting a half suffixes again, so the uid records the grain', () => {
  const { so } = S.apply(base(), [{ op: 'split', uid: 'u-001', at: 15 },
                                  { op: 'split', uid: 'u-001b', at: 30 }], DOC);
  assert.deepEqual(so.units.map(u => u.uid), ['u-001a', 'u-001ba', 'u-001bb', 'u-002']);
});

test('a split outside the unit is refused and nothing is applied', () => {
  const b = base();
  const { so, complaints } = S.apply(b, [{ op: 'split', uid: 'u-001', at: 200 }], DOC);
  assert.match(complaints.join('\n'), /refused/);
  assert.equal(so, b, 'the base is handed back, not a half-edited copy');
});

test('a patch is refused whole, not applied up to the bad operation', () => {
  // The one that matters. The split is legal and the relabel is not, so a
  // per-operation writer would leave the split on disk with no record of why.
  const b = base();
  const { so, complaints } = S.apply(b, [{ op: 'split', uid: 'u-001', at: 15 },
                                         { op: 'relabel', uid: 'u-001a', label: 'NOPE' }], DOC);
  assert.match(complaints.join('\n'), /op 2/);
  assert.equal(so.units.length, 2);
  assert.equal(so.units[0].uid, 'u-001');
});

test('an unknown operation is refused rather than skipped', () => {
  const { complaints } = S.apply(base(), [{ op: 'reword', uid: 'u-001' }], DOC);
  assert.match(complaints.join('\n'), /unknown operation "reword"/);
});

test('the last unit has nothing to merge with', () => {
  const { complaints } = S.apply(base(), [{ op: 'merge', uid: 'u-002' }], DOC);
  assert.match(complaints.join('\n'), /refused/);
});

// DERIVED FROM THE SPAN, NOT FROM THE LABELS JOINED. The rule here used to be
// "the two kinds differ, so say mixed", which read the operands and not the
// result: merging two `sent` units across a blank line kept `sent`, though the
// survivor plainly covered two paragraphs. Both units below are `sent`, so the
// old rule would have kept `sent` and this test would fail.
test('a merge reports the kind of the span it produced', () => {
  const { so } = S.apply(base(), [{ op: 'merge', uid: 'u-001' }], DOC);
  assert.equal(so.units.length, 1);
  assert.equal(so.units[0].kind, 'mixed', 'the survivor spans a blank line');
  assert.equal(so.units[0].end, 59, 'the survivor covers both spans');
  assert.equal(so.units[0].from, 'merge:u-001+u-002');
});

// The op that made this urgent, and the one the old rule could not reach at all:
// a boundary MOVE leaves both sides describing spans neither of them had.
test('a split and a shift re-derive the kind of every span they touch', () => {
  const doc = '## Scope and precedence\n\nA sentence follows it.';
  const head = () => ({ ...base(), units: [
    { uid: 'h-1', start: 0, end: 23, kind: 'h2', words: 3, label: 'WHAT' },
    { uid: 'h-2', start: 25, end: 47, kind: 'sent', words: 4, label: 'WHAT' }] });

  const split = S.apply(head(), [{ op: 'split', uid: 'h-1', at: 10 }], doc).so;
  assert.deepEqual(split.units.map(u => [u.uid, u.kind]),
    [['h-1a', 'h2'], ['h-1b', 'sent'], ['h-2', 'sent']],
    '"nd precedence" carries no marker, so it is not a heading');

  const shifted = S.apply(head(), [{ op: 'shift', after: 'h-1', to: 32 }], doc).so;
  assert.deepEqual(shifted.units.map(u => u.kind), ['mixed', 'sent'],
    'the heading swallowed across the blank line and is no longer just a heading');
});

test('a note is set and cleared through the same operation', () => {
  const set = S.apply(base(), [{ op: 'note', uid: 'u-001', text: 'the reason is fused in' }], DOC);
  assert.equal(set.so.units[0].note, 'the reason is fused in');
  const cleared = S.apply(set.so, [{ op: 'note', uid: 'u-001', text: '' }], DOC);
  assert.ok(!('note' in cleared.so.units[0]));
});

// THE SECOND AXIS. A verdict is not a label with a different name: the two are
// orthogonal, so setting one must leave the other alone, and an annotation that
// declares no verdicts is one-axis rather than invalid. Both halves are held
// here because both fail quietly, one by refusing every unit and one by
// accepting anything.
const twoAxis = () => ({ ...base(),
  verdicts: [{ verdict: 'KEEP' }, { verdict: 'DROP' }],
  units: base().units.map(u => ({ ...u, verdict: 'KEEP' })) });

test('a verdict is set without disturbing the label', () => {
  const { so, complaints } = S.apply(twoAxis(), [{ op: 'verdict', uid: 'u-001', verdict: 'DROP' }], DOC);
  assert.deepEqual(complaints, []);
  assert.equal(so.units[0].verdict, 'DROP');
  assert.equal(so.units[0].label, 'WHAT', 'the label moved when only the verdict was asked for');
  assert.equal(so.units[1].verdict, 'KEEP', 'a verdict is per unit, not per annotation');
});

test('an undeclared verdict is refused, like an undeclared label', () => {
  const { so, complaints } = S.apply(twoAxis(), [{ op: 'verdict', uid: 'u-001', verdict: 'BURN' }], DOC);
  assert.match(complaints.join('\n'), /verdict u-001 was refused/);
  assert.equal(so.units[0].verdict, 'KEEP', 'the refusal left a change behind');
});

test('check reports a verdict off the declared list', () => {
  const off = twoAxis(); off.units[1].verdict = 'BURN';
  assert.match(S.check(off, DOC).join('\n'), /u-002: verdict "BURN" is not declared/);
});

// The waiver, and it is deliberate: every annotation written before the second
// axis existed carries no `verdicts` block and no per-unit verdict, and holding
// those to a list they never declared would fail each of their units at once.
test('an annotation declaring no verdicts is one-axis, not invalid', () => {
  assert.deepEqual(S.check(base(), DOC), []);
});

test('applying does not touch the annotation it was given', () => {
  const b = base();
  S.apply(b, [{ op: 'split', uid: 'u-001', at: 15 }], DOC);
  assert.equal(b.units.length, 2, 'apply works on a copy; the caller decides to adopt it');
});

// ── the boundary, and the partition it keeps ───────────────────────────────

test('an overlap is a complaint, and it was not one until 2026-08-30', () => {
  // Ten characters in two units. Both implementations reported nothing: the
  // gap check only looks forward, so a unit starting BEFORE its predecessor
  // ended slipped past every gate. The edge drag is what made it easy to
  // create, which is why it is checked now.
  const so = base();
  so.units[1].start = 30;
  const bad = S.check(so, DOC);
  assert.match(bad.join('\n'), /u-002: overlaps the unit before it by 12 chars/);
});

test('moving a boundary moves both units, so the partition survives', () => {
  const { so, complaints } = S.apply(base(), [{ op: 'shift', after: 'u-001', to: 30 }], DOC);
  assert.deepEqual(complaints, []);
  assert.deepEqual([so.units[0].start, so.units[0].end], [0, 30]);
  assert.deepEqual([so.units[1].start, so.units[1].end], [30, 59]);
  assert.equal(so.units[0].from, 'shift:u-001/u-002');
  assert.equal(so.units[1].from, 'shift:u-001/u-002');
  assert.deepEqual(S.check(so, DOC), [], 'no gap and no overlap, by construction');
});

test('a boundary cannot be moved outside the pair it separates', () => {
  for (const to of [0, 200, 59]) {
    const { complaints } = S.apply(base(), [{ op: 'shift', after: 'u-001', to }], DOC);
    assert.match(complaints.join('\n'), /refused/, `to=${to} should be refused`);
  }
});

test('a boundary cannot be moved so far that a side is only whitespace', () => {
  // Reachable only where the text near the boundary is blank, so this gets a
  // fixture of its own: trailing spaces the second unit would be left holding
  // once the first has swallowed the words.
  const PAD = 'Alpha. Beta.  ';
  const so = { vocabulary: [{ label: 'WHAT' }], units: [
    { uid: 'p-1', start: 0, end: 6, kind: 'sent', words: 1, label: 'WHAT' },
    { uid: 'p-2', start: 6, end: 14, kind: 'sent', words: 1, label: 'WHAT' }] };
  assert.deepEqual(S.check(so, PAD), [], 'the fixture itself is sound');
  for (const to of [12, 13])
    assert.match(S.apply(so, [{ op: 'shift', after: 'p-1', to }], PAD).complaints.join('\n'),
      /refused/, `to=${to} would leave p-2 holding only spaces`);
  assert.deepEqual(S.apply(so, [{ op: 'shift', after: 'p-1', to: 11 }], PAD).complaints, [],
    'one character of real text on each side is enough');
});

test('word counts follow the boundary on both sides', () => {
  const { so } = S.apply(base(), [{ op: 'shift', after: 'u-001', to: 14 }], DOC);
  assert.equal(so.units[0].words, 3, '"Close the lid,"');
  assert.equal(so.units[1].words, 7);
});

test('the last unit has no boundary after it', () => {
  const { complaints } = S.apply(base(), [{ op: 'shift', after: 'u-002', to: 50 }], DOC);
  assert.match(complaints.join('\n'), /refused/);
});

// ── where a save may land ──────────────────────────────────────────────────

test('a commit is not a branch, and the default branch takes a pull request', () => {
  const so = base();
  assert.equal(S.saveTarget(so, 'claude/some-work').ref, 'claude/some-work');
  assert.equal(S.saveTarget(so, 'main').ref, null);
  assert.match(S.saveTarget(so, 'main').why, /pull request/);
  assert.equal(S.saveTarget(so, '').ref, null);
  assert.equal(S.saveTarget(so, 'bfec884').ref, null);
  assert.match(S.saveTarget(so, 'bfec884').why, /commit/);
  assert.equal(S.saveTarget(so, 'a'.repeat(40)).ref, null);
  // A repo whose default is not main says so through the caller, not a guess.
  assert.equal(S.saveTarget(so, 'main', 'trunk').ref, 'main');
  assert.equal(S.saveTarget(so, 'trunk', 'trunk').ref, null);
});

test('a standoff with no address of its own cannot be saved anywhere', () => {
  const so = base(); delete so.self;
  assert.equal(S.saveTarget(so, 'claude/some-work').ref, null);
  assert.match(S.saveTarget(so, 'claude/some-work').why, /no address of its own/);
});

test('the commit message states the judgments, not the result', () => {
  assert.deepEqual(S.describe([
    { op: 'split', uid: 'u-001', at: 15 },
    { op: 'merge', uid: 'u-002' },
    { op: 'relabel', uid: 'u-001b', label: 'WHY-MOT' },
    { op: 'note', uid: 'u-001a', text: 'x' },
    { op: 'note', uid: 'u-001a', text: '' },
  ]), ['split u-001 at 15', 'merge u-002 with its successor',
       'relabel u-001b WHY-MOT', 'note u-001a', 'note u-001a (cleared)']);
});

// EVERY OP, BECAUSE THE TWO THAT WERE MISSING BOTH CAME OUT WRONG. The four
// above were the whole of this test, so `verdict` went undescribed and `shift`
// rendered as "note undefined (cleared)": the chain that used to be here ended
// in a default that read `uid`, and a boundary op has none. The commit message
// is the patch's only surviving record, so it stated the opposite of what
// happened. Enumerated against the op table, so adding an op without a
// sentence fails here rather than in a commit nobody re-reads.
test('every operation the kit accepts has a sentence, including both boundary ops', () => {
  assert.deepEqual(S.describe([
    { op: 'shift', after: 'u-001', to: 30 },
    { op: 'verdict', uid: 'u-002', verdict: 'DROP' },
    { op: 'insert', after: 'u-001', text: 'a new sentence.' },
    { op: 'insert', after: null, text: 'a lead sentence.' },
    { op: 'insert', after: 'u-001', text: '' },
  ]), ['shift the boundary after u-001 to 30',
       'u-002 DROP',
       'insert at the boundary after u-001',
       'insert at the head of the document',
       'insert at the boundary after u-001 (cleared)']);

  // The shape rides in the sentence because it changes what the projection
  // does: two insertions with the same text and different shapes are two
  // different edits, and the commit message is the only record that survives.
  assert.deepEqual(S.describe([
    { op: 'insert', after: 'u-002', text: 'a closing paragraph.', as: 'block' },
  ]), ['insert at the boundary after u-002 as a block']);

  const undescribed = Object.keys(S.ops).filter(op => /undescribed/.test(S.describe([{ op }])[0]));
  assert.deepEqual(undescribed, [], 'operations the commit message cannot state');
});

// ── the bytes, against the stored run ──────────────────────────────────────

test('serialize reproduces the committed file exactly', () => {
  // The other writer is tools/build/audit-payload.py. Neither may reformat the
  // other's file, or every real change arrives inside a whole-file diff.
  const p = 'skills/state-the-rule/runs/2026-08-29-conventions/standoff.json';
  const raw = readFileSync(path.join(repoRoot, p), 'utf8');
  assert.equal(S.serialize(JSON.parse(raw)), raw);
});

test('the stored run passes its own invariants through the kit', () => {
  const so = JSON.parse(readFileSync(path.join(repoRoot,
    'skills/state-the-rule/runs/2026-08-29-conventions/standoff.json'), 'utf8'));
  const text = readFileSync(path.join(repoRoot, so.target.path), 'utf8');
  assert.deepEqual(S.check(so, text), []);
});

// ── ONE STRING, TWO WAYS TO INDEX IT ─────────────────────────────────────────
// Python indexes by code point, JavaScript by UTF-16 code unit, so an astral
// character is one index in segment.py and two here. The failure is silent: the
// spans still resolve, they resolve to the wrong text, and every check passes
// over the wrong span. Held here because nothing else can see it: the invariants
// are about the partition, and a shifted partition is still a partition.

const EMOJI = 'Plain. 🥏 Toss it. 📦 Publish.';

test('a document with no astral character maps to itself, in both directions', () => {
  const so = { units: [{ uid: 'u-1', start: 0, end: 42 }, { uid: 'u-2', start: 44, end: 59 }] };
  assert.deepEqual(S.adopt(so, DOC).units, so.units);
  assert.deepEqual(S.emit(so, DOC).units, so.units);
});

test('an adopted span is the text segment.py recorded, not one shifted by the emoji before it', () => {
  const cp = [...EMOJI];
  // The spans as Python counts them, which is what segment.py would write.
  const spans = [[0, 6], [7, 18], [19, 28]];
  const so = { units: spans.map(([start, end], i) => ({ uid: `u-${i}`, start, end })) };
  const browser = S.adopt(so, EMOJI);
  assert.deepEqual(browser.units.map(u => EMOJI.slice(u.start, u.end)),
                   spans.map(([a, b]) => cp.slice(a, b).join('')));
  // Reading the stored offsets directly is the defect this replaces.
  assert.notEqual(EMOJI.slice(7, 18), cp.slice(7, 18).join(''),
    'without the conversion the browser reads a different span');
});

test('every offset in the document round-trips, and one inside a pair snaps to its start', () => {
  const n = [...EMOJI].length;
  const drift = [];
  for (let a = 0; a <= n; a++) {
    const back = S.emit(S.adopt({ units: [{ uid: 'u', start: a, end: n }] }, EMOJI), EMOJI);
    if (back.units[0].start !== a) drift.push([a, back.units[0].start]);
  }
  assert.deepEqual(drift, [], 'code-point offsets that did not survive the round trip');

  // The low half of a surrogate pair is the one UTF-16 index with no code-point
  // counterpart. It is not a place a boundary can be, since it would cut one
  // character in half, so it snaps to the character's start rather than to the
  // next one, which would be a different character.
  const pair = EMOJI.indexOf('\u{1F94F}');
  assert.equal(S.emit({ units: [{ uid: 'u', start: pair + 1, end: EMOJI.length }] }, EMOJI)
                .units[0].start,
               S.emit({ units: [{ uid: 'u', start: pair, end: EMOJI.length }] }, EMOJI)
                .units[0].start);
});

// A patch carries offsets too, and it is read by ops.py, so it converts on the
// way out. An insertion carries none: it is anchored by uid, which is keying by
// uid rather than by offset paying off a second time.
test('a patch converts its offsets and leaves an insertion alone', () => {
  const patch = [{ op: 'split', uid: 'u-1', at: 12 },
                 { op: 'shift', after: 'u-0', to: 20 },
                 { op: 'insert', after: 'u-0', text: 'no offset to convert' },
                 { op: 'relabel', uid: 'u-1', label: 'WHAT' }];
  const out = S.emitPatch(patch, EMOJI);
  assert.equal(out[0].at, 11, 'one astral character before it');
  assert.equal(out[1].to, 18, 'two');
  assert.deepEqual(out[2], patch[2]);
  assert.deepEqual(out[3], patch[3]);
});

// ── THE PROJECTION, AGAINST THE PYTHON THAT OWNS IT ──────────────────────────
// materialize() and skills/state-the-rule/materialize.py are the same edit in
// two languages, so the assertion is byte equality on the projected document
// and key equality on the account, over fixtures covering every shape that
// executes: a DROP, a head insertion anchored to nothing, a block insertion
// read off a blank-line gap, and a run insertion that overrules the reading.
//
// The one place the two could drift is the whitespace tally, since Python's \s
// and JavaScript's \s do not match the same character set at the edges. These
// fixtures stay on ASCII whitespace, so what is held here is the projection
// rather than a claim that the two regex engines agree everywhere.

const MDOC = 'First rule here.\n\nSecond rule, which goes.\n\nThird rule stands.\n';
const mat = (units, insertions) => ({
  kind: 'standoff/1',
  self: { repo: 'o/r', path: 'runs/x/standoff.json' },
  target: { path: 'doc.md' },
  vocabulary: [{ label: 'WHAT', side: 'declaration' }],
  units, ...(insertions ? { insertions } : {}),
});
// Offsets counted once, by hand, off MDOC.
const MUNITS = [
  { uid: 'm-1', start: 0, end: 16, kind: 'sent', words: 3, label: 'WHAT' },
  { uid: 'm-2', start: 18, end: 41, kind: 'sent', words: 4, label: 'WHAT' },
  { uid: 'm-3', start: 43, end: 61, kind: 'sent', words: 3, label: 'WHAT' },
];

function viaPython(so, text) {
  const dir = mkdtempSync(path.join(tmpdir(), 'mat-'));
  try {
    writeFileSync(path.join(dir, 'so.json'), JSON.stringify(so));
    writeFileSync(path.join(dir, 'doc.md'), text);
    const json = execFileSync('python3',
      [path.join(repoRoot, 'skills/state-the-rule/materialize.py'),
       path.join(dir, 'so.json'), path.join(dir, 'doc.md'),
       '--json', '--out', path.join(dir, 'out.md')],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { out: readFileSync(path.join(dir, 'out.md'), 'utf8'), report: JSON.parse(json) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const CASES = {
  'a DROP removes its span and counts its words': [
    MUNITS.map(u => u.uid === 'm-2' ? { ...u, verdict: 'DROP' } : u), null],
  'a head insertion anchored to nothing arrives as a block': [
    MUNITS, [{ after: null, text: 'A new opening.' }]],
  'an insertion at a blank-line gap is read as a block': [
    MUNITS, [{ after: 'm-1', text: 'Placed between rules.' }]],
  'a stated shape overrules the gap the document holds': [
    MUNITS, [{ after: 'm-1', text: 'joined on', as: 'run' }]],
  'REWRITE and MOVE stand, and are reported by uid': [
    MUNITS.map(u => u.uid === 'm-1' ? { ...u, verdict: 'REWRITE' }
                  : u.uid === 'm-3' ? { ...u, verdict: 'MOVE' } : u), null],
  'a drop and an insertion in one pass do not disturb each other': [
    MUNITS.map(u => u.uid === 'm-2' ? { ...u, verdict: 'DROP' } : u),
    [{ after: 'm-1', text: 'Standing in for it.' }]],
};

for (const [name, [units, insertions]] of Object.entries(CASES)) {
  test(`materialize: ${name}`, () => {
    const so = mat(units, insertions);
    const js = S.materialize(so, MDOC);
    const py = viaPython(so, MDOC);
    assert.equal(js.out, py.out, 'the projected document');
    assert.deepEqual(js.report, py.report, 'the account of what ran');
  });
}

test('materialize leaves the annotation it was given untouched', () => {
  const so = mat(MUNITS.map(u => u.uid === 'm-2' ? { ...u, verdict: 'DROP' } : u),
                 [{ after: 'm-1', text: 'Added.' }]);
  const before = JSON.stringify(so);
  S.materialize(so, MDOC);
  assert.equal(JSON.stringify(so), before);
});

test('an insertion anchored to a uid the units do not carry is skipped, not thrown', () => {
  const so = mat(MUNITS, [{ after: 'm-99', text: 'orphan' }]);
  assert.equal(S.materialize(so, MDOC).out, MDOC);
});

// ── WHICH SIDE OF A MERGE SURVIVES ───────────────────────────────────────────
// The joined span is the same either way; what differs is whose judgment it
// carries. Held here because the difference is invisible in the offsets, which
// is exactly how it would rot.

test('a merge keeps the left unit by default, span and judgment both', () => {
  const so = base();
  so.units[1].label = 'WHY-MOT';
  so.units[1].verdict = 'DROP';
  const uid = S.ops.merge(so, DOC, { uid: 'u-001' });
  assert.equal(uid, 'u-001');
  assert.equal(so.units.length, 1);
  assert.deepEqual([so.units[0].start, so.units[0].end], [0, 59]);
  assert.equal(so.units[0].label, 'WHAT');
  assert.equal(so.units[0].verdict, undefined);
});

test("keep:'right' joins the pair into the later unit instead", () => {
  const so = base();
  so.units[1].label = 'WHY-MOT';
  so.units[1].verdict = 'DROP';
  const uid = S.ops.merge(so, DOC, { uid: 'u-001', keep: 'right' });
  assert.equal(uid, 'u-002');
  assert.equal(so.units.length, 1);
  // The same span: the survivor's identity moved, its extent did not.
  assert.deepEqual([so.units[0].start, so.units[0].end], [0, 59]);
  assert.equal(so.units[0].label, 'WHY-MOT');
  assert.equal(so.units[0].verdict, 'DROP');
  assert.deepEqual(S.check(so, DOC), []);
});

test('either side survives with the same provenance, since one boundary went', () => {
  const l = base(), r = base();
  S.ops.merge(l, DOC, { uid: 'u-001' });
  S.ops.merge(r, DOC, { uid: 'u-001', keep: 'right' });
  assert.equal(l.units[0].from, 'merge:u-001+u-002');
  assert.equal(r.units[0].from, l.units[0].from);
});

test('merge and the Python that owns it agree on both sides', () => {
  for (const keep of ['left', 'right']) {
    const so = base();
    so.units[1].label = 'WHY-MOT';
    so.units[1].verdict = 'DROP';
    const dir = mkdtempSync(path.join(tmpdir(), 'merge-'));
    try {
      writeFileSync(path.join(dir, 'so.json'), JSON.stringify(so));
      writeFileSync(path.join(dir, 'doc.md'), DOC);
      writeFileSync(path.join(dir, 'patch.json'),
        JSON.stringify([{ op: 'merge', uid: 'u-001', keep }]));
      execFileSync('python3', [path.join(repoRoot, 'skills/state-the-rule/ops.py'),
                               path.join(dir, 'so.json'), path.join(dir, 'patch.json'),
                               path.join(dir, 'doc.md'), '--write'],
                   { cwd: repoRoot, stdio: ['ignore', 'ignore', 'pipe'] });
      const py = JSON.parse(readFileSync(path.join(dir, 'so.json'), 'utf8'));
      const js = base();
      js.units[1].label = 'WHY-MOT';
      js.units[1].verdict = 'DROP';
      S.ops.merge(js, DOC, { uid: 'u-001', keep });
      assert.deepEqual(js.units, py.units, `keep:'${keep}'`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});
