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

test('applying does not touch the annotation it was given', () => {
  const b = base();
  S.apply(b, [{ op: 'split', uid: 'u-001', at: 15 }], DOC);
  assert.equal(b.units.length, 2, 'apply works on a copy; the caller decides to adopt it');
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
