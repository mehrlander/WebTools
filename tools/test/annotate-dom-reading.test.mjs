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

// The reading is DRAWN now, not a <pre> of text, so these read the pane. `head`
// is the identity row on its own, which is the tag pill plus its id and class
// chips and so reads as the atom does.
const pane = (A) => A._state.domBody.textContent.replace(/\s+/g, ' ').trim();
const head = (A) => (A._state.domBody.firstElementChild?.textContent || '').trim();

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
  assert.equal(head(A), 'li#li1');

  A.select(A.items[0].id);
  assert.equal(head(A), 'p#p1');
});

test('reading: names the element, its selector, its subtree and its ancestors', () => {
  const w = boot();
  const A = w.Annotate;
  A.add(elTarget(w, '#li1'), 'note');
  A.expand(true);
  A.setReading('dom');
  const t = pane(A);

  assert.equal(head(A), 'li#li1');
  const q = (sel) => A._state.domBody.querySelector(sel);
  assert.equal(q('[data-peek-sel]').textContent, '#li1');
  assert.equal(q('[data-peek-verdict]').dataset.peekVerdict, 'unique');
  assert.match(t, /html\/body\/article\/ul\/li/, 'the tag path');
  assert.match(t, /depth \d+ · 1 of 2 · 1 child/, 'where it sits');
  assert.match(t, /under/);
  assert.match(t, /strong/);
  assert.match(t, /"detail"/);
  // The trail is a row of buttons, outermost first, the subject last and lit.
  const crumbs = [...A._state.domBody.querySelectorAll('[data-peek-crumb]')];
  assert.ok(crumbs.length >= 3, 'the ancestor trail is drawn');
  assert.match(crumbs[0].textContent, /^body/);
  assert.match(crumbs.at(-1).textContent, /^li/);
  assert.equal(crumbs.at(-1).dataset.peekCrumb, '0', 'the subject is the innermost crumb');
});

test('reading: says so when the note resolves to nothing', () => {
  const w = boot();
  const A = w.Annotate;
  A.add(elTarget(w, '#gone'), 'note');
  A.expand(true);
  A.setReading('dom');
  assert.match(pane(A), /does not resolve to an element/);
});

test('reading: with no note and no draft it says where a subject comes from', () => {
  const w = boot();
  w.Annotate.expand(true);
  w.Annotate.setReading('dom');
  // The aim leads the sentence because it leads the fallback chain.
  assert.match(pane(w.Annotate), /Aim at something, or select a note/);
});

test('empty set: the dom reading still shows, where md and json go bare', () => {
  const w = boot();
  const A = w.Annotate;
  A.expand(true);
  A.setReading('md');
  assert.equal(A._state.empty.style.display, 'flex', 'md over an empty set is bare');
  A.setReading('dom');
  assert.equal(A._state.empty.style.display, 'none', 'dom is not of the set');
  assert.equal(A._state.serial.style.display, 'none', 'the <pre> yields to the drawn pane');
  assert.equal(A._state.domPane.style.display, 'flex');
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
  assert.equal(head(A), 'p#p1', 'the note, with no aim');

  A._state.aimEl = w.document.getElementById('li1');
  A.setReading('dom');
  assert.equal(head(A), 'li#li1', 'the aim wins');
});

test('subject: ending the mode keeps the reading and drops only the outline', () => {
  const w = boot();
  const A = w.Annotate;
  A.add(elTarget(w, '#p1'), 'filed');
  A.expand(true);
  A._state.aimEl = w.document.getElementById('li1');
  A.setReading('dom');
  assert.equal(head(A), 'li#li1');

  A.startPick();          // arms a mode
  A.notePage();           // endMode() runs on the way through
  assert.equal(A._state.aimEl, null, 'the live aim goes with the mode');
  assert.equal(A._state.holdEl, w.document.getElementById('li1'), 'the subject is held');
  A.setReading('dom');
  assert.equal(head(A), 'li#li1', 'and still reads');
});

test('subject: choosing a note drops the held aim', () => {
  const w = boot();
  const A = w.Annotate;
  A.add(elTarget(w, '#p1'), 'filed');
  A.expand(true);
  A._state.holdEl = w.document.getElementById('li1');
  A.setReading('dom');
  assert.equal(head(A), 'li#li1');

  A.select(A.items[0].id);
  assert.equal(A._state.holdEl, null);
  assert.equal(head(A), 'p#p1');
});

test('subject: a staged rectangle reads as a region, not a node', () => {
  const w = boot();
  const A = w.Annotate;
  A.expand(true);
  A._state.aimRect = { x: 0, y: 0, w: 300, h: 200 };
  A.setReading('dom');
  const t = pane(A);
  assert.match(head(A), /^region300 × 200at 0, 0$/);
  // jsdom has no layout, so nothing has a box to be inside or to touch; the
  // reading must say that rather than throw or draw an empty list.
  assert.match(t, /covers nothing on the page\.|contains \d+|touches \d+/);
});

// Arming the element aim is one deliberate act with one question behind it, so
// the pane that answers it opens with the mode rather than being found after.
// The earlier objection was to expanding on every TAP, which is a different
// moment; section stays out because its notes are about markdown source.
test('element aim: choosing it opens the card on the DOM reading', () => {
  const w = boot();
  assert.equal(w.Annotate.expanded, false);
  w.Annotate.startPick();
  assert.equal(w.Annotate.expanded, true);
  assert.equal(w.Annotate.reading, 'dom');
});

test('element aim: section does not, and neither does a page without peek', () => {
  const w = boot();
  w.Annotate.startPick({ aim: 'section' });
  assert.equal(w.Annotate.expanded, false);
  assert.equal(w.Annotate.reading, 'notes');

  const bare = boot({ peek: false });
  bare.Annotate.startPick();
  assert.equal(bare.Annotate.expanded, false, 'no reading to open without the kit');
  assert.equal(bare.Annotate.reading, 'notes');
});

// The trail is the one thing in the pane a reader can act on. With no mode
// running it re-points the reading; the outline half needs layout and is driven
// by tools/render/scenarios/annotate-dom-crumb.mjs.
test('trail: tapping a crumb re-points the reading at that ancestor', () => {
  const w = boot();
  const A = w.Annotate;
  A.expand(true);
  A._state.holdEl = w.document.getElementById('li1');
  A.setReading('dom');
  assert.equal(head(A), 'li#li1');

  const crumbs = [...A._state.domBody.querySelectorAll('[data-peek-crumb]')];
  const ul = crumbs.find(b => b.textContent.trim() === 'ul');
  assert.ok(ul, 'the ul is on the trail');
  ul.click();
  assert.equal(head(A), 'ul');
  assert.equal(A._state.holdEl, w.document.querySelector('ul'));
});

test('elementOf: every target type resolves through one function', () => {
  const w = boot();
  const A = w.Annotate;
  const d = w.document;
  A.add({ type: 'page' }, 'p');
  A.expand(true);
  A.setReading('dom');
  assert.match(head(A), /^body/, 'a page note reads the body');

  A.clear();
  const p1 = d.getElementById('p1').firstChild;
  const r = d.createRange();
  r.setStart(p1, 4); r.setEnd(p1, 19);
  A.add({ type: 'text', quote: A._quoteFor(d.body, r), display: 'quick brown fox' }, 't');
  assert.equal(head(A), 'p#p1', 'a text note reads its block');
});
