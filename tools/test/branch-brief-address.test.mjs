// alpineComponents/branch-brief.js — what an ADDRESS can ask the view to show.
//
// The branch page answers `#gh=owner/repo@branch` and, since 2026-08-26, two
// more keys: `&pane=` names a section and `&file=` opens the file deck on one
// path. Since the tabs went on 2026-08-31 both sections always render, so
// `&pane=` no longer picks between them: it says which one the link is about,
// which buys a scroll to it and, for `files`, the compare a host would defer. They exist because the surfacing caption stopped enumerating files in
// chat and started linking here instead, so a reply that wants to point at one
// file needs an address that lands on that file rather than on a list it sits
// somewhere in.
//
// `pane` was already a host option and needed no new machinery. `file` did, and
// the three clauses below are the ones that decide whether a link opens what it
// says or something else:
//
//   - a path this branch does not touch opens NOTHING. openFileDeckAt falls
//     back to index 0 on a miss, which is right for a tap on a row that exists
//     and wrong for an address, which may be stale or mistyped: a deck of the
//     wrong file reads as an answer to the question that was asked.
//   - it fires ONCE, so closing the deck and returning to the list does not
//     reopen what the reader just dismissed.
//   - it needs the compare, and the compare is deferred on a hosted mount, so
//     `&file=` has to ASK for the read rather than assume a section did.
//
// The other direction is here too: `pane` rides back up through onMeta, which
// is what lets the takeover stamp an address naming the section a reader went
// to. An opening nobody steered stamps none.
//
// No network, no pixels; the same jsdom harness the other branch-brief tests
// use, with the deck stubbed since swipe-deck is a browser gesture.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot, captureAlpineErrors } from './bootstrap.mjs';

const tick = (n = 1) => new Promise(r => setTimeout(r, n * 10));

const FILES = ['docs/SURFACING.md', 'lib/kits/file-deck.js', 'pages/branch.html'];

const calls = { compare: [] };

const { window } = makeWindow({
  html: '<!doctype html><html><body><div id="m"></div></body></html>',
});

for (const f of ['lib/kits/branch-status.js', 'lib/kits/branch-brief.js']) {
  new window.Function('window', readFileSync(path.join(repoRoot, f), 'utf8'))(window);
}

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || ''; }
  async compare(base, head) {
    calls.compare.push(this.repo + '@' + head);
    return {
      ahead_by: 3, behind_by: 0, total_commits: 3,
      commits: [{ sha: 'c1', commit: { message: head, committer: { date: '2026-08-26T00:00:00Z' } } }],
      files: FILES.map(f => ({ filename: f, status: 'modified', additions: 4, deletions: 1,
                               patch: '@@ -1 +1 @@' })),
    };
  }
  async req() { return [{ number: 512, title: 'A guide', state: 'open', draft: true, body: 'why' }]; }
  async get() { throw Object.assign(new Error('404'), { status: 404 }); }
}
window.GH = FakeGH;
window.TOKEN = 'tkn';

// The deck, stubbed to record rather than to render: what this file is about is
// WHICH file the view asks for, and swipe-deck's own behaviour is its tests'.
const opened = [];
window.swipeDeck = { top: () => null };
window.subjectChannel = {};
window.fileDeck = { open: (o) => { opened.push(o); return { close() {} }; } };

const FACTS = { ahead: 3, behind: 0, firstDate: '2026-08-20T00:00:00Z',
                lastDate: '2026-08-26T00:00:00Z', sessions: [] };
const meta = [];
const OPTS = { repo: 'me/tools', base: 'main', framed: true, facts: FACTS,
               onMeta: (m) => meta.push(m) };

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
captureAlpineErrors(Alpine);
const { default: collapse } = await import('@alpinejs/collapse/dist/module.esm.js');
window.Alpine = Alpine;
Alpine.plugin(collapse);
for (const p of ['lib/alpine-bundle.js', 'lib/alpineComponents/file-review.js',
                 'lib/alpineComponents/branch-brief.js']) {
  new window.Function(readFileSync(path.join(repoRoot, p), 'utf8'))();
}
Alpine.start();
await tick(2);

let data;
const mount = async (extra = {}) => {
  const host = window.document.getElementById('m');
  host.innerHTML = '';
  window.__opts = { ...OPTS, branch: 'claude/thing', ...extra };
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'branchBrief(window.__opts)');
  host.append(el);
  Alpine.initTree(el);
  await tick(10);
  data = Alpine.$data(el);
  return data;
};

const reset = () => {
  calls.compare.length = 0; opened.length = 0; meta.length = 0;
  window.BranchBrief.forget();
};

test('no pane and no file: nothing is singled out and the diff is not read', async () => {
  reset();
  await mount();
  assert.equal(data.pane, '', 'both sections render, so an address that names none names none');
  assert.deepEqual(calls.compare, [], 'a mount that lends facts defers the compare');
  assert.deepEqual(opened, []);
});

test('&pane=files asks for the file list', async () => {
  reset();
  await mount({ pane: 'files' });
  assert.equal(data.pane, 'files');
  assert.deepEqual(calls.compare, ['me/tools@claude/thing'],
    'which is now the whole of what the key does at load: spend the compare');
  assert.deepEqual(opened, [], 'naming a section is not opening a deck');
});

test('&file= opens the deck on that file, and asks for the compare itself', async () => {
  reset();
  await mount({ file: 'lib/kits/file-deck.js' });
  assert.deepEqual(calls.compare, ['me/tools@claude/thing'],
    'a file address reads the diff even though nothing else on the page asked');
  assert.equal(opened.length, 1);
  // AN ADDRESS OUTRANKS A COLLAPSE. Since 2026-09-05 the list lifts pages and
  // docs into their own group and starts the rest closed, and this named a file
  // in a closed one: `deckFiles` reads only open groups, so the check that used
  // to sit here turned a good address into silence, the page opening nothing
  // and saying nothing. The group opens now, and stays open behind the deck.
  assert.ok(data.deckFiles.some(f => f.path === 'lib/kits/file-deck.js'),
    'the group holding it was opened');
  // The index is wherever the file lands once that group joins, which the lift
  // moved. The path is the assertion; the number is read off it.
  assert.ok(opened[0].start > 0, 'the deck opens on the named file, not the first');
  assert.equal(opened[0].files[opened[0].start].path, 'lib/kits/file-deck.js');
  assert.equal(opened[0].repo, 'me/tools');
  assert.equal(opened[0].ref, 'claude/thing');
});

// The other half of the same rule: a reviewable file needs no list opened,
// since its section has no toggle. Worth its own case because the address path
// forks on exactly that and the two branches fail differently, one by opening
// nothing and one by opening the list for no reason.
test('&file= on a reviewable file opens the deck and leaves the list shut', async () => {
  reset();
  await mount({ file: 'docs/SURFACING.md' });
  assert.equal(opened.length, 1);
  assert.equal(opened[0].files[opened[0].start].path, 'docs/SURFACING.md');
  assert.equal(data.filesShown, false, 'the list was not opened to reach a file above it');
});

test('&file= naming a path this branch does not touch opens nothing', async () => {
  reset();
  await mount({ file: 'docs/NOT-ON-THIS-BRANCH.md' });
  assert.deepEqual(opened, [],
    'a miss is silence: index 0 would present some other file as the answer');
});

test('&file= fires once, so a dismissed deck stays dismissed', async () => {
  reset();
  const d = await mount({ file: 'docs/SURFACING.md' });
  assert.equal(opened.length, 1);
  // The reader closes the deck; the view re-reads for any reason.
  await d.load();
  await tick(10);
  assert.equal(opened.length, 1, 'the option was consumed, not remembered');
});

test('&file= wins over the section it was not given', async () => {
  reset();
  await mount({ pane: 'guide', file: 'pages/branch.html' });
  assert.equal(data.pane, 'guide', 'an explicit section is still honoured underneath');
  assert.equal(opened.length, 1, 'and the deck opens over it');
  assert.equal(opened[0].files[opened[0].start].path, 'pages/branch.html');
});

test('the section rides back up through onMeta, so a host can stamp it', async () => {
  reset();
  const d = await mount();
  assert.equal(meta.at(-1).pane, '', 'an unasked-for opening stamps no section');
  d.setPane('files');
  assert.equal(meta.at(-1).pane, 'files',
    'asking for one reports, which is what setPane exists for');
});
