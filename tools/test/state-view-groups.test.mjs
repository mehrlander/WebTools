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

test('the tooltip states both costs, which the rows no longer can', () => {
  const why = data.groupWhy(group());
  assert.match(why, /Branches:/);
  assert.match(why, /Sessions:/);
  // It used to state both INTERVALS too, one per row. There are none: the
  // crawls gate on whether their source moved rather than on a clock, so what
  // this button offers over simply arriving is the ungated pass, and that is
  // what the sentence now says.
  assert.doesNotMatch(why, /normally every/);
  assert.match(why, /past the gate/);
});

test('nothing on the heading escalates, because nothing here is behind', () => {
  // Both readings the heading used to carry are gone with the probe: the
  // concatenated "2 pushed, 3 written" line and the button weight it drove.
  // Arriving at this view runs both crawls, so a heading that lit up would be
  // pointing at work that had already been done.
  assert.equal(typeof data.groupProbe, 'undefined', 'no heading probe survives');
  assert.equal(typeof data.groupMatters, 'undefined', 'no heading weight survives');
  assert.equal(typeof data.probe, 'undefined', 'no probe state survives');
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
