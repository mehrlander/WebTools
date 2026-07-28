// Drive show-repo's Activity > Open view to a seeded, token-free state so the
// list renders headlessly: the crawl's cache normally comes from the private
// registry over the viewer's token, which the sandbox has neither of. Fills
// `activity` directly (openBranches, openRepos and the row helpers are pure
// getters over it), so what the shot proves is the rendering, not the load.
//
//   npm run shot -- pages/show-repo/show-repo.html --script tools/render/scripts/estate-open.mjs
//
// Pass MENU=1 in the environment to open one row's branch menu for the shot,
// REPOCHIP=1 to open a row's repo chip (the repo's whole grouped menu, in the
// shell's panel), or CHIP=1 to narrow the list to one repo through its filter
// chip. HOVER=1 opens either menu by hovering rather than clicking, which is
// what proves the desktop path.
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
      // Landed rows: invisible at the default scope, and the whole point of the
      // Landed one. Two of them, so the chip count is not mistakable for a
      // rounding of the stranded set.
      { name: 'claude/menu-hover-swap', sha: 'g1', group: 'landed', date: iso(300), firstDate: iso(340),
        subject: 'Swap the anchored menu on hover', nUnique: 6, nLanded: 6, nMissing: 0, aheadBy: 0, behindBy: 14 },
      { name: 'claude/thumbs-refresh', sha: 'h1', group: 'landed', date: iso(700), firstDate: iso(760),
        subject: 'Refresh the page thumbnails', nUnique: 3, nLanded: 3, nMissing: 0, aheadBy: 0, behindBy: 61 },
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

// The cards' entries, which the rows read for one thing only: each repo's own
// declared icon, the mark its repo chip wears. The chip's menu also reads the
// shell's config cache for a repo's declared task board, so that is seeded too.
const ENTRIES = [
  { repo: 'me/web-tools', icon: 'ph-toolbox', note: '', group: 'core', order: 11, pins: [], meta: null, err: false, child: null },
  { repo: 'me/home', icon: 'ph-house-line', note: '', group: 'core', order: 13, pins: [], meta: null, err: false, child: null },
  { repo: 'me/scratch', icon: 'ph-note-pencil', note: '', group: 'data', order: 21, pins: [], meta: null, err: false, child: null },
];
const CONFIGS = { 'me/web-tools': { estate: true, tracker: 'tracker/board.md' } };

export default async (page) => {
  await page.waitForFunction(() => window.__shell && window.Alpine, null, { timeout: 15000 });
  await page.evaluate((configs) => {
    window.__shell.goActivity();
    window.__shell.estateConfigs = configs;
  }, CONFIGS);
  await page.waitForFunction(() => !!document.querySelector('[x-data^="estate"]'), null, { timeout: 15000 });
  await page.evaluate(([activity, entries]) => {
    const d = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
    d.authed = true;
    d.activityLoading = false;
    d.activity = activity;
    d.entries = entries;
    d.activityGeneratedAt = new Date(Date.now() - 3600000).toISOString();
  }, [ACTIVITY, ENTRIES]);
  await page.waitForTimeout(600);
  if (process.env.CHIP) {
    await page.locator('button:has-text("home")').first().click();
    await page.waitForTimeout(400);
  }
  const open = async (locator) => {
    if (process.env.HOVER) { await locator.hover(); await page.waitForTimeout(500); }
    else { await locator.click(); await page.waitForTimeout(400); }
  };
  // SCOPE=landed (or recent / stranded / all) switches the list's scope chip
  // before anything else, since the rows a menu hangs off depend on it.
  if (process.env.SCOPE) {
    const label = { landed: 'Landed', recent: 'Recent', stranded: 'Stranded', all: 'All', open: 'Open' }[process.env.SCOPE];
    await page.locator(`button:has-text("${label}")`).first().click();
    await page.waitForTimeout(400);
  }
  if (process.env.MENU) await open(page.locator('button:has-text("GitHub")').first());
  if (process.env.REPOCHIP) await open(page.locator('button[title^="Repo menu: "]').first());
};
