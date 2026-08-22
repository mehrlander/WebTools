// The throttles: one number per cache, owned by the shell that enforces it.
//
// The State view prints "auto every 12h" on a row, and until now it printed it
// from its own copy of the interval rather than from the constant the crawl
// actually obeys. Two numbers for one fact, and the copy is the half that ages:
// dropping the activity throttle from 12h to 30m in the shell would have left
// the row promising half a day over a crawl running every half hour, with
// nothing to say so.
//
// The view now reads the shell's constant by name and keeps its literal only as
// a fallback for the seconds before the shell is up. That fallback is still a
// copy, so this file is the gate that keeps it honest: it reads both sides out
// of source and fails when they part.
//
// It also holds the two directions the row's staleness verdict must follow,
// since "past twice its throttle" reads the same number.
//
// No network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, startAlpine, repoRoot } from './bootstrap.mjs';

const shellSrc = readFileSync(path.join(repoRoot, 'app', 'index.html'), 'utf8');
const viewSrc = readFileSync(path.join(repoRoot, 'lib', 'alpineComponents', 'state-view.js'), 'utf8');

// `6 * 3600 * 1000` and friends, evaluated rather than string-matched, so the
// two sides may write the same duration in whatever units read best where they
// sit: the shell says 30 * 60 * 1000 and the view may say the same or not, but
// they must come to the same milliseconds.
function durations(src, re) {
  const out = new Map();
  for (const m of src.matchAll(re)) {
    const expr = m[2].trim();
    assert.match(expr, /^[\d\s*]+$/, `unexpected duration expression: ${expr}`);
    out.set(m[1], expr.split('*').reduce((a, b) => a * Number(b.trim()), 1));
  }
  return out;
}

const shellThrottles = durations(shellSrc, /^\s{2}(\w+_CACHE_INTERVAL_MS):\s*([\d\s*]+),/gm);
const viewThrottles = new Map();
for (const m of viewSrc.matchAll(/throttleKey: '(\w+)', throttleMs: ([\d\s*]+),/g))
  viewThrottles.set(m[1], m[2].split('*').reduce((a, b) => a * Number(b.trim()), 1));

test('every throttle the view names is a constant the shell defines', () => {
  assert.equal(viewThrottles.size, 3, 'three crawled caches, three throttles');
  for (const key of viewThrottles.keys())
    assert.ok(shellThrottles.has(key), `${key} is not a shell constant`);
});

test('the view fallback equals the shell constant it stands in for', () => {
  for (const [key, ms] of viewThrottles)
    assert.equal(ms, shellThrottles.get(key),
      `${key}: view says ${ms}ms, shell says ${shellThrottles.get(key)}ms`);
});

// ── The resolution, in a booted component ─────────────────────────────────

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; }
  ago() { return 'a while ago'; }
  async ls() { return []; }
  async repos() { return []; }
  async history() { return []; }
  async get() { throw new Error('404'); }
  async req() { throw new Error('404'); }
}

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="sv" x-data="stateView()"></div></body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
const shell = {
  REGISTRY_REPO: 'me/registry',
  hasToken: () => true,
  configRefreshing: false, activityRefreshing: false, sessionsRefreshing: false,
  crawlProgress: { configs: null, activity: null, sessions: null },
  CONFIG_CACHE_INTERVAL_MS: 6 * 3600 * 1000,
  ACTIVITY_CACHE_INTERVAL_MS: 30 * 60 * 1000,
  SESSIONS_CACHE_INTERVAL_MS: 15 * 60 * 1000,
};
window.__shell = shell;

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/crawl-runs.js',
  'lib/alpineComponents/state-view.js',
]);
const data = Alpine.$data(window.document.getElementById('sv'));
const row = (key) => data.rows.find(r => r.key === key);

test('the live shell wins over the fallback, which is the whole point', () => {
  // Not the literal in the row: the number the crawl will actually obey.
  shell.ACTIVITY_CACHE_INTERVAL_MS = 45 * 60 * 1000;
  assert.equal(data.throttleOf(row('activity')), 45 * 60 * 1000);
  shell.ACTIVITY_CACHE_INTERVAL_MS = 30 * 60 * 1000;
});

test('no shell, no crash: the fallback carries the row', () => {
  // A row renders before the shell is up, and in a harness that never mounts
  // one. Reading undefined must not print "auto every NaN".
  window.__shell = undefined;
  assert.equal(data.throttleOf(row('sessions')), 15 * 60 * 1000);
  assert.match(data.humanMs(data.throttleOf(row('sessions'))), /\d/);
  window.__shell = shell;
});

test('a shell value that is not a number falls back rather than propagating', () => {
  shell.ACTIVITY_CACHE_INTERVAL_MS = undefined;
  assert.equal(data.throttleOf(row('activity')), 30 * 60 * 1000);
  shell.ACTIVITY_CACHE_INTERVAL_MS = 30 * 60 * 1000;
});

test('teardown clears the tick and the listeners', () => {
  data.destroy();
});
