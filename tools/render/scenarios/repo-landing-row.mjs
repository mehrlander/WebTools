// screenshot.mjs interaction scenario: the per-repo sidebar for a repo that
// declares a `landing`, which is the one shape of that sidebar no repo in the
// estate produces today.
//
//   node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/repo-landing-row.mjs \
//     --out tools/.preview/repo-landing-row.png --full
//
// The point is what 2026-08-14 changed. A declared `landing` used to TAKE the
// front door: opening the repo rendered that page and the README was reachable
// only by leaving. Now the landing is a row of its own and Overview leads with
// the README for every repo, so the two coexist instead of one displacing the
// other. That is a claim about a state the estate cannot currently reach, since
// `repoLandingView` is null for every repo that exists; unit tests cover the
// getter, and this is the only thing that renders it.
//
// The sandbox has neither a token nor the private registry, so the manifest is
// written onto the store directly. Nothing else is stubbed: the sidebar rows
// are pure getters over it, and the Overview body is the real overview()
// component reading this repo through the contents-API shim.
const CONFIG = {
  estate: true,
  landing: 'pages/index.html',
  pages: [
    { path: 'pages/show-repo/show-repo.html', label: 'show-repo' },
    { path: 'pages/annotate.html', label: 'annotate' },
  ],
  pins: ['docs/show-repo.md', 'lib/kits/'],
};

export default async (page) => {
  await page.waitForFunction(() => window.__shell && window.Alpine, null, { timeout: 15000 });

  const ok = await page.evaluate(async (config) => {
    const S = window.__shell;
    if (!S || !window.Alpine) return 'no shell';
    await S.ensureBrowser('mehrlander/web-tools', '');
    S.goLanding();
    S.drawer = true;
    // loadConfig() runs on open and would land after this write, so the
    // manifest is stamped once the read it would have raced has settled.
    const s = window.Alpine.store('browser');
    s.config = config;
    s.configName = '.web-tools.json';
    return true;
  }, CONFIG);
  if (ok !== true) throw new Error('repo-landing-row scenario: ' + ok);

  // The row is the subject, so wait for it rather than for a timeout: it is
  // absent for every real repo, and a shot taken before the manifest settles
  // would look exactly like the bug this scenario exists to rule out.
  await page.waitForFunction(
    () => !!document.querySelector('aside button i.ph-planet'), null, { timeout: 15000 });
  await page.waitForTimeout(1200);
};
