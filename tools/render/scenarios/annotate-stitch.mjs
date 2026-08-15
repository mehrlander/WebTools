// The stitch key: what the pad shows when a caret lands in a sentence gap the
// pause invented. The top cell, which writes a full stop, becomes the cell that
// takes one back, and one tap drops the mark and the capital together.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-stitch.mjs
//
// STATE=gap       caret in the gap, the stitch key showing   (the default)
// STATE=resting   the same buffer with the caret at the end, so the marks show
// STATE=stitched  after the tap

const STATE = process.env.STATE || 'gap';
const TEXT = 'So I went down to the store this morning. And then I remembered '
  + 'I had left the list on the counter.';

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });
  await page.evaluate((t) => {
    window.Annotate.clear();
    window.Annotate.notePage({ listen: false });
    window.Annotate._state.dict.text = t;
    window.Annotate._paintDraft();
  }, TEXT);
  await page.waitForTimeout(250);
  if (STATE === 'resting') return;
  // The gap: the space after the full stop the pause wrote.
  await page.evaluate(() => {
    const S = window.Annotate._state;
    S.dict.caretAt(S.dict.text.indexOf('. And') + 1);
  });
  await page.waitForTimeout(250);
  if (STATE === 'gap') return;
  await page.evaluate(() => {
    const b = window.Annotate._state.compPunct.children[0];
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await page.waitForTimeout(300);
};
