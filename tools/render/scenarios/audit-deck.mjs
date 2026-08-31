// screenshot.mjs interaction scenario: audit-render.html in the swipe deck.
//
//   node tools/render/screenshot.mjs pages/audit-render.html \
//     --script tools/render/scenarios/audit-deck.mjs \
//     --out tools/.preview/audit-deck.png
//
// The point of the shot: kits/swipe-deck.js is a CONTAINER, not a markdown
// viewer, so the audit rides it with nothing changed. One section per slide,
// the same paint() over the same units, and a per-section keep figure in the
// slide head. Opens on the Status section, the one with a table and two fences.
export default async function (page) {
  await page.waitForSelector('button:has-text("Sections")');
  await page.click('button:has-text("Read")');
  await page.click('button:has-text("Sections")');
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const t = document.querySelector('[style*="scroll-snap-type"], .snap-x') ||
              document.querySelector('div[style*="overflow-x"]');
    if (t) t.scrollLeft = t.clientWidth * 4;
  });
  await page.waitForTimeout(700);
}
