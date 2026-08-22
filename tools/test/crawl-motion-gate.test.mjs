// The gate on each crawl, and the promise the State view used to print over it.
//
// This file replaces state-view-throttles.test.mjs, which held a different
// invariant for a different design. There were three intervals, one per cache,
// owned by the shell that enforced them, and the State view printed each one on
// its row as "auto every 30m". That test existed because the view kept its own
// copy of each number and the copy was the half that aged.
//
// Both sides of that are gone. The view prints no interval, because there is no
// schedule to name: nothing here has ever run on a timer, and the intervals were
// floors with a promise written on them. Each crawl now gates itself per unit of
// work on whether its source moved, which is evidence rather than a guess, and
// what remains of the clock is one shared debounce nothing renders.
//
// The gates are read out of source rather than executed, for the same reason
// activity-watermark-gate.test.mjs reads its own: they live in the shell's
// inline script and need a live GitHub to run. What can be held here is the
// SHAPE, and the shape is where the bugs are. Every clause below is a way a gate
// could be wrong that would look right on screen, and the worst of them fail by
// serving stale data rather than by throwing.
//
// No network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const shellSrc = readFileSync(path.join(repoRoot, 'app', 'index.html'), 'utf8');
const viewSrc = readFileSync(path.join(repoRoot, 'lib', 'alpineComponents', 'state-view.js'), 'utf8');

// ── The clock is a debounce now, not a policy ──────────────────────────────

test('one floor, shared, and no per-cache interval left to drift', () => {
  // Three constants became one. The old names are asserted absent rather than
  // merely unused: a reintroduced CONFIG_CACHE_INTERVAL_MS would gate a crawl
  // on the clock again with nothing else in the suite to notice.
  assert.doesNotMatch(shellSrc, /_CACHE_INTERVAL_MS/,
    'a per-cache interval is back; the gate belongs inside the crawl');
  assert.match(shellSrc, /^ {2}CRAWL_FLOOR_MS: 60 \* 1000,$/m);
});

test('every crawl reads the floor, and nothing else reads a clock', () => {
  const floors = shellSrc.match(/Date\.now\(\) - last < this\.CRAWL_FLOOR_MS/g) || [];
  assert.equal(floors.length, 3, 'configs, activity and sessions each debounce');
});

test('the view names no schedule, since naming one is what went wrong', () => {
  // "auto every 30m" read as a promise the shell never made. The whole row of
  // machinery behind it goes with the words: the view held a fallback copy of
  // each interval and resolved the live one off the shell by name.
  // The rendered string, not the word: the comment recording why this went is
  // the kind of prose the repo keeps, and a test that forbade naming a retired
  // feature would forbid explaining it.
  assert.doesNotMatch(viewSrc, /'auto every '/);
  assert.doesNotMatch(viewSrc, /throttleKey|throttleMs|throttleOf/);
});

// ── The config gate: a repo that cannot have moved is not read ─────────────

const cfgGate = shellSrc.slice(shellSrc.indexOf('const cquiet = (repo) =>'),
                               shellSrc.indexOf('const cskipped = []'));

test('the config gate reads pushed_at off the enumeration it already makes', () => {
  // One listing, two jobs. Paying a second call to learn what the first one
  // returned is what would make per-repo gating not worth having.
  assert.match(shellSrc, /pushedAt = new Map\(all\.map\(r => \[r\.full_name, r\.pushed_at \|\| ''\]\)\)/);
});

test('a forced config pass is never quiet, or Refresh means nothing', () => {
  assert.match(cfgGate, /if \(force\) return false;/);
});

test('nothing to carry forward is never quiet', () => {
  // A skip serves the stored entry through buildCache's `carry`. A repo with
  // no stored entry has nothing to serve, however unmoved it is.
  assert.match(cfgGate, /if \(!cachedRepos\.has\(repo\)\) return false;/);
});

test('an unreadable pushed_at is never quiet', () => {
  // The fallback enumeration (this.estateRepos, when the listing throws) fills
  // no pushed_at at all, so a crawl that lost the listing must read every repo
  // rather than trust an empty map. Gating on a guess is worse than the calls
  // it saves.
  assert.match(cfgGate, /if \(!pushed\) return false;/);
  assert.match(cfgGate, /return cmarks\[repo\] === pushed;/);
});

test('a mark is stamped only for a repo this pass actually read', () => {
  // Stamping one for a repo whose read threw would make the failure permanent:
  // the next pass would call it quiet and carry forward an entry nothing
  // refreshed. The stamp sits after the fetch, beside it in `fetched`.
  const body = shellSrc.slice(shellSrc.indexOf('const cskipped = []'),
                              shellSrc.indexOf('const moved = window.RepoConfigCache.changedRepos'));
  assert.match(body, /fetched\[repo\] = entry;\n\s*\/\/[\s\S]{0,400}?if \(pushedAt\.get\(repo\)\) cmarks\[repo\] = pushedAt\.get\(repo\);/);
});

// ── The sessions gate: the listing is the evidence ─────────────────────────

const sesGate = shellSrc.slice(shellSrc.indexOf('const fingerprint = listing.map'),
                               shellSrc.indexOf('// This read decides which records are stale'));

test('the fingerprint covers path AND sha, or a rewrite reads as quiet', () => {
  // A record edited in place keeps its path and changes its blob sha. Paths
  // alone would gate that out and the cache would hold the old body forever.
  assert.match(sesGate, /listing\.map\(e => e\.path \+ ':' \+ e\.sha\)/);
});

test('the gate sits ABOVE the cache read, which is its whole value', () => {
  // Reading state/sessions.json to discover nothing moved costs 371 KB on every
  // arrival, which is the expense the fifteen-minute clock was buying off.
  assert.ok(shellSrc.indexOf('const fingerprint = listing.map')
          < shellSrc.indexOf('const base = await this.readForFold(reg, S.CACHE_PATH)'),
    'the fingerprint must be compared before the cache is read');
});

test('a forced sessions pass never gates', () => {
  assert.match(sesGate, /if \(!force && smarks\.listing === fingerprint\)/);
  assert.match(shellSrc, /this\._sessionsCrawl = this\._crawlSessions\(force\)/, 'force is passed');
  assert.match(shellSrc, /async _crawlSessions\(force = false\)/, 'force is received');
});

test('a gated pass still stamps `checked`, because it did check', () => {
  // The floor above is a debounce; this is the reading it debounces. Leaving it
  // unstamped would make "checked" mean "last committed", which is exactly the
  // conflation the State view's two ages exist to keep apart.
  assert.match(sesGate, /localStorage\.setItem\(this\._sessionsCheckKey/);
});

test('an incomplete fold leaves the store looking moved, which it is', () => {
  // THE CLAUSE THIS GATE IS WRONG WITHOUT. `stale` can exceed SESSIONS_MAX_FETCH
  // and a record whose blob read threw is not in `fetched` either; both stay
  // stale for the next pass. Stamping the fingerprint anyway would tell that
  // pass the store had not moved, and those records would never be read again:
  // the cache would sit permanently short with every reading on screen saying
  // it was current.
  const fold = shellSrc.slice(shellSrc.indexOf('const deferred = Math.max(0, stale.length'),
                              shellSrc.indexOf('const changed = S.cacheChanged(prev, next)'));
  assert.match(fold, /const complete = !deferred && Object\.keys\(fetched\)\.length === take\.length;/);
  assert.match(fold, /if \(complete\) this\._setMarks\(this\._sessionsMarkKey/);
});

// ── Arrival ────────────────────────────────────────────────────────────────

test('opening State runs all three crawls', () => {
  // It used to run none, on the argument that a view whose subject is age must
  // not answer its own question before you read it. That held while a crawl
  // cost a full pass; with the gates inside, a look that finds nothing costs
  // about one call each, and the view someone opens BECAUSE they suspect a lag
  // should not be the one view that declines to fix it.
  const go = shellSrc.slice(shellSrc.indexOf('goState(item){'),
                            shellSrc.indexOf('this.syncUrl();', shellSrc.indexOf('goState(item){')));
  assert.match(go, /this\.refreshConfigCache\?\.\(\)/);
  assert.match(go, /this\.refreshActivityCache\?\.\(false, \{ deep: false \}\)/);
  assert.match(go, /this\.refreshSessionsCache\?\.\(\)/);
});

test('the arrival passes are unforced, or the gates would never fire', () => {
  // A forced pass skips every gate by design. Arriving with force would make
  // every visit a full estate crawl, which is the cost the gates exist to
  // avoid and the reason arriving is affordable at all.
  const go = shellSrc.slice(shellSrc.indexOf('goState(item){'),
                            shellSrc.indexOf('this.syncUrl();', shellSrc.indexOf('goState(item){')));
  assert.doesNotMatch(go, /refreshConfigCache\?\.\(true\)/);
  assert.doesNotMatch(go, /refreshSessionsCache\?\.\(true\)/);
  assert.doesNotMatch(go, /refreshActivityCache\?\.\(true/);
});

// ── A kick that lands has to say so ────────────────────────────────────────
// The half this change shipped without, and the way it failed is the reason it
// needs a test rather than a careful reader. The crawls ran, gated correctly,
// and stamped their `checked` keys. The view had read those stamps once at
// mount and had no reason to read them again, so every row sat there reporting
// an age from before the crawl: on a phone, "checked 1d ago" over a crawl that
// had finished a second earlier. Nothing threw, nothing logged, and the only
// symptom was a number that looked plausible.

test('goState announces each kick as it lands, and once when all settle', () => {
  const go = shellSrc.slice(shellSrc.indexOf('goState(item){'),
                            shellSrc.indexOf('this.syncUrl();', shellSrc.indexOf('goState(item){')));
  assert.match(go, /web-tools:cache-checked/);
  // Per kick, so a row updates as its own crawl lands rather than at the pace
  // of the slowest of the three.
  assert.match(go, /\.then\(\(\) => checked\(false\)\)/);
  // And once at the end: a crawl that committed also moved `updated`, which no
  // localStorage read can see.
  assert.match(go, /Promise\.all\([\s\S]*?\)\s*\n?\s*\.then\(\(\) => checked\(true\)\)/);
  // A crawl that threw must not strand the announcement, or one failing crawl
  // freezes the other two rows' ages for the life of the page.
  assert.match(go, /Promise\.resolve\(p\)\.catch\(\(\) => \{\}\)/);
});

test('the view listens for it, and cleans the listener up', () => {
  assert.match(viewSrc, /document\.addEventListener\('web-tools:cache-checked', this\._checked\)/);
  assert.match(viewSrc, /document\.removeEventListener\('web-tools:cache-checked', this\._checked\)/);
  // The cheap pass reads localStorage only. Calling load() on every kick would
  // put three five-call reads on every visit to the view.
  assert.match(viewSrc, /if \(e\.detail\?\.settled\) \{ this\.load\(\); return; \}/);
  assert.match(viewSrc, /checkedAgo: this\.checkedAgo\(r\.checkedKey\)/);
});

test('the manual events are still separate, since they mean something else', () => {
  // `*-refreshed` says a crawl the USER forced has finished and the panes it
  // feeds should re-read. Folding the arrival kicks into it would put a full
  // estate reload behind every visit to this view.
  for (const ev of ['configs-refreshed', 'activity-refreshed', 'sessions-refreshed'])
    assert.ok(viewSrc.includes(ev), `${ev} should still be listened for`);
});
