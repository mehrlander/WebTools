// Drive show-repo's Activity > Open view to a seeded, token-free state so the
// list renders headlessly: the crawl's cache normally comes from the private
// registry over the viewer's token, which the sandbox has neither of. Fills
// `activity` directly (openBranches, openRepos and the row helpers are pure
// getters over it), so what the shot proves is the rendering, not the load.
//
//   npm run shot -- pages/show-repo/show-repo.html --script tools/render/scripts/estate-open.mjs
//
// Pass MENU=1 in the environment to open one row's GitHub menu for the shot,
// or CHIP=1 to narrow the list to one repo through its filter chip.
const iso = (d) => new Date(Date.now() - d * 3600000).toISOString();

const ACTIVITY = {
  'me/web-tools': {
    defaultBranch: 'main',
    openPRs: [
      { number: 298, head: 'claude/show-repo-activity-filters', draft: true, title: 'Open view: repo chips, lifespan, GitHub menu',
        updatedAt: iso(2), aheadBy: 6, behindBy: 0, firstDate: iso(52),
        session: 'https://claude.ai/code/session_x' },
      { number: 296, head: 'claude/fab-render-toss', draft: false, title: 'Singleton fab with toss-render',
        updatedAt: iso(30), aheadBy: 12, behindBy: 3, firstDate: iso(500) },
    ],
    survey: { branches: [
      { name: 'claude/show-repo-activity-filters', sha: 'a1', group: 'active', date: iso(2), subject: 'Open view: repo chips, lifespan, GitHub menu' },
      { name: 'claude/fab-render-toss', sha: 'b1', group: 'stranded', date: iso(30), firstDate: iso(500),
        subject: 'Confirm branchesForPath against a live token', aheadBy: 12, behindBy: 3 },
      { name: 'claude/pdf-ink-alignment', sha: 'c1', group: 'stranded', date: iso(200), firstDate: iso(230),
        subject: 'Align ink strokes to the page box', aheadBy: 3, behindBy: 9 },
    ] },
  },
  'me/home': {
    defaultBranch: 'main',
    openPRs: [
      { number: 44, head: 'claude/news-view-refresh', draft: true, title: 'News view refresh',
        updatedAt: iso(9), aheadBy: 2, behindBy: 1, firstDate: iso(11) },
    ],
    survey: { branches: [
      { name: 'claude/news-view-refresh', sha: 'd1', group: 'active', date: iso(9), subject: 'News view refresh' },
      { name: 'claude/ledger-import', sha: 'e1', group: 'stranded', date: iso(400), firstDate: iso(900),
        subject: 'Import the 2025 ledger', aheadBy: 1, behindBy: 40 },
    ] },
  },
  'me/scratch': {
    defaultBranch: 'main',
    openPRs: [],
    survey: { branches: [
      { name: 'claude/spike-parser', sha: 'f1', group: 'stranded', date: iso(70), firstDate: iso(74),
        subject: 'Spike: a smaller parser', aheadBy: 4, behindBy: 2 },
    ] },
  },
};

export default async (page) => {
  await page.waitForFunction(() => window.__shell && window.Alpine, null, { timeout: 15000 });
  await page.evaluate(() => window.__shell.goActivity());
  await page.waitForFunction(() => !!document.querySelector('[x-data^="estate"]'), null, { timeout: 15000 });
  await page.evaluate((activity) => {
    const d = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
    d.authed = true;
    d.activityLoading = false;
    d.activity = activity;
    d.activityGeneratedAt = new Date(Date.now() - 3600000).toISOString();
  }, ACTIVITY);
  await page.waitForTimeout(600);
  if (process.env.CHIP) {
    await page.locator('button:has-text("home")').first().click();
    await page.waitForTimeout(400);
  }
  if (process.env.MENU) {
    await page.locator('button:has-text("GitHub")').first().click();
    await page.waitForTimeout(400);
  }
};
