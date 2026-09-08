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

// ── The mark on the row, and on the button that opens it ────────────────────
//
// The launcher menu and this menu start the same four modes and looked nothing
// alike: alpineComponents/fab.js's row is four glyphs and no words, this one
// was four words and no glyph. A reader who learned the aims in one place
// recognised none of them in the other.

test('the declared kind supplies the Section row its label, hint and glyph', () => {
  A.enable({ doc });
  const host = render();
  const item = A._state.modeChips.section;
  assert.equal(item._label.textContent, 'Markdown section');
  assert.equal(item._hint.textContent, 'tap a heading: the note is about its source');
  // docs/routes-kinds.csv owns all three; kits/md-doc.js carries them onto the
  // declaration. Hardcoding the glyph here is what sent an alignment control
  // out to describe a markdown document until 2026-09-06.
  assert.match(item._glyph.className, /\bph-file-md\b/);
  assert.doesNotMatch(item._glyph.className, /text-align-left/);
  host.remove();
  A.disable();
});

test('the aim button shows the glyph of the aim in force, and names it in full', () => {
  A.enable({ doc });
  const S = A._state;
  // Resting: Page, the aim that needs nothing on the page to hit.
  assert.match(S.aimGlyph.className, /\bph-file\b/);
  assert.equal(S.aimBtn.title, 'What the next note is about: Page');
  assert.equal(S.aimBtn.getAttribute('aria-label'), S.aimBtn.title);
  // No visible word at all: the header carries five controls once the card is
  // expanded and the row does not fit a phone with a word on this button.
  assert.equal(S.aimBtn.textContent.trim(), '');

  const host = render();
  A.startPick({ aim: 'section' });
  assert.match(S.aimGlyph.className, /\bph-file-md\b/);
  // The DECLARED label, not the generic one. The button read `Section` while
  // the menu row beside it read `Markdown section`, in plain sight.
  assert.equal(S.aimBtn.title, 'What the next note is about: Markdown section');

  A.startRegion();
  assert.match(S.aimGlyph.className, /\bph-frame-corners\b/);
  assert.equal(S.aimBtn.title, 'What the next note is about: Region');
  host.remove();
  A.disable();
});

// ── Several renders in one document ─────────────────────────────────────────
//
// The deck mounts four at once and a doc beside a preview is two, so "the
// markdown on this page" is routinely plural. The carrier answers both
// questions now: declaredIn is what a CONTROL asks (does anything here declare
// an aim), declaredAll is what a MARK asks (where is it).

test('the carrier answers with every declared render, not just the first', () => {
  const a = render(), b = render();
  const all = window.srcDoc.declaredAll(doc);
  assert.equal(all.length, 2, 'both renders qualify');
  assert.deepEqual(all.map(f => f.box), [a.firstElementChild, b.firstElementChild],
    'in document order');
  assert.equal(window.srcDoc.declaredIn(doc).box, all[0].box,
    'and the singular reading is still the first of them');
  a.remove(); b.remove();
});

test('a pick resolves inside whichever render it lands in', () => {
  // This half always worked, and it is what made the drawing gap invisible:
  // locate() walks up from the tapped node, so the second render was fully
  // pickable while nothing on screen said it was markdown. The rules were drawn
  // from declaredIn until 2026-09-06, so they marked one document of two.
  const a = render(), b = render();
  A.enable({ doc });
  assert.equal(A.noteSection(headingNamed(b, 'First')), true);
  assert.equal(A._state.draft.target.type, 'section');
  assert.match(A._state.draft.target.excerpt, /^## First/);
  A.disable();
  a.remove(); b.remove();
});

test('the structure paint reads every render', () => {
  // jsdom computes no rects, so the rules themselves are real-browser behavior
  // (verified headless, like the pick engine above). What is checkable here is
  // the reading the paint is built on, which is the half that was wrong.
  const src = readFileSync(path.join(repoRoot, 'lib/kits/annotate.js'), 'utf8');
  const paint = src.match(/const paintStructure = \(\) => \{[\s\S]*?\n {4}\};/);
  assert.ok(paint, 'paintStructure is gone from kits/annotate.js');
  assert.match(paint[0], /srcDoc\.declaredAll\(/,
    'the section rules are drawn from one render again');
  assert.doesNotMatch(paint[0], /declaredIn\(/);
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

