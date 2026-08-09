// lib/kits/github-links.js — the GitHub destinations for one repo. Pure string
// building, so the whole contract is testable: which rows a repo gets, whether
// a ref reaches the rows where a ref means something, and the encoding.
//
// The encoding case is the one that has actually been wrong: a whole-string
// encodeURIComponent turns a branch name's slashes into %2F, which GitHub does
// not read as a path, so every claude/* branch link 404s while looking correct.
// Plain-realm: the module only assigns onto window.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const window = {};
new Function('window', readFileSync(path.join(repoRoot, 'lib', 'kits/github-links.js'), 'utf8'))(window);
const GL = window.GithubLinks;

const keys = rows => rows.map(r => r.key);
const urlOf = (rows, key) => rows.find(r => r.key === key)?.url;

test('the base list, for a repo you are not browsing', () => {
  const rows = GL.rows('me/web-tools');
  assert.deepEqual(keys(rows), ['home', 'prs', 'issues', 'branches', 'commits', 'actions']);
  assert.equal(urlOf(rows, 'home'), 'https://github.com/me/web-tools');
  assert.equal(urlOf(rows, 'prs'), 'https://github.com/me/web-tools/pulls');
  assert.equal(urlOf(rows, 'issues'), 'https://github.com/me/web-tools/issues');
  // Every row leaves the app, so every row carries the out-arrow flag.
  assert.ok(rows.every(r => r.external));
});

test('no repo, no rows', () => {
  assert.deepEqual(GL.rows(''), []);
  assert.equal(GL.repoUrl(''), '');
});

test('a declared tracker adds the one row GitHub cannot name itself', () => {
  const file = GL.rows('me/web-tools', { tracker: 'tracker/board.md' });
  assert.deepEqual(keys(file), ['home', 'prs', 'issues', 'tracker', 'branches', 'commits', 'actions']);
  // A path with an extension is a blob; HEAD stands in for the default branch,
  // which this list never has to know the name of.
  assert.equal(urlOf(file, 'tracker'), 'https://github.com/me/web-tools/blob/HEAD/tracker/board.md');
  // A bare path is a folder, so it is a tree.
  const dir = GL.rows('me/web-tools', { tracker: 'tracker' });
  assert.equal(urlOf(dir, 'tracker'), 'https://github.com/me/web-tools/tree/HEAD/tracker');
});

test('the ref reaches only the rows a ref means something for', () => {
  const rows = GL.rows('me/web-tools',
    { ref: 'claude/some-branch', defaultRef: 'main', tracker: 'tracker/board.md' });
  assert.equal(urlOf(rows, 'home'), 'https://github.com/me/web-tools/tree/claude/some-branch');
  assert.equal(urlOf(rows, 'commits'), 'https://github.com/me/web-tools/commits/claude/some-branch');
  assert.equal(urlOf(rows, 'tracker'),
    'https://github.com/me/web-tools/blob/claude/some-branch/tracker/board.md');
  // Pull requests, issues, branches and actions are repo-wide: a ref would be
  // noise at best and a 404 at worst.
  assert.equal(urlOf(rows, 'prs'), 'https://github.com/me/web-tools/pulls');
  assert.equal(urlOf(rows, 'branches'), 'https://github.com/me/web-tools/branches');
});

test('a ref equal to the default, or with no default to compare, is not stamped', () => {
  assert.equal(urlOf(GL.rows('me/r', { ref: 'main', defaultRef: 'main' }), 'home'),
    'https://github.com/me/r');
  // Without a defaultRef there is nothing to say the ref is worth naming, which
  // is the caller saying "this is not the repo I am browsing".
  assert.equal(urlOf(GL.rows('me/r', { ref: 'main' }), 'home'), 'https://github.com/me/r');
});

test('a branch name is encoded segment-wise, so its slashes survive', () => {
  const rows = GL.rows('me/r', { ref: 'feat/a b', defaultRef: 'main' });
  assert.equal(urlOf(rows, 'home'), 'https://github.com/me/r/tree/feat/a%20b');
  assert.ok(!urlOf(rows, 'home').includes('%2F'));
});

test('pathUrl builds a path inside the repo, tree or blob by extension', () => {
  // The sidebar's project rows: a workspace folder, at the default branch.
  assert.equal(GL.pathUrl('me/home', 'projects/budget-wa'),
    'https://github.com/me/home/tree/HEAD/projects/budget-wa');
  // A board file is a blob, and the ref given is stamped as given: this one
  // takes no defaultRef and makes no judgment about whether to name it.
  assert.equal(GL.pathUrl('me/home', 'projects/budget-wa/tracker/board.md', 'claude/some-branch'),
    'https://github.com/me/home/blob/claude/some-branch/projects/budget-wa/tracker/board.md');
  // Same segment-wise encoding, so a branch keeps its slashes and a path keeps
  // its own while its spaces still escape.
  assert.equal(GL.pathUrl('me/r', 'a b/c', 'feat/x'), 'https://github.com/me/r/tree/feat/x/a%20b/c');
  // Stray slashes are trimmed rather than doubling up in the URL.
  assert.equal(GL.pathUrl('me/r', '/docs/'), 'https://github.com/me/r/tree/HEAD/docs');
  assert.equal(GL.pathUrl('me/r', ''), '');
  assert.equal(GL.pathUrl('', 'docs'), '');
  assert.equal(GL.pathUrl('me/r', '/'), '');
});

test('url() picks one destination out of the same list', () => {
  assert.equal(GL.url('me/r', 'prs'), 'https://github.com/me/r/pulls');
  assert.equal(GL.url('me/r', 'tracker'), '');                    // undeclared
  assert.equal(GL.url('me/r', 'tracker', { tracker: 'tasks' }),
    'https://github.com/me/r/tree/HEAD/tasks');
  assert.equal(GL.url('me/r', 'nope'), '');
});
