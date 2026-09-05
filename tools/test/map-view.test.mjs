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
import { makeWindow, tick, repoRoot, captureAlpineErrors } from './bootstrap.mjs';

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="map" x-data="map()"></div>
  </body></html>`,
});

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
captureAlpineErrors(Alpine);
window.Alpine = Alpine;

// The stub serves CSV for the CSV-backed registries, so it has to emit some.
const toCsv = (rows) => {
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const cell = v => /[",\n]/.test(v ?? '') ? '"' + String(v).replace(/"/g, '""') + '"' : (v ?? '');
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n') + '\n';
};

// A CSV fixture since 2026-08-16, because that is what the tab now parses. The
// hub and plugin keys went with the format: a CSV holds rows, and both were
// copies of .claude-plugin/marketplace.json anyway.
const manifest = {
  items: [
    { kind: 'skill', command: '/portable:tasks', path: '.claude/skills/tasks/SKILL.md', title: 'tasks', role: 'the tracker', use: 'plugin' },
    { kind: 'doc', path: 'docs/CONVENTIONS.md', title: 'Working conventions', role: 'the conventions', use: 'live' },
    { kind: 'script', path: 'scripts/sunset-scan.py', title: 'sunset-scan.py', role: 'sunset markers', use: 'on-demand' },
  ],
};
// The Showing and Docs tabs read the real docs/routes.json and docs/docs.csv,
// so the stub serves by path: the set gets the fixture above, the other two
// tabs get the committed manifests (routes-manifest.test.mjs and
// docs-registry.test.mjs are what hold those files to their own shapes).
const routesJson = readFileSync(path.join(repoRoot, 'docs', 'routes.json'), 'utf8');
// The Showing tab assembles one object from four carriers, so all four are
// served; a stub that answered only routes.json would leave the tables empty
// and every row assertion below would pass on nothing.
const routesModesCsv = readFileSync(path.join(repoRoot, 'docs', 'routes-modes.csv'), 'utf8');
const routesRoutesCsv = readFileSync(path.join(repoRoot, 'docs', 'routes-routes.csv'), 'utf8');
const routesKindsCsv = readFileSync(path.join(repoRoot, 'docs', 'routes-kinds.csv'), 'utf8');
const mechanismsCsv = readFileSync(path.join(repoRoot, 'docs', 'showing-mechanisms.csv'), 'utf8');
const docsCsv = readFileSync(path.join(repoRoot, 'docs', 'docs.csv'), 'utf8');
const surfCsv = readFileSync(path.join(repoRoot, 'docs', 'surfacing.csv'), 'utf8');
const surfDoc = readFileSync(path.join(repoRoot, 'docs', 'SURFACING.md'), 'utf8');
const ownersCsv = readFileSync(path.join(repoRoot, 'docs', 'owners.csv'), 'utf8');
const repsCsv = readFileSync(path.join(repoRoot, 'docs', 'repetitions.csv'), 'utf8');
const propsRegCsv = readFileSync(path.join(repoRoot, 'docs', 'registries.csv'), 'utf8');
const propsDeclCsv = readFileSync(path.join(repoRoot, 'docs', 'properties.csv'), 'utf8');
const propsVocabCsv = readFileSync(path.join(repoRoot, 'docs', 'vocabularies.csv'), 'utf8');
const skillsCsv = readFileSync(path.join(repoRoot, 'skills', 'manifest.csv'), 'utf8');
const textFieldsCsv = readFileSync(path.join(repoRoot, 'docs', 'text-fields.csv'), 'utf8');
const testsCsv = readFileSync(path.join(repoRoot, 'docs', 'tests.csv'), 'utf8');
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
    if (p === 'docs/routes-modes.csv') return { text: routesModesCsv };
    if (p === 'docs/routes-routes.csv') return { text: routesRoutesCsv };
    if (p === 'docs/routes-kinds.csv') return { text: routesKindsCsv };
    if (p === 'docs/showing-mechanisms.csv') return { text: mechanismsCsv };
    if (p === 'docs/docs.csv') return { text: docsCsv };
    if (p === 'docs/surfacing.csv') return { text: surfCsv };
    if (p === 'docs/SURFACING.md') return { text: surfDoc };
    if (p === 'docs/owners.csv') return { text: ownersCsv };
    if (p === 'docs/repetitions.csv') return { text: repsCsv };
    if (p === 'docs/registries.csv') return { text: propsRegCsv };
    if (p === 'docs/properties.csv') return { text: propsDeclCsv };
    if (p === 'docs/vocabularies.csv') return { text: propsVocabCsv };
    if (p === 'skills/manifest.csv') return { text: skillsCsv };
    if (p === 'docs/text-fields.csv') return { text: textFieldsCsv };
    if (p === 'docs/tests.csv') return { text: testsCsv };
    if (p === 'state/sessions.json') return { text: JSON.stringify(sessions) };
    return { text: toCsv(manifest.items) };
  }
};
// No window.__shell in the test, so hasToken() is falsy and the token-gated
// adoption probe never runs; only the public set half loads.

// The Registries tab reads three CSVs, so the kit that parses them has to be in
// the window the same way the pre-build puts it there.
new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/csv.js'), 'utf8'))();
// The ambient bundle, in the same position gh-boot's BOOT manifest gives it
// (first): the doc deck's rendition escapes through window.esc.
new window.Function(readFileSync(path.join(repoRoot, 'lib/vanilla-bundle.js'), 'utf8'))();
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

// The Markdown copy is a second rendering of docs/aims.json, so it is built
// from the manifest rather than scraped off the page. Asserted whole: a
// per-line check would pass on a rendering that lost the goal numbering.
test('the Aims tab renders its manifest as Markdown', () => {
  data.aims = { mission: 'M.', goals: [
    { key: 'a', name: 'One', gloss: 'First.' },
    { key: 'b', name: 'Two', gloss: 'Second.' },
  ], reading: [
    { path: 'docs/X.md', gloss: 'Hub doc.' },
    { repo: 'mehrlander/home', path: 'created/Y.md', private: true, gloss: 'Elsewhere.' },
  ] };
  assert.equal(data.aimsMd(),
    '# Aims\n\n## Mission\n\nM.\n\n## Goals\n\n1. **One.** First.\n2. **Two.** Second.\n'
    + '\n## Reading\n\n'
    + '- [docs/X.md](' + data.hubUrl('docs/X.md') + ') Hub doc.\n'
    + '- [mehrlander/home created/Y.md](https://github.com/mehrlander/home/blob/main/created/Y.md)'
    + ' (private) Elsewhere.\n');
  data.aims = null;
  assert.equal(data.aimsMd(), '', 'nothing loaded copies nothing rather than a heading');
});

test('the set groups into plugin / docs / scripts sections', () => {
  const secs = data.setSections;
  // [...] rebuilds the realm-crossed array on this side for deepEqual.
  assert.deepEqual([...secs.map(s => s.label)], ['In the plugin', 'Docs', 'Scripts']);
  assert.equal(secs[0].items[0].title, 'tasks');
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

// The kinds table is the fourth carrier the Showing tab assembles, and the one
// whose cells are mostly blank: `aim` is carried by one kind of eleven and `kit`
// by three. Every x-show in the template tests the string, so this checks that
// the sparse rows survive the parse rather than that the tab has content.
test('Showing carries the kinds, and the sparse cells survive the parse', () => {
  const kinds = data.routes.kinds;
  assert.ok(kinds.length > 8, 'the kinds table did not load');
  const md = kinds.find(k => k.kind === 'markdown');
  assert.equal(md.aim, 'section');
  assert.equal(md.aim_label, 'Markdown section');
  assert.equal(md.kit, 'lib/kits/md-doc.js');
  // The join columns, which are what put this table on this tab rather than a
  // tab of its own. routes-manifest.test.mjs checks they RESOLVE; this checks
  // the app is handed them at all.
  assert.ok(md.shown_by.split(';').filter(Boolean).length > 0);
  // Source code is the second kind, and it is the one that shows the aim column
  // is optional rather than unfilled: it declares (so it has a kit) and offers
  // no gesture of its own, since a line range is what a text selection already
  // spans. `delimited` is the other shape, a kind nothing declares yet.
  const code = kinds.find(k => k.kind === 'code');
  assert.equal(code.kit, 'lib/kits/code-doc.js');
  assert.equal(code.aim, '', 'a kind with no added aim carries an empty cell, not a missing one');
  assert.equal(kinds.find(k => k.kind === 'delimited').kit, '',
    'a kind nothing declares yet carries a blank, which the card renders as absence');
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

// The cards index one region of the doc, and the tab says so with a door to
// each of the others. The doors are read off the doc's h2 headings, so this
// holds two things: the list IS the doc's headings minus the primitives, and
// every gloss the tab keeps about WHEN a region arrives names a heading that
// exists. A renamed heading fails here rather than leaving a gloss orphaned.
test('Surfacing derives its region doors from the doc, and every gloss names a real heading', async () => {
  await data.loadSurf();
  const headings = [...surfDoc.matchAll(/^## (.+?)\s*$/gm)].map(m => m[1]);
  // Serialized, since the component's arrays come back through Alpine's proxy
  // and deepEqual reads the prototype before it reads the strings.
  assert.equal(JSON.stringify(Array.from(data.surf.regions, r => r.heading)),
    JSON.stringify(headings.filter(h => h !== 'Surfacing primitives')),
    'one door per region of the doc, the primitives excepted');
  for (const h of Object.keys(data.SURF_REGION_GLOSS))
    assert.ok(headings.includes(h), 'gloss for a heading the doc does not carry: ' + h);
  assert.ok(data.surf.regions.some(r => r.gloss), 'at least one door says when its region arrives');
});

test('Docs loads on demand and carries the registry', async () => {
  assert.equal(data.docsReg, null, 'the registry is not fetched until the tab is opened');
  await data.loadDocsReg();
  assert.equal(data.docsErr, '');
  assert.ok(data.docsReg.documents.length > 30);
});

// The two tabs shared a fetch while the owners table was a second block inside
// docs.csv. Since 2026-08-09 each loads its own file, and the point of the
// split is that opening Docs does not pull owners and the reverse.
test('Owners loads its own carrier, separately from Docs', async () => {
  assert.equal(data.ownersReg, null, 'the registry is not fetched until the tab is opened');
  await data.loadOwnersReg();
  assert.equal(data.ownersErr, '');
  assert.ok(data.ownersReg.owners.length > 3);
  // Two files, not three: the tab pulled docs/registries.csv as well while its
  // header carried a scope line, and stopped on 2026-08-26 when the header came
  // off. The scope is read on the Registries tab, where every registry's is.
  assert.equal(data.propsReg, null, 'opening Claims does not pull the registry pair');
  assert.equal(data.OWNERS_MANIFEST, 'docs/owners.csv');
  assert.equal(data.OWNERS_REPS, 'docs/repetitions.csv');
});

test('the Docs folder rail rolls up, nests, and prunes by reach without changing shape', () => {
  const folders = data.docFolders;
  assert.equal(folders[0].dir, 'docs', 'the root folder leads the rail');
  assert.ok(folders.length > 3, 'subfolders get their own rows');
  for (const f of folders) assert.equal(f.depth, f.dir.split('/').length - 1, f.dir);
  assert.equal(folders[0].n, data.docsReg.documents.length, 'the root rolls up the whole registry');
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

  // MOUNTED, not returned: the section controls kits/md-doc.js hangs on each
  // heading are listeners on real nodes, so the renderer fills a box it is
  // handed rather than handing back a string somebody would innerHTML.
  const into = () => window.document.createElement('div');
  const fetchesBefore = asked.length;
  const mdBox = into();
  await data.docDeckRead(mdBox, 'docs/CONVENTIONS.md');
  assert.match(mdBox.innerHTML, /prose/, 'markdown renders as prose');
  // A CSV renders as a TABLE since 2026-09-04, not as the <pre> this used to
  // assert: docs/ holds a dozen registries and the deck showed every one of
  // them as wrapped raw text. It reaches prose by conversion, so the marked
  // stub above is what proves the markdown path ran.
  const csvBox = into();
  await data.docDeckRead(csvBox, 'docs/docs.csv');
  assert.match(csvBox.innerHTML, /prose/, 'a CSV doc renders as a table, not raw source');
  const fetchesAfter = asked.length;
  await data.docDeckRead(into(), 'docs/CONVENTIONS.md');
  assert.equal(asked.length, fetchesAfter, 're-reading hits the cache, not the network');
  assert.ok(fetchesAfter > fetchesBefore, 'first reads did fetch');

  // The address a copied section carries: assembled by the deck, since it is
  // the only place that knows the repo, the ref, the path and the blob URL at
  // once. mdDoc adds the line span to it.
  const addr = data.docDeckAddr('docs/CONVENTIONS.md');
  assert.equal(addr.repo, 'mehrlander/web-tools');
  assert.equal(addr.ref, 'main');
  assert.equal(addr.path, 'docs/CONVENTIONS.md');
  assert.equal(addr.url, data.hubUrl('docs/CONVENTIONS.md'));

  const opened = [];
  window.swipeDeck = { open(o){
    opened.push(o);
    return { close(){}, setTitle(){}, setSubtitle(){}, setLink(){},
             deck: { active: () => 2 }, el: {} };
  } };
  const files = data.docDirFiles;
  await data.openDocDeck(files[2]);
  const o = opened[0];
  assert.equal(o.count, files.length, 'the deck pages the whole selected folder');
  assert.equal(o.start, 2, 'and opens on the tapped row');

  // THE NAME IS SAID ONCE. The header used to carry the folder as its title and
  // the whole path as its subtitle, and the slide then printed the path a third
  // time; the file-name/folder split is the one kits/file-deck.js had already
  // settled for the changeset deck.
  const name = files[2].path.slice(files[2].path.lastIndexOf('/') + 1);
  assert.equal(o.title, name, 'the title is the file, not the folder');
  assert.equal(o.subtitle, 'docs', 'and the folder rides the crumb');
  assert.equal(o.link.href, data.hubUrl(files[2].path),
    'GitHub is a header link now, not a mark inside the reading surface');
  assert.ok(o.actions.some(a => typeof a.onClick === 'function'),
    'and the reference menu is a header action');

  // The contents labeler: one call per row, and the gloss is the registry's own
  // subject rather than a second copy of the path.
  assert.equal(typeof o.index, 'function', 'the deck can list itself');
  const row = o.index(2);
  assert.equal(row.title, name);
  assert.equal(row.subtitle, files[2].subject, 'a row says what the doc is about');

  const slide = window.document.createElement('div');
  o.render(2, slide);
  await tick(3);
  assert.ok(!slide.textContent.includes(files[2].path),
    'the slide does not repeat the path the header already carries');
  assert.ok(/prose|<pre/.test(slide.querySelector('[data-deck-content]').innerHTML),
    'and carries the rendered document');
  delete window.marked;
  delete window.swipeDeck;
});

// ── Readership ──────────────────────────────────────────────────────────────
// The column is token-gated and its empty states carry meaning, so both halves
// are asserted: absent without a token, and never a bare zero on an injected
// doc, which is the case where the number would be exactly backwards.

test('without a token the registry renders and the readership column does not', () => {
  assert.equal(data.hasToken(), false);
  assert.equal(data.docReads, null, 'no token, no column, no error');
  assert.equal(data.docsErr, '', 'the registry is public and must not fail with it');
});

test('readership joins the repo-qualified cache path to the hub-relative registry row', async () => {
  window.__shell = { hasToken: () => true, REGISTRY_REPO: 'mehrlander/web-tools-private' };
  await data.loadDocReads();

  assert.equal(data.registry(), 'mehrlander/web-tools-private');
  assert.equal(data.docReadKey('docs/show-repo.md'), 'web-tools/docs/show-repo.md');
  assert.equal(data.docReadsSessions, 42);
  assert.equal(data.docReadLabel({ path: 'docs/show-repo.md', reach: 'project' }), '9 reads');
  assert.match(data.docReadHint({ path: 'docs/show-repo.md', reach: 'project' }), /9 of 42/);
  assert.match(data.docReadHint({ path: 'docs/show-repo.md', reach: 'project' }), /shell reads/,
    'the counting caveat moved from the retired standing paragraph into the title, and names both channels');
  // Another repo's docs/ file is in the same rollup and must not be read as this one's.
  assert.equal(data.docReadLabel({ path: 'docs/elsewhere.md', reach: 'orphan' }), '');
});

// The label used to close with "not measurable here, and not zero". The first
// half is a fact about this column; the second was a claim about a delivery
// path nothing was checking, and it was false from 2026-08-07, when the hook
// carrying both documents began arriving as a 2 KB preview of 36 KB. So what is
// pinned here is that the label states the limit rather than vouching for the
// channel: a tooltip is a bad place to keep a promise nothing enforces.
test('an injected doc says what this column cannot see, not that the text arrived', () => {
  const injected = { path: 'docs/CONVENTIONS.md', reach: 'injected' };
  assert.equal(data.docReadLabel(injected), 'injected');
  assert.match(data.docReadHint(injected), /cannot measure it/);
  assert.doesNotMatch(data.docReadHint(injected), /not zero/,
    'the retired half: never vouch for a delivery path from a tooltip');
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

// The grammar is the load-bearing half of routes.json now that the three tables
// have moved out, so it is what the loader checks before trusting the object.
test('a routes manifest missing its grammar block surfaces an error, not a blank tab', async () => {
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
  assert.match(d2.routesErr, /no grammar block/);
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
// address). The shell's app() lives inline in app/index.html, hence the
// shell.mjs harness.
const { page, makeShell } = await import('./shell.mjs');

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
  // Boot and popstate share one dispatch through the VIEWS table, so routing
  // the tab is the map row's job rather than a line copied into two chains.
  // That the two paths cannot disagree is shell-routing.test.mjs's beat.
  shell.routeFor('map').open.call(shell, url);
  assert.equal(shell.mapTab, 'docs', 'the map row does not route the tab off the URL');
});

test('the shell and the component agree on the tab set', () => {
  const m = page.match(/const MAP_TABS = \[([^\]]+)\]/);
  assert.ok(m, 'MAP_TABS is not where the shell can validate against it');
  const tabs = m[1].split(',').map(s => s.trim().replace(/'/g, ''));
  const src = readFileSync(path.join(repoRoot, 'lib/alpineComponents/map.js'), 'utf8');
  // The strip became one x-for over TABS on 2026-08-31, so the component's tab
  // set is that array rather than twelve setTab literals. map-tabs.test.mjs
  // holds the array against the sections; this holds it against the shell.
  for (const t of tabs) {
    assert.ok(src.includes(`{ k: '${t}',`), `no TABS entry declares ${t}`);
    assert.ok(src.includes(`mapTab==='${t}'`), `no section renders ${t}`);
  }
  const buttons = [...src.matchAll(/\{ k: '(\w+)', n: '[^']+', i: '[^']+',\s*\n\s*g: '/g)].map(x => x[1]);
  assert.deepEqual([...new Set(buttons)].sort(), [...tabs].sort(),
    'a tab the shell will not validate is a tab the URL cannot carry');
});

// The Registries tab renders the table the other seven hang off, so its shape
// assertions are about the JOIN (declarations grouped under their registry),
// not about any one manifest.
test('Registries groups declarations under the registry that governs them', async () => {
  // Not asserted null here any more: the Owners tab reads its scope from the
  // registry row, so opening Owners loads the pair too. That coupling is the
  // price of the scope having one owner instead of a copy in each file.
  data.propsReg = null;
  await data.loadPropsReg();
  assert.equal(data.propsErr, '');

  const rows = data.registryRows;
  assert.equal(rows.length, data.propsReg.registries.length, 'every registry gets a row');
  for (const r of rows) {
    assert.ok(r.target, r.id + ': a row carries its target grain');
    assert.ok(r.scope, r.id + ': a row carries its scope');
  }
  // The join must not drop or duplicate a declaration.
  const grouped = rows.reduce((n, r) => n + r.decls.length, 0);
  assert.equal(grouped, data.propsReg.properties.length,
    'every declaration lands under exactly one registry row');

  const t = data.registryTotals;
  // `membership` is one question with two answers, so it partitions cleanly. It
  // needed a union to do that before 2026-08-18, when `crosswalk` was a third
  // value of the same column while being an answer to a different question.
  assert.equal(t.computed + t.curated, t.registries,
    'every registry is computed or curated, with nothing left over');
  // Inheritance is the other question, and it cuts across the first rather than
  // partitioning it: some curated registries borrow descriptions, most do not.
  assert.ok(t.inheriting > 0 && t.inheriting < t.curated,
    'some registries inherit descriptions, and not every curated one does');
  assert.equal(t.decls, grouped);
  assert.ok(t.closed > 0 && t.closed <= t.decls);
});

// The gate the carrier/path rename walked straight through. `carrier` became
// `path` on 2026-08-16 and the template kept reading `r.carrier`, so for three
// days every card's file link rendered empty text pointing at
// /blob/main/undefined, and the whole suite stayed green: the assertions above
// hold the ROW to the model, and nothing held the TEMPLATE to the row.
//
// So this reads the markup as data. Every `r.<field>` inside the Registries
// section must be a key the model actually puts on a row. It is deliberately
// the row object's own keys rather than a written list, because a written list
// is the same class of thing that broke: a second place to remember.
// The legend replaced a prose vocabulary table on 2026-08-19, so these are the
// checks that make the deletion safe. If the derivation breaks or a domain
// value loses its gloss, the tab silently shows a bare token and the document
// that used to explain it is gone: the failure mode of moving prose into data
// is that nothing notices when the data stops saying as much as the prose did.
// A property's gloss moved out of a title attribute and onto the card on
// 2026-08-19. The assertion is that every declaration reaches the markup with
// its definition attached, since the failure being fixed was a definition that
// was committed, joined, and reachable only by hovering one chip at a time.
test('every property on a card carries its own definition', async () => {
  await data.loadPropsReg();
  for (const r of data.registryRows) {
    assert.ok(r.decls.length, r.id + ': a registry declares at least one property');
    for (const d of r.decls)
      assert.ok(d.gloss, r.id + '.' + d.property + ': reaches the card with its gloss');
  }
});

// The text-field vocabulary joined onto a property name, so a column says which
// KIND of prose it holds. The assertion that matters is the one about aliases:
// text-vocabulary-conformance.test.mjs gates only the unclaimed class and
// passes an alias on purpose, so eighteen names here resolve through
// `instead_of` and every one of them conforms. A tab that rendered those as
// warnings would invent eighteen defects the gate deliberately does not raise.
test('a property name resolves to its prose kind, aliases included', async () => {
  await data.loadPropsReg();
  const kinds = data.propsReg.kinds;

  // Sanctioned names resolve to themselves.
  assert.equal(kinds.get('gloss')?.kind, 'gloss');
  // An alias resolves to the kind it is an alias OF, and conforms.
  assert.equal(kinds.get('description')?.kind, 'gloss');
  assert.equal(kinds.get('summary')?.kind, 'gloss');

  const all = data.registryRows.flatMap(r => r.decls);
  const resolved = all.filter(d => d.textKind);
  assert.ok(resolved.length > 20, 'the join reaches a real share of the columns');
  assert.ok(resolved.length < all.length,
    'not every column is prose-bearing, so a blank kind is the normal state');
});

test('the Registries legend defines the tab\'s own columns from the pair', async () => {
  await data.loadPropsReg();
  const legend = data.registryLegend;
  assert.ok(legend.length >= 10, 'a registry row has its columns defined');
  for (const d of legend) assert.ok(d.gloss, d.property + ': every legend row carries its gloss');

  // The membership split is the load-bearing one, and it is the example of a
  // definition that lived in prose: the value alone does not say why only a
  // computed set can carry a coverage gate.
  const membership = legend.find(d => d.property === 'membership');
  assert.equal(membership.domain.map(v => v.value).join(','), 'computed,curated');
  for (const v of membership.domain) assert.ok(v.gloss, v.value + ' is glossed, not just listed');

  assert.ok(data.propertyLegend.find(d => d.property === 'required')?.domain.length === 3,
    'the property grain defines its own required domain too');
});

test('every closed domain on the registry pair carries a value gloss', async () => {
  await data.loadPropsReg();
  const bare = [];
  for (const id of ['registries', 'properties']) {
    for (const d of data.legendFor(id)) {
      for (const v of d.domain) if (!v.gloss) bare.push(id + '.' + d.property + '=' + v.value);
    }
  }
  // Narrow to the pair on purpose: vocabularies.csv's own scope says a domain
  // whose values speak for themselves needs no rows, and that stays true
  // everywhere else. The pair is the exception because its legend is now the
  // ONLY place these values are defined.
  assert.equal(bare.join(', '), '', 'undefined values on the pair: ' + bare.join(', '));
});

// A JS template literal cannot hold a backtick, and the Registries section's
// own header comment says so, which did not stop this pass from putting four
// in a markup comment and taking the whole component down with a SyntaxError.
// A warning that has already been ignored once is a check waiting to be
// written.
test('the Map template holds no backtick', () => {
  const src = readFileSync(path.join(repoRoot, 'lib', 'alpineComponents', 'map.js'), 'utf8');
  const start = src.indexOf('template: `');
  const body = src.slice(start + 'template: `'.length);
  const literal = body.slice(0, body.indexOf('`'));
  // A length threshold is not the check: a stray backtick 660 lines in still
  // leaves thousands of characters behind it, which is how the first version of
  // this test passed while the component was failing to parse. Name a marker
  // from the LAST tab instead, so the literal has to reach its real end.
  assert.ok(literal.includes(`x-show="mapTab==='registries'"`),
    'the template literal reaches its last section, so no stray backtick closed it early');
});

// The Skills tab, added 2026-08-19 for the one registry whose absence read as
// coverage: the Portable tab renders the plugin's skills and this renders the
// on-demand library, and the two sets share no member. The disjointness is the
// assertion worth holding, because the moment they overlap the tab is a
// duplicate rather than the only view of a population.
test('Skills renders the library, which is disjoint from the plugin set', async () => {
  assert.equal(data.skillsReg, null, 'the library is not fetched until the tab is opened');
  await data.loadSkillsReg();
  assert.equal(data.skillsErr, '');
  assert.ok(data.skillsReg.length > 20, 'the library is the larger set');
  for (const s of data.skillsReg)
    assert.ok(s.name && s.description, s.name + ': a row carries its trigger description');

  // The same parser the tab uses, already booted here, rather than a second
  // one written for the test.
  const plugin = new Set(window.Csv.rows(readFileSync(path.join(repoRoot, 'docs', 'portable.csv'), 'utf8'))
    .filter(r => r.kind === 'skill').map(r => r.title));
  const both = data.skillsReg.map(s => s.name).filter(n => plugin.has(n));
  assert.equal(both.join(', '), '',
    'a skill in both sets means this tab duplicates Portable: ' + both.join(', '));
});

test('the Skills search matches the trigger text, not only the slug', async () => {
  await data.loadSkillsReg();
  const all = data.skillRows.length;
  assert.equal(all, data.skillsReg.length, 'an empty query filters nothing');

  // A word that appears in a description and in no slug: the whole reason the
  // description is held in the manifest rather than fetched per skill.
  data.skillQ = 'spreadsheet';
  const hits = data.skillRows;
  data.skillQ = '';
  assert.ok(hits.length > 0 && hits.length < all, 'a body word narrows the list');
  assert.ok(hits.every(s => (s.name + ' ' + s.description).toLowerCase().includes('spreadsheet')));
});

test('every field the Registries markup reads exists on a registry row', async () => {
  await data.loadPropsReg();
  const row = data.registryRows[0];
  assert.ok(row, 'a row to check the markup against');

  const src = readFileSync(path.join(repoRoot, 'lib', 'alpineComponents', 'map.js'), 'utf8');
  const start = src.indexOf(`x-show="mapTab==='registries'"`);
  assert.ok(start > 0, 'the Registries section is findable in the template');
  const section = src.slice(start, src.indexOf('</section>', start));

  const read = [...new Set([...section.matchAll(/\br\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]))];
  assert.ok(read.length > 5, 'the section reads several fields off the row');
  const missing = read.filter(f => !(f in row));
  assert.equal(missing.join(', '), '', 'markup reads fields the row does not carry: ' + missing.join(', '));
});


// ── The CSV rendition ────────────────────────────────────────────────────
// The deck's markdown path renders a registry as a table, and the risk in that
// conversion is not layout: it is a cell being READ as markdown. docs/ holds a
// dozen registries and several of them describe markdown, so the first pass
// turned surfacing.csv's own `[caption](url)` into a link labelled "caption",
// which is a file misreporting itself in the one view meant to show it whole.

test('a registry converts to a table with a delimiter row', () => {
  const md = data.csvToMarkdown('a,b\nx,y\n');
  assert.deepEqual(md.split('\n'), ['| a | b |', '| --- | --- |', '| x | y |']);
});

test('a cell is data, so its markdown is escaped rather than run', () => {
  const md = data.csvToMarkdown('key,use\nk,"Explicit [caption](url), **bold**, a_b and `code`"\n');
  assert.match(md, /\\\[caption\\\]\(url\)/, 'brackets survive as brackets');
  assert.match(md, /\\\*\\\*bold\\\*\\\*/, 'asterisks are not emphasis');
  assert.match(md, /a\\_b/, 'an underscore in an identifier is not emphasis');
  assert.match(md, /\\`code\\`/, 'a backtick is not a code span');
});

test('a pipe inside a cell does not split the row', () => {
  // surfacing.csv carries `#gz= | #gh=` in one field; unescaped it would read
  // as two columns and shift every cell after it.
  const md = data.csvToMarkdown('key,form\nk,"#gz= | #gh="\n');
  const row = md.split('\n')[2];
  assert.equal(row, '| k | #gz= \\| #gh= |');
  assert.equal(row.split(/(?<!\\)\|/).length - 2, 2, 'two columns, not three');
});

test('a ragged row is padded to the widest, never truncated to the header', () => {
  // A row with a field the header does not name is a file that has drifted, and
  // dropping the field would hide the drift.
  const md = data.csvToMarkdown('a,b\nx,y,z\n');
  assert.deepEqual(md.split('\n'), ['| a | b |   |', '| --- | --- | --- |', '| x | y | z |']);
});

test('what is not a table declines rather than rendering as one', () => {
  // The caller falls back to the source rendition on null, so a one-column or
  // header-only file stays what it is.
  assert.equal(data.csvToMarkdown('just a header\n'), null, 'no rows');
  assert.equal(data.csvToMarkdown('one\ncolumn\n'), null, 'one column is a list');
  assert.equal(data.csvToMarkdown(''), null);
});

// ── A card and its bullet ────────────────────────────────────────────────
// The corpus half (does every card resolve against the rendered doc) is
// surfacing-lead-anchor.test.mjs, which renders SURFACING.md for real. This is
// the component half: the normalization and the selector the card actually
// calls, plus the one failure mode that matters, which is a hit on the wrong
// bullet rather than a miss.

test('the lead key is normalized the way the manifest gate normalizes it', () => {
  assert.equal(data.leadKey('Reference is a link.'), 'Reference is a link');
  assert.equal(data.leadKey('Boundary:'), 'Boundary');
  assert.equal(data.leadKey('  Show pixels.  '), 'Show pixels');
  assert.equal(data.leadKey(''), '');
  assert.equal(data.leadKey(undefined), '');
});

test('findLead reaches a loose list item, which is the shape marked emits', () => {
  const box = window.document.createElement('div');
  box.innerHTML = '<ul>' +
    '<li><p><strong>Show pixels.</strong> body one</p></li>' +
    '<li><p><strong>Hand over the artifact.</strong> body two</p></li></ul>';
  assert.match(data.findLead(box, 'Show pixels').textContent, /body one/);
  assert.match(data.findLead(box, 'Hand over the artifact').textContent, /body two/);
  assert.equal(data.findLead(box, 'Not a primitive'), null);
});

test('and a tight list item too, so the doc may drop its blank lines', () => {
  const box = window.document.createElement('div');
  box.innerHTML = '<ul><li><strong>Branch anchor.</strong> body</li></ul>';
  assert.match(data.findLead(box, 'Branch anchor').textContent, /body/);
});

test('a bold run that is not the item lead-in is not the anchor', () => {
  // Every primitive carries a **Boundary:** run inside its own paragraph, and
  // several carry **Form**. Matching one of those would scroll the reader to
  // the middle of the right bullet or the wrong one; :first-child is what
  // keeps the anchor the lead-in.
  const box = window.document.createElement('div');
  box.innerHTML = '<ul><li><p><strong>Show pixels.</strong> body ' +
    '<strong>Boundary:</strong> a viewport shot</p></li></ul>';
  assert.equal(data.findLead(box, 'Boundary'), null, 'a mid-paragraph run is not a lead-in');
  assert.ok(data.findLead(box, 'Show pixels'), 'the lead-in still resolves');
});
