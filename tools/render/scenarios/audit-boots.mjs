// THE PAGE STILL RENDERS WHEN SOMETHING LOGS A CIRCULAR OBJECT.
//
//   npm run shot -- pages/audit-render.html --width 430 --touch \
//     --script tools/render/scenarios/audit-boots.mjs
//
// The health readout wraps console.error and console.warn. A first version
// formatted their arguments with JSON.stringify, which throws on anything
// circular: a DOM node, an event, window. So a library logging an object threw
// inside the wrapper, the module script died before Alpine mounted, every
// x-cloak element stayed hidden, and the page came up white. Nothing caught it
// because the sandbox happens to log nothing during boot.
//
// So this logs the worst arguments there are, from the earliest point a page
// script can reach, and then asserts the page is on screen and interactive.

export default async function (page) {
  await page.addInitScript(() => {
    // Before anything else on the page runs, and again once there is a DOM
    // node to be circular about.
    const spin = () => {
      try { console.warn('an object', window); } catch (e) {}
      try { console.error('a node', document.documentElement); } catch (e) {}
      try { const a = {}; a.self = a; console.warn('a cycle', a); } catch (e) {}
      try { console.warn(Symbol('and a symbol')); } catch (e) {}
    };
    spin();
    addEventListener('DOMContentLoaded', spin);
  });

  await page.waitForSelector('[x-ref="doc"] span', { timeout: 20000 });
  await page.waitForTimeout(900);

  const state = await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    const box = document.getElementById('audit-faults');
    return { units: d.units?.length, painted: document.querySelectorAll('[data-uid]').length,
             visible: getComputedStyle(document.querySelector('header')).display,
             readout: box?.textContent?.slice(0, 60), tone: box?.getAttribute('data-tone') };
  });
  if (!state.units) throw new Error('the component did not mount');
  if (!state.painted) throw new Error('the document did not paint');
  if (state.visible === 'none') throw new Error('the page is hidden: x-cloak never lifted');

  // And it is interactive, not merely drawn.
  const uid = await page.evaluate(() => Alpine.$data(document.body).units[3].uid);
  await page.evaluate((u) => document.querySelector(`[data-uid="${CSS.escape(u)}"]`)
    ?.scrollIntoView({ block: 'center' }), uid);
  await page.waitForTimeout(200);
  const box = await page.evaluate((u) => {
    const r = [...document.querySelector(`[data-uid="${CSS.escape(u)}"]`).getClientRects()][0];
    return { x: r.left + Math.min(30, r.width / 2), y: (r.top + r.bottom) / 2 };
  }, uid);
  await page.touchscreen.tap(box.x, box.y);
  await page.waitForTimeout(300);
  const sel = await page.evaluate(() => Alpine.$data(document.body).sel?.uid);
  if (!sel) throw new Error('the page drew but does not respond to a tap');

  console.log(`BOOTS ${state.units} units, ${state.painted} spans, tap selected ${sel}`);
  console.log(`READOUT [${state.tone}] ${state.readout}`);

  // The init-script logs run before the wrapper is installed, so they prove the
  // page boots and nothing more. This proves the wrapper itself survives what
  // killed it: the same arguments, once it is live, with the page still
  // answering a tap afterwards.
  await page.evaluate(() => {
    const a = {}; a.self = a;
    console.warn('live cycle', a, window, document.body);
  });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const box = document.getElementById('audit-faults');
    return { tone: box?.getAttribute('data-tone'), text: box?.textContent?.slice(0, 70),
             alive: !!Alpine.$data(document.body).units?.length };
  });
  if (!after.alive) throw new Error('the wrapper took the page down');
  if (after.tone !== 'error') throw new Error(`a logged cycle was not reported: [${after.tone}]`);
  console.log(`WRAPPER [${after.tone}] ${after.text}`);
}
