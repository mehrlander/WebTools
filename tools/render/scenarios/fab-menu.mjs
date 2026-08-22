// The launcher's long-press menu on the app, showing all three rows: the two
// built-ins ("Take a note", one line and no prose under it, then "Web Tools
// home") and the page-contributed "Paste to Stage".
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
      // The rule the row change was made for: no row carries a second line.
      rowLines: [...document.querySelectorAll('[x-show="fabMenu"] button')]
        .map(b => b.querySelectorAll('span').length),
    };
  });
  console.log('\n--- the launcher menu ---\n  ' + JSON.stringify(out) + '\n');
}
