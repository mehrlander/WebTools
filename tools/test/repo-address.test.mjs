// lib/repo-address.js — the one owner/repo[@ref]:path grammar, plus the
// inbox/outbox box specs built on it.
//
// Two decisions are under test, both of them answers to open questions rather
// than incidental behavior:
//
//   1. A missing @ref parses as '' (unspecified), never 'main'. '' is what the
//      contents API wants, and it is right for a repo whose default branch is
//      named something else. A fallback belongs at the link-building boundary,
//      which is what ref() is for.
//   2. A box spec defaults to a FOLDER on the default branch, and can name a
//      ref when a repo wants one. That is the folder-vs-branch question
//      settled as a per-repo choice with the discoverable option as default.
//
// The three older copies of the grammar (StageLink.parseItem,
// DataPayload.parseSpec, ShorterPayload.parseSpec) are asserted here to agree
// with this module on shape, so the module can be adopted without surprises.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
new window.Function(readFileSync(path.join(repoRoot, 'lib/repo-address.js'), 'utf8'))();
const RA = window.RepoAddress;

test('an address parses into repo, ref, and path', () => {
  assert.deepEqual({...RA.parse('me/proj@feat/x:docs/a.md')}, { repo: 'me/proj', ref: 'feat/x', path: 'docs/a.md' });
  assert.deepEqual({...RA.parse('me/proj:docs/a.md')}, { repo: 'me/proj', ref: '', path: 'docs/a.md' });
  assert.deepEqual({...RA.parse('me.dash-repo/a.b-c:x/y/z.json')},
    { repo: 'me.dash-repo/a.b-c', ref: '', path: 'x/y/z.json' }, 'dots and hyphens on both halves');
});

test('a missing ref is unspecified, not a guess', () => {
  assert.equal(RA.parse('me/proj:a.md').ref, '', "'' lets the contents API resolve the default branch");
  assert.equal(RA.ref(RA.parse('me/proj:a.md')), '', 'no fallback asked for, none invented');
  assert.equal(RA.ref(RA.parse('me/proj:a.md'), 'trunk'), 'trunk', 'the caller supplies one where a link needs it');
  assert.equal(RA.ref(RA.parse('me/proj@v2:a.md'), 'trunk'), 'v2', 'a stated ref always wins');
});

test('a non-address is null, so a caller can read it as a bare path', () => {
  assert.equal(RA.parse('just/a/path.md'), null);
  assert.equal(RA.parse('README.md'), null);
  assert.equal(RA.parse(''), null);
  assert.equal(RA.parse(null), null);
});

test('fmt round-trips what parse read', () => {
  for (const s of ['me/proj:a.md', 'me/proj@feat/x:a/b.md']) {
    assert.equal(RA.fmt(RA.parse(s)), s);
  }
});

test('a box spec is a folder by default, on the default branch', () => {
  assert.deepEqual({...RA.parseBox('inbox', 'me/proj')}, { repo: 'me/proj', ref: '', dir: 'inbox' });
  assert.deepEqual({...RA.parseBox('/inbox/', 'me/proj')}, { repo: 'me/proj', ref: '', dir: 'inbox' }, 'slashes normalized');
  assert.deepEqual({...RA.parseBox('drop/incoming', 'me/proj')}, { repo: 'me/proj', ref: '', dir: 'drop/incoming' });
  assert.equal(RA.parseBox('', 'me/proj'), null, 'nothing declared is not the root, it is nothing');
});

test('a box spec can name a branch, which is the per-repo escape hatch', () => {
  assert.deepEqual({...RA.parseBox('@drop:incoming', 'me/proj')}, { repo: 'me/proj', ref: 'drop', dir: 'incoming' });
  assert.deepEqual({...RA.parseBox('@drop:', 'me/proj')}, { repo: 'me/proj', ref: 'drop', dir: '' }, 'a branch root');
});

test('a box can live in another repo entirely', () => {
  assert.deepEqual({...RA.parseBox('other/repo@main:inbox', 'me/proj')},
    { repo: 'other/repo', ref: 'main', dir: 'inbox' });
  assert.deepEqual({...RA.parseBox('other/repo:inbox', 'me/proj')},
    { repo: 'other/repo', ref: '', dir: 'inbox' });
});

test('box() reads the field off a config, or reports nothing declared', () => {
  const cfg = { inbox: 'inbox', outbox: '@shelf:out' };
  assert.deepEqual({...RA.box(cfg, 'inbox', 'me/proj')}, { repo: 'me/proj', ref: '', dir: 'inbox' });
  assert.deepEqual({...RA.box(cfg, 'outbox', 'me/proj')}, { repo: 'me/proj', ref: 'shelf', dir: 'out' });
  assert.equal(RA.box({}, 'inbox', 'me/proj'), null);
  assert.equal(RA.box(null, 'inbox', 'me/proj'), null);
});

// The adoption check: the copies this module is meant to replace must already
// agree with it, or delegating them later is a behavior change rather than a
// refactor. Only the ref default differs, and only in DataPayload, which is the
// known divergence tracker task one-repo-address-parser-5gtv92 carries.
test('the existing copies agree with this module on shape', async () => {
  for (const f of ['lib/shorter-payload.js', 'lib/data-payload.js']) {
    new window.Function(readFileSync(path.join(repoRoot, f), 'utf8'))();
  }
  const cases = ['me/proj:a.md', 'me/proj@feat/x:a/b.md', 'me.dash/a.b-c:x/y.json', 'bare/path.md', 'README.md'];
  for (const s of cases) {
    const mine = RA.parse(s);
    const shorter = window.ShorterPayload.parseSpec(s);
    const data = window.DataPayload.parseSpec(s);
    assert.deepEqual(shorter ? {...shorter} : shorter, mine ? {...mine} : mine,
      'ShorterPayload agrees exactly: ' + s);
    if (!mine) { assert.equal(data, null, 'DataPayload agrees on non-addresses: ' + s); continue; }
    assert.equal(data.repo, mine.repo, s);
    assert.equal(data.path, mine.path, s);
    assert.equal(data.ref, mine.ref || 'main',
      'DataPayload differs only by filling a missing ref with main, for its link building: ' + s);
  }
});
