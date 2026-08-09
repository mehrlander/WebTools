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
const ownersJson = readFileSync(path.join(repoRoot, 'docs', 'owners.json'), 'utf8');
const testsJson = readFileSync(path.join(repoRoot, 'docs', 'tests.json'), 'utf8');
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
    if (p === 'docs/owners.json') return { text: ownersJson };
    if (p === 'docs/tests.json') return { text: testsJson };
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

test('Docs loads on demand and carries the census', async () => {
  assert.equal(data.docsReg, null, 'the registry is not fetched until the tab is opened');
  await data.loadDocsReg();
  assert.equal(data.docsErr, '');
  assert.ok(data.docsReg.documents.length > 30);
});

// The two tabs shared a fetch while the owners table was a second block inside
// docs.json. Since 2026-08-09 each loads its own carrier, and the point of the
// split is that opening Docs does not pull owners and the reverse.
test('Owners loads its own carrier, separately from Docs', async () => {
  assert.equal(data.ownersReg, null, 'the registry is not fetched until the tab is opened');
  await data.loadOwnersReg();
  assert.equal(data.ownersErr, '');
  assert.ok(data.ownersReg.owners.length > 3);
  assert.ok(data.ownersReg.scope, 'the tab reads the scope from the carrier, not from its own prose');
  assert.equal(data.OWNERS_MANIFEST, 'docs/owners.json');
});

test('the Docs folder rail rolls up, nests, and prunes by reach without changing shape', () => {
  const folders = data.docFolders;
  assert.equal(folders[0].dir, 'docs', 'the root folder leads the rail');
  assert.ok(folders.length > 3, 'subfolders get their own rows');
  for (const f of folders) assert.equal(f.depth, f.dir.split('/').length - 1, f.dir);
  assert.equal(folders[0].n, data.docsReg.documents.length, 'the root rolls up the whole census');
  assert.equal(folders[0].words, data.docWordTotal, 'and the whole mass');

  assert.equal(data.docDir, 'docs', 'the root folder opens selected');
  assert.ok(data.docDirFiles.length > 0, 'the selected folder lists files');
  assert.ok(data.docDirFiles.every(d => d.path.slice('docs/'.length).indexOf('/') === -1),
    'direct files only; subfolder contents stay behind their rail rows');
  assert.ok(data.docDirGloss.length > 0, 'the folder gloss reads from its README row');

  data.docReach = 'orphan';
  const filtered = data.docFolders;
  assert.equal(filtered.length, folders.length, 'a filter moves counts, not the tree shape');
  assert.ok(filtered[0].n < folders[0].n, 'the rollup honors the filter');
  assert.ok(data.docDirFiles.every(d => d.reach === 'orphan'), 'the file list honors it too');
  data.docReach = '';

  assert.equal(data.folderGh('docs/envelopes'),
    'https://github.com/mehrlander/web-tools/tree/main/docs/envelopes',
    'a folder links to its GitHub tree at the read ref');
});

test('a row title opens the doc deck: full folder, tapped row first, rendered by kind, cached', async () => {
  // marked stubbed so the markdown path is deterministic and offline; the
  // component only lazily loads the CDN copy when window.marked is absent.
  window.marked = { parse: (t) => '<h1>md</h1><!-- ' + t.length + ' chars -->' };

  const fetchesBefore = asked.length;
  assert.match(await data.docDeckRead('docs/CONVENTIONS.md'), /prose/, 'markdown renders as prose');
  assert.ok((await data.docDeckRead('docs/docs.json')).startsWith('<pre'),
    'a JSON doc renders as source, not prose');
  const fetchesAfter = asked.length;
  await data.docDeckRead('docs/CONVENTIONS.md');
  assert.equal(asked.length, fetchesAfter, 're-reading hits the cache, not the network');
  assert.ok(fetchesAfter > fetchesBefore, 'first reads did fetch');

  const opened = [];
  window.swipeDeck = { open(o){ opened.push(o); return { close(){}, setSubtitle(){}, deck: {}, el: {} }; } };
  const files = data.docDirFiles;
  await data.openDocDeck(files[2]);
  const o = opened[0];
  assert.equal(o.count, files.length, 'the deck pages the whole selected folder');
  assert.equal(o.start, 2, 'and opens on the tapped row');
  assert.equal(o.title, 'docs/');

  const slide = window.document.createElement('div');
  o.render(2, slide);
  await tick(3);
  assert.ok(slide.textContent.includes(files[2].path), 'a slide leads with its path');
  assert.ok(/prose|<pre/.test(slide.querySelector('[data-deck-content]').innerHTML),
    'and carries the rendered document');
  delete window.marked;
  delete window.swipeDeck;
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
  assert.equal(data.docReadLabel({ path: 'docs/show-repo.md', reach: 'project' }), '9 reads');
  assert.match(data.docReadHint({ path: 'docs/show-repo.md', reach: 'project' }), /9 of 42/);
  assert.match(data.docReadHint({ path: 'docs/show-repo.md', reach: 'project' }), /file tools only/,
    'the counting caveat moved from the retired standing paragraph into the title');
  // Another repo's docs/ file is in the same rollup and must not be read as this one's.
  assert.equal(data.docReadLabel({ path: 'docs/elsewhere.md', reach: 'orphan' }), '');
});

test('an injected doc says so instead of reporting the zero no file tool can avoid', () => {
  const injected = { path: 'docs/CONVENTIONS.md', reach: 'injected' };
  assert.equal(data.docReadLabel(injected), 'injected');
  assert.match(data.docReadHint(injected), /not zero/);
  // Unmeasurable stays distinguishable from unread: injected carries a word,
  // a never-opened doc shows nothing at all (the tail hides on empty).
  assert.equal(data.docReadLabel({ path: 'docs/nobody-opens-this.md', reach: 'orphan' }), '');
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

// ── The tab in the URL ───────────────────────────────────────────────────────
// The Map's open tab is addressable (?view=map&tab=docs) on the same `tab` key
// the project view uses, and the feature spans two files: the shell owns the
// URL and validates the param, map() renders whichever tab is set and fetches
// its manifest. Both halves are asserted here, since a passing half is exactly
// the failure mode (a stamped URL nothing reads, or a rendered tab with no
// address). The shell's app() lives inline in show-repo.html, hence the
// show-repo-shell.mjs harness.
const { page, makeShell } = await import('./show-repo-shell.mjs');

test('a tab tap renders, loads, and hands the tab to the shell', async () => {
  const taps = [];
  window.__shell = { mapTab: 'set', goMapTab: (t) => taps.push(t) };
  const el2 = window.document.createElement('div');
  el2.setAttribute('x-data', 'map()');
  window.document.body.appendChild(el2);
  Alpine.initTree(el2);
  await tick(2);
  const d2 = Alpine.$data(el2);
  assert.equal(d2.mapTab, 'set', 'the shell says set, so the set renders');

  d2.setTab('docs');
  await tick(2);
  assert.equal(d2.mapTab, 'docs');
  assert.deepEqual([...taps], ['docs'], 'the shell is told, so the URL gets stamped');
  assert.ok(d2.docsReg, 'the tab fetched its own manifest');

  d2.setTab('docs');
  assert.deepEqual([...taps], ['docs'], 're-tapping the open tab is not a navigation');
  window.__shell = undefined;
});

test('a deep-linked tab opens on that tab and fetches its manifest', async () => {
  // The click handler is what used to fetch, and it does not run when the URL
  // picked the tab, so mount has to cover it or the pane renders empty.
  window.__shell = { mapTab: 'tests', goMapTab: () => {} };
  const el3 = window.document.createElement('div');
  el3.setAttribute('x-data', 'map()');
  window.document.body.appendChild(el3);
  Alpine.initTree(el3);
  await tick(3);
  const d3 = Alpine.$data(el3);
  assert.equal(d3.mapTab, 'tests');
  assert.ok(d3.testsReg, 'the deep-linked tab loaded without a tap');
  window.__shell = undefined;
});

test('the shell stamps ?tab= for every tab but the default', () => {
  const { shell, history } = makeShell();
  const stamped = [];
  history.pushState = (a, b, url) => stamped.push(url);
  history.replaceState = (a, b, url) => stamped.push(url);

  shell.goMap();
  assert.equal(shell.mapTab, 'set');
  assert.doesNotMatch(stamped.at(-1), /tab=/, 'the default stays out of the URL');
  assert.match(stamped.at(-1), /view=map/);

  shell.goMapTab('docs');
  assert.match(stamped.at(-1), /view=map&tab=docs|tab=docs/);

  // The nav button calls goMap() with nothing and must KEEP the open tab;
  // only a route call (which always passes url.tab) is authoritative.
  shell.goMap();
  assert.equal(shell.mapTab, 'docs', 'returning to Map does not reset the tab');
  shell.goMap('');
  assert.equal(shell.mapTab, 'set', 'an absent param means the default');

  shell.goMap('bogus');
  assert.equal(shell.mapTab, 'set', 'an unknown tab falls back rather than hiding every section');

  // Leaving the view drops the key rather than stranding it on the next URL.
  shell.mapTab = 'docs';
  shell.view = 'landing';
  shell.syncUrl();
  assert.doesNotMatch(stamped.at(-1), /tab=/);
});

test('the shell reads the tab back off a deep link, on both boot paths', () => {
  const { shell } = makeShell({ search: '?view=map&tab=docs' });
  const url = shell.parseUrl();
  assert.equal(url.view, 'map');
  assert.equal(url.tab, 'docs');
  assert.equal([...page.matchAll(/this\.goMap\(url\.tab\)/g)].length, 2,
    'init and popstate no longer route the tab');
});

test('the shell and the component agree on the tab set', () => {
  const m = page.match(/const MAP_TABS = \[([^\]]+)\]/);
  assert.ok(m, 'MAP_TABS is not where the shell can validate against it');
  const tabs = m[1].split(',').map(s => s.trim().replace(/'/g, ''));
  const src = readFileSync(path.join(repoRoot, 'lib/alpineComponents/map.js'), 'utf8');
  for (const t of tabs) {
    assert.ok(src.includes(`setTab('${t}')`), `no tab button renders ${t}`);
    assert.ok(src.includes(`mapTab==='${t}'`), `no section renders ${t}`);
  }
  const buttons = [...src.matchAll(/setTab\('(\w+)'\)/g)].map(x => x[1]);
  assert.deepEqual([...new Set(buttons)].sort(), [...tabs].sort(),
    'a tab the shell will not validate is a tab the URL cannot carry');
});
