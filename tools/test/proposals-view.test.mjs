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
  async saveRaw(p, content, message) { writes.push({ repo: this.repo, path: p, content, message }); return { commit: { sha: 'abc123' } }; }
  async save(p, body) { saves.push({ repo: this.repo, path: p, body }); }
};
window.__shell = { REGISTRY_REPO: REG, hasToken: () => true, loadProposalCount: () => { window.__shell._counted = true; } };

new window.Function(readFileSync(path.join(repoRoot, 'lib/repo-proposals.js'), 'utf8'))();
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
  assert.deepEqual([...data.items.map(i => i.id)].sort(), ['broken', 'on-branch']);
});

test('no token means no read at all', async () => {
  const before = writes.length;
  window.__shell.hasToken = () => false;
  await data.load();
  assert.equal(data.items.length, 0);
  assert.equal(writes.length, before);
  window.__shell.hasToken = () => true;
});
