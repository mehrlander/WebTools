// lib/kits/chat-render.js — a wide markdown table scrolls inside its own box
// rather than widening the column it sits in.
//
// Regression origin: an assistant reply carrying a six-column table pushed a
// whole deck slide past the viewport on a phone. That is worse than it looks,
// and swipe-deck.js says why in its own notes: go() and active() compute in
// units of `track.clientWidth`, so the moment any slide is wider than the
// track, every index past it is wrong and the pager scrolls to an offset that
// lands mid-card. A table is the one markdown element that can do this, since
// its intrinsic min-content width (the longest unbreakable run in each column)
// is a floor no ancestor can shrink below.
//
// These assert the shipped module against a jsdom document. What they cannot
// assert is layout: jsdom computes no widths, so "it scrolls" is measured in a
// real browser instead (tools/render/screenshot.mjs, 2026-08-09: table 863px
// inside a 382px box, slide 430px against a 430px track). What is pinned here
// is the structure that makes the scrolling possible at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, makeWindow } from './bootstrap.mjs';

const { window } = makeWindow();
// A marked stub that emits one real table, so the wrapper has something to
// find. These tests assert what chat-render does with a table, not what marked
// does with pipes.
const TABLE = '<p>before</p><table><thead><tr><th>a</th></tr></thead>'
            + '<tbody><tr><td>1</td></tr></tbody></table><p>after</p>';
const marked = { lexer: md => [{ type: 'paragraph', text: md }], parser: () => TABLE, parse: () => TABLE };
globalThis.marked = window.marked = marked;
for (const k of ['addEventListener', 'removeEventListener', 'history', 'location'])
  globalThis[k] = typeof window[k] === 'function' ? window[k].bind(window) : window[k];
new Function('window', 'document', readFileSync(path.join(repoRoot, 'lib/kits/swipe-deck.js'), 'utf8'))(window, window.document);
globalThis.swipeDeck = window.swipeDeck;
new Function('window', 'document', readFileSync(path.join(repoRoot, 'lib/kits/chat-render.js'), 'utf8'))(window, window.document);
const cr = window.chatRender;

test('a table is wrapped in its own horizontal scroll box', () => {
  const el = cr.markdown('anything');
  const t = el.querySelector('table');
  assert.ok(t, 'the fixture produced a table');
  assert.equal(t.parentElement.tagName, 'DIV');
  assert.match(t.parentElement.className, /overflow-x-auto/);
});

test('the wrapper is capped at the width it is given', () => {
  // Without max-w-full the box itself can be widened by its content, which
  // moves the overflow up a level instead of containing it.
  const t = cr.markdown('anything').querySelector('table');
  assert.match(t.parentElement.className, /max-w-full/);
});

test('the table keeps its place in the flow, and the prose around it', () => {
  // replaceWith, not append: a table lifted to the end of the run would read
  // after prose that introduced it.
  const el = cr.markdown('anything');
  const kids = [...el.querySelector('div').children].map(n => n.tagName);
  assert.deepEqual(kids, ['P', 'DIV', 'P']);
});

test('the table is NOT forced to max-content', () => {
  // Typography sets `width: 100%`, which wraps cells; forcing max-content here
  // would make every prose-heavy table scroll rather than wrap, which is the
  // wrong trade for the common case. Only a table that genuinely cannot fit
  // should start scrolling.
  const t = cr.markdown('anything').querySelector('table');
  assert.equal(t.style.minWidth, '');
  assert.doesNotMatch(t.parentElement.className, /min-w-max|w-max/);
});

test('prose with no table is left alone', () => {
  marked.parser = () => '<p>just prose</p>';
  const el = cr.markdown('anything');
  assert.equal(el.querySelectorAll('.overflow-x-auto').length, 0, 'no wrapper minted');
  marked.parser = () => TABLE;
});
