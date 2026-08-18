// alpineComponents/tools.js — the curated Tools gallery inside show-repo.
// Logic-level tests with real Alpine under jsdom (bootstrap.mjs recipe): resolve
// a manifest path (bare hub path vs qualified cross-repo ref), build the
// render/thumb/source URLs the pages catalog conventions use, and load the
// curated manifest through a stubbed GH. Not covered: live iframes, real API.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, tick, repoRoot, captureAlpineErrors } from './bootstrap.mjs';

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="tools" x-data="tools()"></div>
  </body></html>`,
});

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
captureAlpineErrors(Alpine);
window.Alpine = Alpine;

// The curated shelf the component fetches, served by a stubbed GH (no token,
// public hub). Mirrors docs/tools.csv's shape, which since 2026-08-13 carries
// only { path, icon }: the title and the description belong to the page and are
// joined from pages/pages.csv, so a shelved row cannot drift from the gallery.
const manifest = [
  'path,icon',
  'pages/diff-tool.html,ph-git-diff',
  'mehrlander/home@dev:projects/x/app.html,ph-cube',
  'other/repo:tool.html,',
].join('\n') + '\n';
// The pages catalog the identities are joined from, keyed by href. CSV text
// rather than objects, so the component's own parse runs: it JSON-parsed both
// carriers until 2026-08-18, and a stub that handed it objects agreed with the
// bug instead of catching it.
const pages = [
  'href,title,note',
  'diff-tool.html,Diff,Side-by-side text diff tool.',
  'annotate.html,Annotate,',
].join('\n') + '\n';
const getLog = [];
window.TOKEN = 'ignored-in-test';
window.GH = class {
  constructor(opts) { this.opts = opts; }
  async get(p) {
    getLog.push([this.opts.repo, this.opts.ref, p]);
    if (p === 'pages/pages.csv') return { text: pages };
    return { text: manifest };
  }
};

// kits/csv.js first: the view parses both carriers through it, the same way
// the pre-build's boot list supplies it on a real page.
new window.Function('window', readFileSync(path.join(repoRoot, 'lib/kits/csv.js'), 'utf8'))(window);
new window.Function(readFileSync(path.join(repoRoot, 'lib/alpineComponents/tools.js'), 'utf8'))();
Alpine.start();
await tick(3);

const el = window.document.getElementById('tools');
const data = Alpine.$data(el);

test('mounts and loads the curated manifest with no startup warnings', () => {
  assert.deepEqual(problems, []);
  assert.ok(data.description.length > 0);
  assert.deepEqual(getLog.sort(), [
    ['mehrlander/web-tools', 'main', 'docs/tools.csv'],
    ['mehrlander/web-tools', 'main', 'pages/pages.csv'],
  ]);
  assert.equal(data.items.length, 3);
});

test('resolve: bare path means the hub at main; qualified ref overrides', () => {
  // {...} rebuilds each realm-crossed object on this side for deepEqual.
  assert.deepEqual({ ...data.resolve('pages/diff-tool.html') },
    { repo: 'mehrlander/web-tools', ref: 'main', path: 'pages/diff-tool.html' });
  assert.deepEqual({ ...data.resolve('mehrlander/home@dev:projects/x/app.html') },
    { repo: 'mehrlander/home', ref: 'dev', path: 'projects/x/app.html' });
  assert.deepEqual({ ...data.resolve('other/repo:tool.html') },
    { repo: 'other/repo', ref: 'main', path: 'tool.html' });
});

test('render/thumb/source URLs follow the pages-catalog conventions', () => {
  // Bare hub path at main: hosted github.io + jsDelivr thumb + blob source.
  assert.equal(data.renderUrl('pages/diff-tool.html'),
    'https://mehrlander.github.io/web-tools/pages/diff-tool.html');
  assert.equal(data.thumbUrl('pages/diff-tool.html'),
    'https://cdn.jsdelivr.net/gh/mehrlander/web-tools@main/pages/thumbs/diff-tool.png');
  assert.equal(data.codeUrl('pages/diff-tool.html'),
    'https://github.com/mehrlander/web-tools/blob/main/pages/diff-tool.html');
  // A mehrlander repo off its default ref routes through toss-render #gh=.
  assert.equal(data.renderUrl('mehrlander/home@dev:projects/x/app.html'),
    'https://mehrlander.github.io/web-tools/pages/toss-render.html#gh=mehrlander/home@dev:projects/x/app.html');
  // A non-pages/ path gets no thumbnail (placeholder icon instead).
  assert.equal(data.thumbUrl('mehrlander/home@dev:projects/x/app.html'), '');
});

test('cards inherit the page identity and carry the resolved URLs', () => {
  const cards = data.cards;
  // A hub page takes its title and description from the gallery, not from the
  // shelf, which no longer carries either.
  const diff = cards.find(c => c.path === 'pages/diff-tool.html');
  assert.equal(diff.title, 'Diff');
  assert.equal(diff.note, 'Side-by-side text diff tool.');
  assert.equal(diff.renderUrl, 'https://mehrlander.github.io/web-tools/pages/diff-tool.html');
  // A cross-repo ref has no row in the hub's catalog, so it falls back to the
  // filename rather than borrowing a same-named hub page's identity.
  const ext = cards.find(c => c.path === 'other/repo:tool.html');
  assert.equal(ext.title, 'tool');
  assert.equal(ext.note, '');
  assert.equal(ext.icon, 'ph-wrench', 'missing icon defaults to the wrench');
  assert.equal(ext.view, 'shot');
});

// The join is by full repo path, so a cross-repo page whose filename matches a
// hub page must not pick up the hub page's title. This is the failure mode a
// bare-filename key would have.
test('the identity join does not leak across repos', () => {
  assert.equal(data.identity('other/repo:diff-tool.html').title, 'diff-tool');
  assert.equal(data.identity('pages/diff-tool.html').title, 'Diff');
});
