// repo-mailbox.js — the read-only request/response channel. Run the IIFE
// against a window stub, then check pending-detection, request validation, and
// fulfillment of each kind against a stub GH (tree/branches/fetch), including
// per-file error isolation on fetch and network-error capture.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/repo-mailbox.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const M = window.RepoMailbox;

// Stub GH whose read methods return canned data; get() throws for a missing
// path so per-file error isolation can be exercised.
function makeGH({ tree, branches, files } = {}) {
  return class GH {
    constructor(conf) { this.conf = conf; }
    async req(p) {
      if (p.startsWith('git/trees/')) return tree;
      throw new Error('unexpected req ' + p);
    }
    async branches() { return branches; }
    async get(p) {
      if (files && p in files) return files[p];
      const e = new Error('404'); e.status = 404; throw e;
    }
  };
}

test('pending returns request files without a matching result', () => {
  assert.deepEqual(M.pending(['a.json', 'b.json', 'note.txt'], ['a.json']), ['b.json']);
  assert.deepEqual(M.pending(['a.json'], ['a.json']), []);
});

test('validate rejects bad kinds, repos, and empty fetch paths', () => {
  assert.equal(M.validate({ kind: 'tree', repo: 'o/r' }).ok, true);
  assert.equal(M.validate({ kind: 'nope', repo: 'o/r' }).ok, false);
  assert.equal(M.validate({ kind: 'tree', repo: 'noslash' }).ok, false);
  assert.equal(M.validate({ kind: 'fetch', repo: 'o/r', paths: [] }).ok, false);
  assert.equal(M.validate({ kind: 'fetch', repo: 'o/r', paths: ['a'] }).ok, true);
});

test('fulfill tree flattens the recursive tree', async () => {
  const GH = makeGH({ tree: { truncated: false, tree: [{ path: 'a.js', type: 'blob', size: 10, sha: 's1' }] } });
  const r = await M.fulfill({ id: '1', kind: 'tree', repo: 'o/r' }, { GH, token: 't', now: 'T' });
  assert.equal(r.ok, true);
  assert.equal(r.data.entries[0].path, 'a.js');
  assert.equal(r.data.truncated, false);
});

test('fulfill branches maps name + tip sha', async () => {
  const GH = makeGH({ branches: [{ name: 'main', commit: { sha: 'abc' } }] });
  const r = await M.fulfill({ id: '2', kind: 'branches', repo: 'o/r' }, { GH, token: 't', now: 'T' });
  assert.deepEqual(r.data.branches, [{ name: 'main', sha: 'abc' }]);
});

test('fulfill fetch isolates per-file errors', async () => {
  const GH = makeGH({ files: { 'a.js': { size: 3, text: 'hi\n' } } });
  const r = await M.fulfill({ id: '3', kind: 'fetch', repo: 'o/r', paths: ['a.js', 'missing.js'] }, { GH, token: 't', now: 'T' });
  assert.equal(r.ok, true);
  assert.equal(r.data.files[0].ok, true);
  assert.equal(r.data.files[0].text, 'hi\n');
  assert.equal(r.data.files[1].ok, false);
  assert.match(r.data.files[1].error, /404/);
});

test('fulfill captures a bad request without touching the network', async () => {
  const GH = makeGH({});
  const r = await M.fulfill({ id: '4', kind: 'nope', repo: 'o/r' }, { GH, token: 't', now: 'T' });
  assert.equal(r.ok, false);
  assert.match(r.error, /unsupported kind/);
});

// ── ask: the kind the browser cannot serve ─────────────────────────────────
// The other three kinds are a deferred read from a repo and fulfil themselves
// on page load. An ask is a deferred read from the person, so the contract it
// needs is different: it must be recognizable BEFORE fulfillment (or it would
// be answered by its own rejection), and it must be closable with a message in
// both directions, because "no, and here is why" is a served request rather
// than a failure.

test('isAsk keys on the record, not on whether it validates', () => {
  assert.equal(M.isAsk({ kind: 'ask', note: 'x', dest: 'o/r:d' }), true);
  // The load-bearing case: a MALFORMED ask is still an ask. If the guard were a
  // validation verdict, a half-written record would fall through to fulfill(),
  // get a result written, and be closed before anyone saw it.
  assert.equal(M.isAsk({ kind: 'ask' }), true);
  assert.equal(M.isAsk({ kind: 'tree', repo: 'o/r' }), false);
  assert.equal(M.isAsk(null), false);
  assert.equal(M.isAsk('ask'), false);
});

test('fulfill refuses an ask, which is exactly why the caller must skip it first', () => {
  // Documents the trap rather than endorsing it: the refusal is a RESULT, and
  // writing a result is what marks a request answered.
  const r = M.validate({ kind: 'ask', note: 'x', dest: 'o/r:d' });
  assert.equal(r.ok, false);
  assert.match(r.error, /unsupported kind/);
});

test('validateAsk wants prose and a destination', () => {
  assert.equal(M.validateAsk({ kind: 'ask', note: 'the PowerShell files', dest: 'o/r:projects/wps/dump' }).ok, true);
  // Prose, because what is wanted often has no filename: "whatever is in that
  // folder" is the normal case, and a path schema would have to fake it.
  assert.equal(M.validateAsk({ kind: 'ask', dest: 'o/r:d' }).ok, false);
  assert.equal(M.validateAsk({ kind: 'ask', note: '   ', dest: 'o/r:d' }).ok, false);
  // Structured, because dest is what aims the stage and spans repos.
  assert.equal(M.validateAsk({ kind: 'ask', note: 'x' }).ok, false);
  assert.equal(M.validateAsk({ kind: 'ask', note: 'x', dest: 'nodir' }).ok, false);
  assert.equal(M.validateAsk({ kind: 'tree', repo: 'o/r' }).ok, false);
});

test('closeAsk records both outcomes as served, and refuses a bare decline', () => {
  const req = { id: 'a1', kind: 'ask', dest: 'o/r:d', task: 'o/r:t.md' };
  const sent = M.closeAsk(req, { answered: true, now: '2026-08-12T00:00:00Z' });
  assert.equal(sent.ok, true);
  assert.equal(sent.answered, true);
  assert.equal(sent.message, '', 'a message is optional when the material was sent');
  assert.equal(sent.dest, 'o/r:d');
  assert.equal(sent.task, 'o/r:t.md');

  const declined = M.closeAsk(req, { answered: false, message: 'nothing references it, stop looking' });
  assert.equal(declined.ok, true, 'a decline is a served request, not a failure');
  assert.equal(declined.answered, false);
  assert.equal(declined.message, 'nothing references it, stop looking');

  // The one thing refused: a decline with no reason wastes the next session's
  // time as surely as no answer at all.
  const bare = M.closeAsk(req, { answered: false, message: '   ' });
  assert.equal(bare.ok, false);
  assert.match(bare.error, /needs a message/);
});
