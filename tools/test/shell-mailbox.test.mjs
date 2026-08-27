// processMailbox: the shell's side of the mailbox channel, and specifically the
// guard that keeps an `ask` alive.
//
// The trap this exists to prevent is quiet and total. fulfill() returns a result
// for an unsupported kind rather than throwing, and processMailbox writes every
// result it gets. Writing a result is what marks a request answered, since
// pending means "no same-named result file exists". So an ask that reached
// fulfill() would be closed by its own rejection on the very first page load,
// with a result saying "unsupported kind: ask" and nothing on screen. The
// channel would look implemented and deliver nothing.
//
// The shell's app() lives inline in app/index.html, so this evaluates the plain
// <script> block against stubs via the shared shell.mjs harness.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';
import { makeShell } from './shell.mjs';

const mailboxSrc = readFileSync(path.join(repoRoot, 'lib/kits/repo-mailbox.js'), 'utf8');

// A registry-repo stub: ls() lists the two mailbox directories, get() returns
// records, save() records what was written. Every write the shell makes to the
// mailbox lands in `saved`, which is the whole assertion surface here.
function makeRegistry({ requests = {}, results = [] } = {}) {
  const saved = [];
  class GH {
    constructor(conf) { this.conf = conf; }
    async ls(dir) {
      if (dir === 'mailbox/requests') return Object.keys(requests).map(name => ({ name, type: 'file' }));
      if (dir === 'mailbox/results') return results.map(name => ({ name, type: 'file' }));
      const e = new Error('404'); e.status = 404; throw e;
    }
    async get(p) {
      const name = p.split('/').pop();
      if (p.startsWith('mailbox/requests/') && name in requests) {
        return { text: JSON.stringify(requests[name]) };
      }
      const e = new Error('404'); e.status = 404; throw e;
    }
    async save(p, body, msg) { saved.push({ path: p, body, msg }); return { content: { sha: 'x' } }; }
    // Reached only if a read kind slips through to fulfill().
    async req() { return { tree: [] }; }
    async branches() { return []; }
  }
  return { GH, saved };
}

function shellWith(registry) {
  const win = {};
  new Function('window', mailboxSrc)(win);       // window.RepoMailbox
  const { shell } = makeShell({ win });
  win.TOKEN = 'real-token';
  win.GH = registry.GH;
  return shell;
}

test('an ask is skipped by the fulfil loop, so no result is written for it', async () => {
  const registry = makeRegistry({
    requests: {
      'ask-wps.json': { id: 'ask-wps', kind: 'ask', note: 'the PowerShell files', dest: 'o/r:projects/wps/dump' },
    },
  });
  const shell = shellWith(registry);
  await shell.processMailbox();
  assert.deepEqual(registry.saved, [],
    'writing any result for an ask closes it: pending means no same-named result exists');
});

test('a malformed ask is skipped too, since the guard reads the kind not the verdict', async () => {
  const registry = makeRegistry({
    requests: { 'ask-bad.json': { id: 'ask-bad', kind: 'ask' } },   // no note, no dest
  });
  const shell = shellWith(registry);
  await shell.processMailbox();
  assert.deepEqual(registry.saved, [],
    'a half-written ask must wait for a person, not be answered by its own rejection');
});

test('the read kinds still fulfil, so the guard did not switch the channel off', async () => {
  const registry = makeRegistry({
    requests: { 'br.json': { id: 'br', kind: 'branches', repo: 'o/r' } },
  });
  const shell = shellWith(registry);
  await shell.processMailbox();
  assert.equal(registry.saved.length, 1);
  assert.equal(registry.saved[0].path, 'mailbox/results/br.json');
  assert.equal(registry.saved[0].body.ok, true);
});

test('an ask alongside a read kind blocks neither', async () => {
  const registry = makeRegistry({
    requests: {
      'ask-wps.json': { id: 'ask-wps', kind: 'ask', note: 'files', dest: 'o/r:d' },
      'br.json': { id: 'br', kind: 'branches', repo: 'o/r' },
    },
  });
  const shell = shellWith(registry);
  await shell.processMailbox();
  assert.deepEqual(registry.saved.map(s => s.path), ['mailbox/results/br.json'],
    'the ask waits and the read is served, in one pass');
});

test('an already-answered ask is not listed as pending', async () => {
  const registry = makeRegistry({
    requests: { 'ask-wps.json': { id: 'ask-wps', kind: 'ask', note: 'files', dest: 'o/r:d' } },
    results: ['ask-wps.json'],
  });
  const shell = shellWith(registry);
  await shell.processMailbox();
  assert.deepEqual(registry.saved, [], 'a closed ask stays closed');
});
