// The composer's own selection, driven the way a thumb would drive it. No
// native selection is involved: the kit paints the range and this presses,
// arms and places against the painted spans.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-select-text.mjs
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
  await page.evaluate(() => window.__sr.say('the recognizer heard SHOUTING here', true));
  await page.waitForTimeout(250);

  // Long-press the word to select it. Real pointer events at a real point, so
  // caretRangeFromPoint does the work it will do on a phone.
  const box = await page.evaluate(() => {
    const body = document.querySelector('[data-annotate-ui] [data-d]')?.parentElement;
    const t = body.firstChild;                       // the one text part
    const r = document.createRange();
    const i = t.textContent.indexOf('SHOUTING');
    r.setStart(t.firstChild, i + 3); r.setEnd(t.firstChild, i + 4);
    const b = r.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.waitForTimeout(700);                    // past the long-press threshold
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Arm the START handle, then tap two words to the left. No drag: the tap
  // that arms and the tap that places are separate, so nothing is ever under
  // the finger at the moment it matters.
  const armed = await page.evaluate(() => {
    const h = document.querySelector('[data-annotate-ui] [data-edge="start"]');
    const b = h.getBoundingClientRect();
    h.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: b.x, clientY: b.y }));
    return !!document.querySelector('[data-annotate-ui] [data-edge="start"]');
  });
  if (!armed) throw new Error('the start handle vanished on arming');
  await page.waitForTimeout(150);

  const dest = await page.evaluate(() => {
    const body = document.querySelector('[data-annotate-ui] [data-d]').parentElement;
    const first = body.firstChild;                    // the head text part
    const r = document.createRange();
    const i = first.textContent.indexOf('recognizer');
    r.setStart(first.firstChild, i); r.setEnd(first.firstChild, i + 1);
    const b = r.getBoundingClientRect();
    return { x: b.x + 1, y: b.y + b.height / 2 };
  });
  await page.mouse.move(dest.x, dest.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);
};
