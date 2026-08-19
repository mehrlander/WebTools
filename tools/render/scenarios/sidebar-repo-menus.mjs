// Drive show-repo's sidebar Repos index to a seeded, token-free state and open
// one of the two menus a row carries, so the pair renders headlessly: the index
// is normally filled from the private registry's config cache over the viewer's
// token, which the sandbox has neither of. Fills `estateRepos`/`estateConfigs`
// directly (the groups and both item lists are pure getters over them), so what
// the shot proves is the rendering, not the load.
//
//   npm run shot -- app/index.html --script tools/render/scenarios/sidebar-repo-menus.mjs
//
// MENU=github opens a row's GitHub links menu (the default), MENU=actions its
// actions menu, MENU=none leaves both closed for a shot of the rows alone.
// HOVER=1 opens by hovering rather than clicking, which is what proves the
// desktop path; the headless browser reports a fine pointer, so the hover guard
// passes there the same way it does on a laptop.

const REPOS = [
  { repo: 'me/web-tools', short: 'web-tools', icon: 'ph-toolbox', group: 'core', order: 11, priv: false },
  { repo: 'me/web-tools-private', short: 'web-tools-private', icon: 'ph-vault', group: 'core', order: 12, priv: true },
  { repo: 'me/home', short: 'home', icon: 'ph-house-line', group: 'core', order: 13, priv: true },
  { repo: 'me/ledger', short: 'ledger', icon: 'ph-scales', group: 'data', order: 20, priv: true },
  { repo: 'me/scratch', short: 'scratch', icon: 'ph-note-pencil', group: 'data', order: 21, priv: true },
];

// Only web-tools declares a task board, so the shot shows both shapes of the
// GitHub menu: the row is there for a repo that tracks work and absent for one
// that does not.
const CONFIGS = {
  'me/web-tools': { estate: true, icon: 'ph-toolbox', group: 'core', order: 11, tracker: 'tracker/board.md' },
  'me/web-tools-private': { estate: true, icon: 'ph-vault', group: 'core', order: 12 },
  'me/home': { estate: true, icon: 'ph-house-line', group: 'core', order: 13 },
  'me/ledger': { estate: true, icon: 'ph-scales', group: 'data', order: 20 },
  'me/scratch': { estate: true, icon: 'ph-note-pencil', group: 'data', order: 21 },
};

export default async (page) => {
  await page.waitForFunction(() => window.__shell && window.Alpine, null, { timeout: 15000 });
  await page.evaluate(([repos, configs]) => {
    const s = window.__shell;
    s.goDashboard();
    s.estateRepos = repos;
    s.estateConfigs = configs;
    s.drawer = true;
  }, [REPOS, CONFIGS]);
  await page.waitForTimeout(600);

  const which = process.env.MENU || 'github';
  if (which === 'none') return;
  // The row's two trailing buttons, found by their titles rather than by
  // position, so this keeps working if the row's layout moves. A suffix match:
  // the actions title leads with the repo's public/private state.
  const title = which === 'actions' ? 'Actions for web-tools' : 'GitHub links for web-tools';
  const btn = page.locator(`aside button[title$="${title}"]`).first();
  if (process.env.HOVER) {
    await btn.hover();
    await page.waitForTimeout(500);   // clears the ~140 ms open delay
  } else {
    await btn.click();
    await page.waitForTimeout(400);
  }
};
