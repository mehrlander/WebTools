// lib/shorter-merge.js: putting N independent shortenings of one document onto
// a single surface. The load-bearing claims are that the original stays the
// frame (so "what does version C say here" is always answerable), that regions
// grow to the size of the actual disagreement, and that identical wordings
// collapse into one option rather than N buttons that read alike.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { repoRoot } from './bootstrap.mjs';

const require = createRequire(import.meta.url);
const { diffWordsWithSpace } = require('diff');

const win = {};
new Function('window', readFileSync(path.join(repoRoot, 'lib/shorter-merge.js'), 'utf8')).call(win, win);
const { opsFor, regionsFrom, absorbGaps, textForRegion, optionsFor, build } = win.ShorterMerge;

const D = diffWordsWithSpace;
const P = (label, text) => ({ label, text });
// Every option's text, in the order the surface will show them.
const texts = (seg) => seg.options.map(o => o.text);
const labels = (seg) => seg.options.map(o => o.label);
const assembled = (segs) => segs.map(s => s.kind === 'equal' ? s.text : s.options.find(o => o.id === s.selected).text).join('');

test('ops cover the original contiguously and rebuild the proposal', () => {
  const a = 'the quick brown fox jumps over the lazy dog';
  const b = 'the quick fox leaps over the dog';
  const ops = opsFor(a, b, D);
  assert.equal(ops[0].a, 0, 'coverage starts at 0');
  assert.equal(ops[ops.length - 1].b, a.length, 'and ends at the end of the original');
  for (let i = 1; i < ops.length; i++) assert.equal(ops[i].a, ops[i - 1].b, 'no gaps between ops');
  assert.equal(ops.map(o => o.s).join(''), b, 'concatenating the emissions rebuilds the proposal');
});

test('an unchanged op carries the original slice verbatim', () => {
  const a = 'alpha beta gamma';
  for (const op of opsFor(a, 'alpha gamma', D)) {
    if (!op.change) assert.equal(op.s, a.slice(op.a, op.b));
  }
});

test('a pure insertion is a zero-width op, not a phantom deletion', () => {
  const ops = opsFor('a c', 'a b c', D);
  const ins = ops.filter(o => o.change);
  assert.equal(ins.length, 1);
  assert.equal(ins[0].a, ins[0].b, 'nothing in the original was consumed');
  assert.ok(ins[0].s.includes('b'));
});

test('an identical proposal produces no regions at all', () => {
  const a = 'nothing here changes';
  assert.deepEqual(regionsFrom([opsFor(a, a, D)]), []);
  assert.deepEqual(build(a, [P('Same', a)], D).map(s => s.kind), ['equal']);
});

test('touching intervals from different versions merge into one region', () => {
  // Two versions editing adjacent words must not become two decisions the
  // reader has to make separately; the disagreement is one place.
  const regions = regionsFrom([[{ a: 4, b: 9, change: true }], [{ a: 9, b: 14, change: true }]]);
  assert.deepEqual(regions, [[4, 14]]);
});

test('separated intervals stay separate regions', () => {
  const regions = regionsFrom([[{ a: 0, b: 3, change: true }], [{ a: 20, b: 25, change: true }]]);
  assert.deepEqual(regions, [[0, 3], [20, 25]]);
});

test('textForRegion answers for a version that never touched the region', () => {
  // The whole point of anchoring on the original: a version that left this
  // span alone still has an answer for it, and the answer is the original.
  const a = 'one two three four five';
  const ops = opsFor(a, 'one two three four', D);   // only the tail changed
  assert.equal(textForRegion(ops, 0, 7), a.slice(0, 7));
});

test('a light edit gives a word-sized region; a wholesale rewrite gives a big one', () => {
  const a = 'The committee postponed the vote. The timeline was too aggressive.';
  const light = build(a, [P('Light', a.replace('postponed', 'delayed'))], D);
  const heavy = build(a, [P('Heavy', 'They put it off. Too fast.')], D);
  const lightRegion = light.find(s => s.kind === 'choice');
  const heavyRegion = heavy.find(s => s.kind === 'choice');
  assert.ok(lightRegion.b - lightRegion.a < 15, 'a swapped word stays a small region');
  assert.ok(heavyRegion.b - heavyRegion.a > 40, 'a rewrite of the whole passage is one big region');
  assert.equal(heavy.filter(s => s.kind === 'choice').length, 1, 'and it is a single decision');
});

test('gap absorption is what keeps a rewrite from shattering into false choices', () => {
  // Without it, two people rewriting one sentence from scratch still coincide
  // on "the" and "too", and the word diff reports six adjacent decisions
  // strung together by single spaces.
  const a = 'The committee postponed the vote. The timeline was too aggressive.';
  const raw = build(a, [P('Heavy', 'They put it off. Too fast.')], D, { gap: -1 });
  assert.ok(raw.filter(s => s.kind === 'choice').length >= 5, 'the unabsorbed diff really does shatter');
});

test('absorption never crosses a paragraph break', () => {
  // Measured by non-space characters a blank line is a gap of zero, so without
  // an explicit stop a decision at the end of one paragraph annexes the start
  // of the next and the reader adjudicates across a structural boundary.
  const a = 'The vote was postponed.\n\nSeveral participants objected loudly.';
  const b = 'The vote slipped.\n\nSeveral objected.';
  const segs = build(a, [P('V', b)], D);
  for (const seg of segs.filter(s => s.kind === 'choice')) {
    assert.ok(!/\n[ \t]*\n/.test(seg.options[0].text),
      'a decision spans a paragraph break: ' + JSON.stringify(seg.options[0].text));
  }
  assert.ok(segs.filter(s => s.kind === 'choice').length >= 2, 'the two paragraphs decide separately');
  assert.equal(assembled(segs), a, 'and it still reassembles');
});

test('absorption stops at a gap of real prose', () => {
  const src = 'aa bbbb this gap is clearly long enough to be left alone cccc dd';
  const regions = absorbGaps([[0, 2], [3, 7], [57, 61], [62, 64]], src);
  assert.deepEqual(regions, [[0, 7], [57, 64]], 'two clusters, not one region and not four');
});

test('versions that agree on a wording collapse into one option', () => {
  const a = 'the quick brown fox';
  const segs = build(a, [P('A', 'the fox'), P('B', 'the fox'), P('C', 'the brown fox')], D);
  const seg = segs.find(s => s.kind === 'choice');
  assert.equal(seg.options.length, 3, 'original, the agreed cut, and C');
  assert.ok(labels(seg).includes('A, B'), 'the agreeing versions share one button: ' + labels(seg));
});

test('a version that left a region alone is folded into the original option', () => {
  // Otherwise four versions produce four buttons at every region, three of
  // them reading exactly like the original.
  const a = 'alpha beta gamma delta';
  const segs = build(a, [P('Cutter', 'alpha gamma delta'), P('Bystander', a)], D);
  const seg = segs.find(s => s.kind === 'choice');
  assert.equal(seg.options.length, 2, 'two real choices, not three');
  assert.deepEqual(seg.options[0].agreed, ['Bystander'], 'and the agreement is recorded, not lost');
});

test('options run original first, then longest to shortest', () => {
  const a = 'one two three four five six';
  const segs = build(a, [P('Mid', 'one two five six'), P('Short', 'one six')], D);
  const seg = segs.find(s => s.kind === 'choice');
  assert.equal(seg.options[0].id, 'original');
  const lens = texts(seg).map(t => t.trim().split(/\s+/).filter(Boolean).length);
  const tail = lens.slice(1);
  assert.deepEqual(tail, [...tail].sort((x, y) => y - x), 'a severity ramp: ' + JSON.stringify(lens));
});

test('every option keeps a palette index so a version holds one colour', () => {
  const segs = build('a b c d', [P('X', 'a c d'), P('Y', 'a b d')], D);
  for (const seg of segs.filter(s => s.kind === 'choice')) {
    for (const o of seg.options) {
      assert.equal(typeof o.vi, 'number');
      assert.ok(o.isOriginal ? o.vi === -1 : o.vi >= 0);
    }
  }
});

test('selecting the original everywhere reassembles the document byte for byte', () => {
  const a = 'The quick brown fox jumps over the lazy dog.\n\nA second paragraph, longer than it needs to be.\n';
  const segs = build(a, [P('A', 'The fox jumps over the dog.\n\nA second paragraph.\n'), P('B', 'A fox jumped.\n')], D);
  assert.equal(assembled(segs), a, 'default selection is the original, and it is lossless');
});

test('selecting one version everywhere reproduces that version exactly', () => {
  // The sidebar offers "apply this version throughout"; it has to land on the
  // version as written, or the wholesale comparison is a lie.
  const a = 'one two three four five six seven eight';
  const vA = 'one three four six seven eight';
  const vB = 'one two four five eight';
  const segs = build(a, [P('A', vA), P('B', vB)], D);
  for (const seg of segs) {
    if (seg.kind !== 'choice') continue;
    const hit = seg.options.find(o => o.agreed.includes('A'));
    seg.selected = hit ? hit.id : seg.options[0].id;
  }
  assert.equal(assembled(segs), vA);
});

test('a deleted passage renders as an empty option, not a dropped region', () => {
  const a = 'keep this. cut this entirely. keep this too.';
  const segs = build(a, [P('Cut', 'keep this. keep this too.')], D);
  const seg = segs.find(s => s.kind === 'choice');
  assert.ok(seg, 'the deletion is still a decision point');
  assert.ok(texts(seg).some(t => t.trim() === ''), 'and one of its options is nothing');
});

test('no proposals, or an empty original, yields nothing to adjudicate', () => {
  assert.deepEqual(build('text', [], D), []);
  assert.deepEqual(build('', [P('A', 'x')], D), []);
  assert.deepEqual(build('text', [{ label: 'bad' }], D), [], 'a version with no text is skipped');
});

test('a real bundle aligns: several versions of one document stay reassemblable', () => {
  // The end-to-end shape the page actually loads, through the payload reader
  // that materializes block-keyed versions. Anchoring on the original has to
  // survive independently written shortenings that disagree about where to cut.
  const bundle = JSON.parse(readFileSync(path.join(repoRoot, 'data/shortenings/example-committee.json'), 'utf8'));
  const winP = {};
  new Function('window', readFileSync(path.join(repoRoot, 'lib/shorter-payload.js'), 'utf8')).call(winP, winP);
  const p = winP.ShorterPayload.read(JSON.stringify(bundle));
  assert.equal(p.proposals.length, 3);

  const segs = build(p.original, p.proposals, D);
  assert.equal(assembled(segs), p.original, 'original-everywhere is still the document');

  for (const v of p.proposals) {
    for (const seg of segs) {
      if (seg.kind !== 'choice') continue;
      const hit = seg.options.find(o => o.agreed.includes(v.label));
      seg.selected = hit ? hit.id : seg.options[0].id;
    }
    assert.equal(assembled(segs), v.text, `applying "${v.label}" throughout reproduces it`);
  }

  const choices = segs.filter(s => s.kind === 'choice');
  assert.ok(choices.length >= 3, 'each rewritten paragraph is its own decision, got ' + choices.length);
  assert.ok(choices.some(s => s.options.length > 2), 'and at least one has more than a two-way choice');
});
