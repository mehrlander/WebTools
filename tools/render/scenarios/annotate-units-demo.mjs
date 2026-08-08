// Shoot the annotator's unit modes on pages/annotate.html: one element pick
// (hover-outline, tap) and one dragged region rectangle, each through the real
// pointer path, ending with both dashed outline boxes painted and the panel
// showing the pair.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-units-demo.mjs
export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });

  // Element pick: tap stages the element, "+ note" opens the input.
  await page.click('button[data-annotate-ui]:has-text("⌖ element")');
  const h2 = await page.locator('#doc h2').first().boundingBox();
  await page.mouse.move(h2.x + 12, h2.y + 8);
  await page.waitForTimeout(120);
  await page.mouse.click(h2.x + 12, h2.y + 8);
  await page.click('button[data-annotate-ui]:has-text("+ note")');
  await page.fill('textarea[data-annotate-ui]', 'This whole section wants a worked example.');
  await page.click('button[data-annotate-ui][title^="Save note"]');
  await page.waitForTimeout(150);

  // Region: the drag stages the rectangle, "+ note" opens the input.
  await page.click('button[data-annotate-ui]:has-text("▭ region")');
  const ul = await page.locator('#doc ul').first().boundingBox();
  await page.mouse.move(ul.x - 8, ul.y - 6);
  await page.mouse.down();
  await page.mouse.move(ul.x + ul.width * 0.75, ul.y + ul.height + 6, { steps: 10 });
  await page.mouse.up();
  await page.click('button[data-annotate-ui]:has-text("+ note")');
  await page.fill('textarea[data-annotate-ui]', 'These definitions belong in the glossary as well.');
  await page.click('button[data-annotate-ui][title^="Save note"]');
  await page.waitForTimeout(400);
};
