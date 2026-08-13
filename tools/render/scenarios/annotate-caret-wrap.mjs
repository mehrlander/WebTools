// The caret must not break the word it sits inside. A caret splits its word
// into two spans, and an ATOMIC inline between them is a line-break
// opportunity, so a word at the wrap point came apart the moment a caret
// landed in it. This sweeps every caret position inside one long word against
// every amount of text before it, so the word crosses the wrap point somewhere
// in the sweep, and reports each position where the two halves land on
// different lines.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-caret-wrap.mjs
//
// 560 positions: 82 broke while the caret was inline-block, 0 as a plain
// inline with a border. Needs a real line box, so it cannot be a jsdom test;
// the property that makes it true is held in tools/test/dictate.test.mjs.

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });
  await page.click('button[data-annotate-ui]:has-text("Page")');
  await page.waitForTimeout(200);
  const out = await page.evaluate(() => {
    const S = window.Annotate._state;
    const W = 'extraordinarily';
    const broke = [];
    let tried = 0;
    for (let pad = 0; pad < 40; pad++) {
      const T = 'x'.repeat(pad) + ' ' + W + ' and then some more words follow after it.';
      const i = T.indexOf(W);
      for (let k = 1; k < W.length; k++) {
        S.dict.text = T;
        S.dict.caretAt(i + k);
        window.Annotate._paintDraft();
        const runs = S.compBody.querySelectorAll('[data-d="text"]');
        if (runs.length < 2) continue;
        const a = runs[0].getClientRects(), b = runs[1].getClientRects();
        if (!a.length || !b.length) continue;
        tried++;
        if (Math.round(a[a.length - 1].top) !== Math.round(b[0].top)) {
          broke.push({ pad, at: k, head: W.slice(0, k), tail: W.slice(k) });
        }
      }
    }
    return { tried, broke: broke.length, cases: broke.slice(0, 5) };
  });
  console.log('WRAP ' + JSON.stringify(out));

  // Leave a caret mid-word in frame, which is the picture of the fix.
  await page.evaluate(() => {
    const S = window.Annotate._state;
    S.dict.text = 'The reference bar wraps onto extraordinarily narrow lines whenever the viewport is small.';
    S.dict.caretAt(S.dict.text.indexOf('extraordinarily') + 5);
    window.Annotate._paintDraft();
  });
  await page.waitForTimeout(250);
};
