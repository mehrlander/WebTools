// alpineComponents/path-picker.js — logic-level tests for the tap-through
// path selector: descent by choose(), crumb jumps, file picks (emit and stay
// open), dir mode (folder-as-target, files naming their folder), and the lazy
// root loading that lets a caller offer every repo a token can see. There is no
// text input by design. Most tests inject the tree directly; the lazy ones use a
// fake GH that counts calls. No network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="pf" x-data="pathPicker({ mode: 'file' })"></div>
    <div id="pd" x-data="pathPicker({ mode: 'dir' })"></div>
  </body></html>`,
});

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/alpineComponents/path-picker.js',
]);

// The tree a real ensureTree() would build from two roots: a repo node whose
// name carries its own '/', folders with children, files without.
const TREE = () => [{
  name: 'me/open', kind: 'repo', repo: 'me/open', ref: '',
  children: [
    { name: 'lib', kind: 'folder', children: [
      { name: 'a.js', kind: 'file' },
      { name: 'b.js', kind: 'file' },
    ]},
    { name: 'README.md', kind: 'file' },
  ],
}, {
  name: 'other/lib@dev', kind: 'repo', repo: 'other/lib', ref: 'dev',
  children: [{ name: 'src', kind: 'folder', children: [{ name: 'x.js', kind: 'file' }] }],
}];

const file = Alpine.$data(window.document.getElementById('pf'));
const dir = Alpine.$data(window.document.getElementById('pd'));
for (const d of [file, dir]) { d.tree = TREE(); d._loaded = true; }
const plain_ = (v) => JSON.parse(JSON.stringify(v));

const picks = [];
window.document.getElementById('pf').addEventListener('path-pick', e => picks.push(plain_(e.detail)));
window.document.getElementById('pd').addEventListener('path-pick', e => picks.push(plain_(e.detail)));

const byName = (d, name) => d.children().find(n => n.name === name);

test('mounts with no startup warnings or errors', () => {
  assert.deepEqual(problems, []);
});

test('children() lists roots at the top, folders before files inside a repo', () => {
  file.scope = [];
  assert.deepEqual(plain_(file.children().map(n => n.name)), ['me/open', 'other/lib@dev']);
  file.choose(byName(file, 'me/open'));
  assert.deepEqual(plain_(file.children().map(n => n.name)), ['lib', 'README.md']);
});

test('choosing folders descends; jump and up walk back', () => {
  file.scope = []; file.open = true;
  file.choose(byName(file, 'me/open'));
  file.choose(byName(file, 'lib'));
  assert.deepEqual(plain_(file.scope.map(n => n.name)), ['me/open', 'lib']);
  file.up();
  assert.deepEqual(plain_(file.scope.map(n => n.name)), ['me/open']);
  file.jump(0);
  assert.equal(file.scope.length, 0);
});

test('file mode: choosing a file emits repo/ref/path, labels, and stays open', () => {
  picks.length = 0;
  file.scope = []; file.open = true;
  file.choose(byName(file, 'me/open'));
  file.choose(byName(file, 'lib'));
  file.choose(byName(file, 'b.js'));
  assert.deepEqual(plain_(picks), [{ repo: 'me/open', ref: '', path: 'lib/b.js' }]);
  assert.equal(file.open, true, 'stays open for the next grab');
  assert.equal(file.label, 'lib/b.js');
});

test('dir mode: dirSpec is null at the top, a spec inside a repo', () => {
  dir.scope = [];
  assert.equal(dir.dirSpec(), null);
  dir.choose(byName(dir, 'other/lib@dev'));
  dir.choose(byName(dir, 'src'));
  assert.deepEqual(plain_(dir.dirSpec()), { repo: 'other/lib', ref: 'dev', dir: 'src', spec: 'other/lib@dev:src' });
});

test('dir mode: choosing a file picks its containing folder and closes', () => {
  picks.length = 0;
  dir.scope = []; dir.open = true;
  dir.choose(byName(dir, 'other/lib@dev'));
  dir.choose(byName(dir, 'src'));
  dir.choose(byName(dir, 'x.js'));
  assert.deepEqual(plain_(picks), [{ repo: 'other/lib', ref: 'dev', dir: 'src', spec: 'other/lib@dev:src' }]);
  assert.equal(dir.open, false);
  assert.equal(dir.label, 'other/lib@dev:src');
});

test('dir mode: pickDir commits the bare repo root as owner/repo', () => {
  picks.length = 0;
  dir.scope = []; dir.open = true;
  dir.choose(byName(dir, 'me/open'));
  dir.pickDir();
  assert.deepEqual(plain_(picks), [{ repo: 'me/open', ref: '', dir: '', spec: 'me/open' }]);
});

// ---- lazy roots: the tree loads on entry, not at first open ---------------

// A GH stand-in that records every tree request, so "how many calls did showing
// the root list cost" is an assertion rather than a guess.
//
// The roots fixtures hang off globalThis rather than window: Alpine is imported
// into the Node realm, so its expression evaluator closes over globalThis, while
// the component files run in the jsdom window realm.
const treeCalls = [];
class CountingGH {
  constructor(conf = {}) { this.token = conf.token || ''; this.repo = conf.repo || ''; this.ref = ''; }
  async req(path) {
    treeCalls.push({ repo: this.repo, path });
    if (this.repo === 'me/broken') throw new Error('GitHub Error 404');
    return {
      truncated: false,
      tree: [
        { type: 'tree', path: 'src' },
        { type: 'blob', path: 'src/main.js' },
        { type: 'blob', path: 'LICENSE' },
      ],
    };
  }
}

test('listing many roots costs no tree calls until one is entered', async () => {
  const host = window.document.createElement('div');
  host.setAttribute('x-data', "pathPicker({ mode: 'file', roots: () => ROOTS_MANY })");
  globalThis.ROOTS_MANY = Array.from({ length: 40 }, (_, i) => ({ repo: 'me/r' + i, ref: '' }));
  window.document.body.appendChild(host);
  Alpine.initTree(host);
  await new Promise(r => setTimeout(r, 0));

  const d = Alpine.$data(host);
  Alpine.store('browser').gh = new CountingGH({ token: 't', repo: 'me/open' });
  treeCalls.length = 0;

  await d.ensureTree();
  assert.equal(d.tree.length, 40, 'every root is listed');
  assert.equal(treeCalls.length, 0, 'showing the list must not fetch 40 trees');
  assert.equal(d.tree[0].children, null, 'an unentered repo is marked unloaded');

  await d.choose(d.tree[3]);
  assert.equal(treeCalls.length, 1, 'entering one repo costs exactly one call');
  assert.equal(treeCalls[0].repo, 'me/r3');
  assert.deepEqual(plain_(d.children().map(n => n.name)), ['src', 'LICENSE']);

  // Re-entering is free: the children are cached on the node.
  d.jump(0);
  await d.choose(d.tree[3]);
  assert.equal(treeCalls.length, 1, 're-entering a loaded repo refetches nothing');
});

test('an async roots function is awaited', async () => {
  const host = window.document.createElement('div');
  host.setAttribute('x-data', "pathPicker({ mode: 'file', roots: () => ROOTS_ASYNC() })");
  globalThis.ROOTS_ASYNC = async () => {
    await new Promise(r => setTimeout(r, 1));
    return ['me/from-a-promise'];
  };
  window.document.body.appendChild(host);
  Alpine.initTree(host);
  await new Promise(r => setTimeout(r, 0));

  const d = Alpine.$data(host);
  Alpine.store('browser').gh = new CountingGH({ token: 't', repo: 'me/open' });
  await d.ensureTree();
  assert.deepEqual(plain_(d.tree.map(n => n.name)), ['me/from-a-promise']);
});

test('a roots function that throws leaves a stated error, not a blank panel', async () => {
  const host = window.document.createElement('div');
  host.setAttribute('x-data', "pathPicker({ mode: 'file', roots: () => ROOTS_BAD() })");
  globalThis.ROOTS_BAD = async () => { throw new Error('401 bad token'); };
  window.document.body.appendChild(host);
  Alpine.initTree(host);
  await new Promise(r => setTimeout(r, 0));

  const d = Alpine.$data(host);
  Alpine.store('browser').gh = new CountingGH({ token: '', repo: 'me/open' });
  await d.ensureTree();
  assert.match(d.error, /Could not list repositories.*401 bad token/);
  assert.deepEqual(plain_(d.tree), []);
});

test('a repo whose tree fails reads as empty and says why', async () => {
  const host = window.document.createElement('div');
  host.setAttribute('x-data', "pathPicker({ mode: 'file', roots: () => ['me/broken'] })");
  window.document.body.appendChild(host);
  Alpine.initTree(host);
  await new Promise(r => setTimeout(r, 0));

  const d = Alpine.$data(host);
  Alpine.store('browser').gh = new CountingGH({ token: 't', repo: 'me/open' });
  await d.ensureTree();
  await d.choose(d.tree[0]);
  assert.deepEqual(plain_(d.children()), [], 'an unreadable repo is empty, not null');
  assert.match(d.error, /Could not read me\/broken/);
  assert.equal(d.loading, false, 'the spinner is cleared on failure');
});
