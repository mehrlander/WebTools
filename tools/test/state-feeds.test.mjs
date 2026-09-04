// The cache-to-view relation: `reads` on docs/app-routes.csv, held to the code
// that does the reading.
//
// The State view draws, on each derived-cache row, chips for the views that
// consume it. That list used to be an authored `feeds` array on the row itself,
// and it had two faults. It answered in one direction only, so nothing said
// what the Branches view depends on; and it was one hand-kept side of a
// two-sided relation, which docs/registries.md's ownership rule rejects. It is
// now composed: `reads` on the route row is the only authored half, and the
// chips are its inverse, built at read time and never stored.
//
// WHAT THIS GATE ADDS, and the shape is the argument. A scan
// (tools/build/cache-readers.mjs) answers `state/activity.json -> estate.js`
// and no further, because estate.js reads three of the four caches and backs
// seven routed views. So the scan is used as BOUNDS on the authored half
// rather than as a replacement for it:
//
//   upper: a view may not claim a read no file of its own makes.
//   lower: where the evidence is unambiguous the claim is forced, not merely
//          allowed. Two things count as unambiguous: the row lists the cache's
//          declaring kit, which is a consumption claim the manifest already
//          makes; or a reading file belongs to exactly one route, so there is
//          no other route the read could belong to.
//
// The sole-carrier rule is STRICTER than route-activity.js's WIDE = 3, and
// deliberately: that threshold decides whether a commit may date a row, where
// an approximation is defensible. Attributing a data dependency to a route on
// the strength of a file two routes share would be a guess wearing a check.
//
// What is left over after both bounds is the residue only a person can settle:
// which of estate.js's seven views consumes which cache. That is the authored
// field, and it is small.
//
// estate.js states that residue itself, in `paneNeeds`, and the two agree
// today. It is not read here because it keys on the component's own tab names
// rather than on view keys ('repos' is the estate route), so joining them would
// take an authored tab-to-view map: a third hand-kept side, to check a second.
// Read it when a row here looks wrong; it is the closest thing to a second
// opinion the code offers.
//
// No network, no browser: two committed files and a scan of the tree.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';
import { parseCsv, splitList } from '../build/registries-load.mjs';
import { readSources, deriveReaders } from '../build/cache-readers.mjs';

const sources = readSources(repoRoot);
const byKey = new Map(sources.map(s => [s.key, s]));
const readers = deriveReaders(repoRoot, sources);

// `shell` is a row in the manifest and not an address: it draws every route and
// is reachable as none of them, so it is not a view a chip could open.
const routes = parseCsv(readFileSync(path.join(repoRoot, 'docs/app-routes.csv'), 'utf8'))
  .filter(r => r.key !== 'shell')
  .map(r => ({ key: r.key,
               files: splitList(r.files).filter(Boolean),
               reads: splitList(r.reads).filter(Boolean) }));

// How many routes each file backs. A file backing exactly one is that route's
// sole carrier, so a read it makes belongs to that route and nowhere else.
const carried = new Map();
for (const r of routes) for (const f of r.files) carried.set(f, (carried.get(f) || 0) + 1);

const stateView = readFileSync(path.join(repoRoot, 'lib/alpineComponents/state-view.js'), 'utf8');

test('the parses hold, so a pass is not an empty read', () => {
  assert.ok(sources.length >= 5, `only ${sources.length} state sources parsed out of state-view.js`);
  assert.ok(routes.length > 15, `docs/app-routes.csv parsed suspiciously short: ${routes.length}`);
  assert.ok(routes.some(r => r.reads.length), 'no route declares a read; the column has gone blank');
  for (const s of sources) {
    // A pathless source is legal and says how it arrives instead; one that is
    // neither addressable nor attributed to a carrier cannot be checked at all.
    assert.ok(s.path || s.via, `${s.key}: no file under state/ and no via saying how it arrives`);
    if (s.path) assert.ok(readers.get(s.key).length,
      `${s.key}: ${s.path} is read by no app file; the scan has stopped matching, or nothing uses it`);
  }
});

test('feeds is no longer authored on the row', () => {
  assert.doesNotMatch(stateView, /\bfeeds:/,
    'a `feeds` array is back on a state row. The consumers are composed from `reads` on ' +
    'docs/app-routes.csv; a second authored side is the drift this replaced.');
});

test('every read names a source the State view actually reports on', () => {
  for (const r of routes) {
    for (const k of r.reads) {
      assert.ok(byKey.has(k),
        `${r.key}: reads "${k}", which is no source in state-view.js. The domain is that ` +
        `list, not an enumeration in docs/properties.csv, so add the source or fix the row.`);
    }
  }
});

// ── The upper bound ────────────────────────────────────────────────────────

// Three ways a claim can be evidenced, in the order they are cheapest to read.
function support(route, key) {
  const s = byKey.get(key);
  if (!s) return '';
  if (s.declarer && route.files.includes(s.declarer)) return 'declaring kit on the row';
  const hit = route.files.find(f => (readers.get(key) || []).includes(f));
  if (hit) return hit;
  // A source with no file of its own rides another, so reading it means
  // reading the one it arrives in.
  if (s.via && route.reads.includes(s.via)) return 'via ' + s.via;
  return '';
}

test('no view claims a read that no file of its own makes', () => {
  const unsupported = [];
  for (const r of routes) {
    for (const k of r.reads) if (!support(r, k)) unsupported.push(`${r.key} reads ${k}`);
  }
  assert.deepEqual(unsupported, [],
    'these rows declare a read nothing on them performs. Either the view stopped reading the ' +
    'cache and the row should drop it, or the read moved to a file the row does not list.');
});

// ── The lower bound ────────────────────────────────────────────────────────

test('a row listing a cache\'s own kit declares that cache', () => {
  const missing = [];
  for (const r of routes) {
    for (const s of sources) {
      if (s.declarer && r.files.includes(s.declarer) && !r.reads.includes(s.key))
        missing.push(`${r.key} lists ${s.declarer} but does not read ${s.key}`);
    }
  }
  assert.deepEqual(missing, [],
    'listing a cache kit among the files that render a view is a claim that the view uses the ' +
    'cache; `reads` has to say so too, or the chips will not show the view.');
});

test('a reading file that backs one route forces that route to declare it', () => {
  const missing = [];
  for (const s of sources) {
    for (const f of readers.get(s.key) || []) {
      if (carried.get(f) !== 1) continue;
      const only = routes.find(r => r.files.includes(f));
      if (!only.reads.includes(s.key))
        missing.push(`${only.key}: ${f} reads ${s.path} and backs no other route`);
    }
  }
  assert.deepEqual(missing, [],
    'a file backing exactly one route reads a cache the route does not declare. There is no ' +
    'other view the read could belong to, so the row is simply behind its own code.');
});

// ── The relation, both ways ────────────────────────────────────────────────

const viewsReading = (key) => routes.filter(r => r.reads.includes(key)).map(r => r.key);

test('every crawled cache is consumed by a view, and says which', () => {
  for (const s of sources) {
    if (!s.declarer) continue;       // pages consume the entity index; titles ride sessions
    assert.ok(viewsReading(s.key).length,
      `${s.key}: no view declares a read of it, so its row would draw no chips at all. ` +
      `A cache the app crawls and nothing consumes is a finding, not a blank.`);
  }
});

// The one source whose consumers are pages rather than views: a page opens at
// its own URL and a view is a stop inside the shell, so one chip cannot mean
// both. The list is still authored, and the scan holds it to the same standard.
test('a source consumed by pages names exactly the pages that read it', () => {
  for (const s of sources) {
    if (!s.pages.length) continue;
    assert.deepEqual([...s.pages].sort(), [...(readers.get(s.key) || [])].sort(),
      `${s.key}: the pages it names and the pages that read ${s.path} have parted`);
  }
});

// ── The detectors, held to detecting ───────────────────────────────────────
// Each check above passes on the current tree, and would pass identically if it
// were broken, so each is driven once with a case it must reject.

test('the checks reject what they exist to catch', () => {
  const sessions = byKey.get('sessions');
  // Upper: a route whose files perform no read of the cache it claims.
  assert.equal(support({ key: 'x', files: ['lib/kits/text-diff.js'], reads: ['sessions'] }, 'sessions'), '');
  // Upper: a pathless source claimed without the source it rides in.
  assert.equal(support({ key: 'x', files: [], reads: ['titles'] }, 'titles'), '');
  assert.equal(support({ key: 'x', files: [], reads: ['titles', 'sessions'] }, 'titles'), 'via sessions');
  // Lower: the declaring kit on a row is support on its own.
  assert.equal(support({ key: 'x', files: [sessions.declarer], reads: [] }, 'sessions'),
               'declaring kit on the row');
  // And a source nobody reads is not silently fine.
  assert.deepEqual(viewsReading('no-such-source'), []);
});
