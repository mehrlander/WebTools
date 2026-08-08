// alpineComponents/estate.js — logic-level tests for the Repos view's grouped-
// grid layout and card nesting. Membership and fields come from each repo's own
// config (estate:true, group, order), read from the registry's crawled config
// cache (state/configs.json); the view is one section per group (groupSections),
// groups and members ordered by each repo's `order`. A `-private` companion
// folds into its parent's card (applyNesting) and the globe toggle flips face()
// between the two. Driven over a fake GH and a stubbed shell; no network, no
// pixels. (The estate moved to this shape after PR #236; this suite tracks it,
// closing the estate-rows-tests-stale task.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

// The config cache each load() reads (the registry's state/configs.json). Tests
// swap it between loads via loadWith(); asCache wraps a flat name→config map in
// the crawl's { repos: { name: { config } } } shape.
let CONFIGS = { repos: {} };
const asCache = (map) => ({
  repos: Object.fromEntries(Object.entries(map).map(([name, config]) => [name, { config }])),
});

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  ago() { return 'recently'; }
  async get(name) {
    if (name === 'state/configs.json') return { text: JSON.stringify(CONFIGS) };
    throw new Error('404');                          // no surfaces / todos / activity files
  }
  async ls() { throw new Error('404'); }             // no surfaces dir
  async req(path) {
    if (path.startsWith('/repos/')) return { default_branch: 'main', description: '', private: true, pushed_at: '' };
    throw new Error('unexpected ' + path);
  }
}

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="es" x-data="estate()"></div>
  </body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
window.__shell = {
  REGISTRY_REPO: 'me/registry',
  DEFAULT_REPO: 'me/tools',
  quickLinks: [],
  hasToken: () => true,
  _authState: 'auth',
};

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  // The shelf reads every surface through the shared envelope model, which
  // gh-boot loads ahead of the components for exactly this reason.
  'lib/kits/surface.js',
  'lib/alpineComponents/estate.js',
]);

const data = Alpine.$data(window.document.getElementById('es'));
const plain_ = (v) => JSON.parse(JSON.stringify(v));
// [ [group, [repo, …]], … ] over the visible sections, nested cards dropped.
const sections = () => plain_(data.groupSections.map(s => [s.group, s.items.map(e => e.repo)]));
const loadWith = async (map) => { CONFIGS = asCache(map); await data.load(); };

// Membership + fields as each repo's own config would carry them. me/skip opts
// out (estate:false); me/tools-private rides inside me/tools by naming.
const CONFIG_MAP = {
  'me/home':          { estate: true,  group: 'core',     order: 0 },
  'me/tools':         { estate: true,  group: 'core',     order: 1 },
  'me/tools-private': { estate: true,  group: 'core',     order: 2 },
  'me/archive':       { estate: true,  group: 'archives', order: 3 },
  'me/data-b':        { estate: true,  group: 'data',     order: 4 },
  'me/data-a':        { estate: true,  group: 'data',     order: 5 },
  'me/gadgets':       { estate: true,  group: 'tools',    order: 6 },
  'me/skip':          { estate: false, group: 'core',     order: 0 },
};

test('mounts with no startup warnings or errors', () => {
  assert.deepEqual(problems, []);
  assert.ok(data.description.length > 0);
});

test('groupSections: a section per group, groups and members ordered by each repo order', async () => {
  await loadWith(CONFIG_MAP);
  assert.deepEqual(sections(), [
    ['core',     ['me/home', 'me/tools']],           // -private companion nested away
    ['archives', ['me/archive']],
    ['data',     ['me/data-b', 'me/data-a']],        // order 4 before 5
    ['tools',    ['me/gadgets']],
  ]);
});

test('estate:false opts a repo out entirely', async () => {
  await loadWith(CONFIG_MAP);
  assert.ok(!data.entries.some(e => e.repo === 'me/skip'));
});

test('a -private companion nests into its parent card and leaves the sections', async () => {
  await loadWith(CONFIG_MAP);
  const parent = data.entries.find(e => e.repo === 'me/tools');
  assert.equal(parent.child?.repo, 'me/tools-private');
  assert.ok(!sections().some(([, repos]) => repos.includes('me/tools-private')),
    'the companion holds no card of its own');
});

test('face(): the visibility toggle flips a nested card between parent and companion', async () => {
  await loadWith(CONFIG_MAP);
  const parent = data.entries.find(e => e.repo === 'me/tools');
  assert.equal(data.face(parent).repo, 'me/tools');
  parent.showChild = true;
  assert.equal(data.face(parent).repo, 'me/tools-private');
  parent.showChild = false;
  assert.equal(data.face(parent).repo, 'me/tools');
  // A card with no companion never flips, whatever the flag says.
  const lone = data.entries.find(e => e.repo === 'me/archive');
  lone.showChild = true;
  assert.equal(data.face(lone).repo, 'me/archive');
});

test('an ungrouped member forms the empty-name section', async () => {
  await loadWith({
    'me/home':  { estate: true, group: 'core', order: 0 },
    'me/loose': { estate: true, order: 1 },
  });
  const loose = sections().find(([g]) => g === '');
  assert.ok(loose, 'the ungrouped repo forms a "" section');
  assert.deepEqual(loose[1], ['me/loose']);
});

test('signed out: just the public default card, no registry membership', async () => {
  window.__shell.hasToken = () => false;
  await data.load();
  assert.equal(data.authed, false);
  assert.deepEqual(plain_(data.entries.map(e => e.repo)), ['me/tools']);   // DEFAULT_REPO
  window.__shell.hasToken = () => true;                            // restore for any later test
});
