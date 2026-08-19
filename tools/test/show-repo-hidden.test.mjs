// The hide list: estate members kept off the dashboard, declared in the
// private registry's OWN manifest (`hidden`) rather than in the repo they
// name. Every other manifest key describes its repo, so this one is the
// exception the estate's "membership is a repo property" rule has to survive,
// and these are the claims that keep it from becoming a second membership
// list: a hidden repo loses its sidebar row and its promoted app views, keeps
// its config in the map (so the menu can offer it back), never has its own
// config written, and comes back by one toggle.
//
// The override is the other half. A write lands in the registry at once and
// reaches the config cache only when the crawl next runs, so a reload in that
// window must not resurrect what was just hidden.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeShell } from './show-repo-shell.mjs';

const REGISTRY = 'mehrlander/web-tools-private';

const CACHE = () => ({
  repos: {
    'me/home': { config: { estate: true, icon: 'ph-house', group: 'core', order: 1 } },
    'me/fun': {
      config: {
        estate: true, icon: 'ph-plant', group: 'play', order: 5,
        pages: [{ path: 'a.html', appView: true, viewLabel: 'Toy' }],
      },
    },
    [REGISTRY]: { config: { estate: true, icon: 'ph-shield-check', hidden: [] } },
  },
});

// Serves the two reads the hide path makes (the config cache, and the
// registry's own manifest) and records every save.
function fakeGH({ cache, regCfg }, log) {
  class FakeGH {
    constructor(opts = {}) { this.opts = opts; }
    async get(p) {
      if (this.opts.repo === REGISTRY && p === 'state/configs.json')
        return { text: JSON.stringify(cache) };
      if (this.opts.repo === REGISTRY && p === '.web-tools.json')
        return { text: JSON.stringify(regCfg), sha: 'sha1' };
      const e = new Error('GitHub Error 404'); e.status = 404; throw e;
    }
    async save(p, doc) { log.push({ repo: this.opts.repo, path: p, doc }); }
    async repos() { return Object.keys(cache.repos).map(n => ({ full_name: n, private: true })); }
  }
  FakeGH.FRESH = {};
  return FakeGH;
}

function hiddenShell(hidden = []) {
  const log = [];
  const cache = CACHE();
  const regCfg = cache.repos[REGISTRY].config;
  regCfg.hidden = [...hidden];
  const { shell, win, toasts } = makeShell();
  win.TOKEN = 'tok';
  win.GH = fakeGH({ cache, regCfg }, log);
  return { shell, win, log, toasts, cache, regCfg };
}

test('a hidden repo leaves the sidebar index and takes its app views with it', async () => {
  const { shell } = hiddenShell(['me/fun']);
  await shell.loadEstateSidebar();
  assert.deepEqual(shell.estateRepos.map(r => r.repo).sort(), ['me/home', REGISTRY]);
  assert.deepEqual(shell.appViews, [], 'a hidden repo promotes nothing');
  assert.deepEqual(shell.estateHidden, ['me/fun']);
  assert.equal(shell.isRepoHidden('me/fun'), true);
});

test('an unhidden estate keeps every member and every promoted view', async () => {
  const { shell } = hiddenShell([]);
  await shell.loadEstateSidebar();
  assert.deepEqual(shell.estateRepos.map(r => r.repo).sort(), ['me/fun', 'me/home', REGISTRY]);
  assert.deepEqual(shell.appViews.map(v => v.label), ['Toy']);
});

test('a hidden repo keeps its config, so the menu can offer it back', async () => {
  const { shell } = hiddenShell(['me/fun']);
  await shell.loadEstateSidebar();
  assert.equal(shell.estateConfigs['me/fun']?.estate, true);
  shell.menuRepo = 'me/fun';
  const row = shell.repoActionItems.find(r => r.key === 'hide');
  assert.ok(row, 'the actions menu carries the row for a hidden repo');
  assert.equal(row.label, 'Show on the estate');
  shell.menuRepo = 'me/home';
  assert.equal(shell.repoActionItems.find(r => r.key === 'hide').label, 'Hide from the estate');
});

test('a repo that is neither a member nor hidden gets no hide row', async () => {
  const { shell } = hiddenShell([]);
  await shell.loadEstateSidebar();
  shell.menuRepo = 'me/stranger';
  assert.equal(shell.repoActionItems.some(r => r.key === 'hide'), false);
});

test('hiding writes the REGISTRY manifest and nothing else', async () => {
  const { shell, log } = hiddenShell([]);
  await shell.loadEstateSidebar();
  await shell.toggleRepoHidden('me/fun');
  assert.deepEqual(log.map(w => [w.repo, w.path]), [[REGISTRY, '.web-tools.json']]);
  assert.deepEqual(log[0].doc.hidden, ['me/fun']);
  assert.equal(log[0].doc.estate, true, 'the registry keeps its own fields');
  assert.equal(shell.isRepoHidden('me/fun'), true);
  assert.deepEqual(shell.estateRepos.map(r => r.repo).sort(), ['me/home', REGISTRY]);
});

test('showing again drops the key rather than writing an empty list', async () => {
  const { shell, log } = hiddenShell(['me/fun']);
  await shell.loadEstateSidebar();
  await shell.toggleRepoHidden('me/fun');
  assert.equal('hidden' in log[0].doc, false, 'hiding nothing reads as never mentioning it');
  assert.equal(shell.isRepoHidden('me/fun'), false);
});

test('the override survives a reload the config crawl has not caught up with', async () => {
  const { shell, cache } = hiddenShell([]);
  await shell.loadEstateSidebar();
  await shell.toggleRepoHidden('me/fun');
  // The cache still says nothing is hidden: the crawl has not run.
  assert.deepEqual(cache.repos[REGISTRY].config.hidden, []);
  await shell.loadEstateSidebar();
  assert.equal(shell.isRepoHidden('me/fun'), true, 'a just-hidden repo does not bounce back');
  // Once the crawl agrees, the override retires itself.
  cache.repos[REGISTRY].config.hidden = ['me/fun'];
  await shell.loadEstateSidebar();
  assert.equal(shell._hiddenOverride, null);
  assert.equal(shell.isRepoHidden('me/fun'), true);
});
