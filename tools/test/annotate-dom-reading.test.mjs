// The card's fourth reading: the DOM under the note, and what contains it.
//
// This is the one reading that is NOT of the set, so the tests here are mostly
// about SUBJECT resolution: which node the pane is talking about, and what it
// says when there is no answer. jsdom has no layout, so the box line is zeros
// and nothing asserts geometry; the pixels are driven by
// tools/render/scenarios/annotate-dom-reading.mjs.
//
// kits/peek.js is a soft dependency the way kits/dictate.js is. Loading
// annotate alone must leave every other reading working with the chip simply
// absent, which is the first test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, loadKit, repoRoot } from './bootstrap.mjs';

const HTML = `<!doctype html><html><head><title>Sample doc</title></head><body>
  <article id="art">
    <h1>Doc title</h1>
    <p id="p1">The quick brown fox jumps over the lazy dog.</p>
    <ul><li id="li1">First item <strong>with <a href="/x">detail</a></strong></li>
        <li>Second item</li></ul>
  </article>
</body></html>`;

const boot = ({ peek = true } = {}) => {
  const { window } = makeWindow({ html: HTML });
  window.eval(readFileSync(path.join(repoRoot, 'lib/vanilla-bundle.js'), 'utf8'));
  if (peek) window.eval(readFileSync(path.join(repoRoot, 'lib/kits/peek.js'), 'utf8'));
  loadKit('annotate.js', { window });
  window.Annotate.enable();
  return window;
};

const elTarget = (w, sel) => ({ type: 'element', selector: sel, excerpt: 'x' });

test('chip: absent without peek, offered with it', () => {
  const bare = boot({ peek: false });
  assert.equal(bare.Peek, undefined);
  bare.Annotate.expand(true);
  assert.equal(bare.Annotate._state.readChips.dom.style.display, 'none');

  const w = boot();
  w.Annotate.expand(true);
  assert.equal(w.Annotate._state.readChips.dom.style.display, 'flex');
});

test('chip: asking for dom without peek falls back to notes', () => {
  const w = boot({ peek: false });
  w.Annotate.expand(true);
  w.Annotate.setReading('dom');
  assert.equal(w.Annotate.reading, 'notes');
});

test('subject: selected note wins, then the draft, then the most recent', () => {
  const w = boot();
  const A = w.Annotate;
  A.add(elTarget(w, '#p1'), 'first');
  A.add(elTarget(w, '#li1'), 'second');
  A.expand(true);
  A.setReading('dom');

  // Nothing selected: the most recent note.
  assert.match(A._state.serialPre.textContent, /^li#li1/);

  A.select(A.items[0].id);
  assert.match(A._state.serialPre.textContent, /^p#p1/);
});

test('reading: names the element, its selector, its subtree and its ancestors', () => {
  const w = boot();
  const A = w.Annotate;
  A.add(elTarget(w, '#li1'), 'note');
  A.expand(true);
  A.setReading('dom');
  const t = A._state.serialPre.textContent;

  assert.match(t, /^li#li1/);
  assert.match(t, /selector\s+#li1\s+unique/);
  assert.match(t, /path\s+html\/body\/article\/ul\/li/);
  assert.match(t, /tree\s+depth \d+ · child 1 of 2 · 1 children/);
  // The subtree, indented under its own heading.
  assert.match(t, /\nunder\n {2}li#li1/);
  assert.match(t, /strong/);
  assert.match(t, /a {2}"detail"/);
  // And what contains it, outermost first.
  const chain = t.split('contained by\n')[1];
  assert.ok(chain, 'the containing chain is printed');
  assert.match(chain.split('\n')[0], /^ {2}body/);
  assert.match(chain, /article#art/);
});

test('reading: says so when the note resolves to nothing', () => {
  const w = boot();
  const A = w.Annotate;
  A.add(elTarget(w, '#gone'), 'note');
  A.expand(true);
  A.setReading('dom');
  assert.match(A._state.serialPre.textContent, /does not resolve to an element/);
});

test('reading: with no note and no draft it says where a subject comes from', () => {
  const w = boot();
  w.Annotate.expand(true);
  w.Annotate.setReading('dom');
  // The aim leads the sentence because it leads the fallback chain.
  assert.match(w.Annotate._state.serialPre.textContent, /Aim at something, or select a note/);
});

test('empty set: the dom reading still shows, where md and json go bare', () => {
  const w = boot();
  const A = w.Annotate;
  A.expand(true);
  A.setReading('md');
  assert.equal(A._state.empty.style.display, 'flex', 'md over an empty set is bare');
  A.setReading('dom');
  assert.equal(A._state.empty.style.display, 'none', 'dom is not of the set');
  assert.equal(A._state.serial.style.display, 'flex');
});

test('copy: the key is offered for dom on an empty set', () => {
  const w = boot();
  const A = w.Annotate;
  A.expand(true);
  A.setReading('json');
  assert.equal(A._state.serialCopy.style.display, 'none', 'nothing to copy from an empty set');
  A.setReading('dom');
  assert.equal(A._state.serialCopy.style.display, 'flex');
  assert.match(A._state.serialCopy.title, /DOM reading/);
});

// THE LIVE AIM, which is the correction this reading needed. The first version
// keyed on the filed note, so a reader aiming at things watched the pane say
// "select a note" through an entire pick. Reproduced headlessly before the fix.
test('subject: the staged aim outranks every filed note', () => {
  const w = boot();
  const A = w.Annotate;
  A.add(elTarget(w, '#p1'), 'filed');
  A.expand(true);
  A.setReading('dom');
  assert.match(A._state.serialPre.textContent, /^p#p1/, 'the note, with no aim');

  A._state.aimEl = w.document.getElementById('li1');
  A._state.serialPre.textContent = '';
  A.setReading('dom');
  assert.match(A._state.serialPre.textContent, /^li#li1/, 'the aim wins');
});

test('subject: ending the mode drops the aim back to the note', () => {
  const w = boot();
  const A = w.Annotate;
  A.add(elTarget(w, '#p1'), 'filed');
  A.expand(true);
  A._state.aimEl = w.document.getElementById('li1');
  A.setReading('dom');
  assert.match(A._state.serialPre.textContent, /^li#li1/);

  A.startPick();          // arms a mode
  A.notePage();           // endMode() runs on the way through
  assert.equal(A._state.aimEl, null, 'the aim is cleared with the mode');
});

test('subject: a staged rectangle reads as a region, not a node', () => {
  const w = boot();
  const A = w.Annotate;
  A.expand(true);
  A._state.aimRect = { x: 0, y: 0, w: 300, h: 200 };
  A.setReading('dom');
  const t = A._state.serialPre.textContent;
  assert.match(t, /^region {2}300 × 200 at 0, 0/);
  // jsdom has no layout, so nothing has a box to be inside or to touch; the
  // reading must say that rather than throw or print an empty list.
  assert.match(t, /covers nothing on the page\.|contains \d+|touches \d+/);
});

test('elementOf: every target type resolves through one function', () => {
  const w = boot();
  const A = w.Annotate;
  const d = w.document;
  A.add({ type: 'page' }, 'p');
  A.expand(true);
  A.setReading('dom');
  assert.match(A._state.serialPre.textContent, /^body/, 'a page note reads the body');

  A.clear();
  const p1 = d.getElementById('p1').firstChild;
  const r = d.createRange();
  r.setStart(p1, 4); r.setEnd(p1, 19);
  A.add({ type: 'text', quote: A._quoteFor(d.body, r), display: 'quick brown fox' }, 't');
  assert.match(A._state.serialPre.textContent, /^p#p1/, 'a text note reads its block');
});
