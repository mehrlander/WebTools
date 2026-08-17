// kits/last-write.js — the copy this page committed, reconciled against what a
// later read hands back.
//
// The failure it exists for is not a cache and cannot be fixed by one: GitHub's
// contents API is read-after-write eventual, so seconds after a commit a read
// can still be answered with the version that commit replaced, blob sha and all.
// Measured 2026-08-16 in the estate's split activity refresh, which commits
// twice in a row; the second pass read the first pass's leftovers and its PUT
// failed `409 does not match <sha>` against a sha the API kept handing back.
//
// So the assertions here are about one judgment, made on the documents' own
// stamps rather than the clock: is what I was just handed older than what I put
// there? No network, no DOM.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/last-write.js'), 'utf8');
const load = () => { const window = {}; new Function('window', src)(window); return window.LastWrite; };

const REPO = 'me/registry', PATH = 'state/activity.json';
const doc = (stamp, extra = {}) => ({ generatedAt: stamp, ...extra });

test('with nothing noted, the read is the answer', () => {
  const LW = load();
  const read = { doc: doc('2026-08-16T10:00:00Z'), sha: 'a' };
  assert.equal(LW.reconcile(REPO, PATH, read), read);
  assert.equal(LW.reconcile(REPO, PATH, null), null);
});

test('a read that caught up wins, since it may carry another writer’s work', () => {
  const LW = load();
  LW.note(REPO, PATH, doc('2026-08-16T10:00:00Z'), 'mine');
  const read = { doc: doc('2026-08-16T10:05:00Z'), sha: 'theirs' };
  assert.equal(LW.reconcile(REPO, PATH, read), read);
  // Equal stamps count as caught up: preferring ours there would keep a
  // superseded copy alive after a legitimate replacement stamped the same second.
  const same = { doc: doc('2026-08-16T10:00:00Z'), sha: 'theirs' };
  assert.equal(LW.reconcile(REPO, PATH, same), same);
});

test('a read that is behind loses to the copy this page wrote, sha included', () => {
  const LW = load();
  const mine = doc('2026-08-16T10:05:00Z', { repos: { a: 1 } });
  LW.note(REPO, PATH, mine, 'sha-from-the-put');
  const stale = { doc: doc('2026-08-16T10:00:00Z'), sha: 'the-sha-that-409s' };
  const out = LW.reconcile(REPO, PATH, stale);
  assert.equal(out.doc, mine);
  assert.equal(out.sha, 'sha-from-the-put');
  assert.equal(out.ours, true, 'a caller can say it substituted rather than doing it silently');
});

test('a 404 after a write is the same lag wearing a different hat', () => {
  const LW = load();
  const mine = doc('2026-08-16T10:05:00Z');
  LW.note(REPO, PATH, mine, 'mine');
  const out = LW.reconcile(REPO, PATH, null);
  assert.equal(out.doc, mine);
  assert.equal(out.ours, true);
});

test('paths and repos are separate keys, and a note can be dropped', () => {
  const LW = load();
  LW.note(REPO, PATH, doc('2026-08-16T10:05:00Z'), 'mine');
  const other = { doc: doc('2026-08-16T09:00:00Z'), sha: 'x' };
  // Another file in the same repo, and the same file in another repo, both know
  // nothing about this note.
  assert.equal(LW.reconcile(REPO, 'state/configs.json', other), other);
  assert.equal(LW.reconcile('me/other', PATH, other), other);
  assert.equal(LW.reconcile(REPO, PATH, other).ours, true);
  LW.forget(REPO, PATH);
  assert.equal(LW.reconcile(REPO, PATH, other), other);
});

test('a document with no stamp cannot be judged, so the read stands', () => {
  const LW = load();
  LW.note(REPO, PATH, { repos: {} }, 'mine');     // nothing to compare on
  const read = { doc: { repos: { a: 1 } }, sha: 'theirs' };
  assert.equal(LW.reconcile(REPO, PATH, read), read);
});

test('the stamp field is nameable, for a store that dates itself differently', () => {
  const LW = load();
  LW.note(REPO, 'state/x.json', { at: '2026-08-16T10:05:00Z' }, 'mine', 'at');
  const stale = { doc: { at: '2026-08-16T10:00:00Z' }, sha: 'old' };
  assert.equal(LW.reconcile(REPO, 'state/x.json', stale, { stampField: 'at' }).ours, true);
});
