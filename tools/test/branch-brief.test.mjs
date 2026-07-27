// kits/branch-brief.js — the model behind pages/branch.html.
//
// Two layers, tested separately because they are independent by design: the
// derived layer assembles from API responses and can never be stale, and the
// authored layer is an optional envelope that only ever adds. A branch with no
// envelope has to render completely, which is what lets the page ship before
// any authoring convention exists.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The kit reads window.BranchSurvey for compareFields, so both load into one
// stub window, exactly as the page's gh.load chain arranges them.
const win = {};
for (const f of ['lib/branch-survey.js', 'lib/kits/branch-brief.js']) {
  new Function('window', readFileSync(path.join(repoRoot, f), 'utf8'))(win);
}
const BB = win.BranchBrief;

const SESS = (id) => `https://claude.ai/code/session_${id}`;
const commit = (sha, msg, date) => ({ sha, commit: { message: msg, committer: { date } } });

const compare = (over = {}) => ({
  ahead_by: 2, behind_by: 1, total_commits: 2,
  commits: [
    commit('aaa1111', `first\n\nClaude-Session: ${SESS('S1')}`, '2026-07-20T00:00:00Z'),
    commit('bbb2222', `second\n\nClaude-Session: ${SESS('S1')}`, '2026-07-24T00:00:00Z'),
  ],
  files: [{ filename: 'lib/a.js', status: 'modified', additions: 3, deletions: 1, patch: '@@ -1 +1 @@' }],
  ...over,
});

// ── state ───────────────────────────────────────────────────────────────────

test('state: ahead of the base is live', () => {
  assert.equal(BB.state(compare()), 'live');
});

test('state: zero ahead is landed, whatever the branch is called', () => {
  assert.equal(BB.state(compare({ ahead_by: 0 })), 'landed');
});

test('state: no compare at all means no merge base, so unrelated', () => {
  assert.equal(BB.state(null), 'unrelated');
});

// ── the derived layer ───────────────────────────────────────────────────────

test('assemble derives the whole branch from one compare', () => {
  const b = BB.assemble({ repo: 'acme/w', branch: 'feature', base: 'main', compare: compare() });
  assert.equal(b.state, 'live');
  assert.equal(b.ahead, 2);
  assert.equal(b.behind, 1);
  assert.equal(b.files.length, 1);
  assert.equal(b.files[0].path, 'lib/a.js');
  assert.equal(b.commitCount, 2);
});

test('the lifespan runs oldest unique commit to newest', () => {
  const b = BB.assemble({ repo: 'acme/w', branch: 'f', base: 'main', compare: compare() });
  assert.equal(b.firstDate, '2026-07-20T00:00:00Z');
  assert.equal(b.lastDate, '2026-07-24T00:00:00Z');
});

test('commits come back newest first, the order a reader scans', () => {
  const b = BB.assemble({ repo: 'acme/w', branch: 'f', base: 'main', compare: compare() });
  assert.deepEqual(b.commits.map(c => c.sha), ['bbb2222', 'aaa1111']);
});

test('sessions come off the compare, deduped', () => {
  const b = BB.assemble({ repo: 'acme/w', branch: 'f', base: 'main', compare: compare() });
  assert.deepEqual(b.sessions, [SESS('S1')]);
  assert.equal(b.sessionsExact, true);
});

test('past the commit cap the counts are a floor and say so', () => {
  const b = BB.assemble({ repo: 'acme/w', branch: 'f', base: 'main',
                          compare: compare({ total_commits: 400 }) });
  assert.equal(b.complete, false);
  assert.equal(b.commitCount, 400);
  assert.equal(b.sessionsExact, false);
});

test('a branch with no compare still assembles, as unrelated', () => {
  const b = BB.assemble({ repo: 'acme/w', branch: 'orphan', base: 'main', compare: null });
  assert.equal(b.state, 'unrelated');
  assert.deepEqual(b.files, []);
  assert.deepEqual(b.commits, []);
  assert.equal(b.authored, null);
});

test('an open PR attaches; its absence is not an error', () => {
  const withPr = BB.assemble({ repo: 'acme/w', branch: 'f', base: 'main', compare: compare(),
                               pull: { number: 7, title: 'T', draft: true, state: 'open' } });
  assert.equal(withPr.pr.number, 7);
  assert.equal(withPr.pr.draft, true);
  assert.equal(BB.assemble({ repo: 'acme/w', branch: 'f', base: 'main', compare: compare() }).pr, null);
});

// ── the authored layer ──────────────────────────────────────────────────────

test('readAuthored takes the tagged envelope', () => {
  const a = BB.readAuthored({ kind: 'branch-brief/1', intent: 'why', open: ['a', 'b'] });
  assert.equal(a.intent, 'why');
  assert.deepEqual(a.open, ['a', 'b']);
});

test('readAuthored takes an untagged but recognisable block', () => {
  // Authored by hand as often as generated, so the tag is accepted rather than
  // demanded.
  assert.equal(BB.readAuthored({ intent: 'hand-written' }).intent, 'hand-written');
});

test('readAuthored rejects an unrelated document rather than rendering it', () => {
  for (const junk of [null, 'a string', [1, 2], { unrelated: true }, 42]) {
    assert.equal(BB.readAuthored(junk), null);
  }
});

test('a single string where a list belongs is accepted as one entry', () => {
  assert.deepEqual(BB.readAuthored({ intent: 'x', open: 'just one' }).open, ['just one']);
  assert.deepEqual(BB.readAuthored({ intent: 'x', open: [1, '', 'keep'] }).open, ['keep']);
});

test('a branch-review surface projects onto the same four fields', () => {
  // The profile is the format this page should eventually take; reading it now
  // is what lets that happen without the page changing.
  const a = BB.readAuthored({
    manifest: { profile: { name: 'branch-review', version: 1 }, description: 'fallback' },
    context: { notes: 'scrutinize the cache', open: ['confirm the query'] },
    items: [
      { role: 'intent', commentary: 'why this branch exists' },
      { role: 'changed', commentary: 'the load-bearing bit', target: { source: { path: 'lib/a.js' } } },
      { role: 'omitted', title: 'the FAB rewrite' },
    ],
  });
  assert.equal(a.intent, 'why this branch exists');
  assert.equal(a.notes, 'scrutinize the cache');
  assert.deepEqual(a.open, ['confirm the query']);
  assert.deepEqual(a.omitted, ['the FAB rewrite']);
  assert.equal(a.files['lib/a.js'], 'the load-bearing bit');
});

test('a surface with no intent item falls back to its description', () => {
  const a = BB.readAuthored({
    manifest: { profile: { name: 'branch-review', version: 1 }, description: 'the description' },
    items: [],
  });
  assert.equal(a.intent, 'the description');
});

test('the authored layer rides through assemble untouched', () => {
  const authored = BB.readAuthored({ kind: 'branch-brief/1', intent: 'why' });
  const b = BB.assemble({ repo: 'acme/w', branch: 'f', base: 'main', compare: compare(), authored });
  assert.equal(b.authored.intent, 'why');
});

// ── orchestration ───────────────────────────────────────────────────────────

test('fetchBrief asks for the compare and the branch PR', async () => {
  const calls = [];
  const gh = {
    compare: async (b, h) => { calls.push(['compare', b, h]); return compare(); },
    req: async (p) => { calls.push(['req', p]); return [{ number: 9 }]; },
  };
  const r = await gh && await BB.fetchBrief(gh, { repo: 'acme/w', branch: 'feature', base: 'main' });
  assert.deepEqual(calls[0], ['compare', 'main', 'feature']);
  assert.match(calls[1][1], /^pulls\?state=all&head=acme%3Afeature/);
  assert.equal(r.pull.number, 9);
});

test('a 404 compare is a finding, not a failure', async () => {
  const gh = {
    compare: async () => { throw Object.assign(new Error('404'), { status: 404 }); },
    req: async () => [],
  };
  const r = await BB.fetchBrief(gh, { repo: 'acme/w', branch: 'orphan', base: 'main' });
  assert.equal(r.compare, null);
  assert.equal(r.noBase, true);
});

test('a failed PR lookup leaves the page otherwise intact', async () => {
  const gh = {
    compare: async () => compare(),
    req: async () => { throw new Error('403'); },
  };
  const r = await BB.fetchBrief(gh, { repo: 'acme/w', branch: 'f', base: 'main' });
  assert.equal(r.pull, null);
  assert.ok(r.compare, 'the derived layer survives');
});

test('a non-404 compare error propagates rather than reading as unrelated', async () => {
  const gh = {
    compare: async () => { throw Object.assign(new Error('500'), { status: 500 }); },
    req: async () => [],
  };
  await assert.rejects(() => BB.fetchBrief(gh, { repo: 'acme/w', branch: 'f', base: 'main' }));
});
