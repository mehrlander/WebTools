// The section targeting mode, across the two kits it spans: kits/md-doc.js
// declares what a rendered box is a rendering of, and kits/annotate.js turns a
// heading in one into a note carrying that section's SOURCE and its line span.
//
// Why a mode and not a one-tap action, which is the decision this pins the
// consequences of: measured 2026-08-26 in the doc deck, four declared renders
// are mounted at once (swipe-deck keeps two slides either side) and only one is
// on screen, so "the section I am in" must choose a document before a section;
// and at 35% and 70% through one document the nearest-heading-above rule
// returned the same long section, which would pin a note three screens above
// what the reader is looking at. A tap answers both at once.
//
// What is NOT here: the pointer path itself. jsdom implements no
// elementsFromPoint and computes no rects, so the pick engine's aiming is
// real-browser behavior, verified headless, exactly as the element pick and
// region drag already are (see the note at the top of annotate.test.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, loadKit } from './bootstrap.mjs';
import { marked } from 'marked';

const { window } = makeWindow({ html: '<!doctype html><html><head><title>Host</title></head><body></body></html>' });
const doc = window.document;
window.marked = marked;
loadKit('md-doc.js', { window });
loadKit('annotate.js', { window });
const A = window.Annotate;
const mdDoc = window.mdDoc;

const DOC = [
  '# Title', '', 'Opening.', '',
  '## First', '', 'A paragraph.', '',
  '### Under first', '', 'More.', '',
  '## Second', '', 'Last.', '',
].join('\n');

const ADDR = { repo: 'mehrlander/web-tools', ref: 'main', path: 'docs/APP.md',
               url: 'https://github.com/mehrlander/web-tools/blob/main/docs/APP.md' };

const render = () => {
  const host = doc.createElement('div');
  doc.body.append(host);
  mdDoc.render(host, DOC, { addr: ADDR });
  return host;
};
const headingNamed = (host, title) =>
  [...host.querySelectorAll('[data-md-section]')].find(h => h.textContent.startsWith(title));

// ── The outline: a section is a RUN of siblings ─────────────────────────────

test('a section covers its heading and everything under it, to the next peer', () => {
  // An outline around the heading alone would claim the note is about a title.
  const host = render();
  const run = A._sectionEls(headingNamed(host, 'First'));
  const tags = run.map(n => n.tagName);
  assert.equal(tags[0], 'H2');
  assert.ok(tags.includes('H3'), 'a deeper heading is inside the section, not a boundary');
  assert.ok(!run.some(n => n.tagName === 'H2' && n !== run[0]), 'the next peer heading ends it');
  host.remove();
});

test('the last section runs to the end of the document', () => {
  const host = render();
  const run = A._sectionEls(headingNamed(host, 'Second'));
  assert.equal(run[run.length - 1], host.querySelector('div').lastElementChild);
  host.remove();
});

// ── The item: the only conditional one in the aim menu ──────────────────────

test('the Section aim is absent until the page holds a declared render', () => {
  // An item that offers to aim at prose it cannot resolve is the dead control
  // the section menu already refuses to be.
  A.enable({ doc });
  const item = A._state.modeChips.section;
  assert.equal(item.style.display, 'none', 'nothing to aim at yet');

  const host = render();
  // md-doc announces every declaration, which is how the item appears on a deck
  // slide rendered after the annotator was switched on.
  assert.equal(item.style.display, 'flex', 'a render arrived and the aim came with it');
  host.remove();
  A.disable();
});

test('Element and Region are unconditional', () => {
  A.enable({ doc });
  const items = A._state.modeChips;
  assert.equal(items.pick.style.display, 'flex');
  assert.equal(items.region.style.display, 'flex');
  A.disable();
});

// ── The target ──────────────────────────────────────────────────────────────

test('a section note carries markdown, not the rendered text', () => {
  const host = render();
  A.enable({ doc });
  assert.equal(A.noteSection(headingNamed(host, 'First')), true);
  const S = A._state;
  const t = S.draft && S.draft.target;
  assert.equal(t.type, 'section');
  assert.equal(t.title, 'First');
  assert.match(t.excerpt, /^## First/, 'the body is the source, leading with its own heading');
  assert.match(t.excerpt, /### Under first/, 'and carries the subsection');
  assert.deepEqual({ ...t.lines }, { start: 5, end: 11 });
  assert.equal(t.source, 'docs/APP.md § First (lines 5-11)');
  A.disable();
  host.remove();
});

test('a section note serializes as the file, the section and the lines', () => {
  const host = render();
  A.enable({ doc });
  A.clear();
  A.add({ type: 'section', selector: 'div > h2', title: 'First',
          source: 'docs/APP.md § First (lines 5-11)',
          lines: { start: 5, end: 11 },
          excerpt: '## First\n\nA paragraph.' }, 'tighten this');
  const md = A.toMarkdown();
  assert.match(md, /## 1\. § First/, 'the head is the title, not a css path');
  assert.match(md, /Path: `docs\/APP\.md § First \(lines 5-11\)`/);
  assert.match(md, /> ## First/, 'the markdown rides in the quote');
  assert.match(md, /\*\*Note:\*\* tighten this/);
  A.clear();
  A.disable();
  host.remove();
});

test('a heading outside any declared render notes nothing', () => {
  // The honest failure: return false, so the menu or the chip can say so
  // instead of filing a note pinned to a document nobody declared.
  A.enable({ doc });
  const loose = doc.createElement('h2');
  loose.textContent = 'Not a render';
  doc.body.append(loose);
  assert.equal(A.noteSection(loose), false);
  loose.remove();
  A.disable();
});
