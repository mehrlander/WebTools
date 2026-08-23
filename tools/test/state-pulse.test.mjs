// The 24-hour source strip: what the estate DID, drawn from the only timestamps
// that say so.
//
// The reading this replaces was `updated`, the commit date of the cache file,
// which is a fact about the crawl rather than about the estate. Every failure
// mode here is the same one wearing a different hat: a number that looks like
// source activity and is actually crawl activity. The strip makes that
// substitution visible, so the tests are mostly about refusing it.
//
// No network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, startAlpine, repoRoot } from './bootstrap.mjs';

const HOUR = 3600 * 1000;
const now = Date.now();
const iso = (hoursAgo) => new Date(now - hoursAgo * HOUR).toISOString();

// Two caches in the shape the kits actually build.
const ACTIVITY = {
  repos: {
    'me/a': { recentCommits: [{ sha: 'a2', date: iso(1) }, { sha: 'a1', date: iso(5) }] },
    'me/b': { recentCommits: [{ sha: 'b1', date: iso(12) }, { sha: 'b0', date: iso(40) }] },
  },
};
const SESSIONS = {
  rows: [{ started: iso(2), ended: iso(1.5) }, { started: iso(30), ended: iso(29) }],
};

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; }
  ago(){ return 'a while ago'; }
  async ls(){ return []; }
  async repos(){ return []; }
  async history(){ return []; }
  async req(){ throw new Error('404'); }
  async get(p){
    if (p.endsWith('activity.json')) return { text: JSON.stringify(ACTIVITY) };
    if (p.endsWith('sessions.json')) return { text: JSON.stringify(SESSIONS) };
    throw new Error('404');
  }
}

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="sv" x-data="stateView()"></div></body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
window.__shell = { REGISTRY_REPO: 'me/registry', hasToken: () => true, crawlProgress: {}, crawlChecking: {} };

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/crawl-runs.js',
  'lib/kits/repo-activity-cache.js',
  'lib/alpineComponents/state-view.js',
]);
const data = Alpine.$data(window.document.getElementById('sv'));
const row = (key) => data.rows.find(r => r.key === key);
await data.loadPulse();

test('only a row with a truthful stream gets a strip', () => {
  // Repo configs stores one timestamp per history entry and it is the CRAWL's
  // `at`, never the moment the manifest changed. A rail there would be a
  // picture of when the cache was written under a label that says the estate
  // moved, which is the substitution this whole reading exists to refuse.
  assert.ok(data.pulse.activity, 'Branches draws commits');
  assert.ok(data.pulse.sessions, 'Sessions draws session starts');
  assert.equal(data.pulse.configs, undefined, 'Repo configs must draw nothing');
  assert.equal(row('configs').stream, undefined);
});

test('only events inside the window get a tick', () => {
  // 1h, 5h and 12h are in; the 40h commit is out. Counting it would make the
  // rail claim a day held four commits when it held three.
  assert.equal(data.pulse.activity.n, 3);
  assert.equal(data.pulse.activity.ticks.length, 3);
  assert.equal(data.pulse.sessions.n, 1, 'the 30h session is outside the day');
});

test('a tick is placed by time alone, left is older', () => {
  const t = data.pulse.activity.ticks;
  // 24h window: 12h ago sits at 50%, 5h at ~79%, 1h at ~96%. Sorted ascending,
  // so the array is oldest first and the rail reads left to right.
  assert.ok(t[0] < t[1] && t[1] < t[2], 'ascending in time');
  assert.ok(Math.abs(t[0] - 50) < 1, `12h ago should sit mid-rail, got ${t[0]}`);
  assert.ok(t[2] > 90, 'an hour ago sits hard right');
});

test('every tick is identical, so density is the only other variable', () => {
  // The strip encodes time and count. A per-event magnitude would need a second
  // variable, and no event here carries one: a commit is not bigger than
  // another commit. Held in the template, since that is where a height or a
  // heat scale would have to appear.
  const src = readFileSync(path.join(repoRoot, 'lib', 'alpineComponents', 'state-view.js'), 'utf8');
  const tick = src.slice(src.indexOf('x-for="(t, i) in (pulse['), src.indexOf('</template>', src.indexOf('x-for="(t, i) in (pulse[')));
  assert.match(tick, /w-px h-3/, 'a fixed width and height');
  // One colour class, with its alpha baked in, and the same one on every tick.
  // The alpha is what makes overlap compound, so it belongs on the mark rather
  // than on anything computed per event.
  //
  // PRIMARY, and not green: on this view green means one verb (bring this up to
  // date) and lives on the Refresh controls alone, so tinting a reading with it
  // would spend the one colour that still carries meaning here.
  assert.match(tick, /bg-primary\/\d+/, 'one fixed accent and alpha');
  // Only steps the app already generates. Tailwind's browser build emits an
  // opacity modifier only where it finds one in the scanned source, so /45 and
  // /15 rendered fully transparent here on 2026-08-22 while /20, /30 and /60,
  // which the estate already used, resolved. A tick nobody can see is the
  // failure this catches, and it looks identical to a quiet day.
  assert.ok(/bg-primary\/(10|20|30|60|70)\b/.test(tick),
    'use an opacity step the app already generates, or the tick paints transparent');
  assert.doesNotMatch(tick, /height:|opacity:|scale/, 'nothing may vary per event');
  // The alpha is on the tick itself so overlapping marks compound, which is how
  // a dense hour gets darker without anything computing a density.
  assert.match(tick, /:style="'left:' \+ t \+ '%'"/, 'position is the only bound style');
});

test('last change is the newest SOURCE event, not the cache commit', () => {
  // The whole point. The cache file could have been committed a minute ago over
  // a day-old commit, or hold a fresh commit and not have been rebuilt since.
  const r = { ...row('activity'), builtAgo: 'THE CACHE COMMIT', builtAt: 'x' };
  assert.equal(data.changeAgo(r), 'a while ago');
  assert.match(data.changeTitle(r), /when the source last moved/);
  assert.equal(data.pulse.activity.newest, iso(1));
});

test('a row with no stream still says when the cache was rebuilt', () => {
  // `updated` remains exact for what it names. Two readings, two words.
  const r = { ...row('configs'), builtAgo: '2d ago', builtAt: 'x' };
  assert.equal(data.changeAgo(r), '2d ago');
  assert.match(data.changeTitle(r), /when this cache file was last committed/i);
});

test('a quiet day reads as quiet, not as missing', () => {
  const quiet = data.strip([now - 40 * HOUR], now - 24 * HOUR, now - 40 * HOUR);
  assert.equal(quiet.n, 0);
  assert.equal(quiet.partial, false, 'the list reaches past the window, so the rail is trustworthy');
  assert.equal(data.changeAgo({ stream: 'commits', key: 'x' }), 'unknown');
});

test('a list that runs out inside the window says so', () => {
  // RepoActivityCache.COMMIT_CAP is 30 a repo, so a busy repo's stored history
  // can be younger than a day. An empty left half then means "the list ended",
  // not "nothing happened", and those must not read alike.
  const short = data.strip([now - 2 * HOUR], now - 24 * HOUR, now - 2 * HOUR);
  assert.equal(short.partial, true);
  data.pulse = { ...data.pulse, probe: short };
  assert.match(data.pulseTitle({ key: 'probe', stream: 'commits' }), /unknown rather than quiet/);
});

test('teardown clears the tick and the listeners', () => {
  data.destroy();
});

test('the rail says its own span, and says it once', () => {
  // A row of marks over an unstated span is not a timeline: nothing on screen
  // separates 24 hours from a week. The label is derived from the same number
  // the arithmetic uses, since two copies of one figure is how a rail comes to
  // say 24h over a week of events.
  assert.equal(data.windowLabel, '24h');
  assert.equal(row('activity').window, data.windowLabel);
  assert.equal(data.WINDOW_H, 24);
  const src = readFileSync(path.join(repoRoot, 'lib', 'alpineComponents', 'state-view.js'), 'utf8');
  const rail = src.slice(src.indexOf('const TICKS ='), src.indexOf('// THE BAR,'));
  assert.match(rail, /x-text="\$\{r\}\.window"/, 'the label reads the row, never a literal');
  assert.doesNotMatch(rail, />24h</, 'no typed copy of the span');
});
