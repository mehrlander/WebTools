// The DOM reading's ancestor trail, tapped. With a mode running a crumb must
// move the OUTLINE as well as the pane, since a crumb that renames the reading
// while the highlight stays three levels down is two answers to one question.
// With no mode it moves the reading alone, which is the inspector case.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-dom-crumb.mjs
//
// jsdom has no layout, so the outline sizes here are the only place that half
// is checked.
  (window.Annotate._state.domBody.firstElementChild?.textContent || '').trim());
const outline = (page) => page.evaluate(() => {
  const b = [...document.querySelectorAll('[data-annotate-ui]')]
    .find(n => /solid rgb\(250, 204, 21\)/.test(n.style.border || '') && n.style.display !== 'none');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return `${Math.round(r.width)}x${Math.round(r.height)}`;
});

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 20000 });
  await page.evaluate(() => window.Annotate.startPick());
  await page.waitForTimeout(250);
  const at = await page.evaluate(() => {
    const li = [...document.querySelectorAll('#doc li')].find(n => n.getBoundingClientRect().height > 10);
    li.scrollIntoView({ block: 'center' });
    const r = li.getBoundingClientRect();
    return { x: Math.round(r.left + 25), y: Math.round(r.top + 8) };
  });
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(250);
  console.log(`TAP    head=${await head(page)} outline=${await outline(page)}`);

  const crumbs = await page.evaluate(() =>
    [...document.querySelectorAll('[data-peek-crumb]')].map(b => b.dataset.peekCrumb + ':' + b.textContent));
  console.log('CRUMBS ' + JSON.stringify(crumbs));

  // Tap the crumb three rungs out.
  await page.evaluate(() => {
    const bs = [...document.querySelectorAll('[data-peek-crumb]')];
    bs.find(b => b.dataset.peekCrumb === '3')?.click();
  });
  await page.waitForTimeout(250);
  console.log(`CRUMB3 head=${await head(page)} outline=${await outline(page)}`);

  // And with no mode running: the subject moves, the outline is gone.
  await page.evaluate(() => window.Annotate.notePage());
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const bs = [...document.querySelectorAll('[data-peek-crumb]')];
    bs.find(b => b.dataset.peekCrumb === '1')?.click();
  });
  await page.waitForTimeout(250);
  console.log(`NOMODE head=${await head(page)} outline=${await outline(page)}`);
};
