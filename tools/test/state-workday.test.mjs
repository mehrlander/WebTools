// alpineComponents/state-view.js — the calendar behind the rail: which hours
// were the working day, where the days divide, and what the clock said.
//
// A rail drawn from timestamps alone answers "how much" and never "when".
// Twenty-six marks over a day is a density; the same twenty-six with the
// working hours behind them is a working day, an evening, or a weekend.
//
// Two failures are worth holding here and neither shows in a screenshot. The
// arithmetic is LOCAL and wall-clock, so it has to survive being run at any
// hour, which a fixture taken at one moment will not catch; and the bands are
// drawn behind the marks in a channel the marks do not use, which is the whole
// reason a midnight RULE was rejected twice before this shipped.
//
// No network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, startAlpine, repoRoot } from './bootstrap.mjs';

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
window.__shell = { REGISTRY_REPO: 'me/registry', hasToken: () => true, crawlProgress: {}, crawlChecking: {} };
const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js', 'lib/kits/crawl-runs.js', 'lib/kits/repo-activity-cache.js',
  'lib/alpineComponents/state-view.js',
]);
const data = Alpine.$data(window.document.getElementById('sv'));

// The component reads `this.now`, so a test can move the clock rather than
// waiting for one. Restored after each case that moves it.
const REAL_NOW = data.now;
const asOf = (iso) => { data.now = Date.parse(iso); };
const restore = () => { data.now = REAL_NOW; };

test('the workday band covers 8 to 5 and stops there', () => {
  asOf('2026-08-28T19:00:00');            // a Friday evening, local
  const [band] = data.workSpans(24);
  assert.equal(data.workSpans(24).length, 1, 'one working stretch inside the last day');
  // The window runs 19:00 yesterday to 19:00 today, so it holds today's 8 to 5
  // and none of yesterday's, which ended before the window opened.
  const pct = (h) => (24 - h) / 24 * 100;         // hours ago to percent
  assert.ok(Math.abs(band.a - pct(11)) < 2, `8am is 11h back, got ${band.a}`);
  assert.ok(Math.abs(band.b - pct(2)) < 2, `5pm is 2h back, got ${band.b}`);
  restore();
});

test('a week draws seven bands, weekends included', () => {
  asOf('2026-08-28T19:00:00');
  assert.equal(data.workSpans(168).length, 7, 'one a day, and the weekend is not an exception');
  // Stated rather than assumed: dropping the weekend band would make the fill
  // claim which DAYS count as work, where as drawn it claims only which HOURS
  // were chosen. This estate commits on Saturdays.
  restore();
});

test('the band tracks the clock rather than the page load', () => {
  // THE FAILURE THIS CATCHES. A calendar computed once at mount keeps drawing
  // the workday into the evening: at 17:00 the band has to stop, and only a
  // reading off the minute tick does that. `now` is the field that tick writes.
  asOf('2026-08-28T12:00:00');
  const noon = data.workSpans(24).at(-1);
  asOf('2026-08-28T19:00:00');
  const evening = data.workSpans(24).at(-1);
  assert.ok(noon.b > 99, 'at noon the band runs to the right edge, since work is now');
  assert.ok(evening.b < 95, 'by seven it has closed, two hours back from the edge');
  restore();
});

test('a day is a segment, and the partial ones at each end are kept', () => {
  asOf('2026-08-28T19:00:00');
  const days = data.daySpans(168);
  assert.equal(days.length, 8, 'seven midnights bound eight stretches over a week');
  assert.equal(days[0].k, 0, 'today leads, so the alternating tone is stable');
  assert.ok(days[0].b === 100, 'today runs to now');
  assert.ok(days.at(-1).a === 0, 'the oldest is the partial day at the left edge');
  // Letters come off the real calendar, not a counter: 2026-08-28 is a Friday.
  assert.equal(days[0].letter, 'F');
  assert.equal(days[1].letter, 'T');
  restore();
});

test('the narrow rail labels the workday, the wide one labels days', () => {
  asOf('2026-08-28T19:00:00');
  const day = data.railLabels(24), week = data.railLabels(168);
  // Spread first: a value handed back through Alpine's reactive proxy is not
  // deepEqual to a plain array even when every element matches.
  assert.deepEqual([...day.map(l => l.text)], ['8a', '5p'],
    'on the day rail the clock labels are the band’s own edges, not an arbitrary hour');
  assert.ok(day.every(l => l.pct > 0 && l.pct < 100), 'both inside the rail');
  // An hour on the week rail is 0.6% of its width, which is false precision.
  assert.ok(week.every(l => /^[SMTWF]$/.test(l.text)), 'the week gets one letter a day');
  assert.ok(week.length >= 6 && week.length <= 8);
  restore();
});

test('a label on the edge is anchored rather than hung outside the lane', () => {
  // On the hour, literally: at 08:00 the window opens on yesterday's 8am and
  // closes on today's, so the same label lands at both ends. Centred, half of
  // each would sit outside the lane.
  asOf('2026-08-28T08:00:00');
  const edges = data.railLabels(24);
  assert.ok(edges.some(l => l.pct < 1) && edges.some(l => l.pct > 99),
    'the boundary hour puts a label at each end');
  assert.equal(data.anchorFor(0), 'start');
  assert.equal(data.anchorFor(100), 'end');
  assert.equal(data.anchorFor(50), 'middle', 'everything away from an edge is untouched');
  restore();
});

test('a day too narrow to hold its letter is left unlabelled', () => {
  // The partial day at the left edge can be minutes wide. A letter half over
  // its neighbour is worse than no letter, so the width gate drops it.
  asOf('2026-08-28T00:10:00');            // ten minutes past midnight
  const days = data.daySpans(168), labels = data.railLabels(168);
  assert.ok(days.some(d => d.b - d.a < data.WIDTH_FOR_LETTER), 'a sliver exists to drop');
  assert.ok(labels.length < days.length, 'and it is dropped rather than crowded');
  restore();
});

test('the calendar is drawn in channels a mark never uses', () => {
  // WHY THIS IS A TEST AND NOT A PREFERENCE. A vertical line inside the rail is
  // what a tick IS, so a midnight rule or an hour graduation reads as more
  // events; two attempts at one were rejected on exactly that. The workday is a
  // FILL behind the marks, the days are CAPSULES in a lane below, the clock is
  // TEXT below that, and none of the three is a line inside the rail.
  const src = readFileSync(path.join(repoRoot, 'lib', 'alpineComponents', 'state-view.js'), 'utf8');
  const rail = src.slice(src.indexOf('const TICKS ='), src.indexOf('// THE CARD for the tick'));
  const work = rail.slice(rail.indexOf('workSpans(s)'), rail.indexOf('</template>', rail.indexOf('workSpans(s)')));
  assert.match(work, /absolute inset-y-0/, 'the workday is a full-height fill');
  assert.doesNotMatch(work, /w-px|h-px/, 'never a rule, which is what a tick looks like');
  // It has to be behind the marks, which in a box of absolutes is DOM order.
  assert.ok(rail.indexOf('workSpans(s)') < rail.indexOf('pulse[${r}.key]?.[s]?.ticks'),
    'the band is emitted before the ticks, so it paints behind them');
});

test('the tooltip states both assumptions out loud', () => {
  // The hours are a choice and the timezone is the reader's. A shaded band that
  // says neither invites being read as a fact about the record.
  data.pulse = { ...data.pulse, probe: { 24: { n: 3, ticks: [], marks: [], partial: false } } };
  const t = data.pulseTitle({ key: 'probe', stream: 'commits' }, 24);
  assert.match(t, /8a to 5p/, 'the chosen hours');
  assert.match(t, /your timezone rather than the one the work ran in/, 'and whose clock');
  data.destroy();
});
