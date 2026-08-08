// alpineComponents/proposals.js — the review surface for the write-side
// channel. What matters here is not markup but the gate: a row must resolve
// against the live target before it can be applied, and an apply must take two
// taps and leave a record behind. Driven with real Alpine under jsdom against a
// stub GH, the bootstrap.mjs recipe.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, tick, repoRoot } from './bootstrap.mjs';

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body><div id="p" x-data="proposals()"></div></body></html>`,
});

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
window.Alpine = Alpine;

const REG = 'mehrlander/web-tools-private';
const good = {
  id: 'scope-wa-bills', kind: 'set-json-field', repo: 'mehrlander/wa-bills',
  path: '.web-tools.json', field: 'scope', value: 'Washington bill structure.',
  why: 'the Map shows a blank scope for this repo',
};
const bad = { id: 'broken', kind: 'set-json-field', repo: 'mehrlander/fn-data',
  path: '.web-tools.json', field: 'scope', value: 'x', why: 'same' };
// A proposal against a branch rather than the default, to hold the ref-aware
// target link and the fact that the review reads that branch's copy.
const onBranch = { id: 'on-branch', kind: 'put-file', repo: 'mehrlander/wa-bills',
  ref: 'feat/x', path: 'docs/note.md', content: 'new\n', why: 'branch-targeted' };

const writes = [], saves = [];
const files = {
  [REG]: {
    'proposals/pending/scope-wa-bills.json': JSON.stringify(good),
    'proposals/pending/broken.json': JSON.stringify(bad),
    'proposals/pending/on-branch.json': JSON.stringify(onBranch),
    'proposals/pending/spent.json': JSON.stringify({ ...good, id: 'spent' }),
    'proposals/applied/spent.json': '{"ok":true}',
  },
  'mehrlander/wa-bills': { '.web-tools.json': '{\n  "estate": true\n}\n' },
  'mehrlander/fn-data': { '.web-tools.json': 'not json' },   // resolves with an error
};

window.TOKEN = 'test-token';
window.GH = class {
  constructor({ repo, ref }) { this.repo = repo; this.ref = ref; }
  async ls(dir) {
    const names = Object.keys(files[this.repo] || {})
      .filter(p => p.startsWith(dir + '/'))
      .map(p => p.slice(dir.length + 1));
    if (!names.length) { const e = new Error('Not Found'); e.status = 404; throw e; }
    return names.map(name => ({ name, type: 'file' }));
  }
  async get(p) {
    const text = files[this.repo]?.[p];
    if (text === undefined) { const e = new Error('Not Found'); e.status = 404; throw e; }
    return { text };
  }
  async saveRaw(p, content, message, branch) { writes.push({ repo: this.repo, path: p, content, message, branch }); return { commit: { sha: 'abc123' } }; }
  async defaultBranch() { return 'main'; }
  async createRef(branch, from) { writes.push({ createRef: branch, from }); return { branch, sha: 'base', created: true }; }
  async createPull(args) { writes.push({ createPull: args }); return { html_url: 'https://github.com/' + this.repo + '/pull/12', number: 12 }; }
  async save(p, body) { saves.push({ repo: this.repo, path: p, body }); }
};
window.__shell = { REGISTRY_REPO: REG, hasToken: () => true, loadProposalCount: () => { window.__shell._counted = true; } };

new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/repo-proposals.js'), 'utf8'))();
// The put-file pane diffs through the shared kit when it is present, which it
// is wherever the view really runs (show-repo loads it in its own chain).
new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/text-diff.js'), 'utf8'))();
new window.Function(readFileSync(path.join(repoRoot, 'lib/alpineComponents/proposals.js'), 'utf8'))();
Alpine.store('toast', () => {});
Alpine.start();
await tick(3);

// Arrays cross the jsdom realm boundary, so deepEqual against a literal needs
// a [...] rebuild on this side (the same dance map-view.test.mjs does).
const data = Alpine.$data(window.document.getElementById('p'));
await data.load();

test('mounts and lists only what is still pending', () => {
  assert.deepEqual(problems, []);
  assert.deepEqual([...data.items.map(i => i.id)].sort(), ['broken', 'on-branch', 'scope-wa-bills'],
    'a proposal with an applied record is spent and does not reappear');
});

test('a row resolves against the live target and carries the review facts', () => {
  const row = data.items.find(i => i.id === 'scope-wa-bills');
  assert.equal(row.resolved, true);
  assert.equal(row.exists, true);
  assert.equal(row.fieldBefore, undefined, 'the field is not set on the target yet');
  assert.deepEqual(JSON.parse(row.after), { estate: true, scope: 'Washington bill structure.' });
  assert.equal(row.targetGh, 'https://github.com/mehrlander/wa-bills/blob/HEAD/.web-tools.json');
  assert.ok(row.proposalGh.includes('proposals/pending/scope-wa-bills.json'));
});

test('a row whose target cannot be read is listed unresolved, not silently dropped', () => {
  const row = data.items.find(i => i.id === 'broken');
  assert.equal(row.resolved, false);
  assert.match(row.resolveErr, /not valid JSON/);
  // The template disables Apply on !resolved; the record stays visible so the
  // failure is reportable rather than invisible.
  assert.equal(data.items.length, 3);
});

test('a branch-targeted proposal links to that branch, not the default', () => {
  const row = data.items.find(i => i.id === 'on-branch');
  assert.equal(row.targetGh, 'https://github.com/mehrlander/wa-bills/blob/feat/x/docs/note.md',
    'a HEAD link would show the wrong copy of the file being changed');
});

test('a put-file row against an existing file resolves to a line diff', async () => {
  files['mehrlander/wa-bills']['docs/have.md'] = 'keep\nold line\nkeep too\n';
  files[REG]['proposals/pending/rewrites.json'] = JSON.stringify({
    id: 'rewrites', kind: 'put-file', repo: 'mehrlander/wa-bills',
    path: 'docs/have.md', content: 'keep\nnew line\nkeep too\n', why: 'x' });
  await data.load();
  const row = data.items.find(i => i.id === 'rewrites');
  assert.ok(row.diffRows, 'the pane gets rows, not two files to eyeball');
  const rows = [...row.diffRows].map(r => ({ t: r.t, line: r.line }));
  assert.ok(rows.some(r => r.t === 'del' && r.line === 'old line'));
  assert.ok(rows.some(r => r.t === 'add' && r.line === 'new line'));
  assert.ok(rows.some(r => r.t === 'ctx' && r.line === 'keep'), 'context rides along');
  assert.equal(row.diffStat, '+1 / -1');
  // A put-file that creates a new file has nothing to diff against: the
  // side-by-side panes stay, so diffRows must stay unset.
  const creates = data.items.find(i => i.id === 'on-branch');
  assert.equal(creates.exists, false);
  assert.equal(creates.diffRows, undefined);
});

test('applying takes a confirm, writes the target, and records the result', async () => {
  const row = data.items.find(i => i.id === 'scope-wa-bills');
  assert.equal(data.confirming, null, 'nothing is armed on load');
  data.confirming = row.id;                       // what the first tap does
  await data.apply(row);                          // what the second tap does

  assert.equal(writes.length, 1, 'exactly one target write');
  assert.equal(writes[0].repo, 'mehrlander/wa-bills');
  assert.deepEqual(JSON.parse(Buffer.from(writes[0].content, 'base64').toString('utf8')),
    { estate: true, scope: 'Washington bill structure.' });

  const rec = saves.find(s => s.path === 'proposals/applied/scope-wa-bills.json');
  assert.ok(rec, 'the applied record is what marks the proposal spent');
  assert.equal(rec.body.ok, true);
  assert.equal(rec.body.commit, 'abc123');
  assert.equal(data.confirming, null, 'the gate re-arms after the write');
  assert.equal(window.__shell._counted, true, 'the shell count refreshes, so the nav entry can go away');
});

test('after applying, the proposal is no longer pending', async () => {
  files[REG]['proposals/applied/scope-wa-bills.json'] = '{"ok":true}';
  await data.load();
  assert.deepEqual([...data.items.map(i => i.id)].sort(), ['broken', 'on-branch', 'rewrites']);
});

test('no token means no read at all', async () => {
  const before = writes.length;
  window.__shell.hasToken = () => false;
  await data.load();
  assert.equal(data.items.length, 0);
  assert.equal(writes.length, before);
  window.__shell.hasToken = () => true;
});

test('the PR button arms its own confirm and delivers as a pull request', async () => {
  await data.load();   // the token test above left the list empty on purpose
  const row = data.items.find(i => i.id === 'on-branch');
  const before = writes.length;
  data.arm(row, 'pr');                       // the first tap, on Open PR
  assert.equal(data.armedMode, 'pr');
  assert.match(data.confirmLabel(row), /Open a PR on mehrlander\/wa-bills\?/);
  await data.apply(row);                     // the second

  const made = writes.slice(before);
  assert.equal(made.find(w => w.createRef)?.createRef, 'proposal/on-branch');
  assert.equal(made.find(w => w.path)?.branch, 'proposal/on-branch', 'the commit lands on the proposal branch');
  const pr = made.find(w => w.createPull)?.createPull;
  assert.equal(pr.base, 'feat/x', 'a branch-targeted proposal bases its PR on that branch');
  assert.equal(pr.draft, true);
  assert.equal(row.delivered, 'Opened PR #12 on mehrlander/wa-bills.');
  assert.equal(row.deliveredUrl, 'https://github.com/mehrlander/wa-bills/pull/12');
  assert.equal(data.armedMode, null, 'the arm resets after the write');
});

test('the commit button still delivers a plain commit', async () => {
  files[REG]['proposals/pending/plain.json'] = JSON.stringify({
    id: 'plain', kind: 'set-json-field', repo: 'mehrlander/wa-bills', path: '.web-tools.json',
    field: 'note', value: 'x', why: 'a one-key edit does not want a PR' });
  await data.load();
  const row = data.items.find(i => i.id === 'plain');
  assert.equal(data.prPrimary(row), false, 'no hint means commit is the filled button');
  const before = writes.length;
  data.arm(row, 'commit');
  await data.apply(row);
  const made = writes.slice(before);
  assert.equal(made.filter(w => w.createRef).length, 0, 'no branch for a commit delivery');
  assert.equal(made.filter(w => w.createPull).length, 0);
  assert.equal(row.delivered, 'Committed to mehrlander/wa-bills.');
  assert.equal(row.deliveredUrl, 'https://github.com/mehrlander/wa-bills/commit/abc123',
    'the landed commit is a link, matching the commitUrl in the applied record');
});

// ── what a real run taught ──────────────────────────────────────────────────
// Both of these are regressions of observed behavior, not hypotheticals: on
// 2026-07-28 one apply failed with a 409 and was marked spent anyway, and
// successful rows lingered because the reload raced GitHub's listing.

test('a failed apply leaves the proposal pending and records an attempt', async () => {
  files[REG]['proposals/pending/willfail.json'] = JSON.stringify({
    id: 'willfail', kind: 'set-json-field', repo: 'mehrlander/willfail',
    path: '.web-tools.json', field: 'scope', value: 'x', why: 'a write that 409s' });
  files['mehrlander/willfail'] = { '.web-tools.json': '{}' };
  await data.load();
  const row = data.items.find(i => i.id === 'willfail');
  assert.ok(row, 'it lists');

  const realSave = window.GH.prototype.saveRaw;
  window.GH.prototype.saveRaw = async function () { const e = new Error('GitHub Error 409'); e.status = 409; throw e; };
  try {
    data.arm(row, 'commit');
    await data.apply(row);
  } finally { window.GH.prototype.saveRaw = realSave; }

  assert.equal(saves.some(s => s.path === 'proposals/applied/willfail.json'), false,
    'a failure must not write the tombstone that retires a proposal');
  assert.ok(saves.some(s => s.path.startsWith('proposals/attempts/willfail-')),
    'it is kept as an attempt instead, so the failure is diagnosable');
  assert.ok(data.items.some(i => i.id === 'willfail'), 'and the proposal is still pending');
});

test('a successful apply drops the row without waiting for the listing to catch up', async () => {
  files[REG]['proposals/pending/quick.json'] = JSON.stringify({
    id: 'quick', kind: 'set-json-field', repo: 'mehrlander/wa-bills',
    path: '.web-tools.json', field: 'note', value: 'q', why: 'x' });
  await data.load();
  const row = data.items.find(i => i.id === 'quick');
  data.arm(row, 'commit');
  await data.apply(row);
  // The stub's listing still reports it pending, exactly like the real API a
  // second after a write. The row is gone anyway.
  assert.equal(data.items.some(i => i.id === 'quick'), false);
});

test('a change already in place reads as done, and retires without touching the target', async () => {
  files['mehrlander/done-repo'] = { '.web-tools.json': '{\n  "scope": "already here"\n}\n' };
  files[REG]['proposals/pending/already.json'] = JSON.stringify({
    id: 'already', kind: 'set-json-field', repo: 'mehrlander/done-repo',
    path: '.web-tools.json', field: 'scope', value: 'already here', why: 'x' });
  await data.load();
  const row = data.items.find(i => i.id === 'already');
  assert.equal(row.done, true, 'the premise check sees the value is already there');
  assert.equal(row.checks.find(c => c.key === 'needed').state, 'done');

  const before = writes.length;
  await data.retire(row);
  assert.equal(writes.length, before, 'retiring writes nothing to the target');
  assert.ok(saves.some(s => s.path === 'proposals/applied/already.json'), 'only the tombstone');
  assert.equal(data.items.some(i => i.id === 'already'), false);
});
