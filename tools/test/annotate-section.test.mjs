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
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, loadKit, repoRoot } from './bootstrap.mjs';
import { marked } from 'marked';

const { window } = makeWindow({ html: '<!doctype html><html><head><title>Host</title></head><body></body></html>' });
const doc = window.document;
window.marked = marked;
// vanilla-bundle first: the card's drawn readings escape through the window.esc
// it puts there rather than defining a second one (tools/test/one-escape-helper).
window.eval(readFileSync(path.join(repoRoot, 'lib/vanilla-bundle.js'), 'utf8'));
window.eval(readFileSync(path.join(repoRoot, 'lib/kits/peek.js'), 'utf8'));
loadKit('src-doc.js', { window });
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

// ── The section's own reading ───────────────────────────────────────────────
// The DOM reading answers "what is this element and what contains it". A
// section is not an element, so it gets the same question answered in
// markdown's units: rank, line span, what the passage holds, its subsections.
// Section was excluded from this reading at first, on the grounds that it would
// answer with an <h2> in a div; the fix was a second reading, not a withheld
// one.

const domHead = () => (A._state.domBody.firstElementChild?.textContent || '').trim();
const domText = () => A._state.domBody.textContent.replace(/\s+/g, ' ').trim();

test('the reading names the section in markdown terms, not the DOM ones', () => {
  const host = render();
  A.enable();
  A._state.aimEl = headingNamed(host, 'Under first');
  A._state.aimKind = 'section';
  A.expand(true);
  A.setReading('dom');

  assert.equal(domHead(), 'h3Under first', 'the rank and the title, not a tag and a class list');
  const t = domText();
  assert.match(t, /docs\/APP\.md § Under first/, 'the source address');
  assert.match(t, /lines/i);
  assert.match(t, /words/, 'size in words, not a bounding box');
  assert.match(t, /#under-first/, 'the slug');
  assert.match(t, /### Under first/, 'the source, hashes intact');
  assert.doesNotMatch(t, /selector|nth-child/, 'no css selector: that is the other reading');
  A.disable(); host.remove();
});

test('the trail is the markdown chain, which the DOM does not carry', () => {
  const host = render();
  A.enable();
  A._state.aimEl = headingNamed(host, 'Under first');
  A._state.aimKind = 'section';
  A.expand(true);
  A.setReading('dom');

  const crumbs = [...A._state.domBody.querySelectorAll('[data-peek-crumb]')]
    .map(b => b.textContent.trim());
  assert.deepEqual(crumbs, ['h1 Title', 'h2 First', 'h3 Under first'],
    'outermost first, by rank');
  // In the DOM those three are flat siblings, so an element chain would say
  // something entirely different.
  const h3 = headingNamed(host, 'Under first');
  assert.equal(h3.parentElement, headingNamed(host, 'First').parentElement,
    'they are siblings in the render');
  A.disable(); host.remove();
});

test('a crumb re-points the reading at the containing section', () => {
  const host = render();
  A.enable();
  A._state.holdEl = headingNamed(host, 'Under first');
  A._state.holdKind = 'section';
  A.expand(true);
  A.setReading('dom');
  assert.equal(domHead(), 'h3Under first');

  const crumbs = [...A._state.domBody.querySelectorAll('[data-peek-crumb]')];
  crumbs.find(b => b.textContent.trim() === 'h2 First').click();
  assert.equal(domHead(), 'h2First');
  assert.equal(A._state.holdKind, 'section', 'still a section, not the heading element');
  A.disable(); host.remove();
});

test('subsections are listed, and a leaf section lists none', () => {
  const host = render();
  A.enable();
  A.expand(true);
  A._state.aimKind = 'section';

  A._state.aimEl = headingNamed(host, 'First');
  A.setReading('dom');
  assert.match(domText(), /1 subsection/);
  assert.match(domText(), /Under first/);

  A._state.aimEl = headingNamed(host, 'Second');
  A.setReading('dom');
  assert.doesNotMatch(domText(), /subsection/);
  A.disable(); host.remove();
});

test('a filed section note reads as a section, not as its heading element', () => {
  const host = render();
  A.enable();
  // noteSection builds the target the same way the aim does, so this is the
  // filed shape rather than one assembled by hand.
  A.noteSection(headingNamed(host, 'First'));
  const target = A._state.draft.target;
  assert.equal(target.type, 'section');
  A.add(target, 'a note');
  A.expand(true);
  A.setReading('dom');
  assert.equal(domHead(), 'h2First', 'the target type chose the reading');
  A.disable(); host.remove();
});

// ── The structure overlay ──────────────────────────────────────────────────
//
// jsdom has no layout, so every getBoundingClientRect is zeros and unionRect
// (which drops rects with no width and no height) answers null for everything.
// The marks are therefore stubbed into existence here: what is checked is the
// SHAPE of the overlay, one rule per section indented by rank, and its
// lifecycle. Where it actually lands on a page is a browser question and is
// driven by tools/render/scenarios, which measured 9 rules over 9 sections at
// two indents and the boundary dropping at 390px where it would not fit.
const stubLayout = () => {
  let top = 0;
  for (const el of doc.querySelectorAll('[data-src-doc] *')) {
    const y = (top += 20);
    el.getBoundingClientRect = () => ({ left: 40, top: y, right: 340, bottom: y + 18,
                                        width: 300, height: 18, x: 40, y });
  }
  const box = doc.querySelector('[data-src-doc]');
  if (box) box.getBoundingClientRect = () => ({ left: 40, top: 0, right: 340, bottom: top,
                                                width: 300, height: top, x: 40, y: 0 });
};

const ruleMarks = () => [...doc.querySelectorAll('[data-annotate-ui]')]
  .filter(e => e.style.width === '2px');

test('arming the section aim draws one rule per section, indented by rank', () => {
  const host = render();
  A.enable();
  stubLayout();
  A.startPick({ aim: 'section' });
  const box = doc.querySelector('[data-src-doc]');
  const secs = box.__srcDoc.sections;
  const rules = ruleMarks();
  assert.equal(rules.length, secs.length, 'a rule per section');

  // Rank, not DOM depth: a `##` sits inside a `#` and its rule steps in, even
  // though the two headings are flat siblings in the render.
  const lefts = rules.map(r => parseInt(r.style.left, 10));
  const byDepth = new Map();
  secs.forEach((sec, i) => byDepth.set(sec.depth, lefts[i]));
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  assert.ok(depths.length > 1, 'the fixture needs nesting for this to say anything');
  for (let i = 1; i < depths.length; i++) {
    assert.ok(byDepth.get(depths[i]) > byDepth.get(depths[i - 1]),
      `depth ${depths[i]} must sit right of depth ${depths[i - 1]}`);
  }
  A.disable(); host.remove();
});

test('the rules belong to the section aim, not to the annotator', () => {
  const host = render();
  A.enable();
  stubLayout();
  A.startPick({ aim: 'section' });
  assert.ok(ruleMarks().length > 0);
  A.startPick();                       // the element aim: same mode slot, no structure
  assert.equal(ruleMarks().length, 0,
    'an aim that reaches the whole page marks no region');
  A.disable(); host.remove();
  assert.equal(ruleMarks().length, 0, 'and nothing survives the mode');
});

