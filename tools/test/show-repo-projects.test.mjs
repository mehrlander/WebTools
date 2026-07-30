// The sidebar Repos index's PROJECT rows: a repo carrying several workspaces
// declares them in its manifest's `projects` field (the defining convention:
// a workspace running a tracker is a project; the repo root's tracker marks
// the repo itself), and the shell renders them indented under the repo's row.
// This holds the halves that could drift apart silently: the normalizer
// (repoProjects: string/object entries, the derived board, junk dropped), the
// PROJECT VIEW a row opens (goProject, its deep link, the README read), and the
// markup wiring for both sidebar lists, the estate's nested one and the repo's
// own.
//
// The shell's app() lives inline in show-repo.html, so the test evaluates the
// plain <script> block against stubs via the shared show-repo-shell.mjs
// harness (see its header for the tactic and its provenance).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';
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

test('repoProjects: string and object entries normalize to {path, label, board}', () => {
  const { shell } = makeShell();
  shell.estateConfigs = {
    'mehrlander/home': {
      projects: [
        'news',
        { path: 'projects/budget-drs' },
        // A stale `icon` is ignored rather than being an error: the rows
        // stopped drawing one, and a manifest may still carry the field.
        { path: 'projects/budget-wa/', label: 'WA budget', icon: 'ph-bank' },
      ],
    },
  };
  assert.deepEqual(shell.repoProjects('mehrlander/home'), [
    { path: 'news', label: 'news', board: 'news/tracker/board.md' },
    { path: 'projects/budget-drs', label: 'budget-drs',
      board: 'projects/budget-drs/tracker/board.md' },
    { path: 'projects/budget-wa', label: 'WA budget',
      board: 'projects/budget-wa/tracker/board.md' },
  ]);
});

test('repoProjects: the board is derived from the convention, and overridable', () => {
  const { shell } = makeShell();
  shell.estateConfigs = {
    'mehrlander/home': {
      projects: [
        { path: 'projects/a', tracker: 'projects/a/work/board.md' },   // named elsewhere
        { path: 'projects/b', tracker: 'boards/b/' },                  // a folder, trailing slash
        { path: 'projects/c', tracker: false },                        // no board button
        { path: 'projects/d', tracker: '' },                           // empty falls back
      ],
    },
  };
  assert.deepEqual(shell.repoProjects('mehrlander/home').map(p => p.board), [
    'projects/a/work/board.md',
    'boards/b',
    '',
    'projects/d/tracker/board.md',
  ]);
});

test('repoProjects: junk entries drop instead of throwing', () => {
  const { shell } = makeShell();
  shell.estateConfigs = {
    'mehrlander/home': { projects: [null, 42, {}, { path: '' }, { label: 'no path' }, 'ok'] },
  };
  assert.deepEqual(shell.repoProjects('mehrlander/home'),
    [{ path: 'ok', label: 'ok', board: 'ok/tracker/board.md' }]);
});

test('openProject switches the repo, then opens the project view', async () => {
  const { shell, browserStore } = makeShell({ browserStore: { repo: '' } });
  const calls = [];
  shell.ensureBrowser = async (repo) => { calls.push(['ensure', repo]); browserStore.repo = repo; };
  shell.syncUrl = () => {};
  shell.loadProjectReadme = async () => { calls.push('readme'); };
  await shell.openProject('mehrlander/home', { path: 'projects/budget-drs' });
  assert.deepEqual(calls, [['ensure', 'mehrlander/home'], 'readme']);
  assert.equal(shell.view, 'project');
  assert.equal(shell.projectPath, 'projects/budget-drs');
});

test('openProject does not navigate when the repo switch failed', async () => {
  const { shell } = makeShell({ browserStore: { repo: 'mehrlander/web-tools' } });
  const calls = [];
  shell.ensureBrowser = async () => { calls.push('ensure'); /* pickByName failed; repo unchanged */ };
  shell.syncUrl = () => {};
  shell.loadProjectReadme = async () => { calls.push('readme'); };
  await shell.openProject('mehrlander/home', { path: 'projects/budget-drs' });
  assert.deepEqual(calls, ['ensure'], 'a failed switch must not open a project in the wrong repo');
  assert.notEqual(shell.view, 'project');
});

test('goProject sets the view, normalizes the path, and reads the README', () => {
  const { shell } = makeShell({ browserStore: { repo: 'mehrlander/home' } });
  const reads = [];
  shell.syncUrl = () => {};
  shell.loadProjectReadme = async () => { reads.push(shell.projectPath); };
  shell.goProject('projects/budget-wa/');
  assert.equal(shell.view, 'project');
  assert.equal(shell.projectPath, 'projects/budget-wa', 'a trailing slash is trimmed');
  assert.deepEqual(reads, ['projects/budget-wa']);
  // An empty path is not a destination.
  shell.goProject('');
  assert.equal(shell.projectPath, 'projects/budget-wa');
});

test('the open project resolves to its declared entry, or a derived one', () => {
  const { shell } = makeShell({ browserStore: { repo: 'mehrlander/home' } });
  shell.estateConfigs = {
    'mehrlander/home': { projects: [{ path: 'projects/a', label: 'Alpha' }] },
  };
  shell.syncUrl = () => {};
  shell.loadProjectReadme = async () => {};
  shell.goProject('projects/a');
  assert.deepEqual(shell.project, { path: 'projects/a', label: 'Alpha',
                                    board: 'projects/a/tracker/board.md' });
  // A deep link may name a workspace the manifest has not caught up with; the
  // view still opens, on the conventions the path itself implies.
  shell.goProject('projects/unlisted');
  assert.deepEqual(shell.project, { path: 'projects/unlisted', label: 'unlisted',
                                    board: 'projects/unlisted/tracker/board.md' });
});

test('repoProjects prefers the OPEN repo\'s live manifest over the estate cache', () => {
  const { shell, browserStore } = makeShell({ browserStore: { repo: 'mehrlander/home' } });
  shell.estateConfigs = { 'mehrlander/home': { projects: ['stale'] } };
  browserStore.config = { projects: ['live'] };
  assert.deepEqual(shell.repoProjects('mehrlander/home').map(p => p.path), ['live'],
    'inside a repo the manifest at the browsed ref wins over the main-derived cache');
  // Any other repo still reads the cache, which is all there is for one you are
  // not standing in.
  shell.estateConfigs['mehrlander/other'] = { projects: ['cached'] };
  assert.deepEqual(shell.repoProjects('mehrlander/other').map(p => p.path), ['cached']);
});

test('openProjectBoard opens the board in the app, file or folder', async () => {
  const { shell, browserStore } = makeShell({ browserStore: { repo: '' } });
  const calls = [];
  shell.ensureBrowser = async (repo) => { calls.push(['ensure', repo]); browserStore.repo = repo; };
  shell.openFile = async (p) => { calls.push(['file', p]); };
  shell.openFolder = async (p) => { calls.push(['folder', p]); };

  await shell.openProjectBoard('mehrlander/home',
    { path: 'projects/a', board: 'projects/a/tracker/board.md' });
  assert.deepEqual(calls, [['ensure', 'mehrlander/home'], ['file', 'projects/a/tracker/board.md']]);

  // A `tracker` naming a folder opens the folder, openPin's rule.
  calls.length = 0;
  await shell.openProjectBoard('mehrlander/home', { path: 'projects/b', board: 'projects/b/tracker' });
  assert.deepEqual(calls, [['ensure', 'mehrlander/home'], ['folder', 'projects/b/tracker']]);

  // A project with no board never reaches the browser at all (the button is
  // hidden too, but the method is what would run if it were tapped).
  calls.length = 0;
  await shell.openProjectBoard('mehrlander/home', { path: 'projects/c', board: '' });
  assert.deepEqual(calls, []);
});

test('projectGithubUrl points at the folder, at the ref a row tap would browse', () => {
  // The real link builder, so the encoding contract is exercised rather than
  // restated: lib/github-links.js only assigns onto window.
  const win = {};
  new Function('window', readFileSync(path.join(repoRoot, 'lib/github-links.js'), 'utf8'))(win);
  const { shell, browserStore } = makeShell({
    win, browserStore: { repo: 'mehrlander/web-tools', ref: 'main', defaultRef: 'main' },
  });
  const p = { path: 'projects/budget-wa' };
  // A repo you are not browsing: no ref to name, so HEAD.
  assert.equal(shell.projectGithubUrl('mehrlander/home', p),
    'https://github.com/mehrlander/home/tree/HEAD/projects/budget-wa');
  // The open repo, off its default branch: the browsed ref is stamped.
  browserStore.ref = 'claude/some-branch';
  assert.equal(shell.projectGithubUrl('mehrlander/web-tools', p),
    'https://github.com/mehrlander/web-tools/tree/claude/some-branch/projects/budget-wa');
  // Under a branch overlay, the branch a tap would open the repo at wins, even
  // for a repo that is not the open one.
  shell.overlayRefFor = (repo) => (repo === 'mehrlander/home' ? 'claude/overlay' : '');
  assert.equal(shell.projectGithubUrl('mehrlander/home', p),
    'https://github.com/mehrlander/home/tree/claude/overlay/projects/budget-wa');
});

test('a project deep-links as ?repo&view=project&project=', () => {
  const { shell, history } = makeShell({
    browserStore: { repo: 'mehrlander/home', ref: 'main', defaultRef: 'main' },
  });
  const stamped = [];
  history.pushState = (a, b, url) => stamped.push(url);
  history.replaceState = (a, b, url) => stamped.push(url);
  shell.loadProjectReadme = async () => {};
  shell.goProject('projects/budget-wa');
  const last = stamped.at(-1);
  assert.match(last, /view=project/);
  assert.match(last, /project=projects%2Fbudget-wa/);
  assert.match(last, /repo=mehrlander%2Fhome/);
  // Leaving the view drops both keys rather than stranding them on the next URL.
  shell.view = 'landing';
  shell.syncUrl();
  assert.doesNotMatch(stamped.at(-1), /view=project|project=/);
});

test('parseUrl reads the project back off a deep link', () => {
  const { shell } = makeShell({
    search: '?repo=mehrlander/home&view=project&project=projects/budget-wa',
  });
  const url = shell.parseUrl();
  assert.equal(url.view, 'project');
  assert.equal(url.project, 'projects/budget-wa');
  assert.equal(url.repo, 'mehrlander/home');
});

test('the sidebar markup wires the project rows to the shell methods', () => {
  assert.match(page, /x-for="p in repoProjects\(r\.repo\)"/,
    'the Repos index no longer iterates repoProjects');
  assert.match(page, /@click="openProject\(r\.repo, p\)"/,
    'a project row no longer opens through openProject');
  assert.match(page, /repoProjects\(r\.repo\)"[^>]*:key="r\.repo \+ ':' \+ p\.path"/,
    'project rows need a repo-scoped key (two repos may declare the same path)');
  assert.match(page, /@click\.stop="openProjectBoard\(r\.repo, p\)"/,
    'the board button no longer opens through openProjectBoard');
  assert.match(page, /:href="projectGithubUrl\(r\.repo, p\)"/,
    'the github button no longer links through projectGithubUrl');
  // The leading glyph is gone on purpose: every row took the same defaulted
  // icon, so a column of identical marks distinguished nothing.
  assert.doesNotMatch(page, /:class="p\.icon"/, 'project rows draw a leading icon again');
});

test('the repo sidebar carries the same list, and the pane binds the open one', () => {
  // Inside a repo the projects are a section of their own, reading the same
  // normalizer the estate list reads, and selecting one lights that row.
  assert.match(page, /x-for="p in repoProjects\(\$store\.browser\.repo\)"/,
    'the repo sidebar no longer lists the open repo\'s projects');
  assert.match(page, /@click="goProject\(p\.path\)"/,
    'a repo-sidebar project row no longer opens the project view');
  assert.match(page, /view==='project' && projectPath===p\.path/,
    'the repo-sidebar row no longer shows which project is open');
  // The pane is bound to shell state, which is what makes a selection repaint
  // it; a nested component would have to reach through window.__shell.
  assert.match(page, /x-show="view==='project'"/, 'the project pane is gone');
  assert.match(page, /x-html="projectHtml"/, 'the project pane no longer renders its README');
});

test('the project block hugs its repo row, and hangs from a guideline', () => {
  // The gap between a repo row and a project row is the repo row's own slack,
  // not a declared margin, so the block is pulled back to close it; the rule at
  // ml-4 sits on the centre of the repo icon above, which is what makes it read
  // as hanging from the parent rather than as a margin.
  assert.match(page,
    /<div class="flex flex-col -mt-1 ml-4 pl-2 border-l border-base-300" x-show="repoProjects\(r\.repo\)\.length">/,
    'the project block no longer pulls up under its repo row on a guideline');
});
