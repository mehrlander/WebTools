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
import { page, makeShell } from './shell.mjs';

const REGISTRY = 'mehrlander/web-tools-private';
const BRANCH = 'claude/some-branch';

// A GH stub serving the shapes the shell asks for: the registry's config
// cache, per-repo branch-existence probes, per-repo manifests at a ref, the
// account enumeration, and the registry save. Every construction and every
// save is recorded so tests can assert what was (not) asked and written.
function fakeGH({ cache, branches = {}, manifests = {}, account = [] }, log) {
  return class FakeGH {
    constructor(opts) { this.opts = opts; log.push(opts); }
    async save(p) { log.push({ save: p, repo: this.opts.repo }); }
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
    async repos() { return account.map(n => ({ full_name: n, private: true })); }
  };
}

const CACHE = {
  repos: {
    'me/home':   { config: { estate: true, icon: 'ph-house', group: 'core', order: 1 }, configName: '.web-tools.json' },
    'me/ledger': { config: { estate: true, icon: 'ph-scales', group: 'data', order: 2 }, configName: '.web-tools.json' },
  },
};

function overlayShell({ branches, manifests, account } = {}) {
  const log = [];
  const { shell, win, toasts } = makeShell();
  win.TOKEN = 'tok';
  win.GH = fakeGH({ cache: structuredClone(CACHE), branches, manifests, account }, log);
  return { shell, win, log, toasts };
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
    [{ path: 'projects/budget-drs', label: 'budget-drs',
      board: 'projects/budget-drs/tracker/board.md', landing: '', inbox: null }],
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

// The crawls are deliberately NOT guarded under overlay: their inputs are
// pinned at main by construction, so their output is byte-identical to a
// normal session's and a Refresh tap works inside a preview. (This shipped
// guarded at first; the guard defended nothing and made Refresh a silent
// no-op in the field.) The invariant that keeps the un-guarding safe is the
// one held here: the crawl never reads at the overlay branch.
test('the config crawl runs under overlay, reads at main only, and commits', async () => {
  const { shell, win, log } = overlayShell({
    account: ['me/home', 'me/ledger'],
    manifests: {
      'me/home@main': { estate: true },
      'me/ledger@main': { estate: true },
    },
  });
  shell.overlayBranch = BRANCH;
  const built = [];
  win.RepoConfigCache = {
    CACHE_PATH: 'state/configs.json',
    buildCache: (prev, fetched, now) => { built.push(fetched); return { generatedAt: now, repos: fetched }; },
    // The crawl commits on the changed LIST rather than the boolean, so the run
    // record and the gate that decides to write it share one derivation.
    changedRepos: () => ['me/home'],
  };
  await shell.refreshConfigCache(true);
  assert.equal(built.length, 1, 'the crawl must run under overlay');
  const perRepoReads = log.filter(o => o.repo && o.repo !== REGISTRY && o.ref !== undefined);
  assert.ok(perRepoReads.length >= 2, 'the crawl read the account repos');
  for (const o of perRepoReads)
    assert.equal(o.ref, 'main', 'crawl inputs must never read the overlay branch');
  assert.ok(log.some(o => o.save === 'state/configs.json' && o.repo === REGISTRY),
    'the rebuilt cache must commit to the registry');
});

test('refreshConfigs under overlay rebuilds the cache, then re-applies the splice', async () => {
  const { shell, win } = overlayShell({
    account: ['me/home', 'me/ledger'],
    branches: { 'me/home': [BRANCH] },
    manifests: {
      'me/home@main': { estate: true, icon: 'ph-house', group: 'core', order: 1 },
      'me/ledger@main': { estate: true, icon: 'ph-scales', group: 'data', order: 2 },
      ['me/home@' + BRANCH]: { estate: true, icon: 'ph-house', group: 'core', order: 1,
                               projects: ['projects/x'] },
    },
  });
  shell.overlayBranch = BRANCH;
  win.RepoConfigCache = {
    CACHE_PATH: 'state/configs.json',
    buildCache: (prev, fetched, now) => ({ generatedAt: now, repos: prev?.repos || {} }),
    changedRepos: () => [],
  };
  await shell.refreshConfigs();
  assert.deepEqual(shell.repoProjects('me/home'),
    [{ path: 'projects/x', label: 'x', board: 'projects/x/tracker/board.md', landing: '', inbox: null }],
    'after a Refresh the sidebar must still show the branch-spliced view');
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

test('entering the Config view for an overlaid repo warns about the read/write mix', () => {
  const { shell, browserStore, toasts } = makeShell();
  browserStore.repo = 'me/home';
  shell.overlayBranch = BRANCH;
  shell.overlayRefs = { 'me/home': BRANCH };
  shell.goConfig();
  assert.equal(toasts.length, 1, 'the hazardous-write warning must fire');
  assert.match(toasts[0].msg, /default branch/);
  shell.overlayRefs = {};
  shell.goConfig();
  assert.equal(toasts.length, 1, 'no warning when the open repo is not overlaid');
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
