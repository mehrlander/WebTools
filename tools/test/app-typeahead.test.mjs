// app/index.html — wireAppTypeahead, the router that sends a bare printable key
// to a search box.
//
// What is worth pinning here, browser-free, is the ROUTING: which keys the
// router claims, which it leaves alone, which box it picks, and the two
// contracts that join files with nothing else between them. The character's
// journey into the box is layout and default-action behavior and is measured
// in a real browser instead (tools/test/app-typeahead.mjs, `npm run
// test:typeahead`), so nothing here asserts about it.
//
// Executed rather than read: makeShell evaluates the shell's inline block and
// records the listeners it registers, which is the only way to fire a keydown
// at a handler the shell otherwise just installs. The harness DOM is extended
// per test with the two things this router reads and the link stub does not
// carry: getElementById and an activeElement that focus() moves.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';
import { makeShell, page as shellSource } from './shell.mjs';

// A finder box the router can find, focus, and write into. `rects` stands in
// for getClientRects().length, which is how the router asks whether an element
// is on screen at all.
function fakeBox({ rects = 1, focusable = true } = {}) {
  const box = {
    value: '', rects, inputs: 0,
    getClientRects(){ return Array(this.rects).fill({}); },
    hasAttribute(){ return false; },
    dispatchEvent(e){ if (e.type === 'input') this.inputs++; return true; },
  };
  box.focus = function (){ if (focusable) box.doc.activeElement = box; };
  return box;
}

// A shell with its typeahead wired, plus the levers each case needs.
function wired({ box = null, viewBoxes = [], sidebarOpen = true, showSidebar = true,
                 dialogOpen = false, deck = 0 } = {}) {
  const win = {};
  const h = makeShell({ win });
  const { shell, doc, fire } = h;
  // Every fake box focuses by writing to the harness document, so each needs
  // to know which one it is in.
  for (const b of [box, ...viewBoxes]) if (b) b.doc = doc;
  doc.activeElement = null;
  doc.getElementById = (id) => (id === 'quick-find-box' ? box : null);
  doc.querySelector = (sel) => (sel === 'dialog[open]' && dialogOpen ? {} : null);
  doc.querySelectorAll = (sel) => (sel === '[data-find-box]' ? viewBoxes : []);
  if (deck) win.swipeDeck = { stack: Array(deck).fill({}) };
  // Getters on the shell object, so the router's reads answer to the case.
  Object.defineProperty(shell, 'showSidebar', { get: () => showSidebar });
  shell.sidebarOpen = sidebarOpen;
  shell.opened = 0;
  shell.openSidebar = function (){ this.opened++; this.sidebarOpen = true; };
  // Alpine's, and synchronous here: the router's reveal path runs inside it,
  // and the reveal it waits for is faked by the case rather than by a layout.
  shell.$nextTick = (fn) => fn();
  shell.wireAppTypeahead();
  const type = (key, ev = {}) => {
    let prevented = false;
    fire('window', 'keydown', { key, target: null, preventDefault(){ prevented = true; }, ...ev });
    return prevented;
  };
  return { ...h, type, box };
}

test('a bare letter reaches the finder', () => {
  const box = fakeBox();
  const { type, doc } = wired({ box });
  const prevented = type('k');
  assert.equal(doc.activeElement, box, 'focus moves to the finder');
  assert.equal(prevented, false,
    'the default action is left to run, which is what carries the character');
  assert.equal(box.value, '', 'and the router writes nothing itself on this path');
});

test('what the router does not claim', () => {
  // Each of these has a job of its own on a page, and taking it would cost
  // more than the typeahead is worth.
  const cases = [
    ['a modifier combination', 'k', { ctrlKey: true }],
    ['the same with meta', 'k', { metaKey: true }],
    ['the same with alt', 'k', { altKey: true }],
    ['a composition in flight', 'k', { isComposing: true }],
    ['a named key', 'Enter', {}],
    ['a named key', 'Tab', {}],
    ['a named key', 'ArrowDown', {}],
    ['space, which scrolls and activates', ' ', {}],
    ['a key an input already has', 'k', { target: { tagName: 'INPUT' } }],
    ['a key a textarea already has', 'k', { target: { tagName: 'TEXTAREA' } }],
    ['a key a select already has', 'k', { target: { tagName: 'SELECT' } }],
    ['a key a contenteditable already has', 'k', { target: { tagName: 'DIV', isContentEditable: true } }],
  ];
  for (const [why, key, ev] of cases) {
    const box = fakeBox();
    const { type, doc } = wired({ box });
    type(key, ev);
    assert.equal(doc.activeElement, null, `${why} (${key}) is left alone`);
  }
});

test('an overlay that owns the screen takes the key off the router', () => {
  for (const [why, opts] of [['a deck', { deck: 1 }], ['a modal dialog', { dialogOpen: true }]]) {
    const box = fakeBox();
    const { type, doc } = wired({ box, ...opts });
    type('k');
    assert.equal(doc.activeElement, null,
      `${why} is on top, so focus must not move to a box behind it`);
  }
});

test("a view's own search box wins where it is on screen", () => {
  const own = fakeBox();
  const box = fakeBox();
  const { type, doc } = wired({ box, viewBoxes: [own] });
  type('k');
  assert.equal(doc.activeElement, own, 'the view box takes it');
  assert.notEqual(doc.activeElement, box, 'and the sidebar is not opened over the view');
});

test('a view box that is not rendered is skipped for the finder', () => {
  // A filter inside a closed tab still answers the selector. Visibility is the
  // question, not membership.
  const hidden = fakeBox({ rects: 0 });
  const shown = fakeBox();
  const box = fakeBox();
  const { type, doc } = wired({ box, viewBoxes: [hidden, shown] });
  type('k');
  assert.equal(doc.activeElement, shown, 'the first VISIBLE one takes it');
});

test('with no sidebar to open, the key is left where it fell', () => {
  // showSidebar is about content: a signed-out dashboard has no finder to
  // reveal, and seeding a box that stays display:none strands the character
  // with focus still on the body. Measured in the browser 2026-09-04.
  const box = fakeBox({ rects: 0 });
  const { type, doc, shell } = wired({ box, showSidebar: false, sidebarOpen: false });
  type('k');
  assert.equal(doc.activeElement, null);
  assert.equal(box.value, '', 'nothing is seeded into a box that cannot be shown');
  assert.equal(shell.opened, 0, 'and the sidebar is not opened');
});

test('a hidden finder is revealed, and the character is carried by hand', () => {
  const box = fakeBox();
  const { type, doc, shell } = wired({ box, sidebarOpen: false });
  const prevented = type('k');
  assert.equal(shell.opened, 1, 'the sidebar opens');
  assert.equal(doc.activeElement, box, 'and focus lands on the finder');
  assert.equal(prevented, true,
    'the default action has nowhere to go while the box is still hidden');
  assert.equal(box.value, 'k', 'so the router seeds the character itself');
  assert.equal(box.inputs, 1, 'through an input event, so x-model writes it back');
});

test('a reveal that did not take seeds nothing', () => {
  // The character would otherwise sit in a box nobody is looking at, and the
  // next keystroke would append to it.
  const box = fakeBox({ focusable: false });
  const { type, doc } = wired({ box, sidebarOpen: false });
  type('k');
  assert.equal(doc.activeElement, null);
  assert.equal(box.value, '', 'no orphan character');
  assert.equal(box.inputs, 0);
});

test('the id the router names is the id the finder carries', () => {
  // The only thing joining these two files. quick-find registers no key of its
  // own since the router took `/` over, so a rename here fails silently in the
  // app: the box is simply never found.
  const finder = readFileSync(path.join(repoRoot, 'lib/alpineComponents/quick-find.js'), 'utf8');
  assert.match(finder, /<input x-ref="box" id="quick-find-box"/,
    'quick-find must keep the id wireAppTypeahead looks up');
  assert.match(shellSource, /getElementById\('quick-find-box'\)/,
    'and the router must look up the id quick-find carries');
  assert.doesNotMatch(finder, /addEventListener\('keydown'/,
    'one owner: quick-find must not register a key listener beside the router');
});

test('the views that own a search box declare it', () => {
  // Without the attribute the view still works and the keystroke still lands
  // somewhere, which is why this is a test and not a crash: it goes to the
  // sidebar finder instead of the filter the reader is looking at.
  const files = readFileSync(path.join(repoRoot, 'lib/alpineComponents/search-view.js'), 'utf8');
  assert.match(files, /data-find-box/, 'the Files view claims its own query box');
  assert.match(shellSource, /placeholder="filter by name…" data-find-box/,
    'the Pages view claims its own filter');
});
