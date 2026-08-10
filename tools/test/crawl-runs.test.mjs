// crawl-runs.js — the `runs` ring each state/ cache carries, and the interval
// join that hangs a run on the commit it produced.
//
// Two properties this holds, and both are the reason the ring is affordable:
//
//  • push() drops a field the caller did not measure rather than writing zero,
//    because the config crawl cannot count its failures and "0 failed" is a
//    claim while an absent key is not.
//  • matchRuns() joins by INTERVAL, never by position. Commits predate the ring
//    and a hand-edited file has a commit with no run at all, so the two lists
//    do not line up; a positional join would shift every duration by one the
//    first time it met such a commit, which is exactly the failure that would
//    go unnoticed.
//
// No network, no DOM.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const window = {};
new Function('window', readFileSync(path.join(repoRoot, 'lib/kits/crawl-runs.js'), 'utf8'))(window);
const { push, matchRuns, CAP } = window.CrawlRuns;

test('push appends newest-last and holds the cap', () => {
  let runs;
  for (let i = 0; i < CAP + 5; i++) runs = push(runs, { at: 'a' + i, ms: i * 1000, checked: 9 });
  assert.equal(runs.length, CAP);
  assert.equal(runs[runs.length - 1].at, 'a' + (CAP + 4));
  assert.equal(runs[0].at, 'a5');              // the oldest five fell off the front
});

test('push does not mutate the ring it was handed', () => {
  const before = [{ at: 'a', ms: 1 }];
  const after = push(before, { at: 'b', ms: 2 });
  assert.equal(before.length, 1);
  assert.equal(after.length, 2);
});

test('a field the crawl did not measure is dropped, never written as zero', () => {
  // The config crawl swallows a per-repo read failure, so it passes no `failed`.
  // An absent key reads as "not counted"; a 0 would read as "none failed".
  const [run] = push(null, { at: 'a', ms: 1200.6, checked: 18, changed: 1, failed: undefined });
  assert.deepEqual(Object.keys(run).sort(), ['at', 'changed', 'checked', 'ms']);
  assert.equal(run.ms, 1201);                  // rounded, since it is milliseconds off a clock
  // A measured zero is a different statement and survives.
  const [kept] = push(null, { at: 'a', ms: 5, checked: 9, failed: 0 });
  assert.equal(kept.failed, 0);
});

// The list the join runs against: three commits an hour apart, each with a run
// stamped a few seconds before it (the crawl writes `at` into the file it is
// about to commit).
const commits = [
  { sha: 'c2', date: '2026-08-09T14:00:00Z' },
  { sha: 'c1', date: '2026-08-09T13:00:00Z' },
  { sha: 'c0', date: '2026-08-09T12:00:00Z' },
];
const runFor = (iso, ms) => ({ at: iso, ms, checked: 9 });

test('each commit gets the run that produced it', () => {
  const runs = [runFor('2026-08-09T11:59:52Z', 8000), runFor('2026-08-09T12:59:51Z', 9000),
                runFor('2026-08-09T13:59:55Z', 7000)];
  assert.deepEqual(matchRuns(commits, runs).map(r => r.ms), [7000, 9000, 8000]);
});

test('a commit with no run of its own takes none, and shifts nobody', () => {
  // c1 predates the ring: the older commits must keep their own runs rather
  // than sliding up into c1's empty slot, which is what a positional join does.
  const runs = [runFor('2026-08-09T11:59:52Z', 8000), runFor('2026-08-09T13:59:55Z', 7000)];
  const out = matchRuns(commits, runs);
  assert.equal(out[0].ms, 7000);
  assert.equal(out[1], null);
  assert.equal(out[2].ms, 8000);
});

test('a run landing just after its commit is still its run', () => {
  // The stamp goes in before the write; a clock a little ahead of GitHub's
  // commit date must not orphan the record.
  const runs = [runFor('2026-08-09T14:00:41Z', 6000)];
  assert.equal(matchRuns(commits, runs)[0].ms, 6000);
});

test('a run far ahead of every commit belongs to none of them', () => {
  const runs = [runFor('2026-08-09T15:30:00Z', 6000)];
  assert.deepEqual(matchRuns(commits, runs), [null, null, null]);
});

test('the newest run inside an interval wins, and no run is used twice', () => {
  // Two runs between c0 and c1 can only happen if a commit was lost or the file
  // was written twice; the later one produced the commit that survived.
  const runs = [runFor('2026-08-09T12:10:00Z', 1000), runFor('2026-08-09T12:59:00Z', 2000),
                runFor('2026-08-09T13:59:00Z', 3000)];
  const out = matchRuns(commits, runs);
  assert.equal(out[0].ms, 3000);
  assert.equal(out[1].ms, 2000);
  assert.equal(out[2], null);      // 12:10 already belongs to c1's interval
});

test('an empty or absent ring joins to nothing rather than throwing', () => {
  assert.deepEqual(matchRuns(commits, []), [null, null, null]);
  assert.deepEqual(matchRuns(commits, undefined), [null, null, null]);
  assert.deepEqual(matchRuns([], [runFor('2026-08-09T12:00:00Z', 1)]), []);
});
