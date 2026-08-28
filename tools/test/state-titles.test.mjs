// alpineComponents/state-view.js — the session-titles export, reported where its
// age can be read.
//
// A session's real title cannot be captured from inside a sandbox session, so it
// arrives from a different venue: a Dispatch capture on the desktop writes a
// dated CSV, and the sessions crawl joins it onto the rows it already builds.
// That makes the title column a DATED SNAPSHOT behind a live view, which is the
// case that silently reads as current.
//
// It shipped on the Sessions pane and was removed on 2026-08-27 (PR #532),
// because that pane defaults to a Day scope where every session postdates the
// export and the line read "0 of N named": a fact about the whole title column,
// shown against whichever rows a scope happened to hold, reads as a broken join.
// The failures worth holding here are that one and its mirror: a count with no
// floor beside it, which says 63 rows are broken when every one of them has a
// name.
//
// No network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

const HOUR = 3600 * 1000;
const now = Date.now();
const day = (n) => new Date(now - n * 24 * HOUR).toISOString().slice(0, 10);

// The shape the sessions crawl actually writes: two top-level facts about the
// column, and rows that carry a title, an agent id, or neither.
const SESSIONS = {
  titlesAt: day(2),
  titlesFrom: 'claude-code-web/' + day(2) + '-sessions.csv',
  rows: [
    { started: new Date(now - 2 * HOUR).toISOString(), agent: 'https://claude.ai/code/session_a', title: 'A real title' },
    { started: new Date(now - 3 * HOUR).toISOString(), agent: 'https://claude.ai/code/session_b', title: 'Another' },
    // Has an id, is simply not in this export: newer than it, or missed.
    { started: new Date(now - 4 * HOUR).toISOString(), agent: 'https://claude.ai/code/session_c' },
    // No id at all. Predates schema 3, so no export however fresh can name it.
    { started: new Date(now - 5 * HOUR).toISOString() },
    { started: new Date(now - 6 * HOUR).toISOString() },
  ],
};

let gets = 0;
class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; }
  ago(iso) { return 'aged:' + iso; }
  async ls() { return []; }
  async repos() { return []; }
  async history() { return []; }
  async req() { throw new Error('404'); }
  async get(p) {
    gets++;
    if (p.endsWith('sessions.json')) return { text: JSON.stringify(SESSIONS) };
    if (p.endsWith('activity.json')) return { text: JSON.stringify({ repos: {} }) };
    throw new Error('404');
  }
}

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="sv" x-data="stateView()"></div></body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
window.Element.prototype.scrollIntoView = function(){};   // jsdom has none
window.__shell = { REGISTRY_REPO: 'me/registry', hasToken: () => true, crawlProgress: {}, crawlChecking: {} };

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/crawl-runs.js',
  'lib/kits/repo-activity-cache.js',
  'lib/alpineComponents/state-view.js',
]);
const data = Alpine.$data(window.document.getElementById('sv'));
await data.loadPulse();

test('the row exists before anything is read', () => {
  // The other rows render their shape immediately and fill in ages after; a row
  // that appeared only once a fetch landed would flicker into a list whose
  // whole subject is what the estate holds.
  const fresh = data.titlesOf(null);
  assert.equal(fresh.total, 0);
  assert.equal(fresh.named, 0);
  assert.equal(fresh.ago, '', 'no export read means no age claimed');
});

test('the export states its own date, not the moment it was read', () => {
  // A dated snapshot behind a live view is exactly the case that reads as
  // current. The date is the file's, which is the claim the export itself
  // makes: it has been wrong in the safe direction before (2026-08-04-sessions
  // .csv held sessions through 08-09) and inferring a better one would be this
  // view guessing on the source's behalf.
  assert.equal(data.titles.at, SESSIONS.titlesAt);
  assert.equal(data.titles.from, SESSIONS.titlesFrom);
  assert.equal(data.titles.ago, 'aged:' + SESSIONS.titlesAt + 'T00:00:00Z',
    'the age is taken off the export date, not off the read');
});

test('coverage counts the column, and the tooltip carries the floor', () => {
  // THE FAILURE THIS EXISTS TO PREVENT. "2 of 5" invites the reading that three
  // rows are broken. Every one of them has a name: the derived branch slug is
  // the floor the join sits on and never replaces, and a count shown without it
  // is the reading that got the line removed from the Sessions pane.
  assert.equal(data.titles.named, 2);
  assert.equal(data.titles.total, 5);
  const why = data.coverWhy();
  assert.match(why, /derived from their branch/, 'the floor is stated');
  assert.match(why, /rather than a failure/, 'and stated as the floor, not as a shortfall');
  assert.doesNotMatch(why, /\bbroken\b|\bmissing\b|\bunnamed\b/i,
    'a row showing its derived name is named');
});

test('a row with no session id is counted apart from a stale export', () => {
  // The two gaps have opposite remedies and must not be added together: 2 rows
  // here can never be titled by any export however fresh, so a reader looking
  // at the shortfall should not go looking for a capture to run.
  assert.equal(data.titles.unjoinable, 2);
  assert.match(data.coverWhy(), /no session id, so no export can ever name them/);
  assert.match(data.coverWhy(), /the other 1 are not in this one/);
});

test('an old export is marked, at the cadence the capture is meant to run', () => {
  const stale = data.titlesOf({ ...SESSIONS, titlesAt: day(30) });
  assert.equal(stale.stale, true, 'a month with no capture is worth seeing');
  assert.equal(data.titles.stale, false, 'two days is not');
});

test('the reading rides the read the strip already makes', async () => {
  // Two GETs for two caches. The view refuses a 1.5 MB fetch for four
  // timestamps elsewhere on this screen, so buying a second one here for four
  // numbers already inside a file it holds would be the same trade it refused.
  const before = gets;
  await data.loadPulse();
  assert.equal(gets - before, 2, 'no read of its own');
});

test('the row links the export where it lives, not into the registry', () => {
  // It is an input from another repo rather than a state/ artifact, and the
  // path shown is the path in that repo.
  assert.equal(data.titles.repo, 'mehrlander/chat-histories');
  assert.equal(data.titlesGh(),
    'https://github.com/mehrlander/chat-histories/blob/main/' + SESSIONS.titlesFrom);
});

test('the row sits with Sessions, which is where the hand-off lands', async () => {
  // THE ROUTE THIS ORDER EXISTS FOR. The Sessions pane no longer carries the
  // export's date; it carries an age pill that calls goState('sessions'), and
  // aim() scrolls that card to the middle of the screen. So the titles reading
  // has to be in the screen the pill lands in, which means directly under the
  // Sessions card rather than past a cache about something else.
  //
  // Held on the rendered order rather than on a constant, because the order a
  // reader gets is the order the template emits, and the two rows are written
  // as separate blocks with nothing but their position tying them together.
  const { readFileSync } = await import('node:fs');
  const path = (await import('node:path')).default;
  const { repoRoot } = await import('./bootstrap.mjs');
  const src = readFileSync(path.join(repoRoot, 'lib', 'alpineComponents', 'state-view.js'), 'utf8');
  const groups = src.indexOf('x-for="g in rowGroups"');
  const titles = src.indexOf('x-if="titles"');
  const offline = src.indexOf('x-if="offline"');
  assert.ok(groups > -1 && titles > -1 && offline > -1, 'all three blocks render');
  assert.ok(groups < titles, 'the crawled rows come first; Sessions is the last of them');
  assert.ok(titles < offline,
    'the titles row must follow Sessions directly: the pane aims at sessions and ' +
    'the export reading has to be in that screen, not past the entity index');
});

test('it says who reads it, and answers to the deep link like any row', () => {
  assert.deepEqual([...data.titles.feeds], ['sessions', 'search']);
  data.aim('titles');
  assert.equal(data.item, 'titles');
  data.destroy();
});
