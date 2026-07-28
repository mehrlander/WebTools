// lib/repo-proposals.js — the write-side agent-to-app channel. The pure halves
// (pending, validate, applyField, toBase64) are the interesting ones: they
// decide what is reviewable and what the target file becomes. resolve/apply run
// against a stub GH, since the point of the channel is that the real write
// needs a token this test does not have.
//
// The rule these tests exist to hold: nothing here applies on its own. apply()
// is only ever called by a confirmed user gesture in the Proposals view, so
// what is tested is that a bad record fails closed rather than reaching a PUT.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
new window.Function(readFileSync(path.join(repoRoot, 'lib/repo-proposals.js'), 'utf8'))();
const P = window.RepoProposals;

const proposal = (over = {}) => ({
  id: 'p1', kind: 'set-json-field', repo: 'me/target', path: '.web-tools.json',
  field: 'scope', value: 'A one-line story.', why: 'the Map shows a blank scope', ...over,
});

// A GH stub: `files` maps repo -> path -> text. A missing path 404s the way the
// contents API does, since "the file does not exist yet" is a normal proposal.
function stubGH(files, log = []) {
  return class {
    constructor({ repo, ref }) { this.repo = repo; this.ref = ref; }
    async get(p) {
      const text = files[this.repo]?.[p];
      if (text === undefined) { const e = new Error('Not Found'); e.status = 404; throw e; }
      return { text };
    }
    async saveRaw(p, content, message, branch) {
      log.push({ repo: this.repo, path: p, content, message, branch });
      return { commit: { sha: 'deadbeef' } };
    }
  };
}

test('pending is the set with no applied record, mailbox-style', () => {
  assert.deepEqual(
    P.pending(['a.json', 'b.json', 'c.json', 'notes.md'], ['b.json']),
    ['a.json', 'c.json'],
    'applied marks a proposal spent; non-json is ignored',
  );
});

test('validate refuses a record a reviewer could not act on', () => {
  assert.equal(P.validate(proposal()).ok, true);
  assert.match(P.validate(proposal({ kind: 'delete-file' })).error, /unsupported kind/);
  assert.match(P.validate(proposal({ repo: 'target' })).error, /owner\/name/);
  assert.match(P.validate(proposal({ path: '' })).error, /missing path/);
  assert.match(P.validate(proposal({ why: '' })).error, /missing why/);
  assert.match(P.validate(proposal({ field: '' })).error, /field name/);
  assert.match(P.validate(proposal({ value: undefined })).error, /needs a value/);
  assert.match(P.validate({ kind: 'put-file', repo: 'me/t', path: 'x', why: 'y' }).error, /needs content/);
});

test('applyField updates in place, appends when new, and keeps the file shape', () => {
  const before = JSON.stringify({ icon: 'ph-scales', estate: true }, null, 2) + '\n';
  const r = P.applyField(before, 'scope', 'A story.');
  assert.equal(r.ok, true);
  assert.equal(r.before, undefined, 'the key was not set');
  assert.deepEqual(JSON.parse(r.text), { icon: 'ph-scales', estate: true, scope: 'A story.' });
  assert.equal(Object.keys(JSON.parse(r.text)).at(-1), 'scope', 'a new key lands last');
  assert.ok(r.text.endsWith('}\n'), 'two-space indent and a trailing newline, like the manifests');

  const r2 = P.applyField(r.text, 'scope', 'A better story.');
  assert.equal(r2.before, 'A story.', 'the old value is reported for the review pane');
  assert.equal(Object.keys(JSON.parse(r2.text))[2], 'scope', 'an existing key keeps its position');
});

test('applyField fails closed on a target that is not a JSON object', () => {
  assert.match(P.applyField('not json at all', 'scope', 'x').error, /not valid JSON/);
  assert.match(P.applyField('[1,2]', 'scope', 'x').error, /not an object/);
});

test('toBase64 survives non-Latin-1 text', () => {
  const s = 'budget: — café ✓';
  assert.equal(Buffer.from(P.toBase64(s), 'base64').toString('utf8'), s);
});

test('resolve shows the bytes the write would send, against the live file', async () => {
  const GH = stubGH({ 'me/target': { '.web-tools.json': '{\n  "estate": true\n}\n' } });
  const r = await P.resolve(proposal(), { GH, token: 't' });
  assert.equal(r.ok, true);
  assert.equal(r.exists, true);
  assert.equal(r.fieldBefore, undefined);
  assert.deepEqual(JSON.parse(r.after), { estate: true, scope: 'A one-line story.' });
});

test('resolve on a missing target proposes creating it', async () => {
  const GH = stubGH({});
  const r = await P.resolve(proposal(), { GH, token: 't' });
  assert.equal(r.ok, true);
  assert.equal(r.exists, false);
  assert.deepEqual(JSON.parse(r.after), { scope: 'A one-line story.' });
});

test('apply writes base64 to the target and reports the commit', async () => {
  const log = [];
  const GH = stubGH({ 'me/target': { '.web-tools.json': '{\n  "estate": true\n}\n' } }, log);
  const res = await P.apply(proposal(), { GH, token: 't', now: '2026-07-28T00:00:00Z' });
  assert.equal(res.ok, true);
  assert.equal(res.created, false);
  assert.equal(res.commit, 'deadbeef');
  assert.equal(res.appliedAt, '2026-07-28T00:00:00Z');
  assert.equal(log.length, 1);
  assert.equal(log[0].repo, 'me/target');
  assert.match(log[0].message, /proposal p1/);
  assert.deepEqual(JSON.parse(Buffer.from(log[0].content, 'base64').toString('utf8')),
    { estate: true, scope: 'A one-line story.' });
});

test('put-file replaces the whole file', async () => {
  const log = [];
  const GH = stubGH({ 'me/target': { 'docs/x.md': 'old\n' } }, log);
  const res = await P.apply(proposal({ kind: 'put-file', path: 'docs/x.md', content: 'new\n' }),
    { GH, token: 't' });
  assert.equal(res.ok, true);
  assert.equal(Buffer.from(log[0].content, 'base64').toString('utf8'), 'new\n');
});

test('an invalid proposal never reaches a write', async () => {
  const log = [];
  const GH = stubGH({ 'me/target': { '.web-tools.json': '{}' } }, log);
  const res = await P.apply(proposal({ kind: 'rm -rf' }), { GH, token: 't' });
  assert.equal(res.ok, false);
  assert.match(res.error, /unsupported kind/);
  assert.equal(log.length, 0, 'validation runs before the network, not after');
});

test('a target that is not JSON is refused rather than overwritten', async () => {
  const log = [];
  const GH = stubGH({ 'me/target': { '.web-tools.json': 'oops, prose' } }, log);
  const res = await P.apply(proposal(), { GH, token: 't' });
  assert.equal(res.ok, false);
  assert.match(res.error, /not valid JSON/);
  assert.equal(log.length, 0, 'a read-modify-write that cannot read does not write');
});

test('apply without gh-transfer loaded reports that, rather than throwing', async () => {
  class NoSaveRaw {
    constructor({ repo }) { this.repo = repo; }
    async get() { return { text: '{}' }; }
  }
  const res = await P.apply(proposal(), { GH: NoSaveRaw, token: 't' });
  assert.equal(res.ok, false);
  assert.match(res.error, /gh-transfer/);
});
