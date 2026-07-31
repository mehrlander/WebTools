// screenshot.mjs interaction scenario: the PROJECT VIEW's Docs pill — the
// workspace's markdown surfaced from one recursive tree read, root files first,
// then one group per folder, with the curated DOCS.md lead and the path filter.
//
//   node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/project-docs.mjs \
//     --out tools/.preview/project-docs.png
//
// Same tactic as project-view.mjs: the sandbox blocks api.github.com, so the
// manifest, the tree, and the DOCS.md are served from a stub over the GH
// instance the shell holds.
export default async function (page) {
  const ok = await page.evaluate(async () => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.TOKEN = 'fixture-token';
    const shell = window.__shell;
    const store = window.Alpine.store('browser');

    const MANIFEST = {
      estate: true, icon: 'ph-house', group: 'core',
      tracker: 'tracker/board.md',
      projects: ['projects/news', 'projects/bills', 'projects/budget-drs',
                 'projects/budget-wa', 'projects/fiscal-notes', 'projects/wps'],
      pins: ['chron'],
    };
    const DOCS = [
      '# Budget WA: reading order',
      '',
      'Start with the README, then the schema notes; the analysis folder is',
      'dated and newest-first. Everything else is working paper.',
    ].join('\n');
    const MD = [
      'README.md', 'DOCS.md',
      'analysis/2026-06-30-agency-rollup.md',
      'analysis/2026-07-12-fund-splits.md',
      'analysis/README.md',
      'notes/2026-07-02-ofm-extract-quirks.md',
      'notes/2026-07-19-biennium-crosswalk.md',
      'schema/README.md',
      'schema/columns.md',
      'tracker/README.md',
    ];
    const blob = (p) => ({ path: 'projects/budget-wa/' + p, type: 'blob' });

    store.gh = {
      repo: 'mehrlander/home', ref: 'main',
      async get(p) {
        if (p === '.web-tools.json') return { text: JSON.stringify(MANIFEST) };
        if (p === 'projects/budget-wa/DOCS.md') return { text: DOCS };
        const e = new Error('404'); e.status = 404; throw e;
      },
      async req(u) {
        if (/^git\/trees\//.test(u)) return { tree: MD.map(blob) };
        const e = new Error('404'); e.status = 404; throw e;
      },
      ago: () => 'just now',
    };
    store.defaultRef = 'main';
    store.ref = 'main';
    store.repo = 'mehrlander/home';

    // Let the repo-change watchers land before navigating (project-view.mjs's
    // rule), then open the workspace straight onto its Docs pill.
    await new Promise(r => setTimeout(r, 300));
    shell.goProject('projects/budget-wa', 'docs');
    return true;
  });
  if (ok !== true) throw new Error('project-docs scenario: ' + ok);

  await page.waitForFunction(
    () => document.body.innerText.includes('Budget WA: reading order')
       && document.body.innerText.includes('biennium-crosswalk')
       && document.body.innerText.includes('10 files'),
    { timeout: 20000 });
  await page.waitForTimeout(400);
}
