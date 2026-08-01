// The drawer over a ROUTED subject: a markdown file rendered through the data
// view, with the file (not the app) as the identity the drawer reports.
//
//   npm run shot -- pages/toss-render.html \
//     --hash 'data=mehrlander/web-tools:docs/show-repo.md' \
//     --script tools/render/scripts/routed-subject.mjs
//
// SHELL_MODE=branch  the working tree's toss-render, which re-stamps (default)
// SHELL_MODE=main    the re-stamp undone, which is what the DEPLOYED shell does:
//                    it hands the fab pages/data-view.html and nothing else, and
//                    the fab has to read the route off the address instead.
//
// The main mode is the one worth running. It is the only way to see, before the
// shell change merges, whether a viewer opening a #data= toss today gets a
// drawer titled with the file or with the app.

const SHELL = process.env.SHELL_MODE || 'branch';

export default async (page) => {
  await page.waitForFunction(() => window.Alpine && document.querySelector('[x-data^="fab"]'),
    null, { timeout: 20000 });
  await page.waitForTimeout(2500);

  const seen = await page.evaluate((shell) => {
    const d = window.Alpine.$data(document.querySelector('[x-data^="fab"]'));
    // Roll the subject back to what a shell with no route knowledge leaves
    // behind: the renderer, bare. The page ran for real up to this point, so
    // the frame, the fetch, and the address are all the live ones; only the
    // stamp is aged. Doing it here rather than in an init script because the
    // shot tool navigates before the scenario runs, so an init script arrives
    // after the stamp it means to intercept.
    if (shell === 'main') {
      const s = window.__tossSubject;
      if (s && s.route) window.__tossSubject = { repo: s.via.repo, ref: s.via.ref, path: s.via.path };
    }
    d.adoptSubject();
    d.open = true;
    d.activeTab = 'render';
    // The branch survey and the guide come from the viewer's token, which the
    // sandbox has none of; seed enough that the pane is about the identity
    // block rather than about a spinner.
    d.defaultBranch = 'main';
    d.pageBranches = [{ name: 'main', ago: '2h', subject: 'Merge pull request #334', status: 'baseline' }];
    d.pageBranchesLoaded = true;
    d.verLoaded = true;
    d.ver = { ref: 'main', sha: 'bb3f5f0', tipUrl: 'https://github.com/x', pr: '334',
              prUrl: 'https://github.com/y', since: 1, ago: '7h ago' };
    return { stamped: window.__tossSubject, repo: d.repo, path: d.path, ref: d.ref,
             route: d.subjectRoute, via: d.subjectVia && d.subjectVia.path, take: d.takePath };
  }, SHELL);
  console.log('  shell=' + SHELL + ' -> ' + JSON.stringify(seen, null, 2));
  await page.waitForTimeout(800);
};
