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
//
// A third arm, the ref compare's per-file rows, went with the compare component
// when the per-repo branch review was retired (2026-08-14). The jump-over it
// exercised is the same one the other two arms cover.

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

  // The Recent list is a per-repo panel, so open a repo first; the sandbox's
  // contents-API shim serves this repo from the working tree. goSearch leaves
  // the estate context, which is what un-hides the sidebar's per-repo panels
  // (estateCtx gates them).
  await page.evaluate(async () => {
    await window.__shell.ensureBrowser('mehrlander/web-tools', '');
    window.__shell.goSearch();
  });
  await page.waitForTimeout(1500);

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
