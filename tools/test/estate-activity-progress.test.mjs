// alpineComponents/estate.js — the Activity header's crawl progress: the
// getters that turn the shell's progress channel into what the header renders
// (activityProgressLabel / activityProgressActive / activityProgressPct).
//
// The shell owns the crawl and writes the progress; the view only reads it, so
// __shell is a plain stub here and the assertions are about the projection:
// repos finished over repos total, every repo in flight named (the pool runs
// two at once), and no denominator before the member list resolves.
//
// One channel, one slot per crawl (`crawlProgress.activity` here), and the verb
// and unit ride WITH the numbers: the crawl names its own phase, so the header
// prints what it is handed rather than decoding a state it cannot see. The
// State view draws the same slots for all three crawls; see
// state-view-progress.test.mjs.
//
// No network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; }
  ago() { return 'just now'; }
  async get() { throw new Error('404'); }
  async ls() { throw new Error('404'); }
  async req() { throw new Error('404'); }
}

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="es" x-data="estate()"></div></body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
const shell = {
  REGISTRY_REPO: 'me/registry',
  DEFAULT_REPO: 'me/tools',
  quickLinks: [],
  hasToken: () => true,
  _authState: 'auth',
  activityRefreshing: false,
  crawlProgress: { configs: null, activity: null, sessions: null },
  anchorMenu: (ev, rows, opts = {}) => ({ x: 10, y: 20, rows, ...opts }),
  menuStyle: () => 'left:-9999px;top:-9999px',
};
window.__shell = shell;

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  // The shelf reads every surface through the shared envelope model, which
  // gh-boot loads ahead of the components for exactly this reason.
  'lib/kits/surface.js',
  'lib/alpineComponents/estate.js',
]);
const data = Alpine.$data(window.document.getElementById('es'));
// A slot as the shell publishes it: the quick pass's verb and unit unless a
// test names others.
const P = (o) => ({ verb: 'Refreshing activity', unit: 'repos', active: [], ...o });

test('idle: no progress, empty label, zero bar', () => {
  shell.crawlProgress = { activity: null };
  assert.equal(data.activityProgress, null);
  assert.equal(data.activityProgressLabel, '');
  assert.equal(data.activityProgressActive, '');
  assert.equal(data.activityProgressPct, 0);
});

test('before the member list resolves there is no denominator', () => {
  // refreshActivity seeds {0,0,[]} at the click, and the estate list takes a
  // read or two to arrive. "0 of 0 repos" would be worse than saying nothing.
  shell.crawlProgress = { activity: P({ done: 0, total: 0 }) };
  assert.equal(data.activityProgressLabel, 'Refreshing activity');
  assert.equal(data.activityProgressPct, 0);
});

test('mid-crawl: finished repos over total, every in-flight repo named', () => {
  shell.crawlProgress = { activity: P({ done: 4, total: 11, active: ['me/chat-histories', 'me/home'] }) };
  assert.equal(data.activityProgressLabel, 'Refreshing activity · 4 of 11 repos');
  // Short names, and BOTH of them: ACTIVITY_REPO_POOL is 2, so naming only one
  // would describe the crawl wrongly.
  assert.equal(data.activityProgressActive, 'chat-histories, home');
  assert.equal(data.activityProgressPct, 36); // 4/11, rounded — no in-flight fraction
});

test('the survey pass of a split refresh names itself', () => {
  // The quick pass and the true-up behind it report through one bar, and the
  // second opens the slot again under its own verb, which is what keeps that
  // reading from claiming to be the first.
  shell.crawlProgress = { activity: P({ verb: 'Surveying branches', done: 1, total: 3, active: ['me/a'] }) };
  assert.equal(data.activityProgressLabel, 'Surveying branches · 1 of 3 repos');
});

test('the bar counts finished repos only, never the ones in flight', () => {
  shell.crawlProgress = { activity: P({ done: 0, total: 4, active: ['me/a', 'me/b'] }) };
  assert.equal(data.activityProgressPct, 0);  // two running is not progress yet
  shell.crawlProgress = { activity: P({ done: 2, total: 4, active: ['me/c', 'me/d'] }) };
  assert.equal(data.activityProgressPct, 50);
  shell.crawlProgress = { activity: P({ done: 4, total: 4 }) };
  assert.equal(data.activityProgressPct, 100);
});

test('activityBusy tracks the shell, and the header swaps on it', () => {
  shell.activityRefreshing = false;
  assert.equal(data.activityBusy, false);
  shell.activityRefreshing = true;
  assert.equal(data.activityBusy, true);
  shell.activityRefreshing = false;
});
