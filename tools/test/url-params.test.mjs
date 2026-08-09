// lib/kits/url-params.js: fragment-first, query-fallback reads of a page's own
// input params. The precedence is the contract two renderer pages now depend
// on (chat-results and data-view read gz and src through it), so it is pinned
// here rather than left to each page's inline URLSearchParams call.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const win = { URLSearchParams };
new Function('window', readFileSync(path.join(repoRoot, 'lib/kits/url-params.js'), 'utf8')).call(win, win);
const { get, first, source, withKey } = win.UrlParams;

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

test('source names the half get() would take, under the same rule', () => {
  // For callers whose several keys must come from one source (StageLink.read),
  // or whose fragment must be parsed raw rather than URLSearchParams-decoded.
  assert.equal(source('stage', loc('#stage=frag', '?stage=query')), 'hash');
  assert.equal(source('stage', loc('', '?stage=query')), 'search');
  assert.equal(source('stage', loc('#stage=', '?stage=query')), 'search', 'empty fragment value is a miss');
  assert.equal(source('stage', loc('#stage=', '')), null);
  assert.equal(source('stage', loc('', '')), null);
});

test('a malformed half degrades to the other rather than throwing', () => {
  assert.doesNotThrow(() => get('src', { hash: null, search: '?src=ok' }));
  assert.equal(get('src', { hash: null, search: '?src=ok' }), 'ok');
});

test('withKey sets a key, replacing in place rather than appending', () => {
  assert.equal(withKey('#item=a', 'item', 'b'), '#item=b');
  assert.equal(withKey('#src=x&item=a&keep=1', 'item', 'b'), '#src=x&item=b&keep=1',
    'position is held, so a fragment does not reshuffle as it is edited');
  assert.equal(withKey('#src=x', 'item', 'b'), '#src=x&item=b');
});

test('withKey seeds an empty fragment when handed a bare marker', () => {
  // data-view passes `location.hash || '#'` for exactly this: an empty hash
  // has no marker to preserve, and the result has to come back assignable.
  assert.equal(withKey('#', 'item', 'b'), '#item=b');
  assert.equal(withKey('', 'item', 'b'), 'item=b', 'no marker in, no marker out');
  assert.equal(withKey('?a=1', 'item', 'b'), '?a=1&item=b', 'a query keeps its own marker');
});

test('withKey leaves every other segment byte for byte', () => {
  // The reason this is string surgery and not a URLSearchParams round-trip: a
  // data-view fragment carries the gzipped payload beside the view key, and a
  // re-serialize would rewrite tens of kilobytes to edit four bytes.
  const payload = 'H4sIAAAAAAAA_ytJLS7RLcvPTEnVBQCbY-mQCwAAAA';
  const before = '#gz=' + payload + '&item=a';
  const after = withKey(before, 'item', 'b');
  assert.equal(after, '#gz=' + payload + '&item=b');
  assert.equal(get('gz', loc(after)), payload, 'and the payload still reads back');
});

test('withKey removes the key on an empty value', () => {
  assert.equal(withKey('#gz=p&item=a', 'item', ''), '#gz=p');
  assert.equal(withKey('#gz=p&item=a', 'item', null), '#gz=p');
  assert.equal(withKey('#item=a', 'item', null), '', 'no bare marker left behind');
});

test('withKey round-trips a value through get(), escaping included', () => {
  for (const v of ['raw.csv', 'data/nested path.json', 'a&b=c', '100%', 'x+y']) {
    assert.equal(get('item', loc(withKey('#', 'item', v))), v, v);
  }
});

test('both renderer pages read their inputs through the helper', () => {
  for (const p of ['pages/chat-results.html', 'pages/data-view.html']) {
    const src = readFileSync(path.join(repoRoot, p), 'utf8');
    assert.match(src, /gh\.load\('kits\/url-params\.js'\)/, p + ': loads the helper');
    assert.match(src, /UrlParams\.get\('gz'\)/, p + ': reads gz through it');
    assert.match(src, /UrlParams\.get\('src'\)/, p + ': reads src through it');
    assert.doesNotMatch(src, /new URLSearchParams\(location\.(hash|search)\)[^)]*\.get\('(gz|src)'\)/,
      p + ': no inline param read left behind');
  }
});
