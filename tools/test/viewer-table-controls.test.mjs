// The table mode's controls live in the VIEWER'S HEADER, not in a strip of
// their own.
//
// The strip was two idioms for one job: a labelled checkbox ("Header filters")
// sitting under a row of icon buttons, costing a band of a phone screen to say
// one thing. Moving both controls up means the content box is the table and
// nothing else, and it means a mode can contribute chrome at all, which is what
// ctx.controls is.
//
// What the cases hold is the part that fails silently. A mode mounts from
// inside a requestAnimationFrame, so two rapid switches interleave (clear,
// clear, append, append) and the row grows a second funnel and a second deck;
// the sequence token is what stops it, and nothing about a duplicated button
// throws. The toggle's own contract is here too, since an icon has to say its
// state in the mark: a checkbox carries a word and a glyph cannot.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/swipe-deck.js'), 'utf8'))();
// viewer.js registers an Alpine component on alpine:init; only ViewRegistry is
// under test, and it is assigned at module scope, so a stub Alpine is enough.
window.Alpine = { data: () => {} };
new window.Function(readFileSync(path.join(repoRoot, 'lib/alpineComponents/viewer.js'), 'utf8'))();
const R = window.ViewRegistry;

// A Tabulator at exactly the depth the mount uses it.
const fakeTable = (rows = [{ a: 1 }, { a: 2 }]) => {
  const handlers = {};
  return {
    on: (ev, fn) => { (handlers[ev] ||= []).push(fn); },
    fire: async (ev) => { for (const fn of handlers[ev] || []) await fn(); },
    getRows: () => rows.map(d => ({ getData: () => d })),
    getColumns: () => [{ getField: () => 'a', isVisible: () => true,
                         getDefinition: () => ({ title: 'A' }) }],
    redraw: () => {},
    scrollToRow: () => Promise.resolve(),
  };
};
const slotOf = () => {
  const s = window.document.createElement('span');
  window.document.body.append(s);
  return s;
};
// The two buttons order their classes differently (the header helper appends
// the glyph, swipeDeck.entry leads with it), so pull the ph-* token out rather
// than reading a position.
const glyph = (i) => i.className.split(' ').find(c => c.startsWith('ph-')) || '';
const icons = (slot) => [...slot.querySelectorAll('button i')].map(glyph);

test('the filter toggle says its state in the glyph, and flips both', () => {
  const slot = slotOf(), target = window.document.createElement('div');
  target.innerHTML = '<div class="tabulator-header-filter"></div>';
  R.mountTableControls(slot, fakeTable(), target, { name: 'rows.csv' });

  const btn = slot.querySelector('button');
  assert.equal(glyph(btn.querySelector('i')), 'ph-funnel');
  assert.equal(btn.title, 'Hide the header filters');

  btn.dispatchEvent(new window.Event('click'));
  assert.equal(glyph(btn.querySelector('i')), 'ph-funnel-x',
    'an icon has to carry the state a checkbox carried in a word');
  assert.equal(btn.title, 'Show the header filters', 'and the tooltip says where a tap goes');
  assert.equal(target.querySelector('.tabulator-header-filter').style.display, 'none');

  btn.dispatchEvent(new window.Event('click'));
  assert.equal(target.querySelector('.tabulator-header-filter').style.display, '');
});

test('a second mount supersedes the first rather than stacking on it', async () => {
  const slot = slotOf(), target = window.document.createElement('div');
  const t1 = fakeTable(), t2 = fakeTable();
  // Both mounts run before either table finishes building, which is the
  // interleaving switchMode's own clear cannot see.
  R.mountTableControls(slot, t1, target, { name: 'a.csv' });
  R.mountTableControls(slot, t2, target, { name: 'b.csv' });
  assert.equal(slot.querySelectorAll('button').length, 1, 'one funnel, not two');

  await t1.fire('tableBuilt');
  assert.deepEqual(icons(slot), ['ph-funnel'],
    'the superseded mount does not add its deck button on waking');

  await t2.fire('tableBuilt');
  assert.deepEqual(icons(slot), ['ph-funnel', 'ph-cards-three'],
    'the live mount does');
});

test('an empty table offers a filter toggle and no deck', async () => {
  const slot = slotOf(), target = window.document.createElement('div');
  const t = fakeTable([]);
  R.mountTableControls(slot, t, target, { name: 'empty.csv' });
  await t.fire('tableBuilt');
  assert.deepEqual(icons(slot), ['ph-funnel'], 'nothing to read is not a button');
});

test('the deck entry wears the header row, not the Branch-detail emphasis', async () => {
  const slot = slotOf(), target = window.document.createElement('div');
  const t = fakeTable();
  R.mountTableControls(slot, t, target, { name: 'rows.csv' });
  await t.fire('tableBuilt');
  const deck = slot.querySelectorAll('button')[1];
  assert.match(deck.className, /btn-ghost/, 'ghost here: the file is the subject, the deck is one lens');
  assert.doesNotMatch(deck.className, /btn-sm/, 'and full size, to sit with copy and mode');
  assert.equal(deck.title, 'Read 2 records one at a time', 'same wording as every other door');
});
