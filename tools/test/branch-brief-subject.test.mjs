// alpineComponents/branch-brief.js — saying WHICH document is being read.
//
// The branch page's strip holds several documents and which one is showing is
// chosen inside the page, not by its address. The sidebar's layer strip walks
// the live frame stack, and a markdown panel is a div in this document rather
// than a frame, so that walk names the page and stops one level short of the
// reader. The container closes the gap by announcing on the subject channel,
// the same one the file deck speaks, with the same route: 'deck'.
//
// The payoff is the sidebar's compare bar, which is gated on a subject having
// announced a BASE. Until this landed the page mounted reading cards that each
// subscribe to the answer on web-tools:compare-ref while the one control that
// publishes it stayed hidden.
//
// The kit is loaded THROUGH gh.load rather than pre-installed on the window, so
// the lazy chain the page actually runs is what is under test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, tick, repoRoot, captureAlpineErrors } from './bootstrap.mjs';

const REPO = 'acme/widgets';

// Two reviewable documents, so the strip has two panels and moving between
// them is a real move rather than a no-op.
const compare = {
  ahead_by: 2, behind_by: 0, total_commits: 2,
  commits: [
    { sha: 'aaa1111', commit: { message: 'first', committer: { date: '2026-07-20T00:00:00Z' } } },
  ],
  files: [
    { filename: 'lib/a.js', status: 'modified', additions: 3, deletions: 1, patch: '@@ -1 +1 @@' },
    { filename: 'docs/b.md', status: 'added', additions: 9, deletions: 0, patch: '@@ -0,0 +1 @@' },
    { filename: 'docs/c.md', status: 'added', additions: 4, deletions: 0, patch: '@@ -0,0 +1 @@' },
  ],
};

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body><div id="m"
           x-data="branchBrief({ repo: '${REPO}', branch: 'feat/x', base: 'main' })"></div></body></html>`,
});

for (const f of ['lib/kits/branch-status.js', 'lib/kits/branch-brief.js']) {
  new window.Function('window', readFileSync(path.join(repoRoot, f), 'utf8'))(window);
}

// The loader, as the page arranges it: a kit named on demand is evaluated into
// this window. Anything the fixture has no file for resolves rather than
// throwing, which is what the pre-build's inlined cache does for a page.
const loaded = [];
window.gh = {
  ref: 'feat/x',
  load: async (spec) => {
    loaded.push(spec);
    const p = path.join(repoRoot, 'lib', spec);
    if (existsSync(p)) new window.Function('window', readFileSync(p, 'utf8'))(window);
  },
};

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || ''; }
  async compare() { return compare; }
  async req() { return []; }
  async get() { return { text: 'x' }; }
}
window.GH = FakeGH;
window.TOKEN = 'tkn';

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
captureAlpineErrors(Alpine);
const { default: collapse } = await import('@alpinejs/collapse/dist/module.esm.js');
window.Alpine = Alpine;
Alpine.plugin(collapse);
for (const p of ['lib/alpine-bundle.js', 'lib/alpineComponents/repo.js',
                 'lib/alpineComponents/file-review.js', 'lib/alpineComponents/branch-brief.js']) {
  new window.Function(readFileSync(path.join(repoRoot, p), 'utf8'))();
}
Alpine.start();
await tick(8);

const data = () => Alpine.$data(window.document.getElementById('m'));
const subject = () => window.__tossSubject;

test('the strip announces the document it is showing, not the page holding it', () => {
  const d = data();
  assert.deepEqual(d.reviewableFiles.map(f => f.path), ['docs/b.md', 'docs/c.md'],
    'fixture: two documents in the strip');
  assert.ok(loaded.includes('kits/subject-channel.js'), 'the kit was pulled on first announcement');
  const s = subject();
  assert.ok(s, 'something was announced');
  assert.equal(s.path, 'docs/b.md', 'the panel showing, not pages/branch.html');
  assert.equal(s.repo, REPO);
  assert.equal(s.ref, 'feat/x');
});

test('it announces a base, which is what the sidebar gates its compare bar on', () => {
  // fab.js: x-show="!subjectLocal && subjectBase". Both halves of the pair
  // travel, so a reader is told the same string a client fetches.
  const s = subject();
  assert.equal(s.base, 'main');
  assert.equal(s.baseName, 'main');
});

test("the route says in-document, so the drawer offers no deployed twin", () => {
  // route: 'deck' makes fab.liveTwin false. A markdown panel has no page of
  // its own at any ref, so an escape button offering one would 404.
  assert.equal(subject().route, 'deck');
});

test('moving to the next document moves the subject', async () => {
  const d = data();
  d.goRev(1);
  await tick(4);
  assert.equal(d.revAt, 1);
  assert.equal(subject().path, 'docs/c.md');
  d.goRev(0);
  await tick(4);
  assert.equal(subject().path, 'docs/b.md', 'and back');
});

test('a deck over the page owns the subject, so the strip underneath stays quiet', async () => {
  // The deck opens its own channel, which snapshots this announcement and puts
  // it back on close. Announcing underneath would overwrite the slide the
  // reader is on, and openFileDeck awaiting the compare with the deck already
  // built is how that is reached.
  const d = data();
  const before = subject().path;
  window.swipeDeck = { top: () => ({ id: 'a deck' }) };
  try {
    d.goRev(1);
    await tick(4);
    assert.equal(d.revAt, 1, 'the strip still moved');
    assert.equal(subject().path, before, 'the subject did not');
  } finally {
    delete window.swipeDeck;
  }
  // And it resumes once the deck is gone, rather than staying stuck.
  d.goRev(0);
  await tick(4);
  assert.equal(subject().path, 'docs/b.md');
});

test('framed, it says nothing at all', async () => {
  // As a slide of show-repo's branch deck three of these are mounted at once
  // and this component cannot tell which the reader is on. The flag is driven
  // directly because the guard under test is the flag: mounting a second
  // framed view would need a second window, and the assertion would be the
  // same one.
  const d = data();
  const before = subject().path;
  d.framed = true;
  try {
    d.goRev(1);
    await tick(4);
    assert.equal(subject().path, before, 'no announcement from a framed slide');
  } finally {
    d.framed = false;
    d.goRev(0);
    await tick(4);
  }
});

test('nothing reviewable hands the drawer back to the page', async () => {
  const d = data();
  // The missing filter empties the strip on this fixture: nothing here is
  // missing from the base.
  d.setFileState('missing');
  await tick(4);
  assert.equal(d.reviewableFiles.length, 0, 'fixture: the filter empties the strip');
  assert.equal(subject(), null,
    'the subject is released rather than naming a document off screen');
  d.setFileState('missing');
  await tick(4);
  assert.equal(subject().path, 'docs/b.md', 'and claimed again when the strip refills');
});

test('destroy puts back whatever the subject was before this view claimed it', async () => {
  const d = data();
  assert.ok(subject(), 'claimed');
  d.destroy();
  assert.equal(subject(), null, 'released');
  d.destroy();                      // releasing twice is a no-op
  assert.equal(subject(), null);
});

test('mounting the branch view is quiet', () => {
  assert.deepEqual(problems, []);
});
