// The annotator's unit modes on pages/annotate.html, through the real pointer
// path: one element pick (hover-outline, tap) and one dragged region rectangle.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-units-demo.mjs
//
// STATE=both    both units captured, dashed outlines painted   (the default)
// STATE=region  mid-mode: the drag cover down, the card floating over it with
//               ▭ Region lit. This is the state that used to be a trap, since
//               the card hid and took the only exit with it.
const STATE = process.env.STATE || 'both';

// The compose surface opens in DICTATION, so a headless run has to ask for the
// keyboard before there is a textarea to type into. Clicking the pencil is what
// a reader without a microphone does too.
const type = async (page, text) => {
  await page.click('button[data-annotate-ui][title^="Type instead"]');
  await page.fill('textarea[data-annotate-ui]', text);
  await page.click('button[data-annotate-ui][title^="Save note"]');
  await page.waitForTimeout(150);
};

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });

  // Element pick: tap stages the element, "+ note" opens the input.
  await page.click('button[data-annotate-ui]:has-text("⌖ Element")');
  const h2 = await page.locator('#doc h2').first().boundingBox();
  await page.mouse.move(h2.x + 12, h2.y + 8);
  await page.waitForTimeout(120);
  await page.mouse.click(h2.x + 12, h2.y + 8);
  await page.click('button[data-annotate-ui]:has-text("+ note")');
  await type(page, 'This whole section wants a worked example.');

  // Region: the drag stages the rectangle, "+ note" opens the input.
  await page.click('button[data-annotate-ui]:has-text("▭ Region")');
  const ul = await page.locator('#doc ul').first().boundingBox();
  await page.mouse.move(ul.x - 8, ul.y - 6);
  await page.mouse.down();
  await page.mouse.move(ul.x + ul.width * 0.75, ul.y + ul.height + 6, { steps: 10 });
  await page.mouse.up();

  if (STATE === 'region') {
    // Stop here. The rectangle is staged, the cover is down, and the card is
    // still up with its chip lit: three things that could not be true at once
    // before, since the card hid for the length of the mode.
    await page.waitForTimeout(400);
    return;
  }

  await page.click('button[data-annotate-ui]:has-text("+ note")');
  await type(page, 'These definitions belong in the glossary as well.');
  await page.waitForTimeout(300);
};
