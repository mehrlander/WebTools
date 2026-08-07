// Drive show-repo's sidebar Repos index to a seeded, token-free state where
// one repo declares `projects`, so the indented project rows render headlessly
// (the index normally fills from the private registry's config cache over the
// viewer's token, which the sandbox has neither of). Same tactic as
// sidebar-repo-menus.mjs: fill `estateRepos`/`estateConfigs` directly, so the
// shot proves the rendering, not the load. The seeded `projects` list mirrors
// home's real manifest, which its tracker-registry generator syncs from the
// trackers it finds.
//
//   npm run shot -- pages/show-repo/show-repo.html --script tools/render/scenarios/sidebar-projects-overlay.mjs
//
// OVERLAY=1 additionally seeds the branch-overlay state (?overlay=), so the
// shot shows the preview posture: the chip on the Repos header and the glyph
// on the overlaid repo's row.

const REPOS = [
  { repo: 'me/web-tools', short: 'web-tools', icon: 'ph-toolbox', group: 'core', order: 11, priv: false },
  { repo: 'me/home', short: 'home', icon: 'ph-house-line', group: 'core', order: 13, priv: true },
  { repo: 'me/ledger', short: 'ledger', icon: 'ph-scales', group: 'data', order: 20, priv: true },
];

const CONFIGS = {
  'me/web-tools': { estate: true, icon: 'ph-toolbox', group: 'core', order: 11 },
  'me/home': {
    estate: true, icon: 'ph-house-line', group: 'core', order: 13,
    projects: [
      { path: 'news' },
      { path: 'projects/bills' },
      { path: 'projects/budget-drs' },
      { path: 'projects/budget-wa' },
      { path: 'projects/fiscal-notes' },
      { path: 'projects/wps' },
    ],
  },
  'me/ledger': { estate: true, icon: 'ph-scales', group: 'data', order: 20 },
};

export default async (page) => {
  await page.waitForFunction(() => window.__shell && window.Alpine, null, { timeout: 15000 });
  const overlay = process.env.OVERLAY ? 'claude/repo-sidebar-project-indent-a4b2b7' : '';
  await page.evaluate(([repos, configs, branch]) => {
    const s = window.__shell;
    s.goDashboard();
    s.estateRepos = repos;
    s.estateConfigs = configs;
    if (branch) { s.overlayBranch = branch; s.overlayRefs = { 'me/home': branch }; }
    s.drawer = true;
  }, [REPOS, CONFIGS, overlay]);
  await page.waitForTimeout(600);
};
