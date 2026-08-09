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
