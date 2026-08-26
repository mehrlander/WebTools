// The launcher's long-press menu on the app, showing its three built-in rows:
// "Take a note" (one line, no prose under it), "Paste to Stage", and "Web Tools
// home". The `menu` contract has no contributor now that the paste is built in,
// so `contributed` is expected to be empty here and the shape under test is the
// three rows plus the one-line rule.
//
// Driven by calling openFabMenu() rather than by synthesising a 450ms pointer
// hold: the gesture is covered by the fab's own tests, and what a screenshot
// is for is the shape of the thing the gesture opens.
//
//   npm run shot -- app/index.html --script tools/render/scenarios/fab-menu.mjs --width 430 --touch

export default async function (page) {
  // attached, not visible: the fab's host div has no box of its own; the
  // launcher it renders does.
  await page.waitForSelector('[x-data*="fab()"]', { state: 'attached', timeout: 15000 });
  const out = await page.evaluate(async () => {
    const el = document.querySelector('[x-data*="fab()"]');
    const d = Alpine.$data(el);
    d.openFabMenu();
    await new Promise(r => setTimeout(r, 400));
    return {
      open: d.fabMenu,
      contributed: [...d.pageMenu].map(m => ({ label: m.label, icon: m.icon, side: m.side })),
      // The built-ins, read off the rendered rows rather than from a list in
      // the component: what a long press actually shows is the point.
      rows: [...document.querySelectorAll('[x-show="fabMenu"] button span')].map(s => s.textContent),
      // The app is a stage host, so its paste must stay in place rather than
      // park and navigate.
      stageHost: !!Alpine.$data(document.querySelector('[x-data*="fab()"]'))._stageHost(),
      // The rule the row change was made for: no row carries a second line.
      rowLines: [...document.querySelectorAll('[x-show="fabMenu"] button')]
        .map(b => b.querySelectorAll('span').length),
    };
  });
  console.log('\n--- the launcher menu ---\n  ' + JSON.stringify(out) + '\n');
}
