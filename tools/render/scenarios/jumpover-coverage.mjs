// The jump-overs filled in by the exact-file pass, rendered headlessly. Each
// target normally needs a token (the sidebar's recent list is a commits read,
// the stage is cross-repo, a compare is two refs), so the rows are seeded
// directly and what the shot proves is the rendering, not the load.
//
//   npm run shot -- pages/show-repo/show-repo.html --script tools/render/scenarios/jumpover-coverage.mjs
//
// WHERE picks the view:
//   recent   the sidebar's Recent entries, with one row's icon hovered (default)
//   stage    the Stage view's staged rows, one hovered
//   compare  the compare panel's per-file rows

const RECENT = [
  { path: 'lib/kits/source-peek.js', age: '2h' },
  { path: 'docs/show-repo.md', age: '2h' },
  { path: 'lib/alpineComponents/map.js', age: '3h' },
  { path: 'tracker/board.md', age: '1d' },
];

const STAGE = [
  { repo: 'mehrlander/web-tools', ref: 'main', path: 'docs/routes.json' },
  { repo: 'mehrlander/web-tools', ref: 'main', path: 'lib/kits/source-peek.js' },
  { repo: 'mehrlander/home', ref: '', path: 'docs/CONSTELLATION.md' },
];

const COMPARE = {
  status: 'ahead', ahead_by: 3, behind_by: 0,
  commits: [{ sha: 'a'.repeat(40), commit: { message: 'Give the icon one meaning', author: { date: new Date(0).toISOString() } } }],
  files: [
    { filename: 'lib/kits/source-peek.js', status: 'added', additions: 260, deletions: 0 },
    { filename: 'lib/alpineComponents/map.js', status: 'modified', additions: 41, deletions: 12 },
    { filename: 'docs/old-notes.md', status: 'removed', additions: 0, deletions: 88 },
  ],
};

export default async (page) => {
  await page.waitForFunction(() => window.__shell && window.Alpine, null, { timeout: 15000 });
  const where = process.env.WHERE || 'recent';

  if (where === 'stage') {
    await page.evaluate((items) => {
      window.__shell.goStage();
      window.Alpine.store('browser').stage = items;
    }, STAGE);
    await page.waitForSelector('a[data-peek$="routes.json"]', { timeout: 15000 });
    const icon = page.locator('a[data-peek$="routes.json"]').first();
    await icon.locator('xpath=..').hover();
    await icon.hover();
    await page.waitForTimeout(1600);
    return;
  }

  // Both remaining views are inside a repo, so open one first. The sandbox's
  // contents-API shim serves this repo from the working tree.
  // goFiles leaves the estate context, which is what un-hides the sidebar's
  // per-repo panels (estateCtx gates them).
  await page.evaluate(async () => {
    await window.__shell.ensureBrowser('mehrlander/web-tools', '');
    window.__shell.goFiles();
  });
  await page.waitForTimeout(1500);

  if (where === 'compare') {
    await page.evaluate((data) => {
      window.__shell.view = 'branches';
      window.__shell.branchesSeen = true;
      const d = document.getElementById('compare').__compare;
      d.open = true;   // the panel is collapsed until a reader opens it
      d.base = 'main'; d.head = 'claude/github-icon-placement'; d.data = data;
    }, COMPARE);
    await page.waitForTimeout(600);
    const icon = page.locator('#compare a[data-peek$="kits/source-peek.js"]').first();
    await icon.scrollIntoViewIfNeeded();
    await icon.hover();
    await page.waitForTimeout(1600);
    return;
  }

  await page.evaluate((recent) => {
    window.__shell.drawer = true;
    window.__shell.recentLoading = false;
    window.__shell.recent = recent;
  }, RECENT);
  await page.waitForTimeout(600);
  const icon = page.locator('aside a[data-peek$="show-repo.md"]').first();
  await icon.locator('xpath=..').hover();
  await icon.hover();
  await page.waitForTimeout(1600);
};
