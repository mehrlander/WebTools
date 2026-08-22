// alpineComponents/state-view.js — the Activity group: two caches, one press.
//
// Branches and Sessions are two crawls over two sources into two files, and the
// State view drew them as two rows with a Refresh each. The split is real
// underneath and was wrong on screen, since a session ending moves both at
// once. So the rows stayed two and the button became one.
//
// What is worth holding here is the fold and the wiring, because both fail
// quietly. A group whose members drifted apart would still render, as two boxed
// rows with one button that refreshed one of them; a group naming a shell
// method that no longer exists would render an enabled button that does
// nothing. Neither shows up in a screenshot.
//
// The bar each row draws while its own half runs is state-view-progress.test.mjs.
//
// No network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, startAlpine, repoRoot } from './bootstrap.mjs';

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
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
const calls = [];
const shell = {
  REGISTRY_REPO: 'me/registry',
  hasToken: () => true,
  configRefreshing: false, activityRefreshing: false, sessionsRefreshing: false,
  crawlProgress: { configs: null, activity: null, sessions: null },
  refreshActivityGroup(){ calls.push('group'); },
  refreshActivity(){ calls.push('activity'); },
  refreshSessions(){ calls.push('sessions'); },
  refreshConfigs(){ calls.push('configs'); },
};
window.__shell = shell;

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/crawl-runs.js',
  'lib/alpineComponents/state-view.js',
]);
const data = Alpine.$data(window.document.getElementById('sv'));
const group = () => data.rowGroups.find(g => g.group?.key === 'activity');

test('the fold: configs stands alone, the activity two travel together', () => {
  // Joined rather than deep-compared: Alpine hands the getter's result back
  // through a reactive proxy, so a strict deepEqual fails on the prototype
  // while reporting the values as identical, which reads as a real failure.
  assert.equal(data.rowGroups.map(g => g.key).join(' '), 'configs group:activity');
  assert.equal(data.rowGroups[0].group, null);
  // A group takes the position of its FIRST member, so declaring one never
  // reorders the list: configs stays on top exactly where CACHES puts it.
  assert.equal(group().rows.map(r => r.key).join(' '), 'activity sessions');
});

test('a grouped row surrenders its own button, an ungrouped one keeps it', () => {
  // `group` is what the template's x-if reads. The assertion is on the flag
  // rather than on rendered markup because the flag is what both the button
  // and the fold above turn on: they cannot disagree.
  assert.equal(data.rows.find(r => r.key === 'configs').group, undefined);
  for (const r of group().rows) assert.equal(r.group, 'activity');
});

test('one press runs the group, not a member', () => {
  calls.length = 0;
  data.runGroup(group());
  assert.deepEqual(calls, ['group']);
});

test('busy while EITHER half runs, since the shell runs them in sequence', () => {
  const g = group();
  assert.equal(data.groupBusy(g), false);
  // Sessions first and cheap: the button must stay down through the gap, or it
  // offers a second press while the expensive half is still going.
  shell.sessionsRefreshing = true;
  assert.equal(data.groupBusy(g), true);
  shell.sessionsRefreshing = false;
  shell.activityRefreshing = true;
  assert.equal(data.groupBusy(g), true);
  shell.activityRefreshing = false;
  assert.equal(data.groupBusy(g), false);
});

test('worth pressing if EITHER source moved', () => {
  const g = group();
  data.probe = { activity: { n: 0, line: 'no push' }, sessions: { n: 0, line: 'no record' } };
  assert.equal(data.groupMatters(g), false);
  // One press covers both, so one row with something to fetch is reason enough;
  // the other row's no-op crawl is the four calls it costs to be sure.
  data.probe = { activity: { n: 0, line: 'no push' }, sessions: { n: 3, line: '3 written' } };
  assert.equal(data.groupMatters(g), true);
  data.probe = {};
});

test('the tooltip states both costs and both throttles, which the rows no longer can', () => {
  const why = data.groupWhy(group());
  assert.match(why, /Branches:/);
  assert.match(why, /Sessions:/);
  // The SHAPE, not the durations. Each row states its own interval, and the
  // interval itself belongs to the shell: asserting '12h' here made this a
  // third copy of a number two places already hold, and it duly went stale the
  // day the throttle moved. state-view-throttles.test.mjs owns the values.
  assert.equal(why.match(/normally every \S+/g)?.length, 2, 'one interval per row');
});

// ── The group's probe ──────────────────────────────────────────────────────
// The heading trades its note for a live reading once it has one, so what the
// reading says has to survive a half-read and must never reduce two units to
// one number.

test('the heading probe concatenates both readings and never sums them', () => {
  const g = group();
  data.probe = { activity: { n: 2, names: ['a/b', 'c/d'], line: '2 pushed' },
                 sessions: { n: 3, records: 3, line: '3 written' } };
  const p = data.groupProbe(g);
  // Both facts, side by side. A sum would read '5' over two units that have
  // nothing in common, which is the one fold that would be false here.
  assert.equal(p.line, '2 pushed, 3 written');
  assert.equal(p.moved, 2);
  data.probe = {};
});

test('a quiet probe still reads, and reads as quiet', () => {
  data.probe = { activity: { n: 0, names: [], line: 'no push' },
                 sessions: { n: 0, records: 0, line: 'no record' } };
  const p = data.groupProbe(group());
  assert.equal(p.line, 'no push, no record');
  assert.equal(p.moved, 0);
  data.probe = {};
});

test('a half-read heading says nothing rather than half the answer', () => {
  const g = group();
  assert.equal(data.groupProbe(g), null, 'no readings at all');
  // The probe makes two calls that fail independently. One arriving is not the
  // group's answer, and a heading showing it would read as though it were.
  data.probe = { sessions: { n: 3, records: 3, line: '3 written' } };
  assert.equal(data.groupProbe(g), null, 'one reading of two');
  data.probe = {};
});

test('the probe tooltip keeps each half attributed, with its own caveat', () => {
  const g = group();
  data.probe = { activity: { n: 2, names: ['mehrlander/home', 'mehrlander/wps'], line: '2 pushed' },
                 sessions: { n: 1, records: 1, line: '1 written' } };
  const why = data.groupProbeWhy(g);
  assert.match(why, /Branches: /);
  assert.match(why, /Sessions: /);
  // The per-file caveats are the reason the sentences are not merged: each
  // reading over- or under-counts in its own direction.
  assert.match(why, /PR opened without a push moves nothing here/);
  assert.match(why, /1 session record committed since this was built/);
  data.probe = {};
});

test('the refresh tooltip names WHICH half is past its throttle', () => {
  const g = group();
  // Only meaningful with no probe: a live reading supersedes the clock, which
  // is what refreshWhy does per row.
  data.probe = {};
  const branches = g.rows.find(r => r.key === 'activity');
  branches.stale = true;
  const why = data.groupWhy(g);
  assert.match(why, /^Branches past twice its throttle\./);
  // Two throttles behind one button, so an unnamed staleness claim is one the
  // reader cannot act on.
  assert.doesNotMatch(why, /Sessions past twice/);
  assert.equal(why.match(/normally every \S+/g)?.length, 2, 'both rows still state theirs');
  branches.stale = false;
  assert.doesNotMatch(data.groupWhy(g), /past twice/);
});

// ── The wiring, read out of the shell ──────────────────────────────────────
// The view names a shell method by string, since the shell is not up when the
// component registers. That is the right call and it is also unchecked at
// runtime: `window.__shell?.[name]?.()` on a name nobody defines is a silent
// no-op behind an enabled button. So the name is checked here instead.
const shellSrc = readFileSync(path.join(repoRoot, 'app', 'index.html'), 'utf8');
const viewSrc = readFileSync(path.join(repoRoot, 'lib', 'alpineComponents', 'state-view.js'), 'utf8');

test('every refresh the view names is a method the shell defines', () => {
  const named = new Set();
  for (const m of viewSrc.matchAll(/refresh: '(\w+)'/g)) named.add(m[1]);
  assert.ok(named.has('refreshActivityGroup'), 'the group refresh should be among them');
  assert.ok(named.size >= 4, `expected the three caches plus the group, got ${named.size}`);
  for (const name of named)
    assert.match(shellSrc, new RegExp('async ' + name + '\\s*\\(' ), `${name} is not defined in the shell`);
});

test('the group runs both crawls, and each is forced', () => {
  const body = shellSrc.slice(shellSrc.indexOf('async refreshActivityGroup('));
  const fn = body.slice(0, body.indexOf('\n  },'));
  // Forced, or the throttle it exists to override would skip the half the
  // reader pressed for.
  assert.match(fn, /refreshSessionsCache\(true\)/);
  assert.match(fn, /refreshActivityCache\(true, \{ deep: true \}\)/);
  // Sessions first: both crawls commit to the registry's main, and two contents
  // PUTs racing on one branch is a 409.
  assert.ok(fn.indexOf('refreshSessionsCache') < fn.indexOf('refreshActivityCache'),
            'the cheap half should run first');
  // Both rows still draw their own bar, so both slots are opened and closed.
  for (const key of ['sessions', 'activity']) {
    assert.match(fn, new RegExp("openCrawl\\('" + key + "'"));
    assert.match(fn, new RegExp("closeCrawl\\('" + key + "'"));
  }
});

// Last, and not optional. The component's init() starts a 60-second interval to
// age the rows, so a file that boots one and never tears it down leaves a handle
// open and `node --test` never exits. Locally that reads as a slow suite;
// in CI, where the workflow sets no timeout-minutes, it reads as a check that
// runs for six hours and then fails. state-view-progress.test.mjs ends the same
// way for the same reason.
test('teardown clears the tick and the listeners', () => {
  data.destroy();
});
