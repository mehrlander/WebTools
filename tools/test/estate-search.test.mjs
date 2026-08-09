// lib/kits/estate-search.js — the shared search core: the per-(repo, ref) tree
// cache with its failure backoff (a failed fetch is remembered briefly, never
// cached as an empty tree), file-name search across repos with per-repo error
// reporting, the code-search call's shape (scope qualifier, text-match
// fragments), the session grep over what a record quotes, and reset. Driven
// over a fake GH; no network, no pixels, no Alpine.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

const REGISTRY = 'me/registry';

let FILES = {};    // registry "<path>" -> parsed JSON
let TREES = {};    // "<repo>@<ref>" -> [blob paths]; absent -> the fetch throws
let SEARCH = null; // response served for /search/code
let TREE_CALLS = [];

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  get headers() { return { Accept: 'application/vnd.github.v3+json' }; }
  async get(name) {
    if (this.repo === REGISTRY && FILES[name]) return { text: JSON.stringify(FILES[name]) };
    throw Object.assign(new Error('404'), { status: 404 });
  }
  async req(path) {
    const tm = String(path).match(/^git\/trees\/([^?]+)/);
    if (tm) {
      const key = this.repo + '@' + decodeURIComponent(tm[1]);
      TREE_CALLS.push(key);
      if (TREES[key]) return { tree: TREES[key].map(p => ({ type: 'blob', path: p })), truncated: false };
      throw Object.assign(new Error('GitHub Error 404'), { status: 404 });
    }
    if (String(path).startsWith('/search/code') && SEARCH) return SEARCH;
    throw Object.assign(new Error('404'), { status: 404 });
  }
}

const { window } = makeWindow();
window.TOKEN = 'tkn';
window.GH = FakeGH;
await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/repo-sessions-cache.js',
  'lib/kits/estate-search.js',
]);
const ES = window.EstateSearch;

test('tree: one fetch per (repo, ref), then the cache answers', async () => {
  TREES = { 'me/tools@HEAD': ['a.js', 'lib/b.js'] };
  TREE_CALLS = [];
  const t1 = await ES.tree('me/tools', '', 'tkn');
  const t2 = await ES.tree('me/tools', 'HEAD', 'tkn');
  assert.deepEqual([...t1.paths], ['a.js', 'lib/b.js']);
  assert.equal(t1, t2);                       // '' and 'HEAD' are one key
  assert.deepEqual(TREE_CALLS, ['me/tools@HEAD']);
});

test('tree: a failure is not cached as an empty tree, and backs off rather than hammering', async () => {
  TREE_CALLS = [];
  await assert.rejects(() => ES.tree('me/gone', '', 'tkn'), /GitHub Error 404/);
  // Within the backoff window the fetch is not retried; the error says so.
  await assert.rejects(() => ES.tree('me/gone', '', 'tkn'), /recently failed/);
  assert.equal(TREE_CALLS.length, 1);
});

test('names: matches across repos at their own refs; an unreadable tree is reported, not fatal', async () => {
  TREES = {
    'me/tools@HEAD': ['lib/gh-api.js', 'README.md'],
    'me/tools@dev':  ['lib/gh-api.js', 'lib/only-on-dev.js'],
  };
  const res = await ES.names({ q: 'gh-api', repos: [{ repo: 'me/tools', ref: 'dev' }], token: 'tkn' });
  assert.deepEqual([...res.hits.map(h => h.path)], ['lib/gh-api.js']);
  assert.equal(res.hits[0].ref, 'dev');
  const mixed = await ES.names({
    q: 'js', repos: [{ repo: 'me/tools', ref: 'dev' }, { repo: 'me/gone', ref: '' }], token: 'tkn' });
  assert.equal(mixed.hits.length, 2);          // dev tree still answered
  assert.equal(mixed.errors.length, 1);
  assert.match(mixed.errors[0], /me\/gone/);
});

test('code: scope rides the query, fragments become clipped snippets', async () => {
  SEARCH = { total_count: 1, items: [{
    path: 'lib/x.js', repository: { full_name: 'me/tools' },
    text_matches: [{ fragment: 'the needle sits here in the haystack of a longer line' }],
  }] };
  const res = await ES.code({ q: 'needle', scope: 'user:me', token: 'tkn' });
  assert.equal(res.total, 1);
  assert.equal(res.hits[0].path, 'lib/x.js');
  assert.match(res.hits[0].frag, /needle sits here/);
});

test('sessions: greps what a record quotes, caches the corpus, newest first', async () => {
  FILES = {
    'state/sessions.json': { rows: [
      { id: 'aaaa1111', day: '2026-08-02' },
      { id: 'bbbb2222', day: '2026-08-05' },
    ] },
    'sessions/2026/08/2026-08-02-aaaa1111.json':
      { day: '2026-08-02', opening_ask: 'about the wayback urls', prompts: [], last_message: 'done' },
    'sessions/2026/08/2026-08-05-bbbb2222.json':
      { day: '2026-08-05', opening_ask: 'other', prompts: [{ at: 't', text: 'wayback again please' }], last_message: '' },
  };
  const res = await ES.sessions({ q: 'wayback', registry: REGISTRY, token: 'tkn' });
  assert.deepEqual([...res.hits.map(h => h.id)], ['bbbb2222', 'aaaa1111']);
  // The corpus is cached: a changed store answers the same until reset.
  FILES['sessions/2026/08/2026-08-02-aaaa1111.json'].opening_ask = 'edited away';
  const again = await ES.sessions({ q: 'wayback', registry: REGISTRY, token: 'tkn' });
  assert.equal(again.hits.length, 2);
  ES.reset();
  const fresh = await ES.sessions({ q: 'wayback', registry: REGISTRY, token: 'tkn' });
  assert.deepEqual([...fresh.hits.map(h => h.id)], ['bbbb2222']);
});

test('clip: one line of context around the first case-insensitive hit', () => {
  const long = 'x'.repeat(100) + ' the NEEDLE appears ' + 'y'.repeat(100);
  const c = ES.clip(long, 'needle');
  assert.match(c, /^…/);
  assert.match(c, /NEEDLE appears/);
  assert.ok(c.length < 130);
});
