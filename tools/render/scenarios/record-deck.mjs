// The record deck, opened from the shared viewer's table mode.
//
//   node tools/render/screenshot.mjs pages/data-view.html \
//     --hash "data=mehrlander/web-tools:docs/showing-mechanisms.csv" \
//     --script tools/render/scenarios/record-deck.mjs \
//     --out tools/.preview/record-deck.png --width 390 --height 844
//
// jsdom answers the arithmetic (tools/test/record-deck.test.mjs); what only a
// browser answers is whether the card is READABLE at 390px: that no field
// pushes the slide wider than the track (the failure swipe-deck's own note
// warns about, where every index past the wide slide is wrong), and that the
// entry button is where a thumb can reach it.
// The deck entry lives in the VIEWER HEADER now, beside copy and mode,
// rather than in a strip of the table mode's own.
const DECK_BTN = '[data-view-controls] button:has(.ph-cards-three)';

export default async function (page) {
  await page.waitForSelector(DECK_BTN, { timeout: 15000 });
  await page.click(DECK_BTN);
  await page.waitForSelector('.sd-track', { timeout: 10000 });
  await page.waitForTimeout(700);

  // The measurement the picture cannot make: a slide must be exactly one track
  // width, or the pager and the counter disagree with what is on screen.
  const geom = await page.evaluate(() => {
    const t = document.querySelector('.sd-track');
    const s = t.children[0];
    return { track: t.clientWidth, slide: s.clientWidth,
             scrollW: s.scrollWidth, count: t.children.length,
             docScroll: document.documentElement.scrollWidth,
             docClient: document.documentElement.clientWidth };
  });
  console.log('  deck geometry', JSON.stringify(geom));
  if (geom.slide !== geom.track) console.log('  FAIL slide is not one track wide');
  if (geom.scrollW > geom.slide) console.log('  FAIL a field pushes the slide open');
}
