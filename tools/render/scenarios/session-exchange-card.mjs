// One exchange as one card, with its tool calls folded.
//
//   node tools/render/screenshot.mjs pages/session.html \
//     --hash "gz=<a gzipped record>" \
//     --script tools/render/scenarios/session-exchange-card.mjs \
//     --out tools/.preview/session-exchange-card.png --width 390 --height 844
//
// jsdom answers what the layout IS: which turns share a card, and where the
// runs of tool calls fall (tools/test/session-render.test.mjs). What only a
// browser answers is whether the result reads: that a closed fold is one line
// among the prose rather than a second kind of message competing with it, and
// that an exchange carrying dozens of calls still opens on its own question
// instead of on machinery.
//
// Set CARD past the first to land mid-conversation, which is where a reader
// arrives from the outline.
const CARD = Number(process.env.CARD || 1);
const OPEN_FOLD = process.env.OPEN_FOLD === '1';

export default async function (page) {
  const row = `[aria-label="Read card ${CARD} in the deck"]`;
  await page.waitForSelector(row, { timeout: 20000 });
  await page.click(row);
  await page.waitForSelector('.sd-track', { timeout: 10000 });
  await page.waitForTimeout(900);

  if (OPEN_FOLD) {
    const fold = '.sd-track details summary';
    await page.waitForSelector(fold, { timeout: 10000 });
    await page.click(fold);
    await page.waitForTimeout(900);
  }

  // The measurement the picture cannot make: how much of the card is prose and
  // how much is folded machinery. A card whose folds outnumber its sentences
  // several times over is one the grouping has not condensed.
  const shape = await page.evaluate(() => {
    const slide = [...document.querySelectorAll('.sd-track > *')]
      .find(s => s.offsetParent !== null && s.textContent.trim());
    const kids = slide ? [...slide.querySelectorAll(':scope > * > *')] : [];
    return {
      folds: document.querySelectorAll('.sd-track details').length,
      open: document.querySelectorAll('.sd-track details[open]').length,
      labels: [...document.querySelectorAll('.sd-track details summary')].map(s => s.textContent.trim()),
      blocks: kids.length,
    };
  });
  console.log('card shape:', JSON.stringify(shape, null, 2));
}
