// alpineComponents/branch-brief.js — mounted BY A HOST rather than as a page.
//
// show-repo's branch deck mounts one of these per slide, directly in the
// shell's own Alpine. There was an iframe and a postMessage channel between
// them until 2026-08-13, which cost a second boot of the whole library and
// forced a hand-rolled swipe over a single live surface; both went when the
// takeover became a swipe-deck, and what is left is three plain options.
//
// This file holds what a host is owed, since a host cannot see inside:
//
//   - `framed` means the host supplies the identity chrome, so the view drops
//     the repo and the PR link and keeps only the branch name;
//   - `warm` names the neighbours worth reading ahead, which is what makes a
//     step to one of them cost nothing;
//   - `onMeta` reports what only a finished read knows, above all the PR
//     number for a branch whose PR has MERGED: the activity crawl asks GitHub
//     for open pull requests only, so the host's own row has none and its
//     header would otherwise stay blank on the branches whose work is done.
//
// The layout half is here too, because it is also a fact about the host: a
// framed view is a column that pins its head and scrolls its pane, so a long
// file list never carries away the branch name or the pane switch.
//
// No network, no pixels; the same jsdom harness the cards and groups tests use.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const tick = (n = 1) => new Promise(r => setTimeout(r, n * 10));

const compareFor = (branch) => ({
  ahead_by: 2, behind_by: 0, total_commits: 1,
  commits: [{ sha: 'c-' + branch, commit: { message: branch, committer: { date: '2026-08-01T00:00:00Z' } } }],
  files: [{ filename: branch + '.js', status: 'modified', additions: 1, deletions: 0, patch: '@@ -1 +1 @@' }],
});

// A PR per branch, and one of them merged: that is the case the embedder's own
// row cannot cover, so it is the case this channel exists to carry.
const PULLS = {
  'feat/a': [{ number: 443, title: 'A', state: 'open', draft: true, body: 'a' }],
  'feat/b': [{ number: 409, title: 'B', state: 'closed', merged_at: '2026-08-02T00:00:00Z', body: 'b' }],
  'feat/c': [],
};

const calls = { compare: [], pulls: [], csv: [] };
let hold = null;                 // when set, compares wait on it

const { window } = makeWindow({
  html: '<!doctype html><html><body><div id="m"></div></body></html>',
});

for (const f of ['lib/kits/branch-survey.js', 'lib/kits/branch-brief.js']) {
  new window.Function('window', readFileSync(path.join(repoRoot, f), 'utf8'))(window);
}

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || ''; }
  async compare(base, head) {
    calls.compare.push(this.repo + '@' + head);
    if (hold) await hold;
    return compareFor(head);
  }
  async req(p) {
    const m = /head=([^&]*)/.exec(p || '');
    const head = m ? decodeURIComponent(m[1]).split(':')[1] : '';
    calls.pulls.push(this.repo + '@' + head);
    return PULLS[head] || [];
  }
  async get(p) {
    calls.csv.push(this.repo + '@' + this.ref + ':' + p);
    throw Object.assign(new Error('404'), { status: 404 });
  }
}
window.GH = FakeGH;
window.TOKEN = 'tkn';

// What a host is told. The component is mounted with these options, the way
// the branch deck mounts one per slide.
const meta = [];
const OPTS = { repo: 'me/tools', base: 'main', framed: true,
               onMeta: (m) => meta.push(m) };

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
const { default: collapse } = await import('@alpinejs/collapse/dist/module.esm.js');
window.Alpine = Alpine;
Alpine.plugin(collapse);
for (const p of ['lib/alpine-bundle.js', 'lib/alpineComponents/file-review.js',
                 'lib/alpineComponents/branch-brief.js']) {
  new window.Function(readFileSync(path.join(repoRoot, p), 'utf8'))();
}
Alpine.start();
await tick(2);

// Mount one, the way a deck slide does: imperative, options by reference
// through a keyed global, because inside an x-data EXPRESSION Alpine puts
// every registered component name in scope and a bare `repo` would resolve to
// the repo data provider rather than to this string.
let data;
const mount = async (branch, extra = {}) => {
  const host = window.document.getElementById('m');
  host.innerHTML = '';
  window.__opts = { ...OPTS, branch, ...extra };
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'branchBrief(window.__opts)');
  host.append(el);
  Alpine.initTree(el);
  await tick(8);
  data = Alpine.$data(el);
  return data;
};

const reset = () => { calls.compare.length = 0; calls.pulls.length = 0; calls.csv.length = 0; meta.length = 0; };

test('a host mounts it at a branch and is told what the read found', async () => {
  window.BranchBrief.forget();
  await mount('feat/a');
  assert.equal(data.branch, 'feat/a');
  assert.equal(data.brief.files.length, 1);
  const m = meta.at(-1);
  assert.equal(m.branch, 'feat/a');
  assert.equal(m.pr, 443);
  assert.equal(m.prState, 'draft');
});

test('the merged PR is reported, which is the whole point of onMeta', async () => {
  window.BranchBrief.forget();
  reset();
  await mount('feat/b');
  const m = meta.at(-1);
  assert.equal(m.pr, 409);
  assert.equal(m.prState, 'merged',
    'the host cache never saw this one: the crawl asks for OPEN pull requests');
  assert.deepEqual(calls.compare, ['me/tools@feat/b'], 'one branch read, no page loaded');
});

test('a branch with no PR reports none rather than the last one', async () => {
  window.BranchBrief.forget();
  reset();
  await mount('feat/c');
  assert.equal(meta.at(-1).pr, 0);
  assert.equal(meta.at(-1).prState, '');
});

test('the neighbours a host names are warmed, and arriving at one is free', async () => {
  window.BranchBrief.forget();
  reset();
  await mount('feat/a', { warm: [{ repo: 'me/tools', branch: 'feat/b', base: 'main' },
                                 { repo: 'me/tools', branch: 'feat/c', base: 'main' }] });
  await tick(6);
  assert.ok(calls.compare.includes('me/tools@feat/b'), 'read ahead of the reader');
  reset();
  await mount('feat/b');
  assert.equal(data.brief.files[0].path, 'feat/b.js');
  assert.deepEqual(calls.compare, [], 'and arriving there cost no call at all');
});

test('the registry is read once per ref, not once per mount', async () => {
  window.BranchBrief.forget();
  await mount('feat/c');
  data.forgetRegistry();
  reset();
  await mount('feat/c');
  assert.equal(calls.csv.length, 1, 'the repo declares none, which is a 404 worth paying once');
  window.BranchBrief.forget();
  reset();
  await mount('feat/c');
  assert.equal(calls.csv.length, 0, 'and not again inside the memo\'s life');
});

// ── The layout, and where the scrollbar lives ────────────────────────────────
//
// Framed, this is a pane inside a host's chrome, and a pane scrolls inside
// itself. The document scrolling instead meant a long guide or a
// three-hundred-file list carried away the branch name and the control that
// would switch panes, which is the one thing a reader always wants back. The
// classes are the mechanism, so the classes are what this pins; the pixels are
// in tools/render/scenarios, since a jsdom box has no layout to measure.

test('framed: the head holds its place and the pane takes the scroll', async () => {
  window.BranchBrief.forget();
  await mount('feat/a');
  const root = window.document.querySelector('#m > div > div');
  assert.ok(root.className.includes('h-full'), 'the view fills what the host gave it');
  assert.ok(root.firstElementChild.className.includes('shrink-0'), 'the head holds its place');
  assert.ok(root.lastElementChild.className.includes('overflow-y-auto'), 'the pane takes the scroll');
  assert.ok(root.lastElementChild.className.includes('min-h-0'),
    'without which a flex child refuses to shrink and scrolls the document again');
});

test('framed: the document itself is left alone', async () => {
  assert.equal(window.document.body.style.overflow, '',
    'a host owns its own document; this view pins nothing outside its mount');
  assert.equal(window.document.body.style.height, '');
});

// ── The load, under a host that swaps branches ──────────────────────────────

test('a read that is overtaken does not land on top of the newer one', async () => {
  window.BranchBrief.forget();
  await mount('feat/a');
  let release;
  hold = new Promise(r => { release = r; });
  const slow = data.load();                 // feat/a, held
  await tick(1);
  hold = null;
  const d = await mount('feat/c');          // a different mount finishes first
  release();
  await tick(6);
  assert.equal(d.branch, 'feat/c');
  assert.equal(d.brief.files[0].path, 'feat/c.js');
  await slow;
});
