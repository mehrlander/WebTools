// Does the highlight stay ON the thing it is drawn around when the page moves?
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/outline-follows-page.mjs
//   npm run shot -- pages/peek.html     --script tools/render/scenarios/outline-follows-page.mjs
//
// Runs whichever surfaces the page has. Three of them drew a viewport-pinned
// box from a viewport rect: annotate's element pick and its region box never
// repainted at all, so a 260px scroll left 260px of drift and the highlight
// simply stayed behind; kits/peek.js repainted from a scroll listener, which
// works and lags. All three are document-positioned now, so `drift` is 0 by
// construction and there is nothing to repaint.
//
// jsdom has no layout, so the sizes here exist nowhere else. `drift` is the
// only number that matters: the box's top minus the element's, both in
// viewport terms, before and after a scroll.

const drift = (page, kind) => page.evaluate((k) => {
  const sel = k === 'peek' ? '[data-peek-ui]' : '[data-annotate-ui]';
  const box = [...document.querySelectorAll(sel)]
    .find(n => /solid rgb\(250, 204, 21\)/.test(n.style.border || '') && n.style.display !== 'none');
  if (!box) return { drift: null, note: 'no outline' };
  const r = box.getBoundingClientRect();
  if (k === 'region') {
    const rect = window.Annotate._state.aimRect;
    return { pos: box.style.position, drift: rect ? Math.round(r.top - (rect.y - window.scrollY)) : null };
  }
  const el = k === 'peek' ? window.Peek.current() : window.Annotate._state.aimEl;
  if (!el) return { drift: null, note: 'no subject' };
  return { pos: box.style.position, drift: Math.round(r.top - el.getBoundingClientRect().top) };
}, kind);

const run = async (page, label, kind, arm) => {
  await arm();
  await page.waitForTimeout(280);
  const before = await drift(page, kind);
  if (before.drift === null) { console.log(`${label.padEnd(18)} ${before.note}`); return; }
  await page.evaluate(() => window.scrollBy(0, 250));
  await page.waitForTimeout(320);
  const after = await drift(page, kind);
  console.log(`${label.padEnd(18)} ${after.pos}  drift before=${before.drift} after=${after.drift}`);
};

export default async (page) => {
  await page.waitForTimeout(1200);
  const kits = await page.evaluate(() => ({ ann: !!window.Annotate, peek: !!window.Peek }));

  const aimPoint = () => page.evaluate(() => {
    const li = [...document.querySelectorAll('li')].find(n => n.getBoundingClientRect().height > 10);
    li.scrollIntoView({ block: 'start' }); window.scrollBy(0, -150);
    const r = li.getBoundingClientRect();
    return { x: Math.round(r.left + 22), y: Math.round(r.top + 6) };
  });

  if (kits.ann) {
    await run(page, 'annotate element', 'element', async () => {
      await page.evaluate(() => { window.scrollTo(0, 0); window.Annotate.enable(); window.Annotate.startPick(); });
      const at = await aimPoint();
      await page.mouse.click(at.x, at.y);
    });

    await run(page, 'annotate region', 'region', async () => {
      await page.evaluate(() => { window.Annotate.notePage(); window.scrollTo(0, 240); window.Annotate.startRegion(); });
      await page.waitForTimeout(200);
      await page.mouse.move(90, 300); await page.mouse.down();
      await page.mouse.move(320, 430, { steps: 8 }); await page.mouse.up();
    });
    await page.evaluate(() => window.Annotate.disable());
  }

  if (kits.peek && !kits.ann) {
    await run(page, 'peek panel', 'peek', async () => {
      await page.evaluate(() => { window.scrollTo(0, 0); if (!window.Peek.enabled) window.Peek.enable(); });
      const at = await aimPoint();
      await page.mouse.click(at.x, at.y);
    });
  }
};
