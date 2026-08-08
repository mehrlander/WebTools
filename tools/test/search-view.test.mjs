// alpineComponents/search-view.js — the Search view's logic: seed consumption
// (the finder's gate or a deep link auto-runs a carried query), the three
// modes' dispatch into the shared core (names takes the ref, contents builds
// its scope qualifier, sessions greps), full-error surfacing, hit opening
// (files at their ref, sessions by event), clear, and the address restamp on
// each run. EstateSearch is stubbed so this tests the VIEW, not the core; the
// core has its own suite. No network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="sv" x-data="searchView()"></div></body></html>`,
});
window.TOKEN = 'tkn';

let CALLS = [];
let ANSWER = {};
window.EstateSearch = {
  clip: (t) => String(t || ''),
  reset() { CALLS.push(['reset']); },
  async names(a) { CALLS.push(['names', a]); if (ANSWER.throw) throw new Error(ANSWER.throw); return ANSWER; },
  async code(a)  { CALLS.push(['code', a]);  if (ANSWER.throw) throw new Error(ANSWER.throw); return ANSWER; },
  async sessions(a) { CALLS.push(['sessions', a]); if (ANSWER.throw) throw new Error(ANSWER.throw); return ANSWER; },
};

const shell = {
  REGISTRY_REPO: 'me/registry',
  hasToken: () => true,
  estateRepos: [{ repo: 'me/tools' }, { repo: 'me/home' }],
  searchSeed: { q: 'seeded', mode: 'contents' },   // consumed by init, below
  _synced: 0,
  syncUrl() { shell._synced++; },
  _browsed: [],
  async ensureBrowser(repo, ref) { shell._browsed.push([repo, ref]); },
  _opened: [],
  openFile(p) { shell._opened.push(p); },
};
window.__shell = shell;

ANSWER = { hits: [], total: 0 };
const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/alpineComponents/search-view.js',
]);
const data = Alpine.$data(window.document.getElementById('sv'));
const j = (x) => JSON.parse(JSON.stringify(x));
const tick = () => new Promise(r => setTimeout(r, 10));

test('a parked seed is consumed at mount and auto-runs', async () => {
  await tick();
  assert.equal(data.q, 'seeded');
  assert.equal(data.mode, 'contents');
  assert.equal(CALLS.filter(c => c[0] === 'code').length, 1);
  assert.equal(data.ran, true);
});

test('names mode passes the ref to every scoped repo; hits open at that ref', async () => {
  CALLS = [];
  ANSWER = { hits: [{ repo: 'me/tools', ref: 'dev', path: 'lib/x.js' }], total: 1, truncated: false, errors: [] };
  data.mode = 'names'; data.q = 'x'; data.repo = ''; data.ref = 'dev';
  await data.run();
  const [, args] = CALLS.find(c => c[0] === 'names');
  assert.deepEqual(j(args.repos), [{ repo: 'me/tools', ref: 'dev' }, { repo: 'me/home', ref: 'dev' }]);
  data.openHit(data.hits[0]);
  await tick();
  assert.deepEqual(j(shell._browsed.at(-1)), ['me/tools', 'dev']);
  assert.equal(shell._opened.at(-1), 'lib/x.js');
});

test('contents mode scopes to the chosen repo, or the account when none is', async () => {
  CALLS = [];
  ANSWER = { hits: [], total: 0 };
  data.mode = 'contents'; data.q = 'needle'; data.repo = 'me/home';
  await data.run();
  assert.equal(CALLS.find(c => c[0] === 'code')[1].scope, 'repo:me/home');
  data.repo = '';
  await data.run();
  assert.equal(CALLS.filter(c => c[0] === 'code')[1][1].scope, 'user:me');
});

test('a search failure surfaces the whole error and still counts as ran', async () => {
  ANSWER = { throw: 'GitHub Error 403 (Rate Rem: 0)' };
  data.mode = 'contents'; data.q = 'boom';
  await data.run();
  assert.equal(data.error, 'GitHub Error 403 (Rate Rem: 0)');
  assert.equal(data.ran, true);
  ANSWER = { hits: [], total: 0 };
});

test('a session hit dispatches web-tools:open-session', async () => {
  ANSWER = { hits: [{ id: 'aaaa1111', day: '2026-08-02', ask: 'the ask', frag: 'the frag' }], total: 1 };
  data.mode = 'sessions'; data.q = 'ask';
  await data.run();
  const seen = [];
  window.document.addEventListener('web-tools:open-session', e => seen.push(e.detail));
  data.openHit(data.hits[0]);
  assert.deepEqual(j(seen), [{ id: 'aaaa1111', day: '2026-08-02' }]);
});

test('each run restamps the address; clear empties results and the seed', async () => {
  const before = shell._synced;
  ANSWER = { hits: [], total: 0 };
  data.mode = 'sessions'; data.q = 'anything';
  await data.run();
  assert.ok(shell._synced > before);
  assert.equal(shell.searchSeed.q, 'anything');
  data.clear();
  assert.equal(data.ran, false);
  assert.equal(data.hits.length, 0);
  assert.equal(shell.searchSeed, null);
});

test('a later routing re-seeds the mounted view by event', async () => {
  CALLS = [];
  ANSWER = { hits: [], total: 0 };
  window.document.dispatchEvent(new window.CustomEvent('web-tools:search-seed',
    { detail: { q: 'routed', mode: 'sessions' } }));
  await tick();
  assert.equal(data.q, 'routed');
  assert.equal(CALLS.filter(c => c[0] === 'sessions').length, 1);
});
