// THE CONSOLE LIST IS NOT BUILT UNTIL IT IS OPENED, AND IT IS BOUNDED.
//
//   npm run shot -- pages/audit-render.html --width 430 --touch \
//     --script tools/render/scenarios/fab-console-cost.mjs
//
// The fallback console panel rendered one node per captured line, with six
// bindings each, every time the drawer opened: x-show hides a subtree that has
// already been built. With consoleLogs uncapped, that made the drawer's cost a
// function of how much the page had logged, inside one synchronous Alpine
// flush. Measured on an iPhone 2026-09-08: the build reached that node at 72ms
// and the web process died there, having crossed the other three tab panes in
// twelve.
//
// So this drives the failure the device found. It logs far more than any page
// should, opens the drawer, and asserts the two properties that make the cost
// flat: nothing built while the console is closed, and the retained set
// bounded however much arrives.

export default async function (page) {
  await page.waitForSelector('[aria-label="Web-tools panel"]', { timeout: 20000 });
  await page.waitForTimeout(1800);

  const LOUD = 2000;
  const state = await page.evaluate(async (n) => {
    const d = Alpine.$data(document.querySelector('[x-data*="fab"]') || document.body);
    for (let i = 0; i < n; i++) console.log('a loud page, line ' + i);
    await new Promise(r => setTimeout(r, 300));
    // Rebuild the drawer body from scratch, which is the walk that died.
    d.close(); d.opened = false;
    await new Promise(r => setTimeout(r, 200));
    const before = document.querySelectorAll('*').length;
    const t0 = performance.now();
    d.toggle();
    await new Promise(r => setTimeout(r, 600));
    return {
      kept: d.consoleLogs.length, cap: d.CONSOLE_CAP, dropped: d.consoleDropped,
      built: document.querySelectorAll('*').length - before,
      ms: Math.round(performance.now() - t0),
        rows: document.querySelectorAll('#__fab-console-panel > div').length,
      panelNodes: (document.querySelector('[x-ref="consoleHost"]')?.querySelectorAll('*').length) ?? -1,
      consoleOpen: !!d.consoleOpen,
    };
  }, LOUD);

  if (state.consoleOpen) throw new Error('the console started open, so this proves nothing');
  if (state.kept > state.cap)
    throw new Error(`${LOUD} lines logged and ${state.kept} kept, over the cap of ${state.cap}`);
  if (!state.dropped) throw new Error('nothing was reported dropped, so the cap is not being counted');
  if (state.rows) throw new Error(`the closed console built ${state.rows} fallback rows`);
  if (state.panelNodes > 0) throw new Error(`the closed console mounted the rich panel: ${state.panelNodes} elements`);
  // The whole drawer is around two thousand elements. A build that carried a
  // row per line would be several times that; this is the number that has to
  // stay flat as a page gets louder.
  if (state.built > 1200)
    throw new Error(`the drawer built ${state.built} elements after ${LOUD} log lines`);

  // Opening the console then builds the rows, bounded by the cap.
  // Opening the console is what pays for it, and it does then show the lines.
  const opened = await page.evaluate(async () => {
    const d = Alpine.$data(document.querySelector('[x-data*="fab"]') || document.body);
    const before = document.querySelectorAll('*').length;
    d.consoleOpen = true;
    await new Promise(r => setTimeout(r, 900));
    return { built: document.querySelectorAll('*').length - before, ready: !!d.consolePanelReady };
  });
  if (opened.built < 50) throw new Error(`opening the console built almost nothing: ${opened.built}`);

  console.log(`${LOUD} lines logged · ${state.kept} kept (${state.dropped} dropped) · drawer open built ${state.built} elements in ${state.ms}ms · expanding the console built ${opened.built} more`);
}
