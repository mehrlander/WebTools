// Drive kits/peek.js: arm, tap the deepest list item, then tap the same point
// three more times and watch the chain index climb.
//
//   npm run shot -- pages/demos/peek-demo.html --script tools/render/scenarios/peek-walk.mjs
//
// Prints the atom and selector at each step. The last shot is left on the
// third ancestor, which is where the outline is visibly larger than the tap.

const state = (page) => page.evaluate(() => {
  const el = window.Peek.current();
  if (!el) return null;
  const f = window.Peek.facts(el);
  return { at: window.Peek.chain().indexOf(el), len: window.Peek.chain().length,
           atom: f.atom, selector: f.selector, matches: f.matches,
           box: `${f.rect.w}x${f.rect.h}` };
});

export default async (page) => {
  await page.waitForSelector('button:has-text("Arm")', { timeout: 15000 });
  await page.evaluate(() => window.armPeek());
  await page.waitForTimeout(200);
  console.log('ARMED ' + JSON.stringify(await page.evaluate(() => !!window.Peek.enabled)));

  // The innermost list item, three ULs deep and inside three bare divs.
  const at = await page.evaluate(() => {
    // The DEEPEST match: textContent includes descendants, so .find() would
    // return the outermost <li> and the walk would start three levels too high.
    const all = [...document.querySelectorAll('li')].filter(n => n.textContent.includes('One point one point one'));
    const li = all[all.length - 1];
    const r = li.getBoundingClientRect();
    return { x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2) };
  });
  console.log('POINT ' + JSON.stringify(at));

  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(150);
  console.log('TAP1 ' + JSON.stringify(await state(page)));

  for (const n of [2, 3, 4]) {
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(150);
    console.log(`TAP${n} ` + JSON.stringify(await state(page)));
  }

  // The breadcrumb addresses the chain directly, so a jump is one tap too.
  await page.evaluate(() => window.Peek.to(0));
  await page.waitForTimeout(100);
  console.log('TO0 ' + JSON.stringify(await state(page)));

  // The three serializations, sized.
  console.log('SERIAL ' + JSON.stringify(await page.evaluate(() => {
    const el = window.Peek.chain()[3];
    window.Peek.select(el);
    return { tree: window.Peek.tree(el).split('\n').length,
             html: window.Peek.html(el).length,
             json: Object.keys(window.Peek.json()).length };
  })));

  // Leave it parked a few levels up, where the outline is the point.
  await page.evaluate(() => { window.Peek.select(document.querySelector('li ul li')); window.Peek.to(3); });
  await page.waitForTimeout(200);
};
