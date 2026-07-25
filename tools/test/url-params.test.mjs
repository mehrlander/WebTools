// lib/url-params.js: fragment-first, query-fallback reads of a page's own
// input params. The precedence is the contract two renderer pages now depend
// on (chat-results and data-view read gz and src through it), so it is pinned
// here rather than left to each page's inline URLSearchParams call.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const win = { URLSearchParams };
new Function('window', readFileSync(path.join(repoRoot, 'lib/url-params.js'), 'utf8')).call(win, win);
const { get, first } = win.UrlParams;

const loc = (hash, search) => ({ hash: hash || '', search: search || '' });

test('the fragment wins over the query for the same key', () => {
  assert.equal(get('src', loc('#src=frag', '?src=query')), 'frag');
});

test('the query is read when the fragment lacks the key', () => {
  assert.equal(get('src', loc('#other=x', '?src=query')), 'query');
  assert.equal(get('src', loc('', '?src=query')), 'query');
});

test('an empty fragment value does not mask a real query value', () => {
  // The miss case that made "absent or empty" the rule: a link that carries a
  // bare '#src=' would otherwise shadow the ?src= that actually has the data.
  assert.equal(get('src', loc('#src=', '?src=query')), 'query');
});

test('a missing key is null, not undefined or an empty string', () => {
  assert.equal(get('nope', loc('#src=a', '?other=b')), null);
});

test('leading punctuation is optional on both halves', () => {
  assert.equal(get('src', loc('src=bare', '')), 'bare');
  assert.equal(get('src', loc('', 'src=bare')), 'bare');
});

test('values arrive URLSearchParams-decoded, so an address survives escaping', () => {
  assert.equal(get('src', loc('#src=mehrlander%2Fhome%40main%3Adata.csv', '')),
    'mehrlander/home@main:data.csv');
  assert.equal(get('src', loc('#src=mehrlander/home@main:data.csv', '')),
    'mehrlander/home@main:data.csv', 'the unescaped form reads the same');
});

test('first() takes the earliest key that has a value, in declared order', () => {
  assert.deepEqual(first(['gz', 'src'], loc('#gz=payload', '?src=addr')), ['gz', 'payload']);
  assert.deepEqual(first(['gz', 'src'], loc('', '?src=addr')), ['src', 'addr']);
  assert.deepEqual(first(['gz', 'src'], loc('', '')), [null, null]);
});

test('a malformed half degrades to the other rather than throwing', () => {
  assert.doesNotThrow(() => get('src', { hash: null, search: '?src=ok' }));
  assert.equal(get('src', { hash: null, search: '?src=ok' }), 'ok');
});

test('both renderer pages read their inputs through the helper', () => {
  for (const p of ['pages/chat-results.html', 'pages/data-view.html']) {
    const src = readFileSync(path.join(repoRoot, p), 'utf8');
    assert.match(src, /gh\.load\('url-params\.js'\)/, p + ': loads the helper');
    assert.match(src, /UrlParams\.get\('gz'\)/, p + ': reads gz through it');
    assert.match(src, /UrlParams\.get\('src'\)/, p + ': reads src through it');
    assert.doesNotMatch(src, /new URLSearchParams\(location\.(hash|search)\)[^)]*\.get\('(gz|src)'\)/,
      p + ': no inline param read left behind');
  }
});
