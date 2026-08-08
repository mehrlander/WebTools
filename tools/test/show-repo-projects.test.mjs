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
    { path: 'news', label: 'news', board: 'news/tracker/board.md', landing: '' },
    { path: 'projects/budget-drs', label: 'budget-drs',
      board: 'projects/budget-drs/tracker/board.md', landing: '' },
    { path: 'projects/budget-wa', label: 'WA budget',
      board: 'projects/budget-wa/tracker/board.md', landing: '' },
  ]);
});

test('repoProjects: a landing is kept as a root-relative path, junk reads as undeclared', () => {
  const { shell } = makeShell();
  shell.estateConfigs = {
    'mehrlander/home': {
      projects: [
        { path: 'projects/a', landing: 'projects/a/app/view/app.html' },
        { path: 'projects/b', landing: '/projects/b/index.html/' },  // stray slashes trimmed
        { path: 'projects/c', landing: '' },
        { path: 'projects/d', landing: 42 },
        { path: 'projects/e' },
      ],
    },
  };
  assert.deepEqual(shell.repoProjects('mehrlander/home').map(p => p.landing), [
    'projects/a/app/view/app.html',
    'projects/b/index.html',
    '', '', '',
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
    [{ path: 'ok', label: 'ok', board: 'ok/tracker/board.md', landing: '' }]);
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
                                    board: 'projects/a/tracker/board.md', landing: '' });
  // A deep link may name a workspace the manifest has not caught up with; the
  // view still opens, on the conventions the path itself implies.
  shell.goProject('projects/unlisted');
  assert.deepEqual(shell.project, { path: 'projects/unlisted', label: 'unlisted',
                                    board: 'projects/unlisted/tracker/board.md', landing: '' });
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

test('openProjectBoard routes a file board to the Board pill, a folder board to Files', async () => {
  const { shell, browserStore } = makeShell({ browserStore: { repo: '' } });
  const calls = [];
  shell.ensureBrowser = async (repo) => { calls.push(['ensure', repo]); browserStore.repo = repo; };
  shell.openFolder = async (p) => { calls.push(['folder', p]); };
  shell.goProject = (path, tab) => { calls.push(['project', path, tab]); };

  // A file board lands on the rendered, navigable pill, so every board tap
  // (estate row, repo sidebar row, header button) reads the same surface.
  await shell.openProjectBoard('mehrlander/home',
    { path: 'projects/a', board: 'projects/a/tracker/board.md' });
  assert.deepEqual(calls, [['ensure', 'mehrlander/home'], ['project', 'projects/a', 'board']]);

  // A `tracker` naming a folder has no one file to render: openPin's rule.
  calls.length = 0;
  await shell.openProjectBoard('mehrlander/home', { path: 'projects/b', board: 'projects/b/tracker' });
  assert.deepEqual(calls, [['ensure', 'mehrlander/home'], ['folder', 'projects/b/tracker']]);

  // A project with no board never reaches the browser at all (the button is
  // hidden too, but the method is what would run if it were tapped).
  calls.length = 0;
  await shell.openProjectBoard('mehrlander/home', { path: 'projects/c', board: '' });
  assert.deepEqual(calls, []);
});

test('the Board pill exists for a file board only, and renders the board keyed per ref', async () => {
  const gets = [];
  const { shell, browserStore } = makeShell({ browserStore: {
    repo: 'mehrlander/home', ref: 'main', defaultRef: 'main',
    gh: { get: async (p) => { gets.push(p); return { text: '# Board' }; } },
  }});
  shell.syncUrl = () => {};
  browserStore.config = { projects: [
    { path: 'projects/a' },
    { path: 'projects/b', tracker: 'projects/b/boards' },
  ] };
  shell.goProject('projects/a', 'board');
  assert.equal(shell.projectBoardFile, 'projects/a/tracker/board.md');
  await new Promise(r => setTimeout(r));
  // The typed projection is tried first (docs/TRACKER.md, board.json). This
  // stub answers every path with the same markdown, so the JSON parse fails
  // and the loader falls through to the markdown board, which is exactly the
  // path a tracker that has not regenerated yet takes. Both fetches are the
  // correct trace for that case; the projection's own path is covered in
  // show-repo-board-review.test.mjs.
  assert.deepEqual(gets, ['projects/a/tracker/board.json', 'projects/a/tracker/board.md']);
  assert.equal(shell.projectBoardTasks, null, 'nothing parsed as a projection');
  assert.equal(shell.projectBoardLoading, false);
  // marked is unloadable under the harness, so the render falls back to the
  // escaped <pre>; the loader having produced SOMETHING is the contract here.
  assert.match(shell.projectBoardHtml, /Board/);
  // A folder board earns no pill; the header button keeps the folder route.
  shell.projectPath = 'projects/b';
  assert.equal(shell.projectBoardFile, '');
});

test('resolveRepoRelative folds board links onto repo-root paths', () => {
  const { shell } = makeShell();
  const base = 'projects/a/tracker';
  assert.equal(shell.resolveRepoRelative(base, 'tasks/foo-x1.md'), 'projects/a/tracker/tasks/foo-x1.md');
  assert.equal(shell.resolveRepoRelative(base, './README.md'), 'projects/a/tracker/README.md');
  assert.equal(shell.resolveRepoRelative(base, '../notes/x.md'), 'projects/a/notes/x.md');
  assert.equal(shell.resolveRepoRelative(base, '../../../tools'), 'tools');
  assert.equal(shell.resolveRepoRelative(base, 'tasks/foo.md#L10'), 'projects/a/tracker/tasks/foo.md',
    'a fragment is display baggage, not path');
  assert.equal(shell.resolveRepoRelative(base, '/docs/TRACKER.md'), 'docs/TRACKER.md',
    'a root-absolute href resolves from the repo root');
  assert.equal(shell.resolveRepoRelative(base, '../../../../escape.md'), '',
    'a hop past the root resolves to nothing rather than guessing');
  assert.equal(shell.resolveRepoRelative(base, ''), '');
});

test('projectGithubUrl points at the folder, at the ref a row tap would browse', () => {
  // The real link builder, so the encoding contract is exercised rather than
  // restated: lib/kits/github-links.js only assigns onto window.
  const win = {};
  new Function('window', readFileSync(path.join(repoRoot, 'lib/kits/github-links.js'), 'utf8'))(win);
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

test('both project lists hang off the same rule, and the card carries neither list', () => {
  // Two lists now, not three: the estate sidebar's nested rows and the repo
  // sidebar's Projects section. One treatment; a change to one that skips the
  // other is the drift this catches.
  assert.match(page, /class="flex flex-col gap-0\.5 ml-4 pl-2 border-l border-base-300"/,
    'the repo sidebar\'s Projects section no longer hangs off the rule');

  // The estate card dropped its pins and projects bands on 2026-07-31: two
  // bands of static navigation sat above the only row reporting live state
  // (branches, stranded, open PRs), and a card answers "does this repo need
  // me?", which a list that reads the same every day cannot help answer. Both
  // are one sidebar tap away. Asserted as an absence so a later change has to
  // be deliberate about putting them back.
  const estate = readFileSync(path.join(repoRoot, 'lib/alpineComponents/estate.js'), 'utf8');
  assert.doesNotMatch(estate, /face\(e\)\.projects/,
    'the estate card renders projects again');
  assert.doesNotMatch(estate, /face\(e\)\.pins/,
    'the estate card renders pins again');
  // And the entry stops carrying what nothing reads, so the dead fields cannot
  // quietly come back ahead of the markup.
  assert.doesNotMatch(estate, /^\s*projects: window\.__shell/m,
    'the card entry carries a projects field again with no consumer');
  assert.doesNotMatch(estate, /^\s*pins: Array\.isArray\(cfg\.pins\)/m,
    'the card entry carries a pins field again with no consumer');

  // The live row is what the space was cleared for; losing it silently would
  // make the removal a net loss.
  assert.match(estate, /cardActivity\(face\(e\)\.repo\)/,
    'the card no longer reports branch activity');
});

test('a landing takes the Overview slot, rendered through toss-render at the browsed ref', () => {
  const { shell, browserStore } = makeShell({
    browserStore: { repo: 'mehrlander/home', ref: 'main', defaultRef: 'main' },
  });
  browserStore.config = { projects: [{ path: 'projects/a', landing: 'projects/a/app.html' }] };
  shell.syncUrl = () => {};
  const reads = [];
  shell.loadProjectReadme = async () => reads.push('readme');
  shell.loadProjectDocs = async () => reads.push('docs');
  shell.goProject('projects/a');
  assert.equal(shell.projectLandingUrl, '../toss-render.html#gh=mehrlander/home:projects/a/app.html');
  assert.deepEqual(reads, [], 'a landing Overview must not fetch the README it will not render');
  // Off the default branch the landing follows the browsed ref, like
  // projectGithubUrl: inside a repo the honest list is the one on the ref you
  // are standing on, and its landing is too.
  browserStore.ref = 'claude/b';
  assert.equal(shell.projectLandingUrl, '../toss-render.html#gh=mehrlander/home@claude/b:projects/a/app.html');
  // The pills load only what they render: Docs fetches its listing, Pages
  // fetches nothing (a pure derivation off the manifest already in hand).
  shell.goProjectTab('docs');
  assert.deepEqual(reads, ['docs']);
  shell.goProjectTab('pages');
  assert.deepEqual(reads, ['docs']);
});

test('the FAB busts out of a project landing embed', () => {
  const { shell, browserStore } = makeShell({
    browserStore: { repo: 'mehrlander/home', ref: 'main', defaultRef: 'main' },
  });
  browserStore.config = { projects: [{ path: 'projects/a', label: 'Alpha', landing: 'projects/a/app.html' }] };
  shell.view = 'project';
  shell.projectPath = 'projects/a';
  shell.projectTab = 'overview';
  const acts = shell.actions;
  assert.equal(acts.length, 1);
  assert.equal(acts[0].label, 'Open Alpha landing full-page');
  assert.match(acts[0].run().nav, /toss-render\.html#gh=mehrlander\/home:projects\/a\/app\.html$/);
  // The other pills are not an embed, so there is nothing to bust out of.
  shell.projectTab = 'docs';
  assert.deepEqual(shell.actions, []);
});

test('projectPages is the workspace slice of the repo catalog, derived not declared', () => {
  const { shell, browserStore } = makeShell({
    browserStore: { repo: 'mehrlander/home', ref: 'main', defaultRef: 'main' },
  });
  browserStore.config = {
    projects: ['projects/budget-drs'],
    pages: [
      { path: 'projects/budget-drs/app/view/app.html', title: 'Budget DRS', note: 'Fiscal explorer.' },
      { path: 'projects/budget-wa/dashboard/index.html', title: 'Another workspace' },
      { path: 'chron/blog/index.html', title: 'Claimed', project: 'projects/budget-drs' },
      { path: 'mehrlander/web-tools:pages/links.html', title: 'Cross-repo, unclaimed' },
      null, { title: 'no path' },
    ],
  };
  shell.syncUrl = () => {};
  shell.loadProjectReadme = async () => {};
  shell.goProject('projects/budget-drs');
  const items = shell.projectPages;
  // In-folder by prefix, plus the explicit `project` claim; a sibling
  // workspace's page and an unclaimed cross-repo page stay out.
  assert.deepEqual(items.map(i => i.label), ['Budget DRS', 'Claimed']);
  assert.equal(items[0].live,
    '../toss-render.html#gh=mehrlander/home:projects/budget-drs/app/view/app.html');
  assert.equal(items[0].code,
    'https://github.com/mehrlander/home/blob/main/projects/budget-drs/app/view/app.html');
  // Browsing off the default branch, the tiles follow the ref like the rest of
  // the project view.
  browserStore.ref = 'claude/branch';
  assert.equal(shell.projectPages[0].live,
    '../toss-render.html#gh=mehrlander/home@claude/branch:projects/budget-drs/app/view/app.html');
});

test('groupProjectDocs: root leads, folders alphabetical, READMEs lead their folder', () => {
  const { shell } = makeShell();
  const groups = shell.groupProjectDocs([
    'submittal/plan.md', 'README.md', 'submittal/README.md', 'app/notes.md',
    'DOCS.md', 'submittal/checklist.md',
  ]);
  assert.deepEqual(groups.map(g => g.dir), ['', 'app', 'submittal']);
  assert.deepEqual(groups[0].files.map(f => f.name), ['README.md', 'DOCS.md']);
  assert.deepEqual(groups[2].files.map(f => f.rel),
    ['submittal/README.md', 'submittal/checklist.md', 'submittal/plan.md']);
});

test('loadProjectDocs filters the tree to workspace markdown, and failure is not "no docs"', async () => {
  const tree = [
    { path: 'projects/a/README.md', type: 'blob' },
    { path: 'projects/a/DOCS.md', type: 'blob' },
    { path: 'projects/a/notes/x.md', type: 'blob' },
    { path: 'projects/a/notes', type: 'tree' },        // a folder is not a doc
    { path: 'projects/a/app.html', type: 'blob' },     // not markdown
    { path: 'projects/ab/decoy.md', type: 'blob' },    // sibling sharing the prefix chars
    { path: 'other/y.md', type: 'blob' },
  ];
  const gets = [];
  const { shell } = makeShell({ browserStore: {
    repo: 'mehrlander/home', ref: '', defaultRef: 'main',
    gh: {
      req: async (u) => { assert.equal(u, 'git/trees/HEAD?recursive=1'); return { tree }; },
      get: async (p) => { gets.push(p); return { text: '# idx' }; },
    },
  }});
  shell.projectPath = 'projects/a';
  await shell.loadProjectDocs();
  assert.deepEqual(shell.projectDocs.map(g => g.dir), ['', 'notes']);
  assert.equal(shell.projectDocsCount, 3);
  assert.equal(shell.projectDocsLoading, false);
  // A DOCS.md is fetched as the curated lead when the workspace keeps one (its
  // render is a browser concern; here the read is what is observable).
  assert.deepEqual(gets, ['projects/a/DOCS.md']);
  // The filter narrows by full relative path, dropping emptied groups.
  shell.projectDocsQ = 'notes';
  assert.deepEqual(shell.projectDocsGroups.map(g => g.dir), ['notes']);

  const { shell: s2 } = makeShell({ browserStore: {
    repo: 'mehrlander/home', ref: '', defaultRef: 'main',
    gh: { req: async () => { throw new Error('nope'); } },
  }});
  s2.projectPath = 'projects/a';
  await s2.loadProjectDocs();
  assert.equal(s2.projectDocs, null, 'a failed tree read must stay distinct from an empty workspace');
  assert.equal(s2.projectDocsLoading, false);
});

test('a docs row opens the file in the shell viewer', () => {
  const { shell } = makeShell();
  const opened = [];
  shell.openFile = async (p) => opened.push(p);
  shell.projectPath = 'projects/a';
  shell.openProjectDoc('notes/x.md');
  shell.openProjectDoc('');
  assert.deepEqual(opened, ['projects/a/notes/x.md']);
});

test('a non-default pill rides the deep link as &tab=, and boot routes it back', () => {
  const { shell, history } = makeShell({
    browserStore: { repo: 'mehrlander/home', ref: 'main', defaultRef: 'main' },
  });
  const stamped = [];
  history.pushState = (a, b, url) => stamped.push(url);
  history.replaceState = (a, b, url) => stamped.push(url);
  shell.loadProjectReadme = async () => {};
  shell.loadProjectDocs = async () => {};
  shell.goProject('projects/budget-wa', 'docs');
  assert.match(stamped.at(-1), /tab=docs/);
  // Overview is the default, so it stamps no tab; an unknown tab collapses to
  // it rather than stranding the pane.
  shell.goProjectTab('overview');
  assert.doesNotMatch(stamped.at(-1), /tab=/);
  shell.goProject('projects/budget-wa', 'bogus');
  assert.equal(shell.projectTab, 'overview');

  const { shell: s2 } = makeShell({
    search: '?repo=mehrlander/home&view=project&project=projects/budget-wa&tab=docs',
  });
  assert.equal(s2.parseUrl().tab, 'docs');
  // Both boot paths hand the tab through goProject with the project.
  assert.equal([...page.matchAll(/goProject\(url\.project, url\.tab\)/g)].length, 2,
    'init and popstate no longer route the tab');
});

test('the pane wires the pills, the landing embed, the pages grid, and the docs rows', () => {
  assert.match(page, /@click="goProjectTab\('overview'\)"/, 'the Overview pill is gone');
  assert.match(page, /x-show="projectBoardFile"[^>]*@click="goProjectTab\('board'\)"/,
    'the Board pill must exist for a file board only');
  assert.match(page, /@click="onBoardClick\(\$event\)"/,
    'the rendered board no longer resolves its relative links in-app');
  assert.match(page, /x-html="projectBoardHtml"/, 'the board pane is gone');
  assert.match(page, /x-show="project\.board && !projectBoardFile"/,
    'the header Board button must yield to the pill for a file board');
  assert.match(page, /x-show="projectPages\.length"[^>]*@click="goProjectTab\('pages'\)"/,
    'the Pages pill must hide when the workspace claims no pages');
  assert.match(page, /@click="goProjectTab\('docs'\)"/, 'the Docs pill is gone');
  assert.match(page, /:src="projectLandingUrl"/, 'the landing iframe is gone');
  assert.match(page, /x-for="pg in projectPages"/, 'the pages grid no longer iterates projectPages');
  assert.match(page, /@click="openProjectDoc\(f\.rel\)"/, 'a docs row no longer opens in the viewer');
  assert.match(page, /x-html="projectDocsIndexHtml"/, 'the curated DOCS.md lead is gone');
});

test('the two sidebar project lists are sized the same', () => {
  // The estate's nested rows were smaller and dimmer than the repo sidebar's
  // for a while; the guideline made that argument unnecessary. Both now carry
  // the same row metrics, and this is what catches one drifting from the other.
  const rows = [...page.matchAll(
    /class="flex items-center min-w-0 flex-1 px-2 py-1\.5 text-base text-left transition-colors/g)];
  assert.equal(rows.length, 2, 'the two project lists no longer share their row size');
  const blocks = [...page.matchAll(/flex flex-col gap-0\.5 ml-4 pl-2 border-l border-base-300/g)];
  assert.equal(blocks.length, 2, 'the two project blocks no longer share their guideline and gap');
  // The negative margin is gone with the size difference that needed it: at
  // equal row heights there is no slack to close and the pull would crowd.
  assert.doesNotMatch(page, /-mt-1 ml-4 pl-2/, 'the project block pulls up again');
});
