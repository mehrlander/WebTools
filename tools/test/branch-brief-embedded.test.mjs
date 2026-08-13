// alpineComponents/branch-brief.js — one mount, many branches.
//
// The swiper used to step by swapping the iframe's src, which is a whole
// document load per step: the pre-build re-parsed and re-executed, Alpine
// booted, the DOM walked, before the first API call went out. A branch is a
// different SUBJECT for this component, not a different page, so an embedder
// now asks for the next one over postMessage and the component reloads in
// place.
//
// Four things are worth holding, and each of them is a way the swap used to
// paper over a problem this channel now has to solve on its own:
//
//   - the subject really changes, and nothing of the previous branch is left
//     on screen describing this one;
//   - a step that lands mid-read does not get the older answer written over
//     it, which the src swap got for free by throwing the whole document away;
//   - the embedder is told what happened, including the PR number, which its
//     own list cannot know for a merged PR (the activity crawl asks GitHub for
//     open pull requests only);
//   - the neighbours named on the message are warmed into the kit's cache, so
//     the step the reader is about to take is already answered.
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
  html: `<!doctype html><html><body><div id="m"
           x-data="branchBrief({ repo: 'me/tools', branch: 'feat/a', base: 'main', framed: true })"></div></body></html>`,
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

// What the component posts to its embedder. jsdom gives the frame a `parent`
// of itself, so this records what a real takeover would receive.
const posted = [];
window.parent = { postMessage: (m) => posted.push(m) };

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
const { default: collapse } = await import('@alpinejs/collapse/dist/module.esm.js');
window.Alpine = Alpine;
Alpine.plugin(collapse);
for (const p of ['lib/alpine-bundle.js', 'lib/alpineComponents/file-review.js',
                 'lib/alpineComponents/branch-brief.js']) {
  new window.Function(readFileSync(path.join(repoRoot, p), 'utf8'))();
}
Alpine.start();
await tick(8);

const data = Alpine.$data(window.document.getElementById('m'));
const docEl = window.document.documentElement;

// Deliver a message the way the embedder does. The component listens on
// `window`, so this is the real path and not a method call.
const send = async (m, waits = 8) => {
  window.dispatchEvent(Object.assign(new window.Event('message'), {
    data: { source: 'web-tools', ...m },
  }));
  await tick(waits);
};

const reset = () => { calls.compare.length = 0; calls.pulls.length = 0; calls.csv.length = 0; posted.length = 0; };

test('it opened on the branch it was mounted at, and said so', () => {
  assert.equal(data.branch, 'feat/a');
  assert.equal(data.brief.files.length, 1);
  assert.equal(docEl.getAttribute('data-brief-pr'), '443');
  assert.equal(docEl.getAttribute('data-brief-pr-state'), 'draft');
  const ready = posted.filter(m => m.phase === 'ready').pop();
  assert.equal(ready.pr, 443);
  assert.equal(ready.branch, 'feat/a');
});

test('a branch-open message swaps the subject in place', async () => {
  reset();
  window.BranchBrief.forget();
  await send({ type: 'branch-open', repo: 'me/tools', branch: 'feat/b', base: 'main' });
  assert.equal(data.branch, 'feat/b');
  assert.equal(data.brief.files[0].path, 'feat/b.js');
  assert.deepEqual(calls.compare, ['me/tools@feat/b'], 'one branch read, not a page reloaded');
});

test('the merged PR reaches the embedder, which is the whole point of the channel', () => {
  assert.equal(docEl.getAttribute('data-brief-pr'), '409');
  assert.equal(docEl.getAttribute('data-brief-pr-state'), 'merged');
  const ready = posted.filter(m => m.phase === 'ready').pop();
  assert.equal(ready.pr, 409);
  assert.equal(ready.prState, 'merged');
});

test('loading is reported before ready, and clears the previous PR', async () => {
  reset();
  window.BranchBrief.forget();
  let release;
  hold = new Promise(r => { release = r; });
  const sent = send({ type: 'branch-open', repo: 'me/tools', branch: 'feat/c', base: 'main' }, 2);
  await tick(1);
  assert.equal(docEl.hasAttribute('data-brief-ready'), false, 'the embedder holds its facts card');
  assert.equal(posted[0].phase, 'loading');
  release(); hold = null;
  await sent;
  await tick(6);
  assert.equal(docEl.hasAttribute('data-brief-ready'), true);
  assert.equal(docEl.hasAttribute('data-brief-pr'), false, 'feat/c has no PR, and 409 did not linger');
});

test('nothing of the previous branch survives the swap', async () => {
  window.BranchBrief.forget();
  await send({ type: 'branch-open', repo: 'me/tools', branch: 'feat/a', base: 'main' });
  assert.equal(data.guideIdx, 0);
  assert.equal(data.pane, 'guide', 'feat/a has a PR, so the judgment leads again');
  assert.equal(data.brief.prs[0].number, 443, 'and it is feat/a’s PR, not the one before');
});

test('a step that lands mid-read is not overwritten by the slower one behind it', async () => {
  reset();
  window.BranchBrief.forget();
  let release;
  hold = new Promise(r => { release = r; });
  await send({ type: 'branch-open', repo: 'me/tools', branch: 'feat/b', base: 'main' }, 1);
  hold = null;                                   // the next read resolves at once
  await send({ type: 'branch-open', repo: 'me/tools', branch: 'feat/c', base: 'main' }, 6);
  release();
  await tick(6);
  assert.equal(data.branch, 'feat/c');
  assert.equal(data.brief.files[0].path, 'feat/c.js', 'the overtaken read did not land on top');
});

test('the neighbours named on the message are warmed, and a step to one is free', async () => {
  window.BranchBrief.forget();
  await send({
    type: 'branch-open', repo: 'me/tools', branch: 'feat/a', base: 'main',
    warm: [{ repo: 'me/tools', branch: 'feat/b', base: 'main' },
           { repo: 'me/tools', branch: 'feat/c', base: 'main' }],
  });
  assert.ok(calls.compare.includes('me/tools@feat/b'), 'the neighbour was read ahead of the reader');
  reset();
  await send({ type: 'branch-open', repo: 'me/tools', branch: 'feat/b', base: 'main' });
  assert.equal(data.brief.files[0].path, 'feat/b.js');
  assert.deepEqual(calls.compare, [], 'and arriving there cost no call at all');
});

test('the registry is read once per ref, not once per visit', async () => {
  window.BranchBrief.forget();
  data.forgetRegistry();
  reset();
  await send({ type: 'branch-open', repo: 'me/tools', branch: 'feat/c', base: 'main' });
  const first = calls.csv.length;
  assert.equal(first, 1, 'the repo declares none, which is a 404 worth paying once');
  window.BranchBrief.forget();
  await send({ type: 'branch-open', repo: 'me/tools', branch: 'feat/a', base: 'main' });
  await send({ type: 'branch-open', repo: 'me/tools', branch: 'feat/c', base: 'main' });
  assert.equal(calls.csv.filter(c => c.includes('@feat/c:')).length, 1,
    'coming back to feat/c asked nothing again');
});

test('branch-refresh drops the cached reading and asks GitHub again', async () => {
  window.BranchBrief.forget();
  await send({ type: 'branch-open', repo: 'me/tools', branch: 'feat/a', base: 'main' });
  reset();
  await send({ type: 'branch-refresh' });
  assert.deepEqual(calls.compare, ['me/tools@feat/a'], 'the TTL is overridable by the reader');
  assert.ok(calls.csv.length, 'and the registry memo went with it');
});

test('a message from anywhere else is not a message to this page', async () => {
  reset();
  window.dispatchEvent(Object.assign(new window.Event('message'), {
    data: { source: 'somebody-else', type: 'branch-open', repo: 'me/tools', branch: 'feat/b' },
  }));
  await tick(4);
  assert.equal(data.branch, 'feat/a');
  assert.deepEqual(calls.compare, []);
});

// ── The layout, and where the scrollbar lives ────────────────────────────────
//
// Framed, this is a dialog, and a dialog scrolls inside itself. The document
// scrolling instead meant a long guide or a three-hundred-file list carried
// away the branch name and the control that would switch panes, which is the
// one thing a reader always wants back. The classes are the whole mechanism,
// so the classes are what this pins; the pixels are in
// tools/render/scenarios (a jsdom box has no layout to measure).

const root = () => window.document.querySelector('#m > div');

test('framed: the document is pinned and the pane is the scroller', () => {
  assert.equal(window.document.body.style.overflow, 'hidden', 'the document cannot scroll');
  assert.equal(window.document.body.style.height, '100dvh');
  assert.equal(window.document.body.style.flexDirection, 'column');
  assert.equal(data.$el.style.flex, '1 1 auto', 'the mount takes the height the masthead leaves');

  const r = root();
  assert.ok(r.className.includes('h-full'), 'the view fills the mount');
  assert.ok(r.firstElementChild.className.includes('shrink-0'), 'the head holds its place');
  assert.ok(r.lastElementChild.className.includes('overflow-y-auto'), 'and the pane takes the scroll');
  assert.ok(r.lastElementChild.className.includes('min-h-0'),
    'without which a flex child refuses to shrink and scrolls the document again');
});

// ── The flash ────────────────────────────────────────────────────────────────
//
// Every step used to tear the page down to a spinner and build it again: the
// head sat inside the same x-if as the panes, so the branch name, the facts
// strip and the tab switch all went away and came back. Nothing in the head
// needs the compare. The branch, the repo and the base arrive on the message
// that asked for them, so the head can be right immediately and only the
// numbers wait.

test('the head survives a load, and says the new branch at once', async () => {
  window.BranchBrief.forget();
  let release;
  hold = new Promise(r => { release = r; });
  const sent = send({ type: 'branch-open', repo: 'me/tools', branch: 'feat/c', base: 'main' }, 2);
  await tick(1);

  const head = root().firstElementChild;
  assert.ok(head, 'the head is still mounted mid-load');
  assert.match(head.textContent, /feat\/c/, 'and already names the branch being opened');
  assert.equal(data.loading, true);

  release(); hold = null;
  await sent;
  await tick(6);
  assert.match(root().firstElementChild.textContent, /feat\/c/);
});

test('the tab strip holds still across a swap rather than dropping a tab and putting it back', async () => {
  // feat/a has a PR, so it has a Guide tab. Step to it, then start a load.
  window.BranchBrief.forget();
  await send({ type: 'branch-open', repo: 'me/tools', branch: 'feat/a', base: 'main' });
  assert.equal(data.showGuideTab, true);
  assert.equal(data.pane, 'guide');

  let release;
  hold = new Promise(r => { release = r; });
  const sent = send({ type: 'branch-open', repo: 'me/tools', branch: 'feat/c', base: 'main' }, 2);
  await tick(1);
  assert.equal(data.showGuideTab, true, 'mid-load it keeps the answer it had');
  assert.equal(data.pane, 'guide', 'and the selection does not move under the reader');

  release(); hold = null;
  await sent;
  await tick(6);
  assert.equal(data.showGuideTab, false, 'feat/c has no PR, so the tab goes once that is known');
  assert.equal(data.pane, 'files');
});
