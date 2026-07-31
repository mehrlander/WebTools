// screenshot.mjs interaction scenario: the PROJECT VIEW's Pages pill — the
// workspace's slice of the repo catalog (in-folder by prefix plus a `project`
// claim), as lean cards. The card iframes point at toss-render, which is
// token-gated headless, so the pixels show the card frame and metadata rather
// than the rendered pages; the live composition is the deployed page's job.
//
//   node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/project-pages.mjs \
//     --out tools/.preview/project-pages.png
export default async function (page) {
  const ok = await page.evaluate(async () => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.TOKEN = 'fixture-token';
    const shell = window.__shell;
    const store = window.Alpine.store('browser');

    const MANIFEST = {
      estate: true, icon: 'ph-house', group: 'core',
      tracker: 'tracker/board.md',
      projects: [
        'projects/news', 'projects/bills',
        { path: 'projects/budget-drs', landing: 'projects/budget-drs/app/view/app.html' },
        'projects/budget-wa', 'projects/fiscal-notes', 'projects/wps',
      ],
      pages: [
        { path: 'projects/budget-drs/app/view/app.html', title: 'Budget DRS',
          note: 'Fiscal explorer for the DRS budget.' },
        { path: 'projects/budget-drs/submittal/START-HERE.html', title: 'Budget Submittal',
          note: 'DRS 2027-29 submittal: what is due, received, drafted.' },
        { path: 'projects/budget-drs/submittal/checklist.html', title: 'Appendix B Checklist',
          note: 'Every line of the checklist, with form, chapter, statute.' },
        { path: 'chron/blog/index.html', title: 'Blog', project: 'projects/budget-drs',
          note: 'Claimed from outside the folder via the project key.' },
      ],
      pins: ['chron'],
    };

    store.gh = {
      repo: 'mehrlander/home', ref: 'main',
      async get(p) {
        if (p === '.web-tools.json') return { text: JSON.stringify(MANIFEST) };
        const e = new Error('404'); e.status = 404; throw e;
      },
      async req() { const e = new Error('404'); e.status = 404; throw e; },
      ago: () => 'just now',
    };
    store.defaultRef = 'main';
    store.ref = 'main';
    store.repo = 'mehrlander/home';

    await new Promise(r => setTimeout(r, 300));
    shell.goProject('projects/budget-drs', 'pages');
    return true;
  });
  if (ok !== true) throw new Error('project-pages scenario: ' + ok);

  await page.waitForFunction(
    () => document.body.innerText.includes('Appendix B Checklist')
       && document.body.innerText.includes('Claimed from outside the folder'),
    { timeout: 20000 });
  await page.waitForTimeout(600);
}
