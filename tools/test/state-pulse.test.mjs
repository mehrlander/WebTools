// The source strip: what the estate DID, drawn from the only timestamps that
// say so, over both of the spans it draws at once.
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
  rows: [
    // A LIVE session: started outside the window, still writing. The recorder is
    // a Stop hook and fires every turn, so `ended` walks forward while `started`
    // stays pinned. This row is the whole reason the rail reads `ended`.
    { started: iso(30), ended: iso(0.2) },
    { started: iso(2), ended: iso(1.5) },
    { started: iso(40), ended: iso(39) },
  ],
};

let gets = 0;
class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; }
  ago(){ return 'a while ago'; }
  async ls(){ return []; }
  async repos(){ return []; }
  async history(){ return []; }
  async req(){ throw new Error('404'); }
  async get(p){
    gets++;
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
  assert.ok(data.pulse.sessions, 'Sessions draws sessions at their last active moment');
  assert.equal(data.pulse.configs, undefined, 'Repo configs must draw nothing');
  assert.equal(row('configs').stream, undefined);
});

test('only events inside the span get a tick', () => {
  // 1h, 5h and 12h are in; the 40h commit is out. Counting it would make the
  // rail claim a day held four commits when it held three.
  assert.equal(data.pulse.activity[24].n, 3);
  assert.equal(data.pulse.activity[24].ticks.length, 3);
  // Two sessions were ACTIVE inside the day: the live one (last active 12
  // minutes ago, though it began 30 hours ago) and the one that ended 1.5h ago.
  // The 40h session is genuinely outside.
  assert.equal(data.pulse.sessions[24].n, 2);
});

test('a tick is placed by time alone, left is older', () => {
  const t = data.pulse.activity[24].ticks;
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
  // The colour is bound from the row's stream and not written per tick, so what
  // this asserts here is that nothing VARIES within a rail: one class for every
  // mark on it, resolved once from the row.
  assert.match(tick, /:class="tone\(\S+?\)\.tick"/, 'one class for every tick on a rail');
  assert.doesNotMatch(tick, /height:|opacity:|scale/, 'nothing may vary per event');
  // The alpha is on the tick itself so overlapping marks compound, which is how
  // a dense hour gets darker without anything computing a density.
  assert.match(tick, /:style="'left:' \+ t \+ '%'"/, 'position is the only bound style');
});

test('a stream owns a colour, and the pair is locked', () => {
  // The two rails are read AGAINST each other: that is how the `started`/`ended`
  // bug was caught on 2026-08-23, and the check below still runs it. A
  // comparison made in one colour carries which side a mark belongs to by
  // vertical position alone, which is thinner than the reading deserves and
  // gets thinner again now that each row draws two rails.
  const tones = data.tone({ stream: 'commits' });
  const other = data.tone({ stream: 'sessions' });
  assert.notEqual(tones.tick, other.tick, 'the two streams cannot share a tick colour');
  for (const t of [tones, other]) {
    // Alpha baked into the class, so overlapping marks compound without
    // anything computing a density.
    assert.match(t.tick, /\/\d0$/, 'the tick carries its own alpha');
    // Only steps the app already generates. Tailwind's browser build emits an
    // opacity modifier only where it finds one in the scanned source, so /45
    // and /15 rendered fully transparent here on 2026-08-22 while /20, /30 and
    // /60, which the estate already used, resolved. A tick nobody can see is
    // the failure this catches, and it looks identical to a quiet day.
    assert.ok(/\/(10|20|30|60|70)$/.test(t.tick), `${t.tick}: use a step the app generates`);
    assert.ok(/\/(10|20|30|60|70)$/.test(t.band), `${t.band}: use a step the app generates`);
    // NOT GREEN. On this view green means one verb, bring this up to date, and
    // lives on the Refresh controls alone; spending it on a reading would spend
    // the one colour here that still carries meaning.
    assert.doesNotMatch(t.tick + t.mark + t.band, /success/, 'green means refresh, and only that');
  }
});

test('a stream tone cannot reuse a colour the estate spends on branch state', () => {
  // THE BUG THIS CAUGHT, on itself. Sessions shipped in `secondary`, which
  // reads clean on the State view and is already taken one pane over:
  // `branchTileAccent` fills a MERGED branch tile with it and
  // BRANCH_STATE_MARK gives the merge glyph text-secondary/70. Every session
  // card in the Sessions pane nests those tiles, so a pair meant to travel
  // would have arrived on a colour that already meant something else there.
  //
  // Read out of estate.js rather than listed here, so a state palette that
  // grows a colour fails this instead of silently outdating a copy of it.
  const estate = readFileSync(path.join(repoRoot, 'lib', 'alpineComponents', 'estate.js'), 'utf8');
  const palette = estate.slice(estate.indexOf('branchTileAccent(row)'),
                               estate.indexOf('branchShort(name)'));
  const spent = new Set([...palette.matchAll(/(?:text|bg|border)-(\w+)\//g)].map(m => m[1])
    .filter(c => !['base', 'base-content', 'base-200', 'base-300'].includes(c)));
  assert.ok(spent.has('secondary'), 'the branch-state palette still spends secondary (merged)');
  // Both streams, with no exemption: the palette spends error, secondary,
  // success and warning, and primary is not among them, so the rail's own
  // long-standing colour passes this on its merits rather than by grandfather.
  for (const stream of ['commits', 'sessions']) {
    const hue = data.tone({ stream }).tick.replace(/^bg-|\/\d+$/g, '');
    assert.ok(!spent.has(hue),
      `${stream} draws in ${hue}, which the branch-state palette already spends`);
  }
  // Whole class strings, never assembled: a name built from fragments is
  // invisible to a text scan, which is what the bake-page compiler reads.
  const src = readFileSync(path.join(repoRoot, 'lib', 'alpineComponents', 'state-view.js'), 'utf8');
  const table = src.slice(src.indexOf('const STREAM_TONE'), src.indexOf('const TICKS'));
  assert.doesNotMatch(table, /'bg-' \+|`bg-\$\{/, 'no class name may be assembled');
});

test('last change is the newest SOURCE event, not the cache commit', () => {
  // The whole point. The cache file could have been committed a minute ago over
  // a day-old commit, or hold a fresh commit and not have been rebuilt since.
  const r = { ...row('activity'), builtAgo: 'THE CACHE COMMIT', builtAt: 'x' };
  assert.equal(data.changeAgo(r), 'a while ago');
  assert.match(data.changeTitle(r), /when the source last moved/);
  assert.equal(data.pulse.activity[168].newest, iso(1));
});

test('a row with no stream still says when the cache was rebuilt', () => {
  // `updated` remains exact for what it names. Two readings, two words.
  const r = { ...row('configs'), builtAgo: '2d ago', builtAt: 'x' };
  assert.equal(data.changeAgo(r), '2d ago');
  assert.match(data.changeTitle(r), /when this cache file was last committed/i);
});

test('a quiet day reads as quiet, not as missing', () => {
  const quiet = data.strip([{ t: now - 40 * HOUR, name: 'me/a', detail: '' }],
                           now - 24 * HOUR, now - 40 * HOUR, 24);
  assert.equal(quiet.n, 0);
  assert.equal(quiet.partial, false, 'the list reaches past the window, so the rail is trustworthy');
  assert.equal(data.changeAgo({ stream: 'commits', key: 'x' }), 'unknown');
});

test('a list that runs out inside the window says so', () => {
  // RepoActivityCache.COMMIT_CAP is 30 a repo, so a busy repo's stored history
  // can be younger than a day. An empty left half then means "the list ended",
  // not "nothing happened", and those must not read alike.
  const short = data.strip([{ t: now - 2 * HOUR, name: 'me/a', detail: '' }],
                           now - 24 * HOUR, now - 2 * HOUR, 24);
  assert.equal(short.partial, true);
  data.pulse = { ...data.pulse, probe: { 24: short } };
  assert.match(data.pulseTitle({ key: 'probe', stream: 'commits' }, 24), /unknown rather than quiet/);
});

test('teardown clears the tick and the listeners', () => {
  data.destroy();
});

test('every rail says its own span, and says it once', () => {
  // A row of marks over an unstated span is not a timeline: nothing on screen
  // separates 24 hours from a week, and with two rails stacked the question is
  // asked twice. Each label is derived from the same number its own arithmetic
  // uses, since two copies of one figure is how a rail comes to say 24h over a
  // week of events.
  assert.deepEqual([...data.SPANS], [168, 24], 'context on top, detail beneath');
  assert.equal(data.spanLabel(168), '7d');
  assert.equal(data.spanLabel(24), '24h');
  const src = readFileSync(path.join(repoRoot, 'lib', 'alpineComponents', 'state-view.js'), 'utf8');
  const rail = src.slice(src.indexOf('const TICKS ='), src.indexOf('// THE CARD for the tick'));
  assert.match(rail, /x-text="spanLabel\(s\)"/, 'the label reads the span it draws');
  assert.doesNotMatch(rail, />24h<|>7d</, 'no typed copy of a span');
});

test('a session still running counts as active now, not at its start', () => {
  // THE BUG THIS FILE EXISTS TO PREVENT REPEATING. `started` is pinned at
  // session start; the recorder is a Stop hook firing every turn, so `ended`
  // is the record's last-active stamp and the only one that tracks a live
  // session. Drawing `started` put one tick at the top of a session and
  // nothing across the hours it was working, so a session running right now
  // read as silence.
  const live = data.pulse.sessions[24];
  assert.equal(live.newest, iso(0.2), 'the newest event is the live session, minutes ago');
  // Its tick sits hard right, where a session active minutes ago belongs, and
  // NOT off the left end where its 30h-old start would have put it.
  assert.ok(Math.max(...live.ticks) > 99, 'the live session ticks at the right edge');
});

test('the two rails cannot contradict each other over one estate', () => {
  // How this was caught: Branches showed commits 17 minutes old while Sessions
  // claimed nothing in two hours, and every one of those commits was made by a
  // session. A commit inside the window implies a session was active at least
  // that recently, so the sessions rail must reach at least as far right as the
  // commits rail. A single rail could never have run this check on itself.
  const newest = (k) => Math.max(...data.pulse[k][24].ticks);
  assert.ok(newest('sessions') >= newest('activity') - 1,
    'commits with no session active around them means the wrong field is being drawn');
});

// ── Both spans, drawn together ─────────────────────────────────────────────

test('both spans come off one read of each cache', async () => {
  // The spans are two readings of events already in hand. Deriving them must
  // not cost two reads apiece: the whole reason the toggle could be retired is
  // that showing both is free once the events are loaded.
  const before = gets;
  await data.loadPulse();
  assert.equal(gets - before, 2, 'two caches, one read each, four rails');
  const day = data.pulse.activity[24], week = data.pulse.activity[168];
  assert.ok(day && week, 'a streamed row gets a strip per span');
  // 168h reaches the 30h and 40h events the 24h span excluded.
  assert.ok(week.n >= day.n, 'a wider span cannot hold fewer events');
  assert.equal(data.pulse.sessions[168].n, 3, 'all three sessions are inside a week');
  assert.equal(data.pulse.sessions[24].n, 2, 'two of them inside the day');
});

test('a day is said in hours, a week in days', () => {
  // "1d" reads as a rounding of something; "24h" is the span itself. And 168h
  // states a week without communicating one.
  assert.equal(data.spanLabel(24), '24h');
  assert.equal(data.spanLabel(168), '7d');
});

test('the zoom band is the narrow rail\'s share of the wide one', () => {
  // The band is what makes the pair one reading rather than two strips: it
  // marks the stretch of the 7d rail that the 24h rail below it expands.
  // Derived from the spans themselves, so a third span could not leave a
  // hardcoded seventh behind to be wrong.
  assert.ok(Math.abs(data.zoomPct(168) - 24 / 168 * 100) < 1e-9, 'a day is a seventh of a week');
  assert.equal(data.zoomPct(24), 0, 'the narrowest rail zooms nothing, so it draws no band');
});

// ── The tick under the pointer ─────────────────────────────────────────────

test('the nearest event answers, which is what makes a 1px mark reachable', () => {
  // A tick is 1px wide, so it is not a target for a thumb and barely one for a
  // mouse. One overlay resolving the nearest event behaves the same either way
  // and gets BETTER as the rail gets busier, where per-tick hit boxes would be
  // piling on top of each other.
  const marks = data.pulse.activity[24].marks;
  assert.ok(marks.length && marks.every(m => 'left' in m && 't' in m && 'name' in m),
    'position and identity travel together');
  const box = { left: 0, width: 100 };
  const ev = { currentTarget: { getBoundingClientRect: () => box }, clientX: marks[0].left };
  data.peekAt(row('activity'), 24, ev);
  assert.equal(data.peek.key, 'activity');
  // The rail rides the peek. A row has two of them over different sets of
  // marks, so without it the resolved mark draws on both and the card points
  // the wider rail at an event it does not hold.
  assert.equal(data.peek.span, 24);
  assert.equal(data.peek.left, marks[0].left, 'the resolved mark is the nearest one');
  assert.ok(data.peek.ago, 'it says when');
  assert.ok(data.peek.name, 'and what');
  // Aiming at the far end resolves to the far mark, not the first one.
  data.peekAt(row('activity'), 24, { ...ev, clientX: 100 });
  assert.equal(data.peek.left, marks[marks.length - 1].left);
  // The same x on the week rail resolves against the week's marks, which sit
  // at different positions for the same events.
  data.peekAt(row('activity'), 168, { ...ev, clientX: 50 });
  assert.equal(data.peek.span, 168);
  assert.ok(data.pulse.activity[168].marks.some(m => m.left === data.peek.left));
  data.clearPeek();
  assert.equal(data.peek, null);
});

test('a rail with no events cannot open a card', () => {
  // An empty window is the common case on a quiet day, and a tap on it must do
  // nothing rather than resolve to an event outside the span.
  data.pulse = { ...data.pulse, empty: { 24: { marks: [], ticks: [], n: 0 } } };
  data.peekAt({ key: 'empty' }, 24, { currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 100 }) }, clientX: 50 });
  assert.equal(data.peek, null);
});

