// screenshot.mjs interaction scenario: the PROJECT VIEW's Board pill — the
// tracker board rendered in-pane, its relative task links resolved into the
// shell's viewer (onBoardClick) rather than dangling off the pane's URL.
//
//   node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/project-board.mjs \
//     --out tools/.preview/project-board.png
//
// Same tactic as project-view.mjs: the sandbox blocks api.github.com, so the
// manifest and the board file are served from a stub over the GH instance the
// shell holds.
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
    const BOARD = [
      '# budget-wa board',
      '',
      'Generated from `tasks/`. See the [protocol](README.md).',
      '',
      '## In progress',
      '',
      '- [Extend the statewide vendor ceiling-vs-outlay join](tasks/vendor-ceiling-join-x1a2b3.md)',
      '',
      '## On deck',
      '',
      '- [Carry the proviso hierarchy into provisos.csv](tasks/proviso-hierarchy-c4d5e6.md)',
      '- [Feed the normalized tables from a PDF-first bill](tasks/pdf-first-bill-f7g8h9.md)',
      '- [Resolve veto cites to the proviso paragraphs they strike](tasks/veto-cites-j1k2l3.md)',
      '',
      '## Done',
      '',
      '- [Explain the sub-100% joins the schema audit recorded](tasks/sub-100-joins-m4n5p6.md)',
    ].join('\n');

    store.gh = {
      repo: 'mehrlander/home', ref: 'main',
      async get(p) {
        if (p === '.web-tools.json') return { text: JSON.stringify(MANIFEST) };
        if (p === 'projects/budget-wa/tracker/board.md') return { text: BOARD };
        const e = new Error('404'); e.status = 404; throw e;
      },
      async req() { const e = new Error('404'); e.status = 404; throw e; },
      ago: () => 'just now',
    };
    store.defaultRef = 'main';
    store.ref = 'main';
    store.repo = 'mehrlander/home';

    await new Promise(r => setTimeout(r, 300));
    shell.goProject('projects/budget-wa', 'board');
    return true;
  });
  if (ok !== true) throw new Error('project-board scenario: ' + ok);

  await page.waitForFunction(
    () => document.body.innerText.includes('On deck')
       && document.body.innerText.includes('proviso hierarchy'),
    { timeout: 20000 });
  await page.waitForTimeout(400);
}
