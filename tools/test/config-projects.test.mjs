// alpineComponents/config.js — the PROJECTS section of the per-repo
// .web-tools.json editor.
//
// A project is declared (an entry in the manifest's `projects` array) and
// detected (a folder carrying tracker/tasks/, the defining convention). Those
// are two different facts and the form shows both, so what this holds is mostly
// the seam between them: the merged row list, the disagreement flags, and the
// write path that edits one entry without disturbing the shape of the rest.
//
// The write path is where a silent data loss would live, since every field
// edit rewrites an entry in a file the user did not open the form to
// restructure. Real Alpine under jsdom (bootstrap.mjs recipe), with GH stubbed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, tick, repoRoot } from './bootstrap.mjs';

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="config" x-data="config()"></div>
  </body></html>`,
});

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
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

let treeCalls = 0;
window.TOKEN = 'ignored-in-test';
window.__shell = { hasToken: () => true, _authState: 'auth' };
window.GH = class {
  constructor(opts) { this.opts = opts; }
  async get(p) {
    if (p === '.web-tools.json') return { text: JSON.stringify(CONFIG) };
    throw new Error('404');
  }
  async req(p) {
    if (p.startsWith('git/trees/')) { treeCalls++; return TREE; }
    throw new Error('unexpected ' + p);
  }
};
Alpine.store('browser', { repo: 'mehrlander/home', ref: 'main', defaultRef: 'main' });
Alpine.store('toast', () => {});

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
