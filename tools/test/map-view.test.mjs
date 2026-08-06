// alpineComponents/map.js — the Map view inside show-repo (formerly Portable).
// Logic-level tests with real Alpine under jsdom (bootstrap.mjs recipe): the set
// loads from the hub manifest through a stubbed GH. (Scope and adoption moved
// onto the Repos card on 2026-08-03; their tests moved with them, to
// estate-adoption.test.mjs.) The set
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
// The Showing and Docs tabs read the real docs/routes.json and docs/docs.json,
// so the stub serves by path: the set gets the fixture above, the other two
// tabs get the committed manifests (routes-manifest.test.mjs and
// docs-registry.test.mjs are what hold those files to their own shapes).
const routesJson = readFileSync(path.join(repoRoot, 'docs', 'routes.json'), 'utf8');
const docsJson = readFileSync(path.join(repoRoot, 'docs', 'docs.json'), 'utf8');
const surfJson = readFileSync(path.join(repoRoot, 'docs', 'surfacing.json'), 'utf8');
// The private registry's sessions cache, trimmed to the rollup the Docs tab
// reads. Paths are repo-qualified there and hub-relative in the registry, which
// is the join the readership column has to get right.
const sessions = {
  generatedAt: '2026-08-06T12:00:00Z',
  count: 42,
  docAttention: [
    { path: 'web-tools/docs/show-repo.md', sessions: 9, count: 31, last: '2026-08-05T20:00:00Z' },
    { path: 'home/docs/elsewhere.md', sessions: 7, count: 7, last: '2026-08-04T20:00:00Z' },
  ],
};
const asked = [];
window.TOKEN = 'ignored-in-test';
window.GH = class {
  constructor(opts) { this.opts = opts; }
  async get(p) {
    asked.push({ ref: this.opts.ref, path: p });
    if (p === 'docs/routes.json') return { text: routesJson };
    if (p === 'docs/docs.json') return { text: docsJson };
    if (p === 'docs/surfacing.json') return { text: surfJson };
    if (p === 'state/sessions.json') return { text: JSON.stringify(sessions) };
    return { text: JSON.stringify(manifest) };
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



test('the hub doc link resolves to a GitHub blob', () => {
  assert.equal(data.hubUrl('docs/PORTABLE.md'),
    'https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md');
});

test('Showing loads on demand, not at mount', async () => {
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

test('Surfacing loads on demand and names its authoritative doc', async () => {
  assert.equal(data.surf, null, 'the index is not fetched until the tab is opened');
  await data.loadSurf();
  assert.equal(data.surfErr, '');
  assert.ok(data.surf.primitives.length > 10);
  assert.equal(data.SURF_DOC, 'docs/SURFACING.md');
});

test('Docs loads on demand and carries both tables', async () => {
  assert.equal(data.docsReg, null, 'the registry is not fetched until the tab is opened');
  await data.loadDocsReg();
  assert.equal(data.docsErr, '');
  assert.ok(data.docsReg.documents.length > 30);
  assert.ok(data.docsReg.claims.length > 3);
  const groups = data.docGroups;
  assert.equal(groups[0].dir, 'docs', 'the root docs group leads');
  assert.ok(groups.length > 3, 'subfolders group separately');
});

// ── Readership ──────────────────────────────────────────────────────────────
// The column is token-gated and its empty states carry meaning, so both halves
// are asserted: absent without a token, and never a bare zero on an injected
// doc, which is the case where the number would be exactly backwards.

test('without a token the census renders and the readership column does not', () => {
  assert.equal(data.hasToken(), false);
  assert.equal(data.docReads, null, 'no token, no column, no error');
  assert.equal(data.docsErr, '', 'the census is public and must not fail with it');
});

test('readership joins the repo-qualified cache path to the hub-relative registry row', async () => {
  window.__shell = { hasToken: () => true, REGISTRY_REPO: 'mehrlander/web-tools-private' };
  await data.loadDocReads();

  assert.equal(data.registry(), 'mehrlander/web-tools-private');
  assert.equal(data.docReadKey('docs/show-repo.md'), 'web-tools/docs/show-repo.md');
  assert.equal(data.docReadsSessions, 42);
  assert.equal(data.docReadLabel({ path: 'docs/show-repo.md', reach: 'project' }), '9 ×');
  assert.match(data.docReadHint({ path: 'docs/show-repo.md', reach: 'project' }), /9 of 42/);
  // Another repo's docs/ file is in the same rollup and must not be read as this one's.
  assert.equal(data.docReadLabel({ path: 'docs/elsewhere.md', reach: 'orphan' }), '—');
});

test('an injected doc says so instead of reporting the zero no file tool can avoid', () => {
  const injected = { path: 'docs/CONVENTIONS.md', reach: 'injected' };
  assert.equal(data.docReadLabel(injected), 'injected');
  assert.match(data.docReadHint(injected), /not zero/);
  // Unread is distinguishable from unmeasurable, since one is a finding and the
  // other is a limit of the instrument.
  assert.equal(data.docReadLabel({ path: 'docs/nobody-opens-this.md', reach: 'orphan' }), '—');
  assert.match(data.docReadHint({ path: 'docs/nobody-opens-this.md', reach: 'orphan' }), /No recorded session/);
});

test('an absent check renders as visibly absent, and only where one is owed', () => {
  // A copy with no check is the finding; a pointer or live read is fine bare.
  assert.equal(data.checkText({ relation: 'copy' }), 'unchecked');
  assert.match(data.checkTone({ relation: 'copy' }), /text-warning/);
  assert.match(data.checkTone({ relation: 'copy', check: 'none; two hand-kept copies' }), /text-warning/,
    'a check field explaining that none exists still reads as unchecked');
  assert.match(data.checkTone({ relation: 'copy', check: 'byte equality' }), /text-base-content/);
  assert.equal(data.checkText({ relation: 'pointer' }), 'no check needed');
  assert.match(data.checkTone({ relation: 'live read' }), /text-base-content/);
});

test('Showing rows resolve their icons and GitHub links', () => {
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
