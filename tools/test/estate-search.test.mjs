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
// "<repo>@<ref>" -> blob entries, each a path or a { path, size }; absent ->
// the fetch throws. The two forms exist because the trees API reports a blob's
// size on the entry and most of these tests do not care what it is.
let TREES = {};
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
      if (TREES[key]) return {
        tree: TREES[key].map(e => (typeof e === 'string'
          ? { type: 'blob', path: e }
          : { type: 'blob', path: e.path, size: e.size })),
        truncated: false,
      };
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

test('names: a folder scope narrows before the cap, and an empty query under one is a listing', async () => {
  ES.reset();   // the tree cache is per-module, so an earlier test's tree would answer instead
  TREES = {
    'me/tools@HEAD': ['lib/kits/a.js', 'lib/kits/b.js', 'lib/gh-api.js', 'docs/kits.md', 'kits'],
  };
  const repos = [{ repo: 'me/tools', ref: '' }];
  // An empty query is the listing: every path under the scope, and nothing else.
  const listed = await ES.names({ q: '', repos, token: 'tkn', under: 'lib/kits' });
  assert.deepEqual([...listed.hits.map(h => h.path)], ['lib/kits/a.js', 'lib/kits/b.js']);
  // The scope is a path prefix, not a substring: 'docs/kits.md' names the same
  // segment and is out, and the bare file 'kits' is in only as itself.
  const bare = await ES.names({ q: '', repos, token: 'tkn', under: 'kits' });
  assert.deepEqual([...bare.hits.map(h => h.path)], ['kits']);
  // Slashes are forgiving, and the cap counts scoped hits rather than spending
  // itself outside the scope.
  const capped = await ES.names({ q: '', repos, token: 'tkn', under: '/lib/kits/', cap: 1 });
  assert.deepEqual([...capped.hits.map(h => h.path)], ['lib/kits/a.js']);
  assert.equal(capped.total, 2);
  // No scope is the whole tree, unchanged.
  assert.equal((await ES.names({ q: '', repos, token: 'tkn' })).total, 5);
});

test('level: one level of the tree, folders and files, off the same cache', async () => {
  ES.reset();
  TREES = { 'me/tools@HEAD': [
    'README.md', 'lib/gh-api.js', 'lib/kits/a.js', 'lib/kits/demos/b.js', 'docs/x.md',
  ] };
  TREE_CALLS = [];
  const root = await ES.level({ repo: 'me/tools', ref: '', under: '', token: 'tkn' });
  assert.deepEqual([...root.dirs.map(d => d.name)], ['docs', 'lib']);
  assert.deepEqual([...root.files.map(f => f.path)], ['README.md']);
  // A folder's count is the blobs BELOW it, which is what one recursive read
  // knows and what says whether it is worth opening.
  assert.equal(root.dirs.find(d => d.name === 'lib').n, 3);

  const lib = await ES.level({ repo: 'me/tools', ref: '', under: 'lib', token: 'tkn' });
  assert.deepEqual([...lib.dirs.map(d => d.path)], ['lib/kits']);
  assert.deepEqual([...lib.files.map(f => f.path)], ['lib/gh-api.js']);

  const kits = await ES.level({ repo: 'me/tools', ref: '', under: '/lib/kits/', token: 'tkn' });
  assert.deepEqual([...kits.dirs.map(d => d.name)], ['demos']);
  assert.deepEqual([...kits.files.map(f => f.path)], ['lib/kits/a.js']);

  // Four levels, one fetch: descending is free after the repo is read once,
  // which is the whole reason browsing and searching share a cache.
  assert.deepEqual(TREE_CALLS, ['me/tools@HEAD']);
});

test('sizes ride the same tree read, so a listing and a match both carry them', async () => {
  ES.reset();
  TREES = { 'me/tools@HEAD': [
    { path: 'README.md', size: 512 },
    { path: 'lib/gh-api.js', size: 9001 },
    'lib/no-size.js',                       // an entry the API answered without one
  ] };
  TREE_CALLS = [];

  const t = await ES.tree('me/tools', '', 'tkn');
  assert.equal(t.sizes['lib/gh-api.js'], 9001);
  assert.equal(t.sizes['lib/no-size.js'], undefined);

  // The browse lane: a file row carries its own size, a folder row does not.
  const root = await ES.level({ repo: 'me/tools', ref: '', under: '', token: 'tkn' });
  assert.deepEqual([...root.files.map(f => [f.path, f.size])], [['README.md', 512]]);
  assert.equal('size' in root.dirs[0], false);
  const lib = await ES.level({ repo: 'me/tools', ref: '', under: 'lib', token: 'tkn' });
  assert.deepEqual([...lib.files.map(f => f.size)], [9001, undefined]);

  // The search lane: same number, same cache, no second fetch for any of it.
  const res = await ES.names({ q: 'gh-api', repos: [{ repo: 'me/tools', ref: '' }], token: 'tkn' });
  assert.equal(res.hits[0].size, 9001);
  assert.deepEqual(TREE_CALLS, ['me/tools@HEAD']);
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

test('sessions: the derived name is searchable, and says so in the hit', async () => {
  ES.reset();   // the corpus cache is module-level and survives the test above
  FILES = {
    'state/sessions.json': { rows: [
      { id: 'aaaa1111', day: '2026-08-02', branches: ['claude/fab-naming-todqvq'] },
    ] },
    'sessions/2026/08/2026-08-02-aaaa1111.json':
      { day: '2026-08-02', opening_ask: 'about the app button', prompts: [], last_message: '' },
  };
  // The title as remembered, spaced, finds the slug as stored.
  const spaced = await ES.sessions({ q: 'fab naming', registry: REGISTRY, token: 'tkn' });
  assert.deepEqual([...spaced.hits.map(h => h.id)], ['aaaa1111']);
  // And the note line says the name matched, not the conversation, which is the
  // whole reason a name rides the same corpus as what was said.
  assert.match(spaced.hits[0].frag, /session name:/);
  ES.reset();
  const slug = await ES.sessions({ q: 'fab-naming', registry: REGISTRY, token: 'tkn' });
  assert.deepEqual([...slug.hits.map(h => h.id)], ['aaaa1111']);
});

test('sessions: a match on what was said beats the name to the note line', async () => {
  ES.reset();
  FILES = {
    'state/sessions.json': { rows: [
      { id: 'aaaa1111', day: '2026-08-02', branches: ['claude/wayback-urls-todqvq'] },
    ] },
    'sessions/2026/08/2026-08-02-aaaa1111.json':
      { day: '2026-08-02', opening_ask: 'about the wayback urls', prompts: [], last_message: '' },
  };
  const res = await ES.sessions({ q: 'wayback', registry: REGISTRY, token: 'tkn' });
  assert.equal(res.hits.length, 1);
  assert.doesNotMatch(res.hits[0].frag, /session name:/);
});

test('clip: one line of context around the first case-insensitive hit', () => {
  const long = 'x'.repeat(100) + ' the NEEDLE appears ' + 'y'.repeat(100);
  const c = ES.clip(long, 'needle');
  assert.match(c, /^…/);
  assert.match(c, /NEEDLE appears/);
  assert.ok(c.length < 130);
});
