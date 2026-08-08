// alpineComponents/branches.js — logic-level tests for the branch-review
// view's fetch plumbing over a fake GH: the GraphQL branch list (and the REST
// fallback when it throws), the one default-branch tree read, the per-branch
// compare, the no-merge-base 404 fallback (commits list, then compare from
// the oldest commit's parent), and the resulting grouping through the pure
// lib/kits/branch-survey.js math. No network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

const DAY = 86400000;
const iso = (daysBack) => new Date(Date.now() - daysBack * DAY).toISOString();

// Trees, keyed by ref/sha as the component requests them. main holds a.txt@A
// and moved/b.txt@B; the branches exercise each classification lane.
const TREES = {
  main: [
    { path: 'a.txt', type: 'blob', sha: 'A' },
    { path: 'moved/b.txt', type: 'blob', sha: 'B' },
  ],
  'sha-fresh': [{ path: 'wip.txt', type: 'blob', sha: 'W' }],           // active regardless
  'sha-landed': [{ path: 'a.txt', type: 'blob', sha: 'A' },             // same path, same bytes
                 { path: 'old/b.txt', type: 'blob', sha: 'B' }],        // moved blob
  'sha-stranded': [{ path: 'only/here.txt', type: 'blob', sha: 'Z' }],  // missing everywhere
  'sha-orphan': [{ path: 'orphan.txt', type: 'blob', sha: 'Q' }],       // via the 404 fallback
};

const calls = [];
class FakeGH {
  constructor() { this.repo = 'me/r'; this.ref = 'main'; }
  ago() { return 'some time ago'; }
  async branchesDated() {
    calls.push('branchesDated');
    return [
      { name: 'main', date: iso(0), ago: '', sha: 'sha-main', subject: 'tip' },
      { name: 'fresh', date: iso(2), ago: '2d ago', sha: 'sha-fresh', subject: 'wip' },
      { name: 'landed', date: iso(30), ago: '1mo ago', sha: 'sha-landed', subject: 'shipped' },
      { name: 'stranded', date: iso(60), ago: '2mo ago', sha: 'sha-stranded', subject: 'lost work' },
      { name: 'orphan', date: iso(90), ago: '3mo ago', sha: 'sha-orphan', subject: 'pre-rewrite' },
    ];
  }
  async branches() {
    calls.push('branches');
    return [{ name: 'main', commit: { sha: 'sha-main' } }, { name: 'rest-only', commit: { sha: 'sha-stranded' } }];
  }
  async compare(base, head) {
    calls.push('compare ' + base + '...' + head);
    if (head === 'orphan') { const e = new Error('GitHub Error 404'); e.status = 404; throw e; }
    if (base === 'parent-of-orphan') {
      return { ahead_by: 3, files: [{ filename: 'only/here.txt' }, { filename: 'orphan.txt' }], commits: [] };
    }
    const files = {
      fresh: [{ filename: 'wip.txt' }],
      landed: [{ filename: 'a.txt' }, { filename: 'old/b.txt' }],
      stranded: [{ filename: 'only/here.txt' }],
      'rest-only': [{ filename: 'only/here.txt' }],
    }[head] || [];
    return {
      ahead_by: 2, files,
      commits: [{ sha: 'c1', commit: { message: 'subject line\nbody', committer: { date: iso(60) } } }],
    };
  }
  async req(path) {
    calls.push('req ' + path);
    const t = path.match(/^git\/trees\/([^?]+)\?recursive=1$/);
    if (t) {
      const key = decodeURIComponent(t[1]);
      return { truncated: false, tree: TREES[key] || TREES[{ 'rest-only': 'sha-stranded' }[key] || key] || [] };
    }
    if (path.startsWith('commits?sha=orphan')) {
      return [
        { sha: 'o2', parents: [{ sha: 'o1' }], commit: { message: 'newest orphan work', committer: { date: iso(90) } } },
        { sha: 'o1', parents: [{ sha: 'parent-of-orphan' }], commit: { message: 'older', committer: { date: iso(95) } } },
      ];
    }
    throw new Error('unexpected req ' + path);
  }
}

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="br" x-data="branches()"></div>
  </body></html>`,
});

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/branch-survey.js',
  'lib/alpineComponents/branches.js',
]);

const data = Alpine.$data(window.document.getElementById('br'));
const store = Alpine.store('browser');
// Setting store.repo also fires the component's repo watcher, so a test's
// explicit load() can overlap a watcher-triggered one; "settled" is when the
// surviving run's survey has landed (the load done, the pool idle, every older
// branch classified), not when a loading flag dips. The fixtures stay under
// SURVEY_CAP, so every older branch is surveyed rather than left idle.
const settle = async () => {
  for (let i = 0; i < 100; i++) {
    const surveyed = (data.older || []).every(r => r.state === 'done' || r.state === 'error');
    if (!data.loading && !data.surveying && surveyed) return;
    await new Promise(r => setTimeout(r, 20));
  }
};

test('mounts with no startup warnings or errors', () => {
  assert.deepEqual(problems, []);
  assert.ok(data.description.length > 0);
});

test('surveys every older branch and groups on the content signal', async () => {
  store.repo = 'me/r'; store.defaultRef = 'main';
  store.gh = new FakeGH();
  await data.load();
  await settle();

  assert.equal(data.list.length, 4, 'main excluded');
  // Recent work is date-only, never surveyed; it fills the default Recent tab.
  assert.deepEqual(data.recent.map(r => r.name), ['fresh']);
  assert.ok(data.older.every(r => r.state === 'done'), JSON.stringify(data.older.map(r => [r.name, r.state, r.err])));

  const byName = Object.fromEntries(data.older.map(r => [r.name, r]));
  assert.equal(byName.landed.group, 'landed');
  assert.equal(byName.landed.nLanded, 2, 'same-path byte match plus moved blob');
  assert.equal(byName.stranded.group, 'stranded');
  // JSON round-trip: the rows live in the jsdom realm, whose Array prototype
  // fails node's cross-realm deepStrictEqual.
  assert.deepEqual(JSON.parse(JSON.stringify(byName.stranded.missingPaths)), ['only/here.txt']);
});

test('a no-merge-base branch takes the commits fallback and is marked', () => {
  const r = data.older.find(x => x.name === 'orphan');
  assert.equal(r.noBase, true);
  assert.ok(calls.includes('req commits?sha=orphan&per_page=50'));
  assert.ok(calls.includes('compare parent-of-orphan...sha-orphan'), 'diff reaches back to the oldest listed parent');
  // orphan.txt is missing from main; only/here.txt is in the diff but absent
  // from the orphan's tip tree, so it takes the deletion credit (landed).
  assert.equal(r.group, 'stranded');
  assert.equal(r.nMissing, 1);
  assert.equal(r.nLanded, 1);
});

test('tabList carries active/landed/stranded counts', () => {
  const counts = Object.fromEntries(data.tabList.map(t => [t.key, t.count]));
  assert.equal(counts.active, 1, 'fresh');
  assert.equal(counts.landed, 1, 'landed');
  assert.equal(counts.stranded, 2, 'stranded + orphan');
});

test('falls back to the REST branch list when GraphQL is unavailable', async () => {
  const gh = new FakeGH();
  gh.branchesDated = async () => { throw new Error('401'); };
  store.gh = gh;
  await data.load();
  await settle();
  // The REST list's one non-default branch has no date, so it surveys as older.
  assert.deepEqual(data.older.map(r => r.name), ['rest-only']);
  const r = data.older[0];
  assert.equal(r.state, 'done', r.err);
  // date and subject were backfilled from the compare's commit list
  assert.equal(r.subject, 'subject line');
  assert.equal(r.group, 'stranded');
});
