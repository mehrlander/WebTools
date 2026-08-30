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

// The control opens a MENU: a heading has room for one mark, and the reader's
// question at a heading is "what can I do with this part".
const openMenu = (host, i) => {
  const heads = [...host.querySelectorAll('[data-md-section]')];
  heads[i].querySelector('button').click();
  const menus = [...window.document.body.querySelectorAll('div')]
    .filter(n => n.className.includes('z-[80]'));
  return menus[menus.length - 1];
};
const rowLabels = (menu) => [...menu.querySelectorAll('button')]
  .map(b => b.querySelector('span span').textContent);

test('the control copies its own section, with the address', async () => {
  const host = window.document.createElement('div');
  const copied = [];
  window.io = { copy: async (t) => { copied.push(t); } };
  mdDoc.render(host, DOC, { addr: ADDR });
  const menu = openMenu(host, 1);
  menu.querySelectorAll('button')[0].click();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(copied.length, 1);
  assert.match(copied[0], /^From mehrlander\/web-tools@main:docs\/APP\.md lines /);
  assert.match(copied[0], /\n## First\n/);
  delete window.io;
});

test('copy for revision leads with an ask the answer has to fit', async () => {
  // A revision that arrives as advice about the section is not a revision, so
  // the ask names the shape of the answer as well as the job.
  const host = window.document.createElement('div');
  const copied = [];
  window.io = { copy: async (t) => { copied.push(t); } };
  mdDoc.render(host, DOC, { addr: ADDR });
  const menu = openMenu(host, 1);
  menu.querySelectorAll('button')[1].click();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(copied[0].startsWith(mdDoc.REVISE), true);
  assert.match(copied[0], /\n\nFrom mehrlander\/web-tools@main:docs\/APP\.md lines /);
  assert.match(copied[0], /\n## First\n/);
  delete window.io;
});

test('the note row appears only where the annotator is actually running', () => {
  // A control that opens nothing is worse than an absent one: the reader has
  // no way to tell which kind they are looking at.
  const host = window.document.createElement('div');
  mdDoc.render(host, DOC, { addr: ADDR });
  assert.deepEqual(rowLabels(openMenu(host, 1)), ['Copy section', 'Copy for revision']);

  window.Annotate = { enabled: true, noteSection: () => true };
  const host2 = window.document.createElement('div');
  mdDoc.render(host2, DOC, { addr: ADDR });
  assert.deepEqual(rowLabels(openMenu(host2, 1)),
    ['Copy section', 'Copy for revision', 'Note this section']);

  window.Annotate = { enabled: false, noteSection: () => true };
  const host3 = window.document.createElement('div');
  mdDoc.render(host3, DOC, { addr: ADDR });
  assert.equal(rowLabels(openMenu(host3, 1)).length, 2, 'present but not enabled is still no row');
  delete window.Annotate;
});

test('the menu survives a scroll that was already in flight when it opened', () => {
  // A scrollIntoView, or a phone still settling from a flick, delivers its
  // scroll event AFTER the tap that opened the menu. Closing on any scroll lost
  // that race: the menu opened and vanished in the same frame. It follows the
  // heading instead, and closes only when the heading leaves the viewport.
  const host = window.document.createElement('div');
  window.document.body.append(host);
  mdDoc.render(host, DOC, { addr: ADDR });
  const menu = openMenu(host, 1);
  assert.ok(menu, 'the menu opened');
  window.dispatchEvent(new window.Event('scroll'));
  assert.equal(window.document.body.contains(menu), true, 'still open after a scroll');
  host.remove();
});

test('a tap outside closes it, and so does Escape', () => {
  const host = window.document.createElement('div');
  window.document.body.append(host);
  mdDoc.render(host, DOC, { addr: ADDR });

  const m1 = openMenu(host, 1);
  window.document.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  assert.equal(window.document.body.contains(m1), false);

  const m2 = openMenu(host, 1);
  const esc = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  window.document.dispatchEvent(esc);
  assert.equal(window.document.body.contains(m2), false);
  host.remove();
});

// ── Declare ─────────────────────────────────────────────────────────────────

test('any node in a render can be answered for in the source\'s terms', () => {
  const host = window.document.createElement('div');
  window.document.body.append(host);
  mdDoc.render(host, DOC, { addr: ADDR });
  const p = [...host.querySelectorAll('p')].find(n => n.textContent.startsWith('A paragraph'));
  const loc = mdDoc.locate(p);
  assert.equal(loc.section.title, 'First', 'a paragraph belongs to the heading it is under');
  assert.equal(loc.addr.path, 'docs/APP.md');
  assert.equal(mdDoc.sourceRef(p),
    `docs/APP.md § First (lines ${loc.section.startLine}-${loc.section.endLine})`);
  host.remove();
});

test('a node before the first heading locates the document but no section', () => {
  const host = window.document.createElement('div');
  window.document.body.append(host);
  mdDoc.render(host, 'Preamble prose.\n\n# Later\n\nmore\n', { addr: ADDR });
  const p = host.querySelector('p');
  const loc = mdDoc.locate(p);
  assert.equal(loc.section, null);
  assert.equal(mdDoc.sourceRef(p), 'docs/APP.md', 'the file, with nothing invented after it');
  host.remove();
});

test('a node outside any declared render locates nothing', () => {
  const loose = window.document.createElement('p');
  window.document.body.append(loose);
  assert.equal(mdDoc.locate(loose), null);
  assert.equal(mdDoc.sourceRef(loose), '');
  loose.remove();
});

// ── Enhance ─────────────────────────────────────────────────────────────────

test('enhance does the same over markup another renderer produced', () => {
  // kits/guide-render.js renders a doc with the link re-aiming a guide body
  // needs. That reader wants the containment and the controls without giving
  // up the re-aiming, so render() is enhance() with a parse in front of it.
  const box = window.document.createElement('div');
  window.document.body.append(box);
  box.innerHTML = marked.parse(DOC);
  const out = mdDoc.enhance(box, DOC, { addr: ADDR });
  assert.equal(out.sections.length, 4);
  assert.equal(box.querySelectorAll('[data-md-section]').length, 4);
  assert.equal(box.querySelectorAll('[data-md-scroll]').length, 1);
  assert.equal(mdDoc.locate(box.querySelector('p')).addr.path, 'docs/APP.md');
  box.remove();
});

test('enhancing twice does not stack a second control on a heading', () => {
  const box = window.document.createElement('div');
  box.innerHTML = marked.parse(DOC);
  mdDoc.enhance(box, DOC, { addr: ADDR });
  mdDoc.enhance(box, DOC, { addr: ADDR });
  const h = box.querySelector('[data-md-section]');
  assert.equal(h.querySelectorAll('button').length, 1);
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

// ── The markdown hierarchy, which is not the DOM's ──────────────────────────
// A rendered document carries two structures and they disagree: `### Under
// first` is INSIDE `## First` in markdown and its flat sibling in the DOM.
// Nothing in the render says so; the ranks split already knows do.

const NEST = [
  '# Top', '', 'Opening.', '',
  '## One', '', 'A paragraph.', '', '- a', '- b', '',
  '### One deep', '', 'More.', '', '```js', 'code();', '```', '',
  '## Two', '', 'Last, with a [link](x).', '',
  '| a | b |', '| - | - |', '| 1 | 2 |', '',
].join('\n');

test('chain: ancestors by rank, innermost first, stopping at the top', () => {
  const secs = mdDoc.split(NEST);
  const i = secs.findIndex(s => s.title === 'One deep');
  assert.deepEqual(mdDoc.chain(secs, i).map(s => s.title), ['One deep', 'One', 'Top']);
  // A top-level section is its own chain.
  const t = secs.findIndex(s => s.title === 'Top');
  assert.deepEqual(mdDoc.chain(secs, t).map(s => s.title), ['Top']);
  // And a later peer does not pick up the earlier one's children.
  const two = secs.findIndex(s => s.title === 'Two');
  assert.deepEqual(mdDoc.chain(secs, two).map(s => s.title), ['Two', 'Top']);
});

test('children: one rank finer, and only until a peer closes the run', () => {
  const secs = mdDoc.split(NEST);
  const top = secs.findIndex(s => s.title === 'Top');
  assert.deepEqual(mdDoc.children(secs, top).map(s => s.title), ['One', 'Two']);
  const one = secs.findIndex(s => s.title === 'One');
  assert.deepEqual(mdDoc.children(secs, one).map(s => s.title), ['One deep']);
  const two = secs.findIndex(s => s.title === 'Two');
  assert.deepEqual(mdDoc.children(secs, two), []);
});

test('stats: counts markdown units, and a fence is one block not its contents', () => {
  const secs = mdDoc.split(NEST);
  const deep = mdDoc.stats(secs.find(s => s.title === 'One deep').raw);
  assert.equal(deep.code, 1);
  assert.equal(deep.paragraphs, 1, 'the fence body is not prose');
  assert.equal(deep.listItems, 0);

  const one = mdDoc.stats(secs.find(s => s.title === 'One').raw);
  assert.equal(one.listItems, 2);
  assert.equal(one.code, 1, 'its subsection is inside it');

  const two = mdDoc.stats(secs.find(s => s.title === 'Two').raw);
  assert.equal(two.tables, 1);
  assert.equal(two.links, 1);
  assert.ok(two.words > 0 && two.chars > 0 && two.lines > 0);
});

test('stats: a heading-only section counts nothing but itself', () => {
  const secs = mdDoc.split('# Solo\n');
  assert.equal(mdDoc.stats(secs[0].raw).paragraphs, 0);
  assert.equal(mdDoc.stats(secs[0].raw).headings, 0, 'its own heading is not a child');
});

test('headOf: reaches the heading node of a section other than the located one', () => {
  const host = window.document.createElement('div');
  window.document.body.append(host);
  const { box } = mdDoc.render(host, NEST, {});
  const secs = box.__mdDoc ? box.__mdDoc.sections : mdDoc.split(NEST);
  const i = secs.findIndex(s => s.title === 'One');
  const h = mdDoc.headOf(box, i);
  assert.ok(h, 'the heading node is found by index');
  assert.match(h.textContent, /^One/);
  assert.equal(mdDoc.headOf(box, 999), null);
  host.remove();
});
