// alpineComponents/session-brief.js — `#branch=`, the address a phone can make.
//
// The Claude app copies the branch a Claude Code session is on and copies
// nothing else about it, so a branch name is the whole handle that crosses from
// the phone to this store. shortcut-tools' `Choose-Claude` hands it to
// pages/session.html off the double back tap, which means the walk under it is
// load-bearing for a link nobody can debug from the couch.
//
// Nothing in the store joins a branch to a record, so `resolveBranch` opens
// records newest first and reads each one's `repos`. Three properties decide
// whether that link opens the right session, and each is a test here:
//
//   - the LATEST session on the branch, not the first one found. Filenames
//     order by day and say nothing about the order within a day, so a walk that
//     stopped on its first hit would be right across days and a coin toss
//     inside one.
//
//     **Wrong 2026-09-04 → the sentence that used to end the point above:** it
//     read "several sessions on one branch on one day is the normal shape of a
//     day's work here," and the store says otherwise. Across the 304 rows in
//     state/sessions.json that day, 297 distinct branches appear and NOT ONE
//     carries more than one session: the harness mints a fresh branch per
//     session, so branch and session are 1:1. The property below is still worth
//     holding, because nothing enforces that uniqueness and a tie would be
//     silent, but it guards a case that has not yet occurred rather than the
//     normal shape of a day.
//   - it finishes the matching day and no more. The break is the only thing
//     bounding the read below the cap, and a walk that kept going would open
//     every record in the store to answer a question already answered.
//   - a miss says so. The record is published when a session STOPS, so a branch
//     whose session is still running is a real and frequent miss, and an error
//     naming that is the difference between a tap that explains itself and one
//     that looks broken.
//   - the branch arrives in whatever shape a clipboard held it. `branchOf` in
//     the component reduces a full ref, a GitHub URL, a branch.html address or
//     a name with a caption under it to the name, which is what lets a shortcut
//     hand the clipboard over without inspecting it first.
//
// jsdom, no network, no pixels: FakeGH serves the tree and the blobs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot, captureAlpineErrors } from './bootstrap.mjs';

const tick = (n = 1) => new Promise(r => setTimeout(r, n * 10));

// Two days, and two sessions on the wanted branch on the LATER day, written in
// the order the tree returns them: the earlier start first, so a walk that
// stopped on its first hit would answer with the wrong one.
const RECORDS = {
  'sessions/2026/08/2026-08-31-aaaaaaaa.json': {
    short: 'aaaaaaaa', started: '2026-08-31T09:00:00Z',
    repos: [{ name: 'web-tools', branch: 'claude/read-aloud-x1' }],
  },
  'sessions/2026/08/2026-08-31-bbbbbbbb.json': {
    short: 'bbbbbbbb', started: '2026-08-31T21:00:00Z',
    repos: [{ name: 'home', branch: 'claude/other-thing' }],
  },
  'sessions/2026/08/2026-08-31-cccccccc.json': {
    short: 'cccccccc', started: '2026-08-31T17:30:00Z',
    repos: [{ name: 'web-tools', branch: 'claude/read-aloud-x1' },
            { name: 'home', branch: 'claude/read-aloud-x1' }],
  },
  'sessions/2026/08/2026-08-30-dddddddd.json': {
    short: 'dddddddd', started: '2026-08-30T12:00:00Z',
    repos: [{ name: 'web-tools', branch: 'claude/read-aloud-x1' }],
  },
  'sessions/2026/07/2026-07-04-eeeeeeee.json': {
    short: 'eeeeeeee', started: '2026-07-04T12:00:00Z',
    repos: [{ name: 'web-tools', branch: 'claude/ancient' }],
  },
};

const reads = [];

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; }
  async req(p) {
    assert.match(p, /^git\/trees\/main\?recursive=1$/);
    return { tree: Object.keys(RECORDS).map(p2 => ({ type: 'blob', path: p2, size: 100 })) };
  }
  async get(p) {
    reads.push(p);
    if (!RECORDS[p]) throw Object.assign(new Error('404'), { status: 404 });
    return { text: JSON.stringify(RECORDS[p]) };
  }
}

const { window } = makeWindow({ html: '<!doctype html><html><body><div id="m"></div></body></html>' });
window.GH = FakeGH;
window.TOKEN = 'tkn';
// The kit chain is skipped rather than stubbed generously: `ready()` returns
// early when all three namespaces are present, and everything this file asserts
// happens before any of them is called.
window.sessionRender = { turns: () => [], outline: () => [], describe: () => ({ title: 't', subtitle: '' }) };
window.sessionExport = { index: () => ({ el: window.document.createElement('div') }) };
window.readAloud = { supported: false };

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
captureAlpineErrors(Alpine);
window.Alpine = Alpine;
new window.Function(readFileSync(path.join(repoRoot, 'lib/alpine-bundle.js'), 'utf8'))();
Alpine.start();
await tick(2);

// The record and listing caches are the component's module scope, deliberately:
// a deck stepping back to a slide must not refetch. Which makes them survive a
// remount, and every read count below is about what ONE cold visit costs. So
// each case gets a fresh evaluation, which is a fresh closure, and re-registers
// `sessionBrief` over the previous one.
const SRC = readFileSync(path.join(repoRoot, 'lib/alpineComponents/session-brief.js'), 'utf8');

const mount = async (opts) => {
  new window.Function(SRC)();
  reads.length = 0;
  const host = window.document.getElementById('m');
  host.innerHTML = '';
  window.__opts = { repo: 'me/store', framed: true, ...opts };
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'sessionBrief(window.__opts)');
  host.append(el);
  Alpine.initTree(el);
  await tick(12);
  return Alpine.$data(el);
};

test('a branch opens its LATEST session, not the first record that names it', async () => {
  const d = await mount({ branch: 'claude/read-aloud-x1' });
  assert.equal(d.err, '');
  assert.equal(d.record.short, 'cccccccc', 'the later start on the newest matching day wins');
  assert.equal(d.path, 'sessions/2026/08/2026-08-31-cccccccc.json');
  assert.equal(d.id, 'cccccccc', 'the id settles so every other surface can name it');
});

test('the walk finishes the matching day and stops', async () => {
  await mount({ branch: 'claude/read-aloud-x1' });
  // The three records of 08-31, and nothing from 08-30 or earlier.
  assert.deepEqual([...reads].sort(), [
    'sessions/2026/08/2026-08-31-aaaaaaaa.json',
    'sessions/2026/08/2026-08-31-bbbbbbbb.json',
    'sessions/2026/08/2026-08-31-cccccccc.json',
  ]);
});

test('a branch matched in any repo of the session counts', async () => {
  // 'claude/other-thing' is only ever `home`'s branch, and the record's other
  // checkout is on something else. A test on repos[0] would miss it.
  const d = await mount({ branch: 'claude/other-thing' });
  assert.equal(d.record.short, 'bbbbbbbb');
});

test('an older branch is found, and reading it costs the days above it', async () => {
  const d = await mount({ branch: 'claude/ancient' });
  assert.equal(d.record.short, 'eeeeeeee');
  assert.equal(reads.length, Object.keys(RECORDS).length, 'every newer record was opened to get there');
});

test('a full ref is the same address as the bare name', async () => {
  const d = await mount({ branch: 'origin/claude/read-aloud-x1' });
  assert.equal(d.record.short, 'cccccccc');
});

test('no session on the branch says so, and says why one might be missing', async () => {
  const d = await mount({ branch: 'claude/never-existed' });
  assert.match(d.err, /No session on claude\/never-existed/);
  assert.match(d.err, /published when the session it describes stops/,
    'a branch whose session is still running is the common miss, not a typo');
  assert.equal(d.record, null);
});

test('an explicit path still wins, so #gh= is untouched by any of this', async () => {
  const d = await mount({ branch: 'claude/read-aloud-x1',
                          path: 'sessions/2026/08/2026-08-30-dddddddd.json' });
  assert.equal(d.record.short, 'dddddddd');
  assert.deepEqual([...reads], ['sessions/2026/08/2026-08-30-dddddddd.json'], 'no walk at all');
});

test('every shape the Claude app puts on a clipboard reduces to the branch', async () => {
  const want = 'claude/read-aloud-x1';
  for (const clip of [
    want, 'origin/' + want, 'refs/heads/' + want, '  ' + want + '  ', want + '/',
    'https://github.com/mehrlander/web-tools/tree/' + want,
    'https://github.com/mehrlander/web-tools/compare/' + want + '?expand=1',
    'https://mehrlander.github.io/web-tools/pages/branch.html#gh=mehrlander/web-tools@' + want,
    want + '\nA caption line under it',
  ]) {
    const d = await mount({ branch: clip });
    assert.equal(d.record?.short, 'cccccccc', JSON.stringify(clip));
  }
});

test('a slashless branch name is honoured, not discarded as "not a branch"', async () => {
  // Where this parts company with lib/ops/session-menu.js on purpose. The op
  // demands a `/` because it is GUESSING whether a clipboard holds a branch at
  // all and needs a way to answer no. Here the caller has already said it does,
  // so `dev` is a branch to look for and miss, not an empty string to ignore.
  // The error naming it is the proof the name survived the reduction.
  const d = await mount({ branch: 'dev' });
  assert.match(d.err, /No session on dev\b/);
});
