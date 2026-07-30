// screenshot.mjs interaction scenario: the PROJECT VIEW inside a repo — the
// sidebar's Projects section with one of them selected, and the pane rendering
// that workspace's README.
//
//   node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/project-view.mjs \
//     --out tools/.preview/project-view.png
//
// The sandbox blocks api.github.com, so the open repo's manifest (which is where
// the sidebar's project list comes from, the shell preferring the live one over
// the estate cache) and the workspace README are served from a stub over the GH
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
    const README = [
      '# Budget WA',
      '',
      'The Washington state operating budget workspace: the OFM extracts, the',
      'reconciliation notebooks, and the exhibits built from them.',
      '',
      '## Layout',
      '',
      '- `data/` the fetched extracts, one folder per release',
      '- `notes/` working notes, dated',
      '- `tracker/` the task board for this workspace',
      '',
      'Figures here are transcribed from published OFM tables and carry their',
      'source in the sheet that uses them.',
    ].join('\n');

    store.gh = {
      repo: 'mehrlander/home', ref: 'main',
      async get(p) {
        if (p === '.web-tools.json') return { text: JSON.stringify(MANIFEST) };
        if (p === 'projects/budget-wa/README.md') return { text: README };
        const e = new Error('404'); e.status = 404; throw e;
      },
      async req() { const e = new Error('404'); e.status = 404; throw e; },
      ago: () => 'just now',
    };
    store.defaultRef = 'main';
    store.ref = 'main';
    store.repo = 'mehrlander/home';

    // Setting store.repo queues the shell's own watchers (repo change -> the
    // landing view, plus the manifest read). Alpine flushes them on a
    // microtask, so let them land BEFORE navigating, exactly as openProject's
    // `await ensureBrowser` does; otherwise the watcher repaints over the
    // project view a tick later and the sidebar list arrives after the shot.
    await new Promise(r => setTimeout(r, 300));
    shell.goProject('projects/budget-wa');
    return true;
  });
  if (ok !== true) throw new Error('project-view scenario: ' + ok);

  await page.waitForFunction(
    () => document.body.innerText.includes('The Washington state operating budget')
       && document.body.innerText.includes('fiscal-notes'),
    { timeout: 20000 });
  await page.waitForTimeout(400);
}
