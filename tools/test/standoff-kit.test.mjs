// lib/kits/standoff.js — the standoff's rules as a browser runs them.
//
// skills/state-the-rule/ops.py is the same rules in Python and is the authority
// that writes; tools/render/scenarios/audit-edit.mjs diffs the two over one
// patch end to end. What is held here is the half a comparison cannot show: the
// refusals. A patch that half-applies, a label off the vocabulary, a merge that
// keeps a kind it no longer describes, a save aimed at a commit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('a merge across two kinds reports mixed, not one of them', () => {
  const b = base(); b.units[1].kind = 'heading';
  const { so } = S.apply(b, [{ op: 'merge', uid: 'u-001' }], DOC);
  assert.equal(so.units.length, 1);
  assert.equal(so.units[0].kind, 'mixed');
  assert.equal(so.units[0].end, 59, 'the survivor covers both spans');
  assert.equal(so.units[0].from, 'merge:u-001+u-002');
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
