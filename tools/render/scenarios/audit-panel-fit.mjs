// screenshot.mjs interaction scenario: the popover stays on the viewport, and
// the two selects hug their text.
//
//   node tools/render/screenshot.mjs pages/audit-render.html --width 390 \
//     --script tools/render/scenarios/audit-panel-fit.mjs
//
// The measurement is the assertion, not the picture. "Off the right edge" is a
// number, and a screenshot at one width cannot show that the clamp holds at the
// hard case: a tap in the LAST few pixels of a narrow viewport, where the panel
// has to flip left and still fit. It throws rather than photographing a
// violation, so a regression fails the run instead of arriving as a pixel
// nobody compares.
//
// It taps through the real path (pointer coordinates on a painted span), since
// the placement reads `selPt` from the click and setting `sel` by hand would
// exercise the fallback branch instead of the one a reader hits.
export default async function (page) {
  await page.waitForSelector('[x-ref="doc"] span');

  // Candidate taps, furthest-right first: the right edge of a painted unit is
  // the furthest right a tap can land, which is the case the clamp exists for.
  // Several of them, because the widest unit is a different one at every width
  // and the first pick can sit under the sticky header or land in padding.
  const spots = await page.evaluate(() => {
    const head = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    return [...document.querySelectorAll('[x-ref="doc"] [data-uid]')]
      .flatMap(el => [...el.getClientRects()])
      .filter(r => r.width > 40 && r.height > 8 && r.top > head + 4 && r.bottom < innerHeight - 4)
      .sort((a, b) => b.right - a.right)
      .slice(0, 6)
      .map(r => ({ x: r.right - 2, y: Math.round((r.top + r.bottom) / 2) }));
  });
  if (!spots.length) throw new Error('no painted unit is on screen to tap');

  let tapped = null;
  for (const s of spots) {
    await page.mouse.click(s.x, s.y);
    await page.waitForTimeout(350);
    if (await page.evaluate(() => !!Alpine.$data(document.body).sel)) { tapped = s; break; }
  }
  if (!tapped) throw new Error(`no tap of ${spots.length} selected a unit`);
  console.log('tapped', JSON.stringify(tapped));

  const m = await page.evaluate(() => {
    const el = document.querySelector('[data-panel]');
    const r = el.getBoundingClientRect();
    const sel = [...el.querySelectorAll('select')].map(s => Math.round(s.getBoundingClientRect().width));
    return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
             top: Math.round(r.top), bottom: Math.round(r.bottom),
             vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight,
             selects: sel };
  });
  console.log('panel', JSON.stringify(m));

  const bad = [];
  if (m.left < 0 || m.right > m.vw) bad.push(`horizontally off: ${m.left}..${m.right} in 0..${m.vw}`);
  if (m.top < 0 || m.bottom > m.vh) bad.push(`vertically off: ${m.top}..${m.bottom} in 0..${m.vh}`);
  // Tapping outside is the only way to dismiss it, so a panel spanning the
  // width is a sheet that cannot be closed. Held at the narrowest phone, where
  // the subtraction has the least room to give.
  if (m.vw > 240 && m.width > m.vw - 48)
    bad.push(`no room to tap outside: ${m.width}px panel in a ${m.vw}px viewport`);
  // A select wider than its longest option plus the chevron is padding, not
  // content, and it is what made the panel wide enough to need clamping.
  for (const w of m.selects) if (w > 110) bad.push(`a select is ${w}px, which is not hugging its text`);
  if (bad.length) throw new Error(bad.join('; '));
}
