// alpineComponents/config.js — the per-repo .web-tools.json editor's FORM.
//
// The form now covers every field the manifest has a control for: General,
// Projects, Pages, and Stage. What this holds is the write path, because that
// is where a silent data loss would live: every field edit rewrites an entry in
// a file the user did not open the form to restructure. Three rules run through
// all of it, and each is asserted per field rather than once in principle:
// an entry keeps the shape it was authored in, an empty value deletes its key
// rather than storing "", and a field the form does not render survives an edit
// to one it does.
//
// Projects carries one more thing nothing else does: a project is DECLARED (an
// entry in the manifest) and DETECTED (a folder carrying tracker/tasks/, the
// defining convention), two different facts the form reconciles in one list.
//
// Real Alpine under jsdom (bootstrap.mjs recipe), with GH stubbed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, tick, repoRoot, captureAlpineErrors } from './bootstrap.mjs';

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="config" x-data="config()"></div>
  </body></html>`,
});

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
captureAlpineErrors(Alpine);
window.Alpine = Alpine;

// The manifest under edit: one bare-string entry, one object with fields, one
// object that is nothing but a path. All three shapes are in real manifests.
const CONFIG = {
  estate: true,
  projects: [
    'news',
    { path: 'projects/budget-drs', landing: 'projects/budget-drs/app/view/app.html' },
    { path: 'projects/wps' },
  ],
  pages: [{ path: 'pages/x.html', title: 'X' }],
};
// The tree the scan reads: three workspaces carry tracker/tasks/, and one of
// them (projects/bills) is undeclared. The repo-root tracker marks the repo
// itself and must not surface as a project.
const TREE = {
  tree: [
    { path: 'tracker/tasks/repo-meta-aaaaaa.md' },
    { path: 'news/tracker/tasks/x-bbbbbb.md' },
    { path: 'projects/budget-drs/tracker/tasks/y-cccccc.md' },
    { path: 'projects/bills/tracker/tasks/z-dddddd.md' },
    { path: 'projects/wps/README.md' },
  ],
};

// The real registry, so the reference the editor shows is the one the gate
// holds to the estate's manifests rather than a fixture that can agree with a
// broken reader.
const FIELDS_CSV = readFileSync(path.join(repoRoot, 'docs', 'manifest-fields.csv'), 'utf8');

let treeCalls = 0;
window.TOKEN = 'ignored-in-test';
window.__shell = { hasToken: () => true, _authState: 'auth' };
window.GH = class {
  constructor(opts) { this.opts = opts; }
  async get(p) {
    if (p === '.web-tools.json') return { text: JSON.stringify(CONFIG) };
    if (p === 'docs/manifest-fields.csv') return { text: FIELDS_CSV };
    throw new Error('404');
  }
  async req(p) {
    if (p.startsWith('git/trees/')) { treeCalls++; return TREE; }
    throw new Error('unexpected ' + p);
  }
};
Alpine.store('browser', { repo: 'mehrlander/home', ref: 'main', defaultRef: 'main' });
Alpine.store('toast', () => {});

// The shared CSV parser, because the field reference reads a registry with it.
// The same kit the component uses at runtime, not a second parse for the test.
new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/csv.js'), 'utf8'))();
new window.Function(readFileSync(path.join(repoRoot, 'lib/alpineComponents/config.js'), 'utf8'))();
Alpine.start();
await tick(3);

const data = Alpine.$data(window.document.getElementById('config'));
const draft = () => JSON.parse(data.draft);

test('mounts on the declared projects with no startup warnings', () => {
  assert.deepEqual(problems, []);
  assert.equal(data.loading, false);
  assert.deepEqual([...data.declaredProjects.map(p => p.path)],
    ['news', 'projects/budget-drs', 'projects/wps']);
});

test('rows read the declared entries whatever shape they were authored in', () => {
  const rows = data.projectRows;
  assert.equal(rows.length, 3, 'nothing is found until a scan runs');
  assert.ok(rows.every(r => r.declared));
  assert.equal(rows[0].label, '', 'a bare string carries no fields');
  assert.equal(rows[0].defaultLabel, 'news', 'the placeholder shows what absent means');
  assert.equal(rows[0].defaultTracker, 'news/tracker/board.md');
  assert.equal(rows[1].landing, 'projects/budget-drs/app/view/app.html');
  assert.ok(rows.every(r => !r.undetected), 'no scan has run, so nothing is claimed either way');
});

test('the scan detects workspaces by tracker/tasks/ and skips the repo root', async () => {
  await data.scanProjects();
  assert.equal(data.scanErr, '');
  assert.deepEqual([...data.found], ['news', 'projects/bills', 'projects/budget-drs'],
    "the root tracker marks the repo itself, so it is not a project");
  assert.equal(treeCalls, 1);
});

test('after a scan the two disagreements are both visible', () => {
  const rows = data.projectRows;
  const bills = rows.find(r => r.path === 'projects/bills');
  assert.ok(bills, 'a workspace running a tracker that nothing declares is offered');
  assert.equal(bills.declared, false);
  const wps = rows.find(r => r.path === 'projects/wps');
  assert.equal(wps.undetected, true, 'a declaration the scan cannot corroborate says so');
  assert.equal(rows.find(r => r.path === 'news').undetected, false);
  assert.equal(rows.filter(r => !r.declared).length, 1, 'only the undeclared ones are offered');
});

test('declaring a found workspace appends a bare path and clears the offer', async () => {
  data.addProject('projects/bills');
  await tick(2);
  assert.equal(draft().projects.at(-1), 'projects/bills', 'a new entry is a bare string');
  assert.ok(data.projectRows.find(r => r.path === 'projects/bills').declared);
  data.addProject('projects/bills');
  assert.equal(data.declaredProjects.filter(p => p.path === 'projects/bills').length, 1,
    'declaring twice is not two entries');
});

test('a field edit promotes only that entry, and clearing it demotes back', async () => {
  data.setProjField('news', 'label', 'News');
  await tick(2);
  let p = draft().projects;
  assert.deepEqual(p[0], { path: 'news', label: 'News' }, 'a string entry becomes an object when it has to');
  // Siblings keep both their values and their authored shapes.
  assert.deepEqual(p[1], { path: 'projects/budget-drs', landing: 'projects/budget-drs/app/view/app.html' });
  assert.deepEqual(p[2], { path: 'projects/wps' });
  assert.equal(p[3], 'projects/bills');

  data.setProjField('news', 'label', '   ');
  await tick(2);
  p = draft().projects;
  assert.equal(p[0], 'news', 'clearing the last field returns the entry to a bare path');
});

test('No board writes tracker:false, and unchecking it clears the key', async () => {
  data.setProjField('projects/wps', 'tracker', false);
  await tick(2);
  assert.deepEqual(draft().projects.find(e => e?.path === 'projects/wps'),
    { path: 'projects/wps', tracker: false });
  assert.equal(data.projectRows.find(r => r.path === 'projects/wps').noTracker, true);

  data.setProjField('projects/wps', 'tracker', '');
  await tick(2);
  assert.equal(draft().projects.find(e => e === 'projects/wps' || e?.path === 'projects/wps'),
    'projects/wps', 'false is a value, so clearing it is a delete like any other');
});

test('undeclaring removes the entry and leaves the rest in order', async () => {
  data.removeProject('projects/bills');
  await tick(2);
  assert.deepEqual(draft().projects.map(e => (typeof e === 'string' ? e : e.path)),
    ['news', 'projects/budget-drs', 'projects/wps']);
  // Still detected, so it comes back as an offer rather than vanishing.
  assert.ok(data.projectRows.find(r => r.path === 'projects/bills' && !r.declared));
});

test('the JSON pane carries every edit, and the fields the form never shows', () => {
  const d = draft();
  assert.deepEqual(d.pages, CONFIG.pages, 'an unshown field survives a form edit');
  assert.equal(d.estate, true);
  assert.ok(d.projects.length);
});

test('a JSON edit is read back into the rows', async () => {
  data.draft = JSON.stringify({ estate: true, projects: ['solo'] }, null, 2);
  data.jsonEdited();
  await tick(2);
  assert.deepEqual([...data.declaredProjects.map(p => p.path)], ['solo']);
  assert.equal(data.projectRows.find(r => r.path === 'solo').undetected, true);
});

test('clean drops junk entries and empties without touching authored shapes', () => {
  data.obj = { projects: [
    'ok/',
    { path: ' spaced/ ', label: '  ', landing: 'p.html' },
    { label: 'no path' },
    'valid',
  ] };
  data.formEdited();
  assert.deepEqual(draft().projects, ['ok', { path: 'spaced', landing: 'p.html' }, 'valid']);

  data.obj = { estate: true, projects: [] };
  data.formEdited();
  assert.equal('projects' in draft(), false, 'an empty list is not a key worth writing');
});

test('a scan failure reports rather than emptying the list', async () => {
  const real = window.GH;
  window.GH = class { async req() { throw new Error('403 blocked'); } };
  data.found = ['kept'];
  await data.scanProjects();
  window.GH = real;
  assert.match(data.scanErr, /403 blocked/);
  assert.deepEqual([...data.found], ['kept'], 'the previous answer is not discarded by a failure');
});

// ── The other three list fields ──────────────────────────────────────────────
// stage, pages, and scope used to be JSON-pane-only, with the form promising it
// preserved them. They are on the form now, so the promise is a mechanism: the
// same two rules as a project entry (keep the authored shape, an empty value
// deletes rather than storing "") plus one more that only Pages has, that the
// fields the form does NOT render must survive an edit to the ones it does.

test('pages rows read the catalog and flag a cross-repo entry', async () => {
  data.obj = { pages: [
    { path: 'pages/a.html', title: 'A', note: 'first', icon: 'ph-star', thumb: 'thumbs/a.png' },
    { path: 'mehrlander/web-tools@main:pages/b.html', appView: true },
    'pages/c.html',
  ] };
  await tick(2);
  const rows = data.pageRows;
  assert.deepEqual([...rows.map(r => r.path)],
    ['pages/a.html', 'mehrlander/web-tools@main:pages/b.html', 'pages/c.html']);
  assert.equal(rows[0].crossRepo, false);
  assert.equal(rows[1].crossRepo, true, 'a qualified path says the file is not here');
  assert.equal(rows[1].appView, true);
  assert.equal(rows[2].defaultTitle, 'c.html', 'the placeholder shows what absent means');
});

test('editing a page keeps the fields the form never shows', async () => {
  data.setPageField(0, 'note', 'rewritten');
  await tick(2);
  const p = draft().pages[0];
  assert.equal(p.note, 'rewritten');
  assert.equal(p.icon, 'ph-star', 'icon is not rendered by the form and must survive it');
  assert.equal(p.thumb, 'thumbs/a.png');

  data.setPageField(2, 'title', 'C');
  await tick(2);
  assert.deepEqual(draft().pages[2], { path: 'pages/c.html', title: 'C' },
    'a bare string entry becomes an object only when it has to');
  data.setPageField(2, 'title', '');
  await tick(2);
  assert.equal(draft().pages[2], 'pages/c.html', 'and drops back when the last field clears');
});

test('the app-view toggle writes true and deletes on the way back', async () => {
  data.setPageField(0, 'appView', true);
  await tick(2);
  assert.equal(draft().pages[0].appView, true);
  data.setPageField(0, 'appView', false);
  await tick(2);
  assert.equal('appView' in draft().pages[0], false, 'false is the default, so it is absent');
});

test('adding and removing a page, and the key going away when empty', async () => {
  data.obj = {};
  data.newPage = '  pages/new.html  ';
  data.addPage();
  await tick(2);
  assert.deepEqual([...draft().pages], ['pages/new.html'], 'trimmed, and a bare string');
  assert.equal(data.newPage, '', 'the box clears so the next add is not a duplicate');
  data.addPage();
  assert.equal(draft().pages.length, 1, 'an empty box adds nothing');
  data.removePage(0);
  await tick(2);
  assert.equal('pages' in draft(), false, 'an empty catalog is not a key worth writing');
});

test('the two stage lists round-trip as line-per-path text', async () => {
  data.obj = {};
  data.stageFilesText = 'docs/CONVENTIONS.md\n\n  owner/repo:x.md  ';
  await tick(2);
  assert.deepEqual([...draft().stage.files], ['docs/CONVENTIONS.md', 'owner/repo:x.md'],
    'blank lines dropped, entries trimmed');
  assert.equal('targets' in draft().stage, false, 'the untouched half is not invented');

  data.stageTargetsText = 'owner/repo:docs';
  await tick(2);
  assert.deepEqual([...draft().stage.targets], ['owner/repo:docs']);
  assert.equal(data.stageFilesText, 'docs/CONVENTIONS.md\nowner/repo:x.md', 'the getter reads back');

  data.stageFilesText = '';
  data.stageTargetsText = '';
  await tick(2);
  assert.equal('stage' in draft(), false, 'both halves empty drops the object, not just the keys');
});

test('scope takes prose or a path, and the path form is the monospaced one', async () => {
  data.obj = { scope: '  docs/SCOPE.md  ' };
  await tick(2);
  assert.equal(draft().scope, 'docs/SCOPE.md', 'trimmed like every other string field');
  assert.equal(data.scopeIsPath, true);
  data.obj = { scope: 'The public hub: browser tools and kits.' };
  await tick(2);
  assert.equal(data.scopeIsPath, false, 'prose is prose, whatever it mentions');
  data.obj = { scope: '   ' };
  data.formEdited();
  assert.equal('scope' in draft(), false);
});

// ── The field reference ───────────────────────────────────────────────────
// docs/manifest-fields.csv rendered where the manifest is edited, added
// 2026-08-19. docs/manifest.md had already delegated the field list to the
// registry in 2026-08-16; what was missing was the render, so the reference a
// person needs while filling this form in sat one GitHub click away in a raw
// CSV. These hold the two things that make the block safe to keep: it costs
// nothing until opened, and it cannot take the editor down.
test('the field reference is not fetched until it is opened', () => {
  assert.equal(data.fields, null, 'mounting the editor does not fetch the reference');
});

test('opening the reference loads the registry and groups it by nesting', async () => {
  await data.loadFields();
  assert.ok(data.fields.length > 40, 'the whole registry arrives');

  const groups = data.fieldGroups;
  assert.equal(groups.map(g => g.key).join(','), 'top,member');
  // A member key is one addressed through its parent, which is the split a
  // person filling in the form actually needs.
  assert.ok(groups[1].rows.every(f => f.key.includes('.') || f.key.includes('[')));
  assert.ok(groups[0].rows.every(f => !f.key.includes('.') && !f.key.includes('[')));
  assert.equal(groups[0].rows.length + groups[1].rows.length, data.fields.length);
});

test('the filter matches the summary, not only the key', async () => {
  await data.loadFields();
  const all = data.fields.length;
  data.fieldQ = 'estate';
  const hits = data.fieldGroups.flatMap(g => g.rows);
  data.fieldQ = '';
  assert.ok(hits.length && hits.length < all);
  assert.ok(hits.some(f => !f.key.includes('estate')),
    'a summary word reaches a key that does not carry it');
});

// The editor must survive a hub it cannot reach. Help that can break the thing
// it is helping with is worse than no help.
test('an unreachable registry leaves the editor working', async () => {
  const real = window.GH;
  window.GH = class { async get() { throw new Error('503'); } };
  const fresh = Alpine.$data(window.document.getElementById('config'));
  fresh.fields = null;
  await fresh.loadFields();
  window.GH = real;
  // Length, not deepEqual: Alpine hands back a reactive proxy and strict
  // deep-equality fails on identity even when the contents match.
  assert.equal(fresh.fields.length, 0, 'a failure resolves to an empty reference');
  assert.equal(fresh.err, '', 'and never onto the editor\'s error line');
});
