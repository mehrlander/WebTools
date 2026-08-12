// The cursor pad: press the crosshair and drag, and the caret walks the buffer
// while the button stays put and the thumb stays off the text. Shot mid-drag,
// with the pad lit and the caret parked mid-sentence.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-cursor-pad.mjs

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });
  await page.click('button[data-annotate-ui]:has-text("Page")');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const S = window.Annotate._state;
    S.dict.text = 'The ref bar wraps to two lines under 380px and pushes the guide off the screen entirely.';
    S.dict.caretAt(S.dict.text.length);
    window.Annotate._paintDraft();
  });

  const b = await page.locator('button[data-annotate-ui][title^="Press and drag"]').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  // Left and up: back through two wrapped lines. Stepped rather than jumped,
  // since each move is a separate reading of what sits under the virtual point.
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(b.x + b.width / 2 - i * 12, b.y + b.height / 2 - i * 4);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(400);
};
