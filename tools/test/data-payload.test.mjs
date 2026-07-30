// lib/data-payload.js — logic tests for the one rule that decides whether a
// data toss is an envelope or bare bytes, plus the name sniff, the spec parse,
// and item normalization. The discrimination cases are the point: a payload
// that merely uses the key `items` must stay data, and an explicit kind must
// win even when the shape is ambiguous.
// Plain-realm: the module only assigns onto window.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const window = {};
// The address grammar first: parseSpec delegates to it (lib/repo-address.js),
// and this is the same load order every consuming page keeps.
for (const f of ['lib/repo-address.js', 'lib/data-payload.js']) {
  new Function('window', readFileSync(path.join(repoRoot, f), 'utf8'))(window);
}
const DP = window.DataPayload;

// ── the discriminator ──

test('a JSON object with item-shaped entries reads as an envelope', () => {
  const out = DP.read(JSON.stringify({
    title: 'T', note: 'N',
    items: [{ name: 'a.csv', content: 'x,y' }, { name: 'b.json', src: 'o/r:b.json' }],
  }));
  assert.equal(out.kind, 'envelope');
  assert.equal(out.title, 'T');
  assert.equal(out.note, 'N');
  assert.equal(out.items.length, 2);
  assert.equal(out.items[0].content, 'x,y');
  assert.deepEqual(out.items[1].spec, { repo: 'o/r', ref: '', path: 'b.json' });
});

test('an explicit kind wins even with no items array', () => {
  const out = DP.read(JSON.stringify({ kind: 'data-view/1', title: 'empty' }));
  assert.equal(out.kind, 'envelope');
  assert.equal(out.items.length, 1);          // never hands the page zero items
});

test('data that merely uses the key `items` stays bare', () => {
  // The trap: a legitimate payload whose top-level key collides with ours.
  const raw = JSON.stringify({ items: [1, 2, 3], total: 6 });
  const out = DP.read(raw);
  assert.equal(out.kind, 'bare');
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].content, raw);
});

test('an items array of non-item objects stays bare', () => {
  const raw = JSON.stringify({ items: [{ sku: 1, qty: 2 }, { sku: 2, qty: 5 }] });
  assert.equal(DP.read(raw).kind, 'bare');
});

test('a bare JSON array, a CSV, and plain text all read as bare', () => {
  for (const raw of ['[{"a":1}]', 'a,b\n1,2\n', 'just some words']) {
    assert.equal(DP.read(raw).kind, 'bare', raw);
  }
});

test('an empty items array is not enough to be an envelope', () => {
  assert.equal(DP.read(JSON.stringify({ items: [] })).kind, 'bare');
});

// ── naming ──

test('an addressed bare payload keeps its path, not a sniffed name', () => {
  const out = DP.read('col1,col2\n1,2\n', { name: 'data/design/rows.csv' });
  assert.equal(out.items[0].name, 'rows.csv');
});

test('sniffName types an inline payload by its bytes', () => {
  assert.equal(DP.sniffName('{"a":1}'), 'data.json');
  assert.equal(DP.sniffName('[1,2,3]'), 'data.json');
  assert.equal(DP.sniffName('{not really json'), 'data.txt');
  assert.equal(DP.sniffName('<!doctype html><p>hi'), 'data.html');
  assert.equal(DP.sniffName('<root><a/></root>'), 'data.xml');
  assert.equal(DP.sniffName('a,b\n1,2\n3,4'), 'data.csv');
  assert.equal(DP.sniffName('a\tb\n1\t2\n3\t4'), 'data.tsv');
  assert.equal(DP.sniffName('# Title\n\nprose'), 'data.md');
  assert.equal(DP.sniffName(''), 'data.txt');
});

test('sniffName does not call prose with one comma a CSV', () => {
  assert.equal(DP.sniffName('Hello, world\nand a second line'), 'data.txt');
});

test('an inline envelope item with no name is sniffed and numbered', () => {
  const out = DP.read(JSON.stringify({ kind: 'data-view/1', items: [{ content: 'a,b\n1,2' }] }));
  assert.equal(out.items[0].name, 'item-1.csv');
});

test('an item with only src is named from its path', () => {
  const out = DP.read(JSON.stringify({ kind: 'data-view/1', items: [{ src: 'o/r@br:deep/path/rows.csv' }] }));
  assert.equal(out.items[0].name, 'rows.csv');
  assert.equal(out.items[0].spec.ref, 'br');
  assert.equal(out.items[0].content, null);   // fetched later, by the page
});

// ── spec parsing ──

// A missing @ref reads as '' since the delegation to lib/repo-address.js: this
// module used to fill in 'main', which was a guess about a repo's default
// branch name rather than a reading of the address. Fetching wants '' (the
// contents API resolves the default), and the ref a LINK needs is supplied at
// the link-building boundary instead (RepoAddress.ref, in the viewer's
// fileUrls).
test('parseSpec splits owner/repo[@ref]:path, and returns null otherwise', () => {
  assert.deepEqual(DP.parseSpec('o/r:a/b.json'), { repo: 'o/r', ref: '', path: 'a/b.json' });
  assert.deepEqual(DP.parseSpec('o/r@feat/x:a.json'), { repo: 'o/r', ref: 'feat/x', path: 'a.json' });
  assert.equal(DP.parseSpec('pages/local.json'), null);
  assert.equal(DP.parseSpec(''), null);
});

// ── view pass-through ──

test('view rides through verbatim, including an unknown id', () => {
  const out = DP.read(JSON.stringify({
    kind: 'data-view/1',
    items: [{ name: 'a.csv', content: 'x', view: 'table' }, { name: 'b.txt', content: 'y', view: 'nonsense' }],
  }));
  assert.equal(out.items[0].view, 'table');
  // Not validated here: the viewer's resolveDefaultMode falls back on its own,
  // so this module never needs to track the mode list.
  assert.equal(out.items[1].view, 'nonsense');
});
