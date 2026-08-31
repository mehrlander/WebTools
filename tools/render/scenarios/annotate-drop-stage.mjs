// Letting go of a stage, in all three modes.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-drop-stage.mjs
//
// Until 2026-08-31 the Escape key was the only cancel and a phone has none, so
// a staged rectangle or element could only be dropped through a three-tap trip
// into the card's aim menu. The ✕ beside each "+ note" is the fix, and in the
// section aim a tap on the page that resolves to nothing does the same thing,
// which is what "clicking outside should make it go away" means there.
//
// jsdom cannot answer any of this: the pair is placed against the card's live
// rect and the miss is a real pointer landing on real layout.

const state = (page) => page.evaluate(() => {
  const S = window.Annotate._state;
  const pair = document.querySelector('[data-annotate-offer]');
  return {
    mode: S.mode,
    aim: S.aimEl ? S.aimEl.tagName : (S.aimRect ? 'rect' : null),
    staged: S.staged ? S.staged.style.display : null,
    offer: pair ? [...pair.querySelectorAll('button')].map(b => b.textContent) : null,
  };
});

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 20000 });

  // ── The section aim ──────────────────────────────────────────────────────
  await page.evaluate(() => window.Annotate.startPick({ aim: 'section' }));
  await page.waitForTimeout(250);
  const inside = await page.evaluate(() => {
    const h = document.querySelector('[data-md-section]');
    h.scrollIntoView({ block: 'center' });
    const r = h.getBoundingClientRect();
    return { x: Math.round(r.x + 20), y: Math.round(r.y + r.height / 2) };
  });
  await page.mouse.click(inside.x, inside.y);
  await page.waitForTimeout(250);
  console.log('STAGED  ' + JSON.stringify(await state(page)));

  // The ✕ beside the offer.
  await page.evaluate(() => {
    const pair = document.querySelector('[data-annotate-offer]');
    [...pair.querySelectorAll('button')].find(b => b.textContent === '✕').click();
  });
  await page.waitForTimeout(250);
  console.log('DROPPED ' + JSON.stringify(await state(page)));

  // Re-stage, then miss: a tap outside the declared render.
  await page.mouse.click(inside.x, inside.y);
  await page.waitForTimeout(200);
  const outside = await page.evaluate(() => {
    const box = document.querySelector('[data-src-doc]');
    const r = box.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.max(6, Math.round(r.y - 24)) };
  });
  await page.mouse.click(outside.x, outside.y);
  await page.waitForTimeout(250);
  console.log('MISSED  ' + JSON.stringify(await state(page)));

  // ── The region aim ───────────────────────────────────────────────────────
  await page.evaluate(() => window.Annotate.startRegion());
  await page.waitForTimeout(250);
  await page.mouse.move(120, 300);
  await page.mouse.down();
  await page.mouse.move(300, 420, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  console.log('REGION  ' + JSON.stringify(await state(page)));
  await page.evaluate(() => {
    const pair = document.querySelector('[data-annotate-offer]');
    [...pair.querySelectorAll('button')].find(b => b.textContent === '✕').click();
  });
  await page.waitForTimeout(250);
  console.log('RDROP   ' + JSON.stringify(await state(page)));

  // ── A tap on our own furniture is NOT a miss ─────────────────────────────
  // The guard that separates the two. Clearing a stage because a thumb landed
  // on the card would be the sticky-stage bug in reverse.
  await page.evaluate(() => window.Annotate.startPick({ aim: 'section' }));
  await page.waitForTimeout(200);
  await page.mouse.click(inside.x, inside.y);
  await page.waitForTimeout(200);
  const card = await page.evaluate(() => {
    const r = window.Annotate._state.panel.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + 12) };
  });
  await page.mouse.click(card.x, card.y);
  await page.waitForTimeout(250);
  console.log('ONCARD  ' + JSON.stringify(await state(page)));
  await page.evaluate(() => window.Annotate.disable());

  // ── The text selection's own pair ────────────────────────────────────────
  await page.evaluate(() => window.Annotate.enable());
  await page.waitForTimeout(200);
  const para = await page.evaluate(() => {
    const p2 = document.querySelector('[data-src-doc] p');
    p2.scrollIntoView({ block: 'center' });
    const r = p2.getBoundingClientRect();
    return { x1: Math.round(r.x + 6), y: Math.round(r.y + 8), x2: Math.round(r.x + r.width * 0.6) };
  });
  await page.mouse.move(para.x1, para.y);
  await page.mouse.down();
  await page.mouse.move(para.x2, para.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  console.log('TEXT    ' + JSON.stringify(await page.evaluate(() => {
    const pair = document.querySelector('[data-annotate-offer]');
    return { staged: !!window.Annotate.staged,
             bar: window.Annotate._state.selBar.style.display,
             offer: pair ? [...pair.querySelectorAll('button')].map(b => b.textContent) : null };
  })));
  await page.evaluate(() => {
    const pair = document.querySelector('[data-annotate-offer]');
    [...pair.querySelectorAll('button')].find(b => b.textContent === '✕').click();
  });
  await page.waitForTimeout(250);
  console.log('TDROP   ' + JSON.stringify(await page.evaluate(() => ({
    staged: !!window.Annotate.staged,
    bar: window.Annotate._state.selBar.style.display,
    offer: !!document.querySelector('[data-annotate-offer]'),
  }))));
};
