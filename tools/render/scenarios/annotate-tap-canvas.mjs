// A tap on the blank canvas below the text, with a selection live. The point
// of running it in a real browser is that jsdom cannot: the whole question is
// whether the tap lands on a listener at all and whether the painted spans'
// rects say it missed the words, and both are layout.
//
// The scenario stops one tap short of the end, so the shot shows the selection
// about to be dropped; the assertion below is what proves it was.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-tap-canvas.mjs
export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });
  await page.evaluate(() => {
    class FakeSR {
      constructor() { window.__sr = this; }
      start() { setTimeout(() => this.onstart && this.onstart(), 0); }
      stop() { setTimeout(() => this.onend && this.onend(), 0); }
      say(t, final) {
        this.onresult({ resultIndex: 0,
          results: [Object.assign([{ transcript: t }], { isFinal: !!final })] });
      }
    }
    window.SpeechRecognition = FakeSR;
    window.webkitSpeechRecognition = FakeSR;
  });

  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.getElementById('doc'), NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const i = n.data.indexOf('zero em dashes');
      if (i > -1) {
        const r = document.createRange();
        r.setStart(n, i); r.setEnd(n, i + 'zero em dashes'.length);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        n.parentElement.scrollIntoView({ block: 'center' });
        document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        return;
      }
    }
  });
  await page.click('button[data-annotate-ui]:has-text("+ note")');
  await page.waitForSelector('button[data-annotate-ui][title^="Recording"]');
  await page.evaluate(() => window.__sr.say('a short line', true));
  await page.waitForTimeout(250);

  // Select a word, so there is something for the canvas tap to clear.
  const word = await page.evaluate(() => {
    const body = document.querySelector('[data-annotate-ui] [data-d]').parentElement;
    const t = body.firstChild;
    const r = document.createRange();
    const i = t.textContent.indexOf('short');
    r.setStart(t.firstChild, i + 2); r.setEnd(t.firstChild, i + 3);
    const b = r.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.move(word.x, word.y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(300);

  const before = await page.evaluate(() =>
    !!document.querySelector('[data-annotate-ui] [data-d="sel"]'));
  if (!before) throw new Error('nothing was selected, so the canvas tap proves nothing');

  // The canvas: inside the scroll box, below the last line. This is the point
  // that reached no handler before the listeners moved off the painted span,
  // and the point caretRangeFromPoint would happily answer for.
  const canvas = await page.evaluate(() => {
    const body = document.querySelector('[data-annotate-ui] [data-d]').parentElement;
    const box = body.parentElement;                  // the scrolling view
    const bb = box.getBoundingClientRect();
    const tb = body.getBoundingClientRect();
    return { x: bb.x + bb.width / 2, y: (tb.bottom + bb.bottom) / 2, gap: bb.bottom - tb.bottom };
  });
  if (canvas.gap < 8) throw new Error('no blank canvas under the text to tap');
  await page.mouse.move(canvas.x, canvas.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => ({
    sel: !!document.querySelector('[data-annotate-ui] [data-d="sel"]'),
    pins: document.querySelectorAll('[data-annotate-ui] [data-edge]').length,
  }));
  if (after.sel) throw new Error('the canvas tap left the selection standing');
  if (after.pins) throw new Error('the canvas tap left the pins behind');

  // And the caret is at the end, which is proved by speaking: the words append
  // rather than replacing anything.
  await page.evaluate(() => window.__sr.say('and more', true));
  await page.waitForTimeout(250);
  const text = await page.evaluate(() =>
    [...document.querySelectorAll('[data-annotate-ui] [data-d]')]
      .filter(n => /^(text|sel)$/.test(n.getAttribute('data-d')))
      .map(n => n.textContent).join(''));
  if (!/a short line\.\s*And more/.test(text)) {
    throw new Error('the words did not append at the end: ' + JSON.stringify(text));
  }
};
