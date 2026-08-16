// alpineComponents/map.js under ?use=<ref>: the Map view's two manifests must
// be read at the ref the shell was asked for, not at main.
//
// This is a regression test for a real failure, not a hypothetical. The
// Transport tab shipped reading docs/routes.json at a hardcoded 'main'. That
// file existed only on the branch, so a ?use=<branch> preview link 404'd with
// "Routes manifest load failed: GitHub Error 404" while the deployed page was
// fine. The render scenario missed it because it stubs GH.prototype.get and
// serves the local file, which proves the rendering and says nothing about the
// ref the fetch would have used. Hence this test asserts the OPTS, not the
// response.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, tick, repoRoot, captureAlpineErrors } from './bootstrap.mjs';

const BRANCH = 'claude/some-branch';

const { window } = makeWindow({
  html: '<!doctype html><html><body><div id="map" x-data="map()"></div></body></html>',
  url: `https://localhost/pages/show-repo/show-repo.html?use=${encodeURIComponent(BRANCH)}&view=map`,
});

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
captureAlpineErrors(Alpine);
window.Alpine = Alpine;

// Record every (repo, ref, path) the view asks for, and answer from disk so the
// component gets real manifests regardless of the ref it names.
const asked = [];
const fileFor = (p) => readFileSync(path.join(repoRoot, p), 'utf8');
window.TOKEN = 'ignored-in-test';
window.GH = class {
  constructor(opts) { this.opts = opts; }
  async get(p) {
    asked.push({ repo: this.opts.repo, ref: this.opts.ref, path: p });
    return { text: fileFor(p) };
  }
};

new window.Function(readFileSync(path.join(repoRoot, 'lib/alpineComponents/map.js'), 'utf8'))();
Alpine.start();
await tick(3);

const data = Alpine.$data(window.document.getElementById('map'));
await data.loadRoutes();

test('the set manifest is fetched at the ?use= ref, not main', () => {
  const hit = asked.find(a => a.path === 'docs/portable.json');
  assert.ok(hit, 'the set manifest was requested');
  assert.equal(hit.ref, BRANCH);
});

test('the routes manifest is fetched at the ?use= ref, not main', () => {
  const hit = asked.find(a => a.path === 'docs/routes.json');
  assert.ok(hit, 'the routes manifest was requested');
  assert.equal(hit.ref, BRANCH, 'a manifest added on a branch 404s when read at main');
});

test('both manifests still load and parse at that ref', () => {
  assert.ok(data.manifest && data.manifest.items.length > 0);
  assert.equal(data.routesErr, '');
  assert.ok(data.routes && data.routes.routes.length > 0);
});

test('every request goes to the hub repo', () => {
  assert.ok(asked.length >= 2);
  for (const a of asked) assert.equal(a.repo, 'mehrlander/web-tools');
});
