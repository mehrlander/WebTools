// Drive show-repo's Activity > Open view to a seeded, token-free state so the
// list renders headlessly: the crawl's cache normally comes from the private
// registry over the viewer's token, which the sandbox has neither of. Fills
// `activity` directly (openBranches, openRepos and the row helpers are pure
// getters over it), so what the shot proves is the rendering, not the load.
//
//   npm run shot -- pages/show-repo/show-repo.html --script tools/render/scenarios/estate-open.mjs
//
// Pass TAB=todo or TAB=jots to seed the other two Activity sub-views and switch
// the pill to one of them. They share the pane with Open at every width (the
// lg+ right rail went 2026-08-03), so this is how either one gets a shot.
//
// Pass ROUTES=1 to fake the hub's route chips onto the first row, which is how
// the row's ORDER gets a shot: the session mark and the files control sit left
// of the chips, so a row carrying them lines up with every row that does not.
// Faked rather than seeded because the chips need the route manifest, the
// per-branch file lists and a kit, none of which the sandbox can fetch, and the
// thing under test is the layout.
//
// Pass MENU=1 in the environment to open one row's branch menu for the shot,
// REPOCHIP=1 to open a row's repo chip (the repo's whole grouped menu, in the
// shell's panel), or CHIP=1 to narrow the list to one repo through its filter
// chip. HOVER=1 opens either menu by hovering rather than clicking, which is
// what proves the desktop path. DETAIL=1 taps the first row's branch name so
// the full-viewport branch-detail takeover renders (pair with --width 390
// --height 844 for the phone posture it was built for).
const iso = (d) => new Date(Date.now() - d * 3600000).toISOString();

const ACTIVITY = {
  'me/web-tools': {
    defaultBranch: 'main',
    openPRs: [
      { number: 298, head: 'claude/show-repo-activity-filters', draft: true, title: 'Open view: repo chips, lifespan, GitHub menu',
        updatedAt: iso(2), aheadBy: 6, behindBy: 0, firstDate: iso(52), nFiles: 9,
        session: 'https://claude.ai/code/session_x' },
      { number: 296, head: 'claude/fab-render-toss', draft: false, title: 'Singleton fab with toss-render',
        updatedAt: iso(30), aheadBy: 12, behindBy: 3, firstDate: iso(500), nFiles: 23 },
    ],
    survey: { branches: [
      { name: 'claude/show-repo-activity-filters', sha: 'a1', group: 'active', date: iso(2), subject: 'Open view: repo chips, lifespan, GitHub menu' },
      { name: 'claude/fab-render-toss', sha: 'b1', group: 'stranded', date: iso(30), firstDate: iso(500),
        subject: 'Confirm branchesForPath against a live token', aheadBy: 12, behindBy: 3 },
      { name: 'claude/pdf-ink-alignment', sha: 'c1', group: 'stranded', date: iso(200), firstDate: iso(230),
        subject: 'Align ink strokes to the page box', aheadBy: 3, behindBy: 9,
        nUnique: 12, nLanded: 9, nMissing: 2, nDiffers: 1,
        missingPaths: ['lib/kits/ink-align.js', 'pages/pdf-ink.html'] },
      // The verdict chip's own case, and the one that made it unreadable before
      // 2026-08-18: a three-way split whose two VISIBLE numbers do not add up
      // (28 landed + 41 differs + 11 missing = 80), on a branch with no merge
      // base, so the asterisk is showing too. Both halves of the chip are
      // routes into the detail's Files pane from here.
      { name: 'claude/budget-drs-tracker-6jsaz8', sha: 'f1', group: 'stranded', date: iso(60), firstDate: iso(400),
        subject: 'Merge origin/main into claude/budget-drs-tracker-6jsaz8', noBase: true,
        nUnique: 80, nLanded: 28, nMissing: 11, nDiffers: 41,
        missingPaths: ['tracker/tasks/0031-fund-splits.md', 'projects/budget-drs/data/design/LAYERS.md'] },
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
        updatedAt: iso(9), aheadBy: 2, behindBy: 1, firstDate: iso(11), nFiles: 4 },
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

// The two list views, seeded the same way and for the same reason: both read a
// small JSON file out of the private registry, which the sandbox cannot reach.
const TODO = [
  { id: 't1', text: 'Purge the jsDelivr cache after the gh-api change', done: false, created_at: iso(30) },
  { id: 't2', text: 'Re-shoot the page thumbnails that drifted', done: false, created_at: iso(52) },
  { id: 't3', text: 'Decide whether the snags log gets a projector', done: false, created_at: iso(100) },
  { id: 't4', text: 'Fold branch-survey into the activity cache', done: true, created_at: iso(300), done_at: iso(120) },
];
const JOTS = [
  { id: 'j1', text: 'A stage link could carry its own review prompts', created_at: iso(4) },
  { id: 'j2', text: 'The estate cards want a per-repo staleness read', created_at: iso(26) },
  { id: 'j3', text: 'Try the data route on a CSV big enough to hurt', created_at: iso(75) },
];

export default async (page) => {
  await page.waitForFunction(() => window.__shell && window.Alpine, null, { timeout: 15000 });
  await page.evaluate((configs) => {
    window.__shell.goActivity();
    window.__shell.estateConfigs = configs;
  }, CONFIGS);
  await page.waitForFunction(() => !!document.querySelector('[x-data^="estate"]'), null, { timeout: 15000 });
  await page.evaluate(([activity, entries, todo, jots]) => {
    const d = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
    d.authed = true;
    d.activityLoading = false;
    d.activity = activity;
    d.entries = entries;
    d.activityGeneratedAt = new Date(Date.now() - 3600000).toISOString();
    d.todoLoading = false;
    d.todoItems = todo;
    d.jotLoading = false;
    d.jotItems = jots;
  }, [ACTIVITY, ENTRIES, TODO, JOTS]);
  await page.waitForTimeout(600);
  // The pill routes through the shell's go* methods, so drive it the way a tap
  // does rather than assigning `tab`, which is a getter over the shell view.
  if (process.env.TAB) {
    await page.evaluate((t) => {
      window.Alpine.$data(document.querySelector('[x-data^="estate"]')).goSub(t);
    }, process.env.TAB);
    await page.waitForTimeout(400);
  }
  if (process.env.ROUTES) {
    await page.evaluate(() => {
      const d = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
      const first = d.openRows[0];
      d.branchRoutes = (row) => (row.repo === first.repo && row.name === first.name)
        ? { on: [{ key: 'a', label: 'Branches', hits: ['lib/alpineComponents/estate.js'] },
                 { key: 'b', label: 'Guides', hits: ['lib/alpineComponents/estate.js'] }],
            near: [{ key: 'c', label: 'Map', hits: ['dist/web-tools.js'] }] }
        : null;
    });
    await page.waitForTimeout(300);
  }
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
  if (process.env.DETAIL) {
    await page.evaluate(() => {
      const d = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
      d.openBranchDetail(d.openRows[0]);
    });
    await page.waitForTimeout(900);
  }
  if (process.env.MENU) await open(page.locator('button:has-text("GitHub")').first());
  if (process.env.REPOCHIP) await open(page.locator('button[title^="Repo menu: "]').first());
};
