// The blank canvas below the last line is a PLACE, not an absence, and what a
// tap there means depends on whether a pin is armed. Both readings are browser
// facts: jsdom has no client rects, so hitsText cannot tell canvas from text
// there and neither path can be driven without layout.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-canvas-tap.mjs
//
// Prints ARMED / POINT / AFTER / UNARMED and leaves the armed case in frame:
// the selection running from "reference" to the end of the buffer, its end pin
// still red.

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });
  await page.click('button[data-annotate-ui]:has-text("Page")');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const S = window.Annotate._state;
    S.dict.text = 'The reference bar wraps onto two lines whenever the viewport is narrow.';
    S.dict.selectWordAt(4);
    window.Annotate._paintDraft();
  });
  await page.click('[data-edge="end"]');
  await page.waitForTimeout(120);
  console.log('ARMED ' + JSON.stringify(await page.evaluate(() => ({
    armed: window.Annotate._state.compArmed,
    range: window.Annotate._state.dict.range,
    len: window.Annotate._state.dict.text.length,
  }))));

  // A point inside the box and below the last painted line.
  const at = await page.evaluate(() => {
    const S = window.Annotate._state;
    const b = S.compView.getBoundingClientRect();
    const h = S.compBody.getBoundingClientRect();
    const x = b.left + 40, y = h.bottom + 20;
    return { x, y, hits: window.Dictate.hitsText(S.compBody, x, y) };
  });
  console.log('POINT ' + JSON.stringify(at));

  // Armed: the pin travels to the end and the selection survives.
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(150);
  console.log('AFTER ' + JSON.stringify(await page.evaluate(() => ({
    armed: window.Annotate._state.compArmed,
    range: window.Annotate._state.dict.range,
  }))));

  // Unarmed: the same tap is still the one-tap way out of selection mode.
  await page.evaluate(() => {
    const S = window.Annotate._state;
    S.dict.selectWordAt(4); S.compArmed = null; window.Annotate._paintDraft();
  });
  await page.waitForTimeout(400);                 // past the multi-tap window
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(150);
  console.log('UNARMED ' + JSON.stringify(await page.evaluate(() => ({
    armed: window.Annotate._state.compArmed,
    range: window.Annotate._state.dict.range,
  }))));

  // Back to the armed case, so the shot shows the state this exists for.
  await page.evaluate(() => {
    const S = window.Annotate._state;
    S.dict.select(4, 13); S.compArmed = 'end'; window.Annotate._paintDraft();
  });
  await page.waitForTimeout(400);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(200);
};
