// repo-config-cache.js — the pure config-aggregate builders. Run the IIFE
// against a window stub, then exercise hashing, per-repo history merge (append
// only on change, capped), whole-cache build (membership follows the crawl),
// and the timestamp-ignoring change detector that gates no-op commits.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/repo-config-cache.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const C = window.RepoConfigCache;

test('hashConfig is stable, order-preserving, and separates null', () => {
  assert.equal(C.hashConfig({ a: 1, b: 2 }), C.hashConfig({ a: 1, b: 2 }));
  assert.notEqual(C.hashConfig({ a: 1 }), C.hashConfig({ a: 2 }));
  assert.notEqual(C.hashConfig(null), C.hashConfig({}));
});

test('mergeRepo seeds history on first sight', () => {
  const e = C.mergeRepo(undefined, { config: { icon: 'ph-x' }, configName: '.web-tools.json' }, 't0');
  assert.equal(e.history.length, 1);
  assert.deepEqual(e.config, { icon: 'ph-x' });
  assert.equal(e.history[0].at, 't0');
});

test('mergeRepo appends only when the config changes', () => {
  const a = C.mergeRepo(undefined, { config: { icon: 'ph-x' } }, 't0');
  const b = C.mergeRepo(a, { config: { icon: 'ph-x' } }, 't1'); // unchanged
  assert.equal(b.history.length, 1);
  assert.equal(b.fetchedAt, 't1'); // snapshot restamped even without a new version
  const c = C.mergeRepo(b, { config: { icon: 'ph-y' } }, 't2'); // changed
  assert.equal(c.history.length, 2);
  assert.equal(c.history[1].config.icon, 'ph-y');
});

test('mergeRepo caps history at the newest N', () => {
  let e;
  for (let i = 0; i < 25; i++) e = C.mergeRepo(e, { config: { n: i } }, 't' + i, 20);
  assert.equal(e.history.length, 20);
  assert.equal(e.history[0].config.n, 5);   // oldest 5 dropped
  assert.equal(e.history[19].config.n, 24); // newest kept
});

test('buildCache tracks the crawl membership and carries history', () => {
  const prev = C.buildCache(null, {
    'o/a': { config: { v: 1 } },
    'o/b': { config: { v: 1 } },
  }, 't0');
  // a changes, b drops out, c appears
  const next = C.buildCache(prev, {
    'o/a': { config: { v: 2 } },
    'o/c': { config: { v: 1 } },
  }, 't1');
  assert.deepEqual(Object.keys(next.repos).sort(), ['o/a', 'o/c']);
  assert.equal(next.repos['o/a'].history.length, 2); // history carried + appended
  assert.equal(next.repos['o/c'].history.length, 1); // fresh
});

// The crawl seeds itself from one client's view of the account, and that view
// can be narrower than the world (a repo-scoped fine-grained token, an account
// past the un-paginated 100 the listing asks for, a fallback to a short list).
// Writing such a view over the shared file as if it were complete is what took
// state/configs.json from 18 repos to 1 on 2026-08-01, and the activity cache
// with it. Every repo the cache already knew therefore rides forward.
test('buildCache carries a repo the crawl never visited, whole', () => {
  const prev = C.buildCache(null, {
    'o/a': { config: { v: 1 } },
    'o/unseen': { config: { v: 1, estate: true } },
  }, 't0');
  const carry = Object.keys(prev.repos);
  const next = C.buildCache(prev, { 'o/a': { config: { v: 2 } } }, 't1', C.HISTORY_CAP, carry);
  assert.deepEqual(Object.keys(next.repos).sort(), ['o/a', 'o/unseen']);
  assert.deepEqual(next.repos['o/unseen'], prev.repos['o/unseen'],
                   'history, hash and fetchedAt all untouched');
  assert.deepEqual(C.cacheChanged(prev, next), true);   // o/a really did move
  assert.equal(next.repos['o/a'].config.v, 2);
});

// How a repo does leave: visited, and found to declare nothing. The entry stays
// with a null config, which de-lists it everywhere downstream, since every
// consumer filters on a config field rather than on mere presence.
test('a visited repo with no manifest keeps a row with a null config', () => {
  const prev = C.buildCache(null, { 'o/a': { config: { estate: true } } }, 't0');
  const next = C.buildCache(prev, { 'o/a': { config: null, configName: null } }, 't1',
                            C.HISTORY_CAP, ['o/a']);
  assert.equal(next.repos['o/a'].config, null);
  assert.equal(Object.entries(next.repos).filter(([, e]) => e.config?.estate === true).length, 0);
});

test('cacheChanged ignores timestamps, catches hash and membership', () => {
  const a = C.buildCache(null, { 'o/a': { config: { v: 1 } } }, 't0');
  const sameContent = C.buildCache(a, { 'o/a': { config: { v: 1 } } }, 't1');
  assert.equal(C.cacheChanged(a, sameContent), false); // only fetchedAt moved
  const changed = C.buildCache(a, { 'o/a': { config: { v: 2 } } }, 't2');
  assert.equal(C.cacheChanged(a, changed), true);
  const added = C.buildCache(a, { 'o/a': { config: { v: 1 } }, 'o/b': { config: {} } }, 't3');
  assert.equal(C.cacheChanged(a, added), true);
});
