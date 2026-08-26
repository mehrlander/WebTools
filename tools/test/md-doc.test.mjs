// lib/kits/md-doc.js — the two things a rendered markdown document owes its
// reader: a wide table that scrolls on its own, and a section that can be
// taken out as SOURCE with the address it came from.
//
// Regression origin for the first half: a doc opened in the Map view's swipe
// deck carried a wide table, and the slide scrolled sideways as one piece, so
// dragging to column six dragged the prose with it. chat-render.js had already
// fixed the same thing for a transcript (tools/test/chat-render-wide-table.test.mjs
// pins that one); this half of the estate had not followed.
//
// What these cannot assert is layout: jsdom computes no widths, so "it scrolls"
// is a browser measurement. What is pinned here is the structure that makes the
// scrolling possible, and all of the cutting, which is pure.
//
// The section half runs against the REAL marked, not a stub: what a heading is,
// and whether a `#` inside a fence is one, is the parser's answer and the whole
// reason split() goes through the lexer rather than a line regex.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, makeWindow } from './bootstrap.mjs';
import { marked } from 'marked';

const { window } = makeWindow();
window.marked = marked;
new Function('window', 'document', readFileSync(path.join(repoRoot, 'lib/kits/md-doc.js'), 'utf8'))(window, window.document);
const mdDoc = window.mdDoc;

const DOC = [
  '# Title',
  '',
  'Opening prose.',
  '',
  '## First',
  '',
  'A paragraph.',
  '',
  '### Under first',
  '',
  'More.',
  '',
  '## Second',
  '',
  '| a | b |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '```sh',
  '# not a heading',
  '```',
  '',
].join('\n');

const ADDR = { repo: 'mehrlander/web-tools', ref: 'main', path: 'docs/APP.md',
               url: 'https://github.com/mehrlander/web-tools/blob/main/docs/APP.md' };

// ── Contain ─────────────────────────────────────────────────────────────────

test('a table is wrapped in its own horizontal scroll box', () => {
  const host = window.document.createElement('div');
  mdDoc.render(host, DOC, { addr: ADDR });
  const t = host.querySelector('table');
  assert.ok(t, 'the fixture produced a table');
  assert.equal(t.parentElement.tagName, 'DIV');
  assert.match(t.parentElement.className, /overflow-x-auto/);
  assert.match(t.parentElement.className, /max-w-full/);
});

test('the table is NOT forced to max-content', () => {
  // Typography's `width: 100%` still wraps cells, so a table that CAN fit
  // still fits. Forcing max-content would make every prose-heavy table scroll
  // rather than wrap, which is the wrong trade for the common case.
  const host = window.document.createElement('div');
  mdDoc.render(host, DOC, { addr: ADDR });
  const t = host.querySelector('table');
  assert.equal(t.style.minWidth, '');
  assert.doesNotMatch(t.parentElement.className, /min-w-max|w-max/);
});

test('wrapping twice mints one box, not two', () => {
  // contain() is called by render and can be called again by a host that
  // re-runs it; a second wrapper would nest a scroller inside a scroller and
  // give the reader two places to drag.
  const host = window.document.createElement('div');
  mdDoc.render(host, DOC, { addr: ADDR });
  mdDoc.contain(host);
  assert.equal(host.querySelectorAll('[data-md-scroll]').length, 1);
});

test('prose with no table is left alone', () => {
  const host = window.document.createElement('div');
  mdDoc.render(host, '# Only\n\nWords.\n', { addr: ADDR });
  assert.equal(host.querySelectorAll('[data-md-scroll]').length, 0);
});

test('containment is an inline style, not a class that may never be generated', () => {
  // A utility class arriving from a JS string depends on the Tailwind browser
  // build having generated a rule for it, and when it has not there is no error
  // anywhere. The class stays as the readable statement of intent; the inline
  // style is what makes it true.
  const host = window.document.createElement('div');
  mdDoc.render(host, DOC, { addr: ADDR });
  const box = host.querySelector('[data-md-scroll]');
  assert.equal(box.style.overflowX, 'auto');
  assert.equal(box.style.maxWidth, '100%');
});

test('a code block scrolls as itself, without waiting for the typography plugin', () => {
  // `pre` is white-space: pre, so a long command line does not wrap at all. The
  // rule that normally saves it belongs to @tailwindcss/typography, and a page
  // rendering prose without that plugin has overflow-x: visible on every block.
  const host = window.document.createElement('div');
  mdDoc.render(host, DOC, { addr: ADDR });
  const pre = host.querySelector('pre');
  assert.ok(pre, 'the fixture produced a code block');
  assert.equal(pre.style.overflowX, 'auto');
  assert.equal(pre.style.maxWidth, '100%');
  assert.equal(pre.parentElement.hasAttribute('data-md-scroll'), false,
    'a pre is already a block with its own edges: no wrapper is minted for it');
});

// ── Cut ─────────────────────────────────────────────────────────────────────

test('every heading is a section, and a fenced # is not', () => {
  const secs = mdDoc.split(DOC);
  assert.deepEqual(secs.map(s => s.title), ['Title', 'First', 'Under first', 'Second']);
});

test('a section runs to the next heading of equal or higher rank', () => {
  // Wikipedia's rule: `## First` carries its `###` with it, and the `###` still
  // has a section of its own. A section cut at the next heading of ANY rank
  // would hand over the first paragraph of an argument and call it the section.
  const secs = mdDoc.split(DOC);
  const first = secs.find(s => s.title === 'First');
  assert.match(first.raw, /### Under first/);
  assert.doesNotMatch(first.raw, /## Second/);
  const under = secs.find(s => s.title === 'Under first');
  assert.doesNotMatch(under.raw, /## Second/);
});

test('a section carries the exact source, not the rendered text', () => {
  const second = mdDoc.split(DOC).find(s => s.title === 'Second');
  assert.match(second.raw, /\| a \| b \|/, 'the table keeps its pipes');
  assert.match(second.raw, /```sh/, 'the fence keeps its fence');
  assert.equal(second.raw.startsWith('## Second'), true, 'it leads with its own heading');
  assert.equal(second.raw, second.raw.trimEnd(), 'no trailing blank lines');
});

test('line numbers point at the source', () => {
  const lines = DOC.split('\n');
  for (const s of mdDoc.split(DOC)) {
    assert.equal(lines[s.startLine - 1], '#'.repeat(s.depth) + ' ' + s.title,
      'startLine lands on the heading for ' + s.title);
    assert.ok(s.endLine >= s.startLine);
    assert.equal(lines.slice(s.startLine - 1, s.endLine).join('\n'), s.raw,
      'the span reproduces the section for ' + s.title);
  }
});

test('a document with no headings has no sections, and still renders', () => {
  const host = window.document.createElement('div');
  const out = mdDoc.render(host, 'Just a paragraph.\n', { addr: ADDR });
  assert.deepEqual(out.sections, []);
  assert.match(host.textContent, /Just a paragraph/);
});

// ── The payload ─────────────────────────────────────────────────────────────

test('the copied payload leads with the address and the line span', () => {
  const sec = mdDoc.split(DOC).find(s => s.title === 'First');
  const text = mdDoc.payload(sec, ADDR);
  const [first, second] = text.split('\n');
  assert.equal(first, `From mehrlander/web-tools@main:docs/APP.md lines ${sec.startLine}-${sec.endLine}`);
  assert.equal(second, `${ADDR.url}#L${sec.startLine}-L${sec.endLine}`);
  assert.match(text, /\n\n## First\n/, 'a blank line, then the section verbatim');
});

test('the payload degrades rather than lying when there is no address', () => {
  // A section with no address is still worth copying; what it must not do is
  // print an address-shaped line with the parts missing.
  const sec = mdDoc.split(DOC)[0];
  const text = mdDoc.payload(sec, {});
  assert.doesNotMatch(text.split('\n')[0], /^From .*:/);
  assert.match(text, /^From lines /);
});

// ── The control ─────────────────────────────────────────────────────────────

test('each top-level heading gets a copy control, and it is not part of the text', () => {
  const host = window.document.createElement('div');
  mdDoc.render(host, DOC, { addr: ADDR });
  const heads = [...host.querySelectorAll('[data-md-section]')];
  assert.equal(heads.length, 4);
  for (const h of heads) {
    const btn = h.querySelector('button');
    assert.ok(btn, 'the heading carries a button');
    // kits/annotate.js rejects any subtree carrying this attribute when it
    // walks the document's text to anchor a quote. Without it, a selection
    // dragged across a heading carries an invisible glyph into the quote and
    // the anchor cannot re-find itself.
    assert.equal(btn.hasAttribute('data-annotate-ui'), true);
  }
});

test('the control copies its own section, with the address', async () => {
  const host = window.document.createElement('div');
  const copied = [];
  window.io = { copy: async (t) => { copied.push(t); } };
  mdDoc.render(host, DOC, { addr: ADDR });
  const heads = [...host.querySelectorAll('[data-md-section]')];
  heads[1].querySelector('button').click();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(copied.length, 1);
  assert.match(copied[0], /^From mehrlander\/web-tools@main:docs\/APP\.md lines /);
  assert.match(copied[0], /\n## First\n/);
  delete window.io;
});

test('a heading inside a blockquote is not a section', () => {
  // split() takes top-level heading TOKENS and render() pairs them against the
  // box's DIRECT-child headings. Both readings say "at the document's own
  // level", which is what keeps the two lists in step.
  const host = window.document.createElement('div');
  const src = '# Real\n\ntext\n\n> ## Quoted\n>\n> more\n';
  const out = mdDoc.render(host, src, { addr: ADDR });
  assert.deepEqual(out.sections.map(s => s.title), ['Real']);
  assert.equal(host.querySelectorAll('[data-md-section]').length, 1);
  assert.equal(host.querySelector('blockquote h2').hasAttribute('data-md-section'), false);
});

test('render can be asked for prose alone', () => {
  const host = window.document.createElement('div');
  mdDoc.render(host, DOC, { addr: ADDR, sections: false });
  assert.equal(host.querySelectorAll('[data-md-section]').length, 0);
  assert.equal(host.querySelectorAll('[data-md-scroll]').length, 1, 'containment is not optional');
});

test('html() returns the body alone when the caller owns the container', () => {
  const out = mdDoc.html(DOC, { proseClass: '' });
  assert.equal(out.startsWith('<div'), false, 'no second prose box');
  assert.match(out, /data-md-scroll/, 'the table is still contained');
});
