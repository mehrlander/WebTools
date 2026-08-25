// Shoot pages/dictate.html mid-dictation, with the recognizer stubbed.
//
// Same tactic as annotate-dictate-demo and stage-dictate: install the stub
// AFTER load, since the kit resolves its constructor lazily at start() and a
// page-level addInitScript would be shadowed by the real webkitSpeechRecognition
// this Chromium carries. The page starts listening on the empty surface's own
// tap target, which is the one gesture WebKit's permission model requires and
// the thing worth showing in the shot.
//
//   npm run shot -- pages/dictate.html --width 390 --height 844 --touch \
//     --script tools/render/scenarios/dictate-page.mjs
//
// `--script tools/render/scenarios/dictate-page-selection.mjs` is the sibling
// that goes on to select a word, which is where the pad becomes casing keys.
export const speak = async (page, { select = false, sheet = false, anchor = false, pin = false } = {}) => {
  await page.evaluate(() => {
    class FakeSR {
      constructor() { window.__sr = this; }
      start() { setTimeout(() => this.onstart && this.onstart(), 0); }
      stop() { setTimeout(() => this.onend && this.onend(), 0); }
      say(text, final) {
        this.onresult({ resultIndex: 0,
          results: [Object.assign([{ transcript: text }], { isFinal: !!final })] });
      }
    }
    window.SpeechRecognition = FakeSR;
    window.webkitSpeechRecognition = FakeSR;
  });

  const start = page.locator('button:has-text("Tap anywhere to start talking")');
  await start.waitFor({ state: 'visible', timeout: 15000 });
  await start.click();
  await page.waitForTimeout(400);

  const lines = [
    'the point of this page is that it is blank',
    'every other caller of the kit attaches the buffer to something a passage a file a page you were already reading',
    'none of them answers I want to say a thing',
  ];
  for (const line of lines) {
    await page.evaluate((t) => window.__sr.say(t, true), line);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.__sr.say('so this is the address that was missing', false));
  await page.waitForTimeout(300);

  if (select) {
    // A long press takes the word under the finger. Aimed at the first line,
    // which is where the pad's casing face is worth seeing against real text.
    const box = await page.locator('[x-ref="body"] [data-d="text"]').first().boundingBox();
    if (box) {
      await page.mouse.move(box.x + 150, box.y + 12);
      await page.mouse.down();
      await page.waitForTimeout(600);
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
  }
  if (anchor) {
    // The target's tap half: arm a selection from wherever the caret is.
    await page.locator('button:has(i.ph-crosshair)').click();
    await page.waitForTimeout(250);
  }
  if (pin) {
    // Arm an edge of the selection from its PINHEAD, which is the other way in
    // to the same state: the target reddens for it without having been tapped.
    // The pins are hidden once a mouse has been seen, and a render is all
    // mouse, so ask for them back first.
    await page.evaluate(() => { const c = document.querySelector('[x-data="dictate"]')._x_dataStack[0]; c.precise = false; c.paint(); });
    await page.waitForTimeout(150);
    await page.locator('[x-ref="layer"] [data-edge="end"]').click();
    await page.waitForTimeout(250);
  }
  if (sheet) {
    await page.locator('button:has-text("Save")').click();
    await page.waitForTimeout(400);
  }
};

export default async (page) => { await speak(page); };
