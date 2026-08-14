// A double tap on a word opens the keyboard with the caret inside that word,
// and the long press still takes the word itself. Both need a real caret-from-
// point: the jsdom test stubs it, so the arithmetic is checked there and the
// browser's own answer is checked here.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-double-tap.mjs
//
// Prints DOUBLE and LONGPRESS, and leaves the keyboard mode in frame.

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });
  await page.click('button[data-annotate-ui]:has-text("Page")');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const S = window.Annotate._state;
    S.dict.text = 'The reference bar wraps onto two lines whenever the viewport is narrow.';
    S.dict.caretAt(S.dict.text.length);
    window.Annotate._paintDraft();
  });

  // The middle of the word "wraps", which is offsets 18 through 23.
  const at = await page.evaluate(() => {
    const S = window.Annotate._state;
    const r = document.createRange();
    const t = S.compBody.querySelector('[data-d="text"]').firstChild;
    r.setStart(t, 19); r.setEnd(t, 20);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });

  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(60);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(200);
  console.log('DOUBLE ' + JSON.stringify(await page.evaluate(() => {
    const S = window.Annotate._state;
    const i = S.compTa.selectionStart;
    return { editing: S.editing, caret: i,
             around: S.compTa.value.slice(Math.max(0, i - 6), i + 6),
             taShown: S.compTa.style.display, viewShown: S.compView.style.display };
  })));

  // Out of the keyboard, then the sure gesture on the same word.
  await page.evaluate(() => window.Annotate._state.compEdit.click());
  await page.waitForTimeout(200);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await page.waitForTimeout(150);
  console.log('LONGPRESS ' + JSON.stringify(await page.evaluate(() => {
    const S = window.Annotate._state, r = S.dict.range;
    return { editing: S.editing, range: r, word: r && S.dict.text.slice(r.start, r.end) };
  })));

  // Back into the keyboard, so the shot shows what the gesture opens.
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(60);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(250);
};
