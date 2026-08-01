// The drawer over a ROUTED subject: a markdown file rendered through the data
// view, with the file (not the app) as the identity the drawer reports.
//
//   npm run shot -- pages/toss-render.html \
//     --hash 'data=mehrlander/web-tools:docs/show-repo.md' \
//     --script tools/render/scripts/routed-subject.mjs

export default async (page) => {
  await page.waitForFunction(() => window.Alpine && document.querySelector('[x-data^="fab"]'),
    null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const d = window.Alpine.$data(document.querySelector('[x-data^="fab"]'));
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
  });
  await page.waitForTimeout(800);
};
