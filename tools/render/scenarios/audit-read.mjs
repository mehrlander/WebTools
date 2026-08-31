// screenshot.mjs interaction scenario: audit-render.html in Read view.
//
//   node tools/render/screenshot.mjs pages/audit-render.html \
//     --script tools/render/scenarios/audit-read.mjs \
//     --out tools/.preview/audit-read.png
//
// What the pixels have to prove: the tint survives a real markdown render, and
// the units that CANNOT be rendered alone are marked rather than rendered
// broken. Scrolls past the header so the fence and the code-span split are in
// frame, which is where both failure shapes live.
export default async function (page) {
  await page.waitForSelector('button:has-text("Read")');
  await page.click('button:has-text("Read")');
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(400);
}
