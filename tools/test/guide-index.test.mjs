// kits/guide-index.js — the pure fold behind the estate's Guides pane. Run the
// IIFE against a window stub, then exercise path admission, the title
// derivation, the main/PR merge (one document is one row), session collection
// across PR row shapes, ordering, and the render address.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/guide-index.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const G = window.guideIndex;

const REPO = 'mehrlander/web-tools';
const GUIDE = 'pages/guides/code-layers.html';

test('isGuidePath admits a flat .html under the shelf and nothing else', () => {
  assert.ok(G.isGuidePath('pages/guides/code-layers.html'));
  assert.ok(G.isGuidePath('pages/guides/a.HTML'));           // extension case-blind
  // The shelf's own README is prose about the shelf, not a guide.
  assert.ok(!G.isGuidePath('pages/guides/README.md'));
  // One flat shelf: a nested file is not reached, so "what is a guide" stays
  // answerable from the path with no directory walk.
  assert.ok(!G.isGuidePath('pages/guides/sub/deep.html'));
  assert.ok(!G.isGuidePath('pages/guides/'));
  // A page that merely lives near the shelf is not on it.
  assert.ok(!G.isGuidePath('pages/branch.html'));
  assert.ok(!G.isGuidePath('docs/guides/thing.html'));
  assert.ok(!G.isGuidePath(null) && !G.isGuidePath(undefined));
});

test('titleOf reads the filename, hyphens and underscores as spaces', () => {
  assert.equal(G.titleOf(GUIDE), 'Code layers');
  assert.equal(G.titleOf('pages/guides/some_long-name.html'), 'Some long name');
  assert.equal(G.titleOf(''), '');
});

test('thumbPath mirrors the pages tree under pages/thumbs, extension swapped', () => {
  assert.equal(G.thumbPath(GUIDE), 'pages/thumbs/guides/code-layers.png');
  assert.equal(G.thumbPath('pages/branch.html'), 'pages/thumbs/branch.png');
  // Derived, not looked up: a guide on a branch resolves its own branch's shot,
  // which pages/pages.csv cannot answer because it is generated from main.
  assert.equal(G.thumbPath('docs/thing.html'), '');
  assert.equal(G.thumbPath(''), '');
});

test('a guide on main and on a PR is ONE row, not two', () => {
  const rows = G.build({
    main: [{ repo: REPO, path: GUIDE, ref: 'main' }],
    onPrs: [{ repo: REPO, path: GUIDE, pr: { number: 367, head: 'claude/x', sessions: ['s1'] } }],
  });
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.onMain, true);
  assert.deepEqual(r.refs, ['main', 'claude/x']);   // default branch first
  assert.equal(r.prs.length, 1);
  assert.deepEqual(r.sessions, ['s1']);
});

test('a branch-only guide is listed, with no claim of being on main', () => {
  const rows = G.build({
    main: [],
    onPrs: [{ repo: REPO, path: GUIDE, pr: { number: 367, head: 'claude/x', sessions: ['s1'] } }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].onMain, false);
  assert.deepEqual(rows[0].refs, ['claude/x']);
});

test('a landed guide with no open PR still appears, simply unlinked', () => {
  const rows = G.build({ main: [{ repo: REPO, path: GUIDE, ref: 'main' }], onPrs: [] });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].prs, []);
  assert.deepEqual(rows[0].sessions, []);
  assert.equal(rows[0].onMain, true);
});

test('sessions collect across PRs, dedupe, and read the older bare `session` field', () => {
  const rows = G.build({
    main: [],
    onPrs: [
      { repo: REPO, path: GUIDE, pr: { number: 10, head: 'a', sessions: ['s1', 's2'] } },
      // A pre-2026-08 row carries one bare `session` and no list; reading only
      // `sessions` would report it as sessionless.
      { repo: REPO, path: GUIDE, pr: { number: 20, head: 'b', session: 's2' } },
    ],
  });
  const r = rows[0];
  assert.equal(r.prs.length, 2);
  assert.equal(r.prs[0].number, 20);                  // newest PR first
  assert.deepEqual(r.sessions, ['s2', 's1']);         // deduped, newest PR leading
});

test('non-guide paths are dropped from both inputs', () => {
  const rows = G.build({
    main: [{ repo: REPO, path: 'pages/guides/README.md' }, { repo: REPO, path: 'lib/x.js' }],
    onPrs: [{ repo: REPO, path: 'pages/branch.html', pr: { number: 1, head: 'h' } }],
  });
  assert.deepEqual(rows, []);
});

test('in-flight guides sort ahead of landed ones, then by repo and path', () => {
  const rows = G.build({
    main: [
      { repo: 'mehrlander/home', path: 'pages/guides/zeta.html', ref: 'main' },
      { repo: REPO, path: 'pages/guides/alpha.html', ref: 'main' },
      { repo: REPO, path: GUIDE, ref: 'main' },
    ],
    onPrs: [{ repo: REPO, path: GUIDE, pr: { number: 367, head: 'claude/x' } }],
  });
  assert.equal(rows[0].path, GUIDE);                  // the one with a PR leads
  assert.deepEqual(rows.slice(1).map(r => r.repo + ':' + r.path),
    ['mehrlander/home:pages/guides/zeta.html', REPO + ':pages/guides/alpha.html']);
});

test('renderUrl addresses the toss renderer at a ref, preferring the PR head', () => {
  const [inFlight] = G.build({
    main: [{ repo: REPO, path: GUIDE, ref: 'main' }],
    onPrs: [{ repo: REPO, path: GUIDE, pr: { number: 367, head: 'claude/x' } }],
  });
  assert.match(G.renderUrl(inFlight), /#gh=mehrlander\/web-tools@claude\/x:pages\/guides\/code-layers\.html$/);
  // An explicit ref wins, which is what a per-row ref switch would pass.
  assert.match(G.renderUrl(inFlight, { ref: 'main' }), /@main:/);
  assert.equal(G.renderUrl(null), '');
});

// The fault this comparison exists to prevent: build() reads a DIRECTORY
// LISTING of each PR head, which inherits every guide already on the default
// branch. Presence on a branch is not authorship, so without the sha check a
// landed guide reads "in flight" on every branch cut after it merged, and
// carries that PR's sessions as though they had written it.
test('a guide unchanged on a PR head is not in flight on that PR', () => {
  const rows = G.build({
    main: [{ repo: REPO, path: GUIDE, ref: 'main', sha: 'aaa111' }],
    // Two open PRs that merely contain the file, exactly as a branch cut from
    // main after the guide landed does.
    onPrs: [
      { repo: REPO, path: GUIDE, sha: 'aaa111', pr: { number: 380, head: 'claude/unrelated-a' } },
      { repo: REPO, path: GUIDE, sha: 'aaa111', pr: { number: 381, head: 'claude/unrelated-b' } },
    ],
  });
  assert.equal(rows.length, 1, 'still one row: the guide exists');
  assert.deepEqual(rows[0].prs, [], 'no PR is proposing it');
  assert.deepEqual(rows[0].sessions, [], 'and no session is credited with it');
  assert.equal(rows[0].onMain, true);
});

test('a guide whose blob differs on a PR head IS in flight, with that session', () => {
  const rows = G.build({
    main: [{ repo: REPO, path: GUIDE, ref: 'main', sha: 'aaa111' }],
    onPrs: [
      { repo: REPO, path: GUIDE, sha: 'bbb222',
        pr: { number: 382, head: 'claude/revising', sessions: ['https://claude.ai/code/session_01X'] } },
      // A second PR that only carries the file is still filtered out, so the
      // revising PR is not diluted by branches that did nothing.
      { repo: REPO, path: GUIDE, sha: 'aaa111', pr: { number: 383, head: 'claude/bystander' } },
    ],
  });
  assert.deepEqual(rows[0].prs.map(p => p.number), [382]);
  assert.deepEqual(rows[0].sessions, ['https://claude.ai/code/session_01X']);
});

test('a new guide that exists only on a branch is in flight with no baseline', () => {
  const rows = G.build({
    main: [],
    onPrs: [{ repo: REPO, path: GUIDE, sha: 'ccc333', pr: { number: 384, head: 'claude/new' } }],
  });
  assert.equal(rows[0].onMain, false);
  assert.deepEqual(rows[0].prs.map(p => p.number), [384]);
});

test('a caller that supplies no sha is taken at face value, not emptied', () => {
  // The comparison is an improvement on a listing that carries shas, never a
  // requirement. A fixture or an older caller without them still folds.
  const rows = G.build({
    main: [{ repo: REPO, path: GUIDE, ref: 'main' }],
    onPrs: [{ repo: REPO, path: GUIDE, pr: { number: 385, head: 'claude/x' } }],
  });
  assert.deepEqual(rows[0].prs.map(p => p.number), [385]);
});

test('the kit registers exactly its namespace against a bare window', () => {
  const w = {};
  new Function('window', src)(w);
  assert.deepEqual(Object.keys(w), ['guideIndex']);
  assert.equal(typeof w.guideIndex.build, 'function');
});
