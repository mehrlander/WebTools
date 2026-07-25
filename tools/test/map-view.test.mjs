// alpineComponents/map.js — the Map view inside show-repo (formerly Portable).
// Logic-level tests with real Alpine under jsdom (bootstrap.mjs recipe): the set
// loads from the hub manifest through a stubbed GH, and the scope helpers split
// an inline scope story from a file-pointer scope. Not covered: the live
// adoption probe (token-gated; window.PortableAlign + private reads).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, tick, repoRoot } from './bootstrap.mjs';

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="map" x-data="map()"></div>
  </body></html>`,
});

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
window.Alpine = Alpine;

const manifest = {
  hub: 'mehrlander/web-tools',
  items: [
    { kind: 'skill', command: '/portable:caption', path: '.claude/skills/caption/SKILL.md', title: 'caption', role: 'the caption', use: 'plugin' },
    { kind: 'doc', path: 'docs/CONVENTIONS.md', title: 'Working conventions', role: 'the conventions', use: 'live' },
    { kind: 'script', path: 'scripts/sunset-scan.py', title: 'sunset-scan.py', role: 'sunset markers', use: 'on-demand' },
  ],
};
// The Transport tab reads the real docs/routes.json, so the stub serves by
// path: the set gets the fixture above, Transport gets the committed manifest
// (routes-manifest.test.mjs is what holds that file to its own shape).
const routesJson = readFileSync(path.join(repoRoot, 'docs', 'routes.json'), 'utf8');
const asked = [];
window.TOKEN = 'ignored-in-test';
window.GH = class {
  constructor(opts) { this.opts = opts; }
  async get(p) {
    asked.push({ ref: this.opts.ref, path: p });
    return { text: p === 'docs/routes.json' ? routesJson : JSON.stringify(manifest) };
  }
};
// No window.__shell in the test, so hasToken() is falsy and the token-gated
// adoption probe never runs; only the public set half loads.

new window.Function(readFileSync(path.join(repoRoot, 'lib/alpineComponents/map.js'), 'utf8'))();
Alpine.start();
await tick(3);

const el = window.document.getElementById('map');
const data = Alpine.$data(el);

test('mounts and loads the public set with no startup warnings; adoption stays gated', () => {
  assert.deepEqual(problems, []);
  assert.ok(data.description.length > 0);
  assert.equal(data.authed, false, 'no token means the per-repo half is gated off');
  assert.ok(data.manifest && data.manifest.items.length === 3);
});

test('the set groups into plugin / docs / scripts sections', () => {
  const secs = data.setSections;
  // [...] rebuilds the realm-crossed array on this side for deepEqual.
  assert.deepEqual([...secs.map(s => s.label)], ['In the plugin', 'Docs', 'Scripts']);
  assert.equal(secs[0].items[0].title, 'caption');
});

test('scope helpers split an inline story from a file pointer', () => {
  assert.equal(data.scopeIsFile('docs/SCOPE.md'), true);
  assert.equal(data.scopeIsFile('projects/x/SCOPE.md'), true);
  assert.equal(data.scopeIsFile('A private orchestration base. Holds content, not conventions.'), false);
  assert.equal(data.scopeText({ scope: 'A private base.' }), 'A private base.');
  assert.equal(data.scopeText({ scope: 'docs/SCOPE.md' }), '', 'a file pointer is not inline text');
  assert.equal(data.scopeFile({ scope: 'docs/SCOPE.md' }), 'docs/SCOPE.md');
  assert.equal(data.scopeFile({ scope: 'A private base.' }), '');
  assert.equal(data.scopeFileGh({ repo: 'me/proj', scope: 'docs/SCOPE.md' }),
    'https://github.com/me/proj/blob/HEAD/docs/SCOPE.md');
});

test('the hub doc link resolves to a GitHub blob', () => {
  assert.equal(data.hubUrl('docs/PORTABLE.md'),
    'https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md');
});

test('Transport loads on demand, not at mount', async () => {
  assert.equal(data.routes, null, 'the manifest is not fetched until the tab is opened');
  await data.loadRoutes();
  assert.equal(data.routesErr, '');
  assert.ok(data.routes.routes.length > 0);
  assert.ok(data.routes.modes.length > 1);
  const before = data.routes;
  await data.loadRoutes();
  assert.equal(data.routes, before, 'a second open reuses the loaded manifest');
});

test('with no ?use=, both manifests are read at main', () => {
  // The deployed case. The branch-preview case is map-view-use-ref.test.mjs,
  // which needs its own window because the ref comes from location.search.
  assert.ok(asked.length >= 2);
  for (const a of asked) assert.equal(a.ref, 'main', a.path);
});

test('Transport rows resolve their icons and GitHub links', () => {
  assert.equal(data.modeIcon({ trust: 'untrusted' }), 'ph-shield-check');
  assert.equal(data.modeIcon({ trust: 'trusted' }), 'ph-key');
  assert.equal(data.modeIcon({ trust: 'whatever' }), 'ph-arrow-bend-down-right', 'unknown trust falls back');
  assert.equal(data.routeGh({ repo: 'me/proj', ref: 'main', path: 'pages/x.html' }),
    'https://github.com/me/proj/blob/main/pages/x.html');
  assert.equal(data.routeGh({ repo: 'me/proj', path: 'pages/x.html' }),
    'https://github.com/me/proj/blob/main/pages/x.html', 'a missing ref reads as main');
});

test('a routes manifest missing its routes block surfaces an error, not a blank tab', async () => {
  const el2 = window.document.createElement('div');
  el2.setAttribute('x-data', 'map()');
  window.document.body.appendChild(el2);
  Alpine.initTree(el2);
  await tick(2);
  const d2 = Alpine.$data(el2);
  d2.routes = null;
  const realGH = window.GH;
  window.GH = class { async get() { return { text: '{"note":"no routes here"}' }; } };
  await d2.loadRoutes();
  window.GH = realGH;
  assert.equal(d2.routes, null);
  assert.match(d2.routesErr, /no routes block/);
});

test('openConfig opens the repo dialog on the Config tab without throwing', () => {
  // No #repo element is mounted in this harness, so the call must no-op safely
  // (optional chaining) rather than throw; the real wiring is the shell dialog.
  assert.doesNotThrow(() => data.openConfig('me/proj'));
});
