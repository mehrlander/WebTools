// The branch overlay (?overlay=<branch>): preview the estate as if that
// branch were merged wherever it exists. This holds the mechanism's three
// claims: resolution asks GitHub which repos carry the branch (never
// assumes), the config-cache splice re-derives each overlaid repo's manifest
// live at the branch (the cache is main-derived, so this is the only honest
// source), and the overlay is read-only toward the derived caches (a preview
// session must not commit crawl output). Plus the routing rule that an
// overlaid repo opens AT the branch, and the markup contract for the chip
// that makes the preview say it is one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { page, makeShell } from './show-repo-shell.mjs';

const REGISTRY = 'mehrlander/web-tools-private';
const BRANCH = 'claude/some-branch';

// A GH stub serving three shapes the shell asks for: the registry's config
// cache, per-repo branch-existence probes, and per-repo manifests at a ref.
// Every construction is recorded so tests can assert what was (not) asked.
function fakeGH({ cache, branches = {}, manifests = {} }, log) {
  return class FakeGH {
    constructor(opts) { this.opts = opts; log.push(opts); }
    async req(p) {
      if (p.startsWith('branches/')) {
        const b = decodeURIComponent(p.slice('branches/'.length));
        if ((branches[this.opts.repo] || []).includes(b)) return { name: b };
        const e = new Error('GitHub Error 404'); e.status = 404; throw e;
      }
      const e = new Error('unexpected req ' + p); throw e;
    }
    async get(p) {
      if (this.opts.repo === REGISTRY && p === 'state/configs.json')
        return { text: JSON.stringify(cache) };
      if (p === '.web-tools.json') {
        const m = manifests[this.opts.repo + '@' + this.opts.ref];
        if (m) return { text: JSON.stringify(m) };
      }
      const e = new Error('GitHub Error 404'); e.status = 404; throw e;
    }
    async repos() { return []; }   // enrichSidebarPrivacy's probe; irrelevant here
  };
}

const CACHE = {
  repos: {
    'me/home':   { config: { estate: true, icon: 'ph-house', group: 'core', order: 1 }, configName: '.web-tools.json' },
    'me/ledger': { config: { estate: true, icon: 'ph-scales', group: 'data', order: 2 }, configName: '.web-tools.json' },
  },
};

function overlayShell({ branches, manifests } = {}) {
  const log = [];
  const { shell, win } = makeShell();
  win.TOKEN = 'tok';
  win.GH = fakeGH({ cache: structuredClone(CACHE), branches, manifests }, log);
  return { shell, win, log };
}

test('no overlay: the cache is served as-is and no per-repo reads happen', async () => {
  const { shell, log } = overlayShell();
  await shell.loadEstateSidebar();
  assert.deepEqual(shell.overlayRefs, {});
  assert.equal(shell.estateConfigs['me/home'].icon, 'ph-house');
  assert.equal(shell.estateRepos.length, 2);
  // One GH for the registry cache read, one for the privacy enrichment; no
  // branch probes, no manifest reads.
  assert.deepEqual(log.map(o => o.repo), [REGISTRY, undefined]);
});

test('overlay: the branch manifest is spliced over the cache where the branch exists', async () => {
  const { shell } = overlayShell({
    branches: { 'me/home': [BRANCH] },
    manifests: {
      ['me/home@' + BRANCH]: {
        estate: true, icon: 'ph-house', group: 'core', order: 1,
        projects: [{ path: 'projects/budget-drs' }],
      },
    },
  });
  shell.overlayBranch = BRANCH;
  await shell.loadEstateSidebar();
  assert.deepEqual(shell.overlayRefs, { 'me/home': BRANCH });
  assert.deepEqual(shell.repoProjects('me/home'),
    [{ path: 'projects/budget-drs', label: 'budget-drs', icon: 'ph-kanban' }],
    'a projects field that exists only on the branch must reach the sidebar');
  assert.equal(shell.estateConfigs['me/ledger'].projects, undefined,
    'a repo without the branch keeps its cached (main) config');
  assert.equal(shell.estateRepos.length, 2);
});

test('overlay: a branch without a manifest keeps the cached config', async () => {
  const { shell } = overlayShell({ branches: { 'me/home': [BRANCH] }, manifests: {} });
  shell.overlayBranch = BRANCH;
  await shell.loadEstateSidebar();
  assert.deepEqual(shell.overlayRefs, { 'me/home': BRANCH });
  assert.equal(shell.estateConfigs['me/home'].icon, 'ph-house');
});

test('overlay is read-only toward the derived caches: the crawls decline to run', async () => {
  const { shell, win, log } = overlayShell();
  shell.overlayBranch = BRANCH;
  // Present the cache/survey builders so ONLY the overlay guard can stop the
  // crawls; a builder that gets invoked anyway fails the test loudly.
  const boom = () => { throw new Error('crawl ran under overlay'); };
  win.RepoConfigCache = { CACHE_PATH: 'state/configs.json', buildCache: boom, cacheChanged: boom };
  win.RepoActivityCache = { buildCache: boom };
  win.BranchSurvey = {};
  const before = log.length;
  await shell.refreshConfigCache(true);
  await shell.refreshActivityCache(true);
  assert.equal(log.length, before, 'a preview session must not run cache crawls');
});

test('an overlaid repo opens at the branch; others open at their default', async () => {
  const { shell, browserStore } = makeShell();
  shell.overlayRefs = { 'me/home': BRANCH };
  const calls = [];
  shell.ensureBrowser = async (repo, ref) => { calls.push([repo, ref]); browserStore.repo = repo; };
  shell.openFolder = async () => {};
  await shell.openPinned('me/home');
  await shell.openPinned('me/ledger');
  await shell.openProject('me/home', { path: 'projects/x' });
  assert.deepEqual(calls, [
    ['me/home', BRANCH],
    ['me/ledger', undefined],
    ['me/home', BRANCH],
  ]);
});

test('the boot reads ?overlay= through URLSearchParams (the toss params shim answers it)', () => {
  assert.match(page, /URLSearchParams\(location\.search\)\.get\('overlay'\)/,
    'the overlay must be read via URLSearchParams so a toss can deliver it');
});

test('the markup carries the overlay chip and the per-row glyph', () => {
  assert.match(page, /x-show="overlayBranch"/, 'the Repos header chip is gone');
  assert.match(page, /:title="overlayTip"/, 'the chip must explain itself');
  assert.match(page, /overlayRefFor\(r\.repo\)/, 'overlaid rows lost their glyph/title');
});
