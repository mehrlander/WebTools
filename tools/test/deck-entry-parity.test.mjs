// The deck door has one owner, and the copies are held to it.
//
// swipeDeck.entry() is the estate's affordance for "this collection has a
// reader": one glyph, one wording, one hit target. Its plain consumers call it
// and get that for free. The TEMPLATE-DRIVEN ones cannot: an Alpine template
// with its own x-show, :disabled and busy spinner has to spell the button out,
// and the kit loads on demand, so it is not on the page when that template
// first renders. A host that waited for it would paint no button at all.
//
// So each of those keeps a literal, and this is what stops the literals
// drifting. It is the same shape the surfacing manifest uses against
// SURFACING.md: a copy that cannot be eliminated is held two-way by test
// instead. If someone restyles the door in the kit, this fails and names every
// file that has to follow.
//
// There are five copies as of 2026-09-04. branch-brief's is the door into a
// branch's FILES; session-brief's is the door into a session's CARDS, and it
// exists because that view was lifted out of pages/session.html to be mounted
// per slide in the Sessions pane; search-view's is the door into the FILES a
// search just found. The Map view's two arrived last: the Surfacing tab's pair
// (the doc and its gated index) and the Docs tab's selected folder. A sixth
// joins the table below and needs no other change here, which is the point of
// the table.
//
// `pending` is the one thing a row can decline. Two of the doors render before
// their collection has been counted (a branch whose compare has not been read,
// a session whose cards have not been fetched) and so need the uncounted
// wording as well; the other three only ever render over a list already in
// hand, so requiring that string would be requiring a literal nothing can
// display.
//
// `tone` is the second. It is the host's judgment, not the kit's, and the kit
// says so: primary where the deck is what most readers came to do, ghost where
// it is one lens among several. The Map view's headers are strips of quiet
// chips over cards that are the subject, so both of its doors are ghost. The
// column exists so the check reads each door against the tone it declares
// rather than against the default.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/swipe-deck.js'), 'utf8'))();
const entry = window.swipeDeck.entry;

// One row per template-driven copy: the file it lives in, the call that makes
// it the deck button, the noun its collection is counted in, and the Alpine
// expression that counts them.
const DOORS = [
  { what: 'Branch detail', file: 'lib/alpineComponents/branch-brief.js',
    anchor: 'openFileDeck(0)', noun: 'file', count: "plural(deckFiles.length, 'file')" },
  { what: 'Session brief', file: 'lib/alpineComponents/session-brief.js',
    anchor: 'openDeck()', noun: 'card', count: "plural(cards, 'card')" },
  { what: 'Files search', file: 'lib/alpineComponents/search-view.js',
    anchor: 'openDeck()', noun: 'file', count: "plural(fileHits.length, 'file')",
    pending: false },
  { what: 'Map / Surfacing', file: 'lib/alpineComponents/map.js',
    anchor: 'openSurfDeck()', noun: 'file', count: "plural(surfDeckFiles.length, 'file')",
    pending: false, tone: 'ghost' },
  { what: 'Map / Docs', file: 'lib/alpineComponents/map.js',
    anchor: 'openDocDeck(docDirFiles[0])', noun: 'file',
    count: "plural(docDirFiles.length, 'file')", pending: false, tone: 'ghost' },
];

const src = (d) => readFileSync(path.join(repoRoot, d.file), 'utf8');

// The deck button's own class attribute, found by the handler that makes it the
// deck button. Anchoring on the handler rather than on the class string is the
// point: a test that grepped for the string could only ever confirm itself.
const deckBtnClasses = (d) => {
  const text = src(d);
  const at = text.indexOf(d.anchor);
  assert.ok(at > 0, `${d.file} no longer has a button calling ${d.anchor}`);
  const m = /class="([^"]+)"/.exec(text.slice(at, at + 600));
  assert.ok(m, 'the deck button has no literal class attribute');
  return m[1].split(/\s+/).filter(Boolean).sort().join(' ');
};

for (const d of DOORS) {
  test(`${d.what} wears the classes the kit owns`, () => {
    // As a SET, not a string. Class order does not reach CSS, so pinning it
    // would fail on a reordering that changes nothing and teach people to
    // ignore this.
    const want = entry.cls(d.tone).split(/\s+/).filter(Boolean).sort().join(' ');
    assert.equal(deckBtnClasses(d), want,
      `${d.file}'s deck button must carry the same classes as swipeDeck.entry.cls()`);
  });

  test(`${d.what} wears the glyph the kit owns`, () => {
    assert.ok(src(d).includes(`ph ${entry.icon} text-lg max-sm:text-xl`),
      `${d.file}'s deck button must carry ${entry.icon}`);
  });

  test(`${d.what} wears the wording the kit owns`, () => {
    // Pending: the collection has not been read, so there is no count to give.
    // Skipped where the door cannot render before the count exists.
    if (d.pending !== false) assert.ok(src(d).includes(`'${entry.title(0, d.noun)}'`),
      `the no-count title must read: ${entry.title(0, d.noun)}`);
    // Counted: assembled around plural(), so the two ends are checked rather
    // than the expression, which is Alpine's to spell.
    const [head, tail] = entry.title(9, d.noun).split(`9 ${d.noun}s`);
    assert.ok(src(d).includes(`'${head}' + ${d.count} + '${tail}'`),
      `the counted title must assemble to: ${entry.title(9, d.noun)}`);
  });
}
