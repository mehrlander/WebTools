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
function stubGH(files, log = [], opts = {}) {
  return class {
    constructor({ repo, ref }) { this.repo = repo; this.ref = ref; }
    async defaultBranch() { return 'main'; }
    async createRef(branch, from) {
      log.push({ createRef: branch, from });
      if (opts.refExists) return { branch, sha: 'basesha', created: false };
      return { branch, sha: 'basesha', created: true };
    }
    async createPull(args) {
      log.push({ createPull: args });
      if (opts.prFails) { const e = new Error('Resource not accessible by personal access token'); e.status = 403; throw e; }
      return { html_url: 'https://github.com/' + this.repo + '/pull/7', number: 7 };
    }
    async get(p) {
      const text = files[this.repo]?.[p];
      if (text === undefined) { const e = new Error('Not Found'); e.status = 404; throw e; }
      // The blob sha is what the staleness guard compares, so the stub has to
      // carry one; a deterministic stand-in keeps the assertions readable.
      return { text, sha: 'sha-' + p.replace(/\W/g, '') + '-' + text.length };
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

// ── the staleness guard ─────────────────────────────────────────────────────
// A record may claim it was written against a specific version of the target.
// The guard exists because put-file replaces rather than merges: applying a
// stale one erases whatever arrived in between, and nobody reviewed that.

const shaOf = (path, text) => 'sha-' + path.replace(/\W/g, '') + '-' + text.length;

test('a proposal whose target is unchanged applies normally', async () => {
  const log = [];
  const cur = '{\n  "estate": true\n}\n';
  const GH = stubGH({ 'me/target': { '.web-tools.json': cur } }, log);
  const res = await P.apply(proposal({ expectSha: shaOf('.web-tools.json', cur) }), { GH, token: 't' });
  assert.equal(res.ok, true);
  assert.equal(res.forced, undefined, 'nothing to force when nothing moved');
  assert.equal(log.length, 1);
});

test('a stale proposal refuses, names both shas, and writes nothing', async () => {
  const log = [];
  const GH = stubGH({ 'me/target': { '.web-tools.json': '{\n  "estate": true,\n  "note": "changed since"\n}\n' } }, log);
  const res = await P.apply(proposal({ expectSha: 'sha-webtoolsjson-22' }), { GH, token: 't' });
  assert.equal(res.ok, false);
  assert.equal(res.stale, true);
  assert.match(res.error, /changed since this was proposed/);
  assert.match(res.error, /sha-web/, 'the expected sha is named');
  assert.equal(log.length, 0, 'a refused guard never reaches the write');
});

test('force overrides the guard and says so in the record', async () => {
  const log = [];
  const GH = stubGH({ 'me/target': { '.web-tools.json': '{\n  "estate": true,\n  "note": "changed since"\n}\n' } }, log);
  const res = await P.apply(proposal({ expectSha: 'sha-webtoolsjson-22' }), { GH, token: 't', force: true });
  assert.equal(res.ok, true);
  assert.equal(res.forced, true, 'a deliberate override stays distinguishable from a clean apply');
  assert.equal(res.expectedSha, 'sha-webtoolsjson-22');
  assert.ok(res.foundSha, 'and the record keeps what it actually found');
  assert.equal(log.length, 1);
});

test('a target deleted since authoring refuses too, until forced', async () => {
  const log = [];
  const GH = stubGH({}, log);
  const p = proposal({ expectSha: 'sha-whatever' });
  const res = await P.apply(p, { GH, token: 't' });
  assert.equal(res.ok, false);
  assert.match(res.error, /no longer exists/);
  assert.equal(log.length, 0);
  const forced = await P.apply(p, { GH, token: 't', force: true });
  assert.equal(forced.ok, true);
  assert.equal(forced.created, true, 'forcing recreates the file');
});

test('no expectSha keeps the old last-write-wins behavior', async () => {
  const log = [];
  const GH = stubGH({ 'me/target': { '.web-tools.json': '{"estate":true,"note":"changed"}' } }, log);
  const res = await P.apply(proposal(), { GH, token: 't' });
  assert.equal(res.ok, true, 'a session that never read the file cannot claim a sha, and is not blocked');
  assert.equal(res.forced, undefined);
});

test('an expectSha that is not a string is refused at validation', () => {
  assert.match(P.validate(proposal({ expectSha: 12345 })).error, /expectSha/);
});

// ── provenance ──────────────────────────────────────────────────────────────

test('by and session ride through to the applied record', async () => {
  const GH = stubGH({ 'me/target': { '.web-tools.json': '{}' } });
  const res = await P.apply(proposal({ by: 'claude-code', session: 'https://claude.ai/code/session_x' }),
    { GH, token: 't' });
  assert.equal(res.by, 'claude-code');
  assert.equal(res.session, 'https://claude.ai/code/session_x');
});

test('an unsigned proposal still applies, and simply carries no attribution', async () => {
  const GH = stubGH({ 'me/target': { '.web-tools.json': '{}' } });
  const res = await P.apply(proposal(), { GH, token: 't' });
  assert.equal(res.ok, true);
  assert.equal('by' in res, false);
  assert.equal('session' in res, false);
});

// ── delivery: commit, branch, pr ────────────────────────────────────────────
// The channel used to have one way to land a change. A PR is the honest form
// for anything a reviewer should read as a diff, and the only form that works
// against a protected branch.

test('the default delivery is still a commit on the target', async () => {
  const log = [];
  const GH = stubGH({ 'me/target': { '.web-tools.json': '{}' } }, log);
  const res = await P.apply(proposal(), { GH, token: 't' });
  assert.equal(res.deliver, 'commit');
  assert.equal(res.branch, undefined);
  assert.equal(log.filter(l => l.createRef).length, 0, 'no branch is cut for a plain commit');
});

test('branch delivery cuts proposal/<id> and commits there, leaving the target alone', async () => {
  const log = [];
  const GH = stubGH({ 'me/target': { '.web-tools.json': '{}' } }, log);
  const res = await P.apply(proposal({ deliver: 'branch' }), { GH, token: 't' });
  assert.equal(res.ok, true);
  assert.equal(res.deliver, 'branch');
  assert.equal(res.branch, 'proposal/p1');
  assert.equal(res.baseBranch, 'main');
  assert.equal(res.branchCreated, true);
  assert.equal(log.find(l => l.createRef)?.createRef, 'proposal/p1');
  assert.equal(log.find(l => l.path)?.branch, 'proposal/p1', 'the write goes to the branch, not the default');
  assert.equal(res.pr, undefined, 'branch delivery opens nothing');
});

test('pr delivery opens a draft PR carrying the why and the signature', async () => {
  const log = [];
  const GH = stubGH({ 'me/target': { '.web-tools.json': '{\n  "estate": true\n}\n' } }, log);
  const res = await P.apply(proposal({ deliver: 'pr', by: 'claude-code', session: 'https://claude.ai/x' }),
    { GH, token: 't' });
  assert.equal(res.ok, true);
  assert.equal(res.deliver, 'pr');
  assert.equal(res.pr, 'https://github.com/me/target/pull/7');
  assert.equal(res.prNumber, 7);
  const call = log.find(l => l.createPull).createPull;
  assert.equal(call.head, 'proposal/p1');
  assert.equal(call.base, 'main');
  assert.equal(call.draft, true, 'ready is the reviewer move, not the channel-s');
  assert.match(call.title, /Set scope in \.web-tools\.json/);
  assert.match(call.body, /the Map shows a blank scope/, 'the why is the body');
  assert.match(call.body, /claude-code/);
  assert.match(call.body, /https:\/\/claude\.ai\/x/);
  assert.match(call.body, /proposals\/pending\/p1\.json/);
});

test('a PR that cannot be opened still reports the branch and a compare link', async () => {
  const log = [];
  const GH = stubGH({ 'me/target': { '.web-tools.json': '{}' } }, log, { prFails: true });
  const res = await P.apply(proposal({ deliver: 'pr' }), { GH, token: 't' });
  assert.equal(res.ok, true, 'the branch and commit landed, so the record is not a failure');
  assert.equal(res.branch, 'proposal/p1');
  assert.match(res.prError, /not accessible/);
  assert.match(res.compare, /compare\/main\.\.\.proposal%2Fp1/);
});

test('an existing proposal branch is a resume, not a collision', async () => {
  const log = [];
  const GH = stubGH({ 'me/target': { '.web-tools.json': '{}' } }, log, { refExists: true });
  const res = await P.apply(proposal({ deliver: 'branch' }), { GH, token: 't' });
  assert.equal(res.ok, true);
  assert.equal(res.branchCreated, false);
});

test('the tap can override the record-s suggestion in either direction', async () => {
  const log = [];
  const GH = stubGH({ 'me/target': { '.web-tools.json': '{}' } }, log);
  const asPr = await P.apply(proposal(), { GH, token: 't', deliver: 'pr' });
  assert.equal(asPr.deliver, 'pr', 'a commit-shaped record can still go out as a PR');
  const asCommit = await P.apply(proposal({ deliver: 'pr' }), { GH, token: 't', deliver: 'commit' });
  assert.equal(asCommit.deliver, 'commit', 'and a pr-shaped one can be committed directly');
});

test('an unknown delivery is refused rather than guessed', async () => {
  const GH = stubGH({ 'me/target': { '.web-tools.json': '{}' } });
  assert.match(P.validate(proposal({ deliver: 'merge-it' })).error, /unsupported deliver/);
  const res = await P.apply(proposal(), { GH, token: 't', deliver: 'yolo' });
  assert.equal(res.ok, false);
  assert.match(res.error, /unsupported deliver/);
});

test('branch names are safe for a ref, whatever the id looks like', () => {
  assert.equal(P.branchFor({ id: 'scope wa/bills!' }), 'proposal/scope-wa-bills-');
  assert.equal(P.branchFor({}), 'proposal/unnamed');
});

// ── the three prose fields ──────────────────────────────────────────────────
// One line always on screen, the detail behind a tap, the judgment call
// impossible to scroll past. The split exists because a card cannot collapse
// prose halfway, and four cards of full prose is a wall on a phone.

test('a split record reports its own summary and keeps why as the detail', () => {
  const p = { summary: 'Add a scope line.', why: 'The Map shows a blank card without one. Drafted 2026-07-23.' };
  assert.equal(P.summaryOf(p), 'Add a scope line.');
  assert.equal(P.detailOf(p), 'The Map shows a blank card without one. Drafted 2026-07-23.');
});

test('an old record with only why still reads well: first sentence up, rest behind the tap', () => {
  const p = { why: 'Adds a scope line to this repo. The Map shows a blank card without one. Drafted 2026-07-23.' };
  assert.equal(P.summaryOf(p), 'Adds a scope line to this repo.');
  assert.equal(P.detailOf(p), 'The Map shows a blank card without one. Drafted 2026-07-23.');
});

test('a one-sentence why has no detail to hide', () => {
  const p = { why: 'Adds a scope line to this repo.' };
  assert.equal(P.summaryOf(p), 'Adds a scope line to this repo.');
  assert.equal(P.detailOf(p), '', 'nothing left over means no Why toggle on the card');
});

test('summary and caution are refused when they are not strings', () => {
  const base = { id: 'x', kind: 'put-file', repo: 'me/t', path: 'a', content: '', why: 'w' };
  assert.match(P.validate({ ...base, summary: 12 }).error, /summary must be a string/);
  assert.match(P.validate({ ...base, caution: [] }).error, /caution must be a string/);
  assert.equal(P.validate({ ...base, summary: 'ok', caution: 'check first' }).ok, true);
});

test('the PR body carries the three fields as three things, not one paragraph', () => {
  const p = proposal({ summary: 'Add a scope line.', why: 'The Map shows a blank card.', caution: 'confirm visibility' });
  const body = P.prBody(p, { fieldBefore: undefined });
  const lines = body.split('\n');
  assert.equal(lines[0], 'Add a scope line.', 'the summary leads');
  assert.ok(body.includes('The Map shows a blank card.'));
  assert.match(body, /> \*\*Before merging:\*\* confirm visibility/, 'the caution is a blockquote, not buried');
});
