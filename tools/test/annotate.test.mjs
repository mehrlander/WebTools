// annotate.test.mjs — the annotation kit's pure core: quote anchors survive
// the round trip (range → {exact, prefix, suffix} → range), duplicates
// disambiguate on context, structural context (css path, heading trail)
// resolves back, and the serializations carry what a reader needs. The jot
// save is exercised against a stubbed GH to pin the fresh-read → mutate →
// save shape without a network. The pointer UI (selection bubble, element
// pick, region drag) is real-browser behavior and is not simulated here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow } from './bootstrap.mjs';
import { loadKit } from './bootstrap.mjs';

const { window } = makeWindow({
  html: `<!doctype html><html><head><title>Sample doc</title></head><body>
    <article id="art">
      <h1>Doc title</h1>
      <p id="p1">The quick brown fox jumps over the lazy dog.</p>
      <h2>Section two</h2>
      <p id="p2">A repeated phrase sits here. Some middle text. A repeated phrase sits here too.</p>
      <ul><li id="li1">First item with detail</li></ul>
    </article>
  </body></html>`,
});
const doc = window.document;

loadKit('annotate.js', { window });
const A = window.Annotate;

test('quote anchor round-trips through the text index', () => {
  const p1 = doc.getElementById('p1').firstChild;
  const r = doc.createRange();
  r.setStart(p1, 4);            // "quick brown fox"
  r.setEnd(p1, 19);
  const q = A._quoteFor(doc.body, r);
  assert.equal(q.exact, 'quick brown fox');
  assert.ok(q.prefix.endsWith('The '));
  assert.ok(q.suffix.startsWith(' jumps'));

  const back = A._resolveQuote(doc.body, q);
  assert.ok(back, 'quote re-resolves');
  assert.equal(back.toString(), 'quick brown fox');
});

test('a duplicated exact disambiguates on prefix/suffix context', () => {
  const p2 = doc.getElementById('p2').firstChild;
  const text = p2.data;
  const second = text.indexOf('A repeated phrase', 10);
  const r = doc.createRange();
  r.setStart(p2, second);
  r.setEnd(p2, second + 'A repeated phrase'.length);
  const q = A._quoteFor(doc.body, r);
  assert.equal(q.exact, 'A repeated phrase');
  assert.ok(q.prefix.includes('middle text'), 'context captured the second occurrence');

  const back = A._resolveQuote(doc.body, q);
  const idx = A._textIndex(doc.body);
  const at = idx.text.indexOf(back.toString(), idx.text.indexOf('middle'));
  assert.ok(at > -1, 'resolved to the occurrence after the middle text');
});

test('css path resolves back to the element; heading trail reads like a citation', () => {
  const li = doc.getElementById('li1');
  const sel = A._cssPath(li, doc.body);
  assert.equal(doc.querySelector(sel), li, sel);
  assert.equal(A._headingTrail(li), 'Doc title › Section two');
  assert.equal(A._headingTrail(doc.getElementById('p1')), 'Doc title');
});

test('enable + add + serialize: markdown and JSON carry the set', () => {
  A.enable({ doc, subject: { title: 'docs/sample.md', url: 'https://example.test/sample' } });
  assert.ok(A.enabled);

  const p1 = doc.getElementById('p1').firstChild;
  const r = doc.createRange();
  r.setStart(p1, 4);
  r.setEnd(p1, 19);
  const q = A._quoteFor(doc.body, r);
  A.add({ type: 'text', quote: q, selector: 'p#p1', label: 'Doc title' }, 'tighten this');
  A.add({ type: 'element', selector: '#li1', label: 'Doc title › Section two', excerpt: 'First item with detail' }, 'promote to heading');

  const md = A.toMarkdown();
  assert.ok(md.startsWith('# Notes — docs/sample.md'));
  assert.ok(md.includes('https://example.test/sample'));
  assert.ok(md.includes('2 notes'));
  assert.ok(md.includes('> quick brown fox'));
  assert.ok(md.includes('**Note:** tighten this'), 'the reader’s own words are labeled as such');
  assert.ok(md.includes('Context: Doc title › Section two'));
  assert.ok(md.includes('promote to heading'));

  const j = A.toJSON();
  assert.equal(j.format, 'annotate/1');
  assert.equal(j.notes.length, 2);
  assert.equal(j.notes[0].type, 'text');
  assert.equal(j.notes[0].quote.exact, 'quick brown fox');
  assert.equal(j.notes[1].selector, '#li1');
});

test('saveJot appends one jot through fresh-read → mutate → save', async () => {
  const calls = [];
  window.TOKEN = 't0ken';
  window.GH = class {
    constructor(opts) { this.opts = opts; }
    async get() { const e = new Error('missing'); e.status = 404; throw e; }
    async save(path, data, message) { calls.push({ path, data, message, repo: this.opts.repo }); }
  };
  const jot = await A.saveJot();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].repo, 'mehrlander/web-tools-private');
  assert.equal(calls[0].path, 'lists/jots.json');
  assert.equal(calls[0].data.items.length, 1);
  assert.ok(calls[0].data.items[0].text.startsWith('# Notes — docs/sample.md'));
  assert.ok(calls[0].message.includes('via annotate'));
  assert.ok(jot.id.startsWith('j'));
});

test('a two-bullet selection serializes clean: edges trimmed, markers restored', () => {
  // Reproduces the first field test (2026-08-08): selecting across two <li>s
  // from the whitespace before the first one produced a quote opening with
  // blank "> " lines and no bullet markers.
  doc.body.insertAdjacentHTML('beforeend', `
    <ul id="pair">
      <li><b>First.md</b> — the first thing, described.</li>
      <li><b>Second.md</b> — the second thing, described.</li>
    </ul>`);
  const ul = doc.getElementById('pair');
  const r = doc.createRange();
  r.setStart(ul, 0);                                  // before the first li: pure whitespace
  r.setEnd(ul.lastElementChild.lastChild, ul.lastElementChild.lastChild.data.length);

  const q = A._quoteFor(doc.body, r);
  assert.ok(q.exact.startsWith('First.md'), 'leading inter-element whitespace trimmed from the anchor');
  assert.ok(q.exact.endsWith('described.'));

  const display = A._displayFor(r);
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  A.add({ type: 'text', quote: q, display, label: '' }, 'double bullets');
  const md = A.toMarkdown();
  assert.ok(md.includes('> - First.md — the first thing, described.'), md);
  assert.ok(md.includes('> - Second.md — the second thing, described.'));
  assert.ok(!/^>\s*$/m.test(md.split('## 1.')[1].split('double bullets')[0].trim().split('\n')[0]),
    'the quote does not open with a blank quoted line');
  A.clear();
});

test('remove and clear keep the list and paint state consistent', () => {
  A.add({ type: 'text', quote: { exact: 'one', prefix: '', suffix: '' } }, 'n1');
  A.add({ type: 'text', quote: { exact: 'two', prefix: '', suffix: '' } }, 'n2');
  assert.equal(A.items.length, 2);
  A.remove(A.items[0].id);
  assert.equal(A.items.length, 1);
  A.clear();
  assert.equal(A.items.length, 0);
  A.disable();
  assert.ok(!A.enabled);
});
