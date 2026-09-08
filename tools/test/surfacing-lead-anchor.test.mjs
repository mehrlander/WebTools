// A Surfacing card points at the bullet it paraphrases, and the anchor holds.
//
// docs/surfacing.csv's `lead` is the bold lead-in of a bullet in SURFACING.md,
// and surfacing-manifest.test.mjs already holds that membership both ways. What
// it cannot say is whether the key SURVIVES RENDERING, which is the only form
// the Map view's card ever meets it in: the card calls findLead() against the
// deck slide's DOM, not against the file.
//
// The gap between those two is a real one and it is exactly one selector wide.
// The primitives are a LOOSE list, so marked wraps each item's content in a <p>
// and the lead-in is `li > p > strong:first-child`. Driven against the real app
// on 2026-09-04 the tight `li > strong:first-child` matched 0 of 22 and read as
// a join that did not exist. Nothing in the file can show that; only the render
// can, which is why this test renders.
//
// It is browser-free: marked plus jsdom, the same two the slide uses, so it
// stays inside `npm test` rather than joining the Playwright checks.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import { parseCsv } from '../build/registries-load.mjs';
import { repoRoot } from './bootstrap.mjs';

const leads = parseCsv(readFileSync(path.join(repoRoot, 'docs', 'surfacing.csv'), 'utf8'))
  .map(r => r.lead);
const doc = ['SURFACING.md', 'surfacing-extended.md']
  .map(f => readFileSync(path.join(repoRoot, 'docs', f), 'utf8')).join('\n\n');

// The component's own two functions, copied here rather than imported: map.js
// is an Alpine component that needs a browser realm to evaluate, and the rule
// these encode is four lines long. map-view.test.mjs mounts the component and
// asserts the same behaviour through it; this file asserts the CORPUS, which is
// the half that changes when someone edits the doc.
const leadKey = (s) => String(s || '').replace(/[:.]\s*$/, '').trim();
const SEL = 'li > p > strong:first-child, li > strong:first-child';

const { window } = new JSDOM('<!doctype html><body><div id="box"></div></body>');
const box = window.document.getElementById('box');
box.innerHTML = marked.parse(doc);

test('every card in the index resolves to a bullet in the rendered doc', () => {
  const found = new Map([...box.querySelectorAll(SEL)].map(el => [leadKey(el.textContent), el]));
  const missed = leads.filter(l => !found.has(leadKey(l)));
  assert.deepEqual(missed, [],
    'a card whose title tap would open the doc and highlight nothing');
  assert.ok(leads.length > 10, 'the index was read, and is not empty');
});

test('the anchor is the list item, since that is what gets marked', () => {
  // markLead() tints el.closest('li'). A lead-in that rendered outside a list
  // would resolve and then have nothing to mark.
  for (const lead of leads) {
    const el = [...box.querySelectorAll(SEL)].find(e => leadKey(e.textContent) === leadKey(lead));
    assert.ok(el.closest('li'), lead + ': the lead-in is not inside a list item');
  }
});

test('a normalized key still tells the primitives apart', () => {
  // The whole join rests on the key being unique after normalization. Two
  // bullets differing only by a trailing stop would make one card open the
  // other's paragraph, which is worse than no link at all.
  const keys = leads.map(leadKey);
  assert.equal(new Set(keys).size, keys.length, 'two rows normalize to one key');
});

test('the loose-list shape is what the selector is for', () => {
  // Stated as a case rather than as a comment: this is the measurement that
  // sent the first selector back, and a future edit that tightens the list
  // should fail here loudly rather than silently changing which form works.
  const tight = new Set([...box.querySelectorAll('li > strong:first-child')]
    .map(el => leadKey(el.textContent)));
  const wrapped = new Set([...box.querySelectorAll('li > p > strong:first-child')]
    .map(el => leadKey(el.textContent)));
  const hit = (set) => leads.filter(l => set.has(leadKey(l))).length;
  assert.equal(hit(tight), 0, 'the primitives are a loose list, so none is a bare <li><strong>');
  assert.equal(hit(wrapped), leads.length, 'and all of them are <li><p><strong>');
});
