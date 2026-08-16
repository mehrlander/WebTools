// alpineComponents/estate.js — the crawl progress a pane draws: the getters
// that turn the shell's progress channel into what the header and the bar
// render (crawlLabel / crawlActive / crawlPct).
//
// The shell owns the crawl and writes the progress; the view only reads it, so
// __shell is a plain stub here and the assertions are about the projection:
// repos finished over repos total, every repo in flight named (the pool runs
// two at once), and no denominator before the member list resolves.
//
// One channel, one slot per crawl, and the verb and unit ride WITH the
// numbers: the crawl names its own phase, so the getters take a key and print
// what they are handed rather than decoding a state they cannot see. Two panes
// draw them, Branches and Sessions, which is why they are keyed rather than
// named for one crawl. The State view draws the same slots for all three; see
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
  assert.equal(data.crawl('activity'), null);
  assert.equal(data.crawlLabel('activity'), '');
  assert.equal(data.crawlActive('activity'), '');
  assert.equal(data.crawlPct('activity'), 0);
});

test('before the member list resolves there is no denominator', () => {
  // refreshActivity seeds {0,0,[]} at the click, and the estate list takes a
  // read or two to arrive. "0 of 0 repos" would be worse than saying nothing.
  shell.crawlProgress = { activity: P({ done: 0, total: 0 }) };
  assert.equal(data.crawlLabel('activity'), 'Refreshing activity');
  assert.equal(data.crawlPct('activity'), 0);
});

test('mid-crawl: finished repos over total, every in-flight repo named', () => {
  shell.crawlProgress = { activity: P({ done: 4, total: 11, active: ['me/chat-histories', 'me/home'] }) };
  assert.equal(data.crawlLabel('activity'), 'Refreshing activity · 4 of 11 repos');
  // Short names, and BOTH of them: ACTIVITY_REPO_POOL is 2, so naming only one
  // would describe the crawl wrongly.
  assert.equal(data.crawlActive('activity'), 'chat-histories, home');
  assert.equal(data.crawlPct('activity'), 36); // 4/11, rounded — no in-flight fraction
});

test('the survey pass of a split refresh names itself', () => {
  // The quick pass and the true-up behind it report through one bar, and the
  // second opens the slot again under its own verb, which is what keeps that
  // reading from claiming to be the first.
  shell.crawlProgress = { activity: P({ verb: 'Surveying branches', done: 1, total: 3, active: ['me/a'] }) };
  assert.equal(data.crawlLabel('activity'), 'Surveying branches · 1 of 3 repos');
});

test('the bar counts finished repos only, never the ones in flight', () => {
  shell.crawlProgress = { activity: P({ done: 0, total: 4, active: ['me/a', 'me/b'] }) };
  assert.equal(data.crawlPct('activity'), 0);  // two running is not progress yet
  shell.crawlProgress = { activity: P({ done: 2, total: 4, active: ['me/c', 'me/d'] }) };
  assert.equal(data.crawlPct('activity'), 50);
  shell.crawlProgress = { activity: P({ done: 4, total: 4 }) };
  assert.equal(data.crawlPct('activity'), 100);
});

test('the Sessions pane reads its own slot, in its own unit', () => {
  // Same getters, another key: the Sessions crawl counts records rather than
  // repos, and its in-flight names are store paths, so the short name drops the
  // scaffolding and the extension.
  shell.crawlProgress = { activity: null, sessions: { verb: 'Reading records', unit: 'records',
    done: 18, total: 120, active: ['sessions/2026/08/2026-08-16-aaaa1111.json'] } };
  assert.equal(data.crawlLabel('sessions'), 'Reading records · 18 of 120 records');
  assert.equal(data.crawlActive('sessions'), '2026-08-16-aaaa1111');
  assert.equal(data.crawlPct('sessions'), 15);
  // And the pane that is not running says nothing at all.
  assert.equal(data.crawlLabel('activity'), '');
});

test('activityBusy tracks the shell, and the header swaps on it', () => {
  shell.activityRefreshing = false;
  assert.equal(data.activityBusy, false);
  shell.activityRefreshing = true;
  assert.equal(data.activityBusy, true);
  shell.activityRefreshing = false;
});
