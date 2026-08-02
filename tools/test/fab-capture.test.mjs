// fab-capture.test.mjs — the capture serializes what the drawer already
// collects, and says so honestly: mode names the fidelity, read() entries
// carry sizes rather than bytes, and the console buffer rides along whole.
// The clipboard half is a real-browser fact; this pins the bundle's shape,
// which is the contract a session reading a pasted capture depends on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, tick } from './bootstrap.mjs';

const { window } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="pthost"></div>
    <div id="fabhost"></div>
  </body></html>`,
});

// Pre-mount state, the way gh-boot and gh-api leave it: a console buffer that
// predates the FAB, a script registry, a read() registry.
window.__consoleLogs = [
  { level: 'warn', msg: 'gh-fetch: GraphQL BranchSessions rejected: something', time: 1 },
  { level: 'error', msg: 'boom', time: 2 },
];
window.__loadedScripts = [{ path: 'kits/io.js', status: 'ok', auto: false }];
window.__reads = [{ path: 'data/big.json', value: { rows: [1, 2, 3] } }];

const Alpine = await startAlpine(window, ['lib/alpineComponents/path-picker.js', 'lib/alpineComponents/fab.js']);
const doc = window.document;

Alpine.data('pageThing', () => ({
  description: 'a page component',
  actions: [{ label: 'Do it', run: () => {} }],
}));
doc.getElementById('pthost').setAttribute('x-data', 'pageThing');
Alpine.initTree(doc.getElementById('pthost'));

doc.getElementById('fabhost').setAttribute('x-data', 'fab()');
Alpine.initTree(doc.getElementById('fabhost'));
await tick(2);

const fab = Alpine.$data(doc.getElementById('fabhost'));

test('captureData serializes the collected state with honest fidelity', () => {
  const c = fab.captureData();
  assert.equal(c.capture, 'fab/1');
  assert.equal(c.mode, 'top-level', 'outside a toss the mode says so');
  assert.ok(c.at && c.address !== undefined);

  // The console buffer rides whole, including lines from before the mount:
  // this is what lets a capture answer whether a GraphQL query rejected.
  const msgs = [...c.console].map(l => l.msg);
  assert.ok(msgs.some(m => m.includes('GraphQL BranchSessions rejected')));
  assert.equal(c.errors, 1);

  // Scripts from the registry; reads as path + size, never the bytes.
  assert.ok([...c.scripts].some(s => s.path === 'kits/io.js' && s.status === 'ok'));
  const read = [...c.reads].find(r => r.path === 'data/big.json');
  assert.ok(read && read.bytes > 0);
  assert.equal(read.value, undefined, 'a capture reports sizes, not payloads');

  // The component scan, with the page's contributed actions by label.
  const pt = [...c.components].find(g => g.name === 'pageThing');
  assert.ok(pt, 'the page component is scanned');
  assert.equal(pt.side, 'page');
  assert.deepEqual([...(pt.actions || [])], ['Do it']);
});

test('copyCapture writes the bundle to the clipboard and reports the size', async () => {
  let written = '';
  window.navigator.clipboard = { writeText: async t => { written = t; } };
  await fab.copyCapture();
  assert.ok(written.length > 100, 'the JSON landed on the clipboard');
  assert.equal(JSON.parse(written).capture, 'fab/1', 'and parses back');
  assert.match(fab.capMsg, /^Copied \d+K$/);
});
