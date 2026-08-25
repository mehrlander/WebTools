// The paste row's OTHER ending, on a page that is not the app.
//
// The row is the same three-line menu everywhere; what changes is where the
// paste goes. This scenario runs on a plain page carrying the fab, and checks
// the three facts that decide the off-app route:
//
//   there is no stage host here (so the row parks rather than staging in place),
//   the long press warms the two small kits the row needs (io.js to read the
//   clipboard on the tap, stage-handoff.js to park what it read),
//   and neither of them is the 233K stage component.
//
// The clipboard itself is not driven: a headless read needs a permission grant
// the harness does not hand out, and what a paste becomes is covered by the
// unit tests. What a screenshot is for is the menu the gesture opens.
//
//   npm run shot -- pages/index.html --script tools/render/scenarios/fab-paste-offapp.mjs --width 430 --touch

export default async function (page) {
  await page.waitForSelector('[x-data*="fab()"]', { state: 'attached', timeout: 15000 });
  const out = await page.evaluate(async () => {
    const d = Alpine.$data(document.querySelector('[x-data*="fab()"]'));
    d.openFabMenu();
    // The warm-up is fire-and-forget on the press, so give it the half-second
    // the hold itself would have taken.
    await new Promise(r => setTimeout(r, 900));
    return {
      rows: [...document.querySelectorAll('[x-show="fabMenu"] button span')].map(s => s.textContent),
      stageHost: !!d._stageHost(),
      warmed: { io: !!window.io?.pasteItems, handoff: !!window.StageHandoff },
      stageComponentPulled: !!window.StageIntake,
      goesTo: d.showRepoBase + '?view=stage',
    };
  });
  console.log('\n--- the paste row, off the app ---\n  ' + JSON.stringify(out) + '\n');
}
