// lib/kits/standoff.js's source map — the bridge between the two coordinate
// systems a reader works in.
//
// A boundary is a character offset into the DOCUMENT, and the reader places it
// while looking at the document RENDERED. The map walks the rendered text nodes
// and finds each one in the source with a moving cursor, which works because
// the rendered text is a subsequence of the source: markdown deletes delimiters
// and keeps content, in order.
//
// WHAT IT REFUSES IS THE POINT, and it is what these hold. Markup is in no text
// node, so `**`, `[`, `](url)` and a fence's backticks are not places. An inline
// construct is atomic on top of that, because a boundary inside a link's LABEL
// is just as broken as one inside its target: `[one way](url)` cut after "one"
// leaves `…[one` and ` way](url)…`, and neither renders as itself.
//
// Not through marked's tokens on purpose. Adding up `raw` lengths across a
// token tree works and binds this to one library's token shape, which the page
// and this test do not share: the page loads marked@12 from a CDN and the
// vendored copy here is marked@18.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import { repoRoot } from './bootstrap.mjs';

const dom = new JSDOM('<!doctype html><body><div id="r"></div></body>');
const win = { document: dom.window.document };
new Function('window', readFileSync(path.join(repoRoot, 'lib/kits/standoff.js'), 'utf8'))(win);
const S = win.Standoff;

// Render `src` and map it, returning the spans the map produced.
function render(src, from = 0) {
  const r = dom.window.document.getElementById('r');
  r.innerHTML = marked.parse(src);
  const stats = S.mapText(r, src, from);
  const spans = [...r.querySelectorAll('[data-src]')].map(s => ({
    at: +s.dataset.src, text: s.textContent, atomic: !!s.dataset.atomic,
  }));
  return { stats, spans, root: r };
}

const LINE = 'The **one cross-check**, and it runs [one way](https://x/y): a `Frozen` banner.';

test('every mapped span points at the source text it renders', () => {
  // The whole guarantee in one assertion: an offset the map hands out is an
  // offset into these exact bytes.
  const { spans } = render(LINE);
  for (const s of spans)
    assert.equal(LINE.substr(s.at, s.text.length), s.text,
      `span at ${s.at} claims ${JSON.stringify(s.text)}`);
});

test('markup is in no span, so it is not a place a boundary can land', () => {
  const { spans } = render(LINE);
  const covered = new Set();
  for (const s of spans) for (let i = s.at; i < s.at + s.text.length; i++) covered.add(i);
  // The delimiters, by position: `**` twice, `[`, `](https://x/y)`, two backticks.
  for (const [a, b, what] of [[4, 6, 'opening **'], [21, 23, 'closing **'],
                              [37, 38, '['], [45, 59, '](url)'],
                              [63, 64, 'opening backtick'], [70, 71, 'closing backtick']])
    for (let i = a; i < b; i++)
      assert.ok(!covered.has(i), `${what}: offset ${i} is inside a span and should not be`);
});

test('an inline construct is atomic, its label included', () => {
  const { spans } = render(LINE);
  const atomic = spans.filter(s => s.atomic).map(s => s.text);
  assert.deepEqual(atomic, ['one cross-check', 'one way', 'Frozen'],
    'the bold run, the link label and the code span');
  assert.deepEqual(spans.filter(s => !s.atomic).map(s => s.text),
    ['The ', ', and it runs ', ': a ', ' banner.']);
});

test('an atomic span answers no offset, so no gesture reaches inside one', () => {
  // offsetAt is the one route from a point to an offset, and this is the
  // branch that makes the constraint real rather than decorative.
  const { root } = render(LINE);
  const atom = root.querySelector('[data-atomic]');
  const doc = dom.window.document;
  doc.caretRangeFromPoint = () => ({ startContainer: atom.firstChild, startOffset: 2 });
  assert.equal(S.offsetAt(doc, 1, 1), null, 'an atomic span must refuse');
  const open = [...root.querySelectorAll('[data-src]:not([data-atomic])')][1];
  doc.caretRangeFromPoint = () => ({ startContainer: open.firstChild, startOffset: 2 });
  assert.equal(S.offsetAt(doc, 1, 1), +open.dataset.src + 2, 'an open run must answer');
  delete doc.caretRangeFromPoint;
});

test('nodeAt skips atomic spans, so a pin cannot be drawn inside one', () => {
  const { root, spans } = render(LINE);
  const atom = spans.find(s => s.atomic);
  assert.equal(S.nodeAt(root, atom.at + 1), null);
  const open = spans.find(s => !s.atomic && s.text.length > 3);
  const hit = S.nodeAt(root, open.at + 1);
  assert.ok(hit && hit.offset === 1);
});

test('the map is offset by where the unit starts in the document', () => {
  // A unit is rendered on its own, so the cursor starts at its own start and
  // every offset it produces is absolute.
  const { spans } = render(LINE, 1000);
  assert.ok(spans.every(s => s.at >= 1000), 'offsets are document-absolute');
});

test('what it cannot find it leaves unwrapped rather than guessing', () => {
  // An entity decodes on the way through the renderer, so the rendered text is
  // not in the source at all. The safe answer is no offset, which means no
  // boundary, not a plausible wrong one.
  const src = 'Tom &amp; Jerry and then some.';
  const { stats, spans } = render(src);
  assert.ok(stats.unmapped >= 1, 'the decoded run is refused');
  for (const s of spans)
    assert.equal(src.substr(s.at, s.text.length), s.text, 'nothing that survived is wrong');
});

test('a heading, a list and a fence all map', () => {
  const src = '## Venues\n\n- one **bold** item\n- two\n\n```js\nconst x = 1;\n```\n';
  const { spans } = render(src);
  for (const s of spans)
    assert.equal(src.substr(s.at, s.text.length), s.text);
  assert.ok(spans.some(s => s.text === 'Venues'), 'the heading text is a place');
  assert.ok(spans.some(s => s.atomic && s.text === 'bold'), 'the bold run is atomic');
});

// A BLOCK RENDERS WITH FORMATTING WHITESPACE BETWEEN ITS TAGS, and marked puts
// a newline there. Mapping that newline is what broke a list item: it is the
// FIRST text node, indexOf finds the next newline in the SOURCE, which is past
// the whole item, and the cursor is then ahead of every real run behind it. The
// unit mapped nothing, so no boundary in it could be dragged and no point in it
// answered offsetAt. The page blamed markup, which was the wrong reason.
test('a list item maps its own text, not the newline between its tags', () => {
  const src = '1. **Is this a fact?** Delete it and link the view.';
  const { spans } = render(src);
  const body = spans.find(s => s.text.includes('Delete it'));
  assert.ok(body, `nothing mapped the item's own text: ${JSON.stringify(spans)}`);
  assert.equal(src.slice(body.at, body.at + body.text.length), body.text);
  // The end of the item is inside a mapped run, which is what a pin needs.
  assert.ok(body.at + body.text.length >= src.length - 1);
});

test('a table maps its cells, which the same newlines used to eat', () => {
  const { spans } = render('| a | b |\n| --- | --- |\n| one | two |');
  const cells = spans.map(s => s.text.trim()).filter(Boolean);
  for (const want of ['a', 'b', 'one', 'two'])
    assert.ok(cells.includes(want), `cell ${want} went unmapped: ${JSON.stringify(cells)}`);
});

// The narrow half of the rule. A whitespace node with NO newline is a real
// inline separator standing between two elements, and dropping it would put a
// hole in the map where the source has a character.
test('an inline space between two constructs still maps', () => {
  const src = '**one** *two*';
  const { spans } = render(src);
  const gap = spans.find(s => s.text === ' ');
  assert.ok(gap, `the separator was skipped: ${JSON.stringify(spans)}`);
  assert.equal(src[gap.at], ' ');
});
