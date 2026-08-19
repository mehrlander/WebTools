// alpineComponents/state-view.js — the bar a row draws while its own crawl runs.
//
// The State view holds the Refresh controls for all three registry caches, and
// a crawl started here runs for the same tens of seconds it always did. It reads
// the shell's one progress channel, a slot per cache key, and knows nothing
// about which crawl it is watching: the verb, the unit and the names in flight
// all ride in the slot. So the assertions here are about the projection, and
// about the two shapes that must not print alike, a slot with no denominator yet
// and no slot at all.
//
// The Branches pane draws the same channel for its own row; see
// estate-activity-progress.test.mjs.
//
// No network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

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
const shell = {
  REGISTRY_REPO: 'me/registry',
  hasToken: () => true,
  configRefreshing: false, activityRefreshing: false, sessionsRefreshing: false,
  crawlProgress: { configs: null, activity: null, sessions: null },
};
window.__shell = shell;

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/crawl-runs.js',
  'lib/alpineComponents/state-view.js',
]);
const data = Alpine.$data(window.document.getElementById('sv'));
const row = (key) => data.rows.find(r => r.key === key);
const put = (key, slot) => { shell.crawlProgress = { ...shell.crawlProgress, [key]: slot }; };

test('idle: no slot, nothing to say, and a bar at zero', () => {
  assert.equal(data.prog(row('activity')), null);
  assert.equal(data.progLabel(row('activity')), '');
  assert.equal(data.progActive(row('activity')), '');
  assert.equal(data.progPct(row('activity')), 0);
});

test('a slot with no denominator yet states the verb and nothing else', () => {
  // The click opens the slot; the estate list takes a read or two to arrive.
  // "0 of 0 repos" would be worse than saying nothing.
  put('activity', { verb: 'Refreshing activity', unit: 'repos', done: 0, total: 0, active: [] });
  assert.equal(data.progLabel(row('activity')), 'Refreshing activity');
  assert.equal(data.progPct(row('activity')), 0);
});

test('mid-crawl: finished over total, in its own unit, everything in flight named', () => {
  put('activity', { verb: 'Scanning branches', unit: 'repos', done: 4, total: 11,
                    active: ['mehrlander/chat-histories', 'mehrlander/home'] });
  assert.equal(data.progLabel(row('activity')), 'Scanning branches · 4 of 11 repos');
  // Both of them: the repo pool runs two at once, so naming one would describe
  // the crawl wrongly. Short-named through the view's own chip rule.
  assert.equal(data.progActive(row('activity')), 'chat-histories, home');
  assert.equal(data.progPct(row('activity')), 36);   // 4/11, no in-flight fraction
});

test('each row reads its own slot, and one crawl running lights one row', () => {
  put('sessions', { verb: 'Reading records', unit: 'records', done: 3, total: 12,
                    active: ['sessions/2026/08/2026-08-09-aaaa1111.json'] });
  assert.equal(data.progLabel(row('sessions')), 'Reading records · 3 of 12 records');
  // The store's path scaffolding is noise in a line this narrow.
  assert.equal(data.progActive(row('sessions')), '2026-08-09-aaaa1111');
  // The configs row is untouched by either.
  assert.equal(data.progLabel(row('configs')), '');
  assert.equal(data.progPct(row('configs')), 0);
});

test('an unpooled fan-out counts without naming: the line ends after the count', () => {
  // The config crawl puts every repo in flight at once, so "every repo" is not
  // a reading and `active` stays empty.
  put('configs', { verb: 'Reading configs', unit: 'repos', done: 9, total: 40, active: [] });
  assert.equal(data.progLabel(row('configs')), 'Reading configs · 9 of 40 repos');
  assert.equal(data.progActive(row('configs')), '');
  assert.equal(data.progPct(row('configs')), 23);
});

test('the wire tail reads the newest GitHub call, verbatim past the host', () => {
  shell.activityRefreshing = true;
  put('activity', { verb: 'Scanning branches', unit: 'repos', done: 4, total: 11,
                    active: [], calls0: 12 });
  window.__traffic = [
    { url: 'https://api.github.com/repos/me/home/commits?sha=main', method: 'GET', status: 200 },
    // A font arriving mid-crawl is a true row and a misleading one: this row is
    // about the crawl, so only the API counts.
    { url: 'https://cdn.jsdelivr.net/npm/phosphor.woff2', method: 'GET', status: 200 },
    { url: 'https://api.github.com/repos/me/home/git/trees/main?recursive=1', method: 'GET', status: 200 },
  ];
  window.__trafficTotals = { calls: 41 };
  data.wireAt = 1;                       // the traffic event's tick
  assert.equal(data.wireLine(row('activity')), 'GET repos/me/home/git/trees/main?recursive=1');
  assert.equal(data.wireFull(row('activity')), 'https://api.github.com/repos/me/home/git/trees/main?recursive=1');
  // This crawl's calls, off its own baseline, never the page's running total.
  assert.equal(data.wireCount(row('activity')), 29);
});

test('a write and a failure are the two rows that say more than GET 200', () => {
  shell.activityRefreshing = true;
  window.__traffic = [{ url: 'https://api.github.com/repos/me/registry/contents/state/activity.json',
                        method: 'PUT', status: 409 }];
  data.wireAt = 2;
  // The method leads because a PUT is the commit, the one request in the run
  // that changes anything; the status shows only when it is a failure.
  assert.equal(data.wireLine(row('activity')),
               'PUT repos/me/registry/contents/state/activity.json 409');
  window.__traffic = [{ url: 'https://api.github.com/rate_limit', method: 'GET', status: 200 }];
  data.wireAt = 3;
  assert.equal(data.wireLine(row('activity')), 'GET rate_limit');
  shell.activityRefreshing = false;
  // An idle row shows no wire at all, whatever the page is doing elsewhere.
  assert.equal(data.wireLine(row('activity')), '');
});

test('the bar is items finished over items total, and the run is one pass', () => {
  // The activity refresh ran quick-then-scan for a day, and the bar spanned
  // both so it could not fill and start over. One pass now: the second was
  // re-fetching the first's cheap reads, so the plain reading is honest again.
  put('activity', { verb: 'Refreshing activity', unit: 'repos', done: 11, total: 11, active: [] });
  assert.equal(data.progPct(row('activity')), 100);
  assert.equal(data.progLabel(row('activity')), 'Refreshing activity · 11 of 11 repos');
  put('sessions', { verb: 'Reading records', unit: 'records', done: 6, total: 12, active: [] });
  assert.equal(data.progPct(row('sessions')), 50);
  assert.equal(data.progLabel(row('sessions')), 'Reading records · 6 of 12 records');
});

test('the shape is the path with the parts that vary taken out', () => {
  // What turns 214 rows into a reading: the repo names, the shas and the query
  // VALUES are what differ between one call and the next of the same call.
  const shape = (u) => data.callShape(u);
  assert.equal(shape('repos/mehrlander/home/git/trees/abc123def4567890abcdef1234567890abcdef12?recursive=1'),
               'repos/…/…/git/trees/<sha>?recursive');
  assert.equal(shape('repos/mehrlander/web-tools/commits?sha=main&per_page=24'),
               'repos/…/…/commits?sha&per_page');
  assert.equal(shape('repos/mehrlander/wps/pulls/412'), 'repos/…/…/pulls/<n>');
  assert.equal(shape('user/repos?per_page=100'), 'user/repos?per_page');
});

test('the calls tab groups by shape, commonest first, with its time', () => {
  data.callsRun = { at: '2026-08-17T01:39:00Z', ms: 21000, calls: 5, verb: 'Scanning branches',
    rows: [
      { m: 'GET', u: 'repos/me/a/git/trees/main?recursive=1', s: 200, ms: 100, b: 1000 },
      { m: 'GET', u: 'repos/me/b/git/trees/main?recursive=1', s: 200, ms: 140, b: 2000 },
      { m: 'GET', u: 'repos/me/a/commits?sha=main', s: 200, ms: 90, b: null },
      { m: 'PUT', u: 'repos/me/registry/contents/state/activity.json', s: 201, ms: 300, b: 40 },
    ] };
  // Alpine hands back reactive proxies, which deepEqual treats as unequal to a
  // plain literal of the same shape; the assertions are about the values.
  const g = JSON.parse(JSON.stringify(data.callShapes()));
  // Commonest first, and a tie goes to the slower one, which is the order a
  // reader hunting cost wants rather than the order the calls happened in.
  assert.deepEqual(g.map(x => [x.shape, x.n]), [
    ['GET repos/…/…/git/trees/main?recursive', 2],
    ['PUT repos/…/…/contents/state/activity.json', 1],
    ['GET repos/…/…/commits?sha', 1],
  ]);
  assert.equal(g[0].ms, 240);
  // A row that disclosed no content-length is left out rather than counted as
  // zero, so the figure is a floor and never a false total.
  assert.equal(data.callsBytes(), '3 KB');
  data.callsRun = null;
  assert.equal(data.callsBytes(), '');
});

test('busy tracks the row\'s own shell flag, which is what shows the bar', () => {
  assert.equal(data.busy(row('sessions')), false);
  shell.sessionsRefreshing = true;
  assert.equal(data.busy(row('sessions')), true);
  assert.equal(data.busy(row('configs')), false);
  shell.sessionsRefreshing = false;
});

// The view ticks a minute timer so its ages move without a reload, which would
// hold the event loop open past the last assertion.
test('teardown clears the tick and the listeners', () => {
  data.destroy();
});
