// The cursor pad: press the crosshair and drag, and the caret walks the buffer
// while the button stays put and the thumb stays off the text. Shot mid-drag,
// so the drag mode's own signal is in frame: everything outside the card dims,
// the text box takes a blue ring, and the caret is parked mid-sentence.
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
  // Left and up: horizontal is continuous, vertical steps a line per 42px, so
  // this is one line up and a few words back.
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(b.x + b.width / 2 - i * 9, b.y + b.height / 2 - i * 5);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(400);
  // The button is left DOWN: the drag mode's own signal (the surround dimmed
  // to ~163 grey, the ring on the box) is only in frame while the drag is live,
  // and the harness shoots as soon as this returns.
};
