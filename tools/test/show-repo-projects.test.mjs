// The sidebar Repos index's PROJECT rows: a repo carrying several workspaces
// declares them in its manifest's `projects` field (the defining convention:
// a workspace running a tracker is a project; the repo root's tracker marks
// the repo itself), and the shell renders them indented under the repo's row.
// This holds the two halves that could drift apart silently: the normalizer
// (repoProjects: string/object entries, defaults, junk dropped) and the
// markup wiring (the x-for actually feeds those rows, and a row opens the
// repo's Files view at the workspace folder).
//
// The shell's app() lives inline in show-repo.html, so the test evaluates the
// plain <script> block against stubs via the shared show-repo-shell.mjs
// harness (see its header for the tactic and its provenance).

import test from 'node:test';
import assert from 'node:assert/strict';
import { page, makeShell } from './show-repo-shell.mjs';

test('repoProjects: absent, non-array, or empty config yields no rows', () => {
  const { shell } = makeShell();
  shell.estateConfigs = {};
  assert.deepEqual(shell.repoProjects('mehrlander/home'), []);
  shell.estateConfigs = { 'mehrlander/home': { estate: true } };
  assert.deepEqual(shell.repoProjects('mehrlander/home'), []);
  shell.estateConfigs = { 'mehrlander/home': { projects: 'projects/budget-drs' } };
  assert.deepEqual(shell.repoProjects('mehrlander/home'), [], 'a bare string field is not a list');
});

test('repoProjects: string and object entries normalize to {path, label, icon}', () => {
  const { shell } = makeShell();
  shell.estateConfigs = {
    'mehrlander/home': {
      projects: [
        'news',
        { path: 'projects/budget-drs' },
        { path: 'projects/budget-wa/', label: 'WA budget', icon: 'ph-bank' },
      ],
    },
  };
  assert.deepEqual(shell.repoProjects('mehrlander/home'), [
    { path: 'news', label: 'news', icon: 'ph-kanban' },
    { path: 'projects/budget-drs', label: 'budget-drs', icon: 'ph-kanban' },
    { path: 'projects/budget-wa', label: 'WA budget', icon: 'ph-bank' },
  ]);
});

test('repoProjects: junk entries drop instead of throwing', () => {
  const { shell } = makeShell();
  shell.estateConfigs = {
    'mehrlander/home': { projects: [null, 42, {}, { path: '' }, { label: 'no path' }, 'ok'] },
  };
  assert.deepEqual(shell.repoProjects('mehrlander/home'),
    [{ path: 'ok', label: 'ok', icon: 'ph-kanban' }]);
});

test('openProject routes to the Files view at the workspace folder', async () => {
  const { shell, browserStore } = makeShell({ browserStore: { repo: '' } });
  const calls = [];
  shell.ensureBrowser = async (repo) => { calls.push(['ensure', repo]); browserStore.repo = repo; };
  shell.openFolder = async (p) => { calls.push(['folder', p]); };
  await shell.openProject('mehrlander/home', { path: 'projects/budget-drs' });
  assert.deepEqual(calls, [['ensure', 'mehrlander/home'], ['folder', 'projects/budget-drs']]);
});

test('openProject does not navigate when the repo switch failed', async () => {
  const { shell, browserStore } = makeShell({ browserStore: { repo: 'mehrlander/web-tools' } });
  const calls = [];
  shell.ensureBrowser = async () => { calls.push('ensure'); /* pickByName failed; repo unchanged */ };
  shell.openFolder = async () => { calls.push('folder'); };
  await shell.openProject('mehrlander/home', { path: 'projects/budget-drs' });
  assert.deepEqual(calls, ['ensure'], 'a failed switch must not open a folder in the wrong repo');
});

test('the sidebar markup wires the project rows to the shell methods', () => {
  assert.match(page, /x-for="p in repoProjects\(r\.repo\)"/,
    'the Repos index no longer iterates repoProjects');
  assert.match(page, /@click="openProject\(r\.repo, p\)"/,
    'a project row no longer opens through openProject');
  assert.match(page, /repoProjects\(r\.repo\)"[^>]*:key="r\.repo \+ ':' \+ p\.path"/,
    'project rows need a repo-scoped key (two repos may declare the same path)');
});
