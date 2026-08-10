// Two things jsdom cannot decide, driven with real pointer events in a real
// layout engine: a buffer long enough to overflow the box scrolls to keep the
// newest line in view, and three taps in a run take the whole thing.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-triple-tap.mjs
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

  // Speak past the height of the box, a sentence at a time the way a real
  // engine finalizes, so the scroll is exercised on each arrival rather than
  // once at the end.
  const LINES = [
    'The first thing said, which will end up off the top of the box',
    'and the second, which follows it down',
    'and a third, by which point the box is full',
    'and a fourth, which is the one being spoken',
  ];
  for (const line of LINES) {
    await page.evaluate((t) => window.__sr.say(t, true), line);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(200);

  // The box scrolled, and the last line is fully in view rather than clipped
  // in half by a height that is not a whole number of lines.
  const view = await page.evaluate(() => {
    const body = document.querySelector('[data-annotate-ui] [data-d]').parentElement;
    const box = body.parentElement;
    const cs = getComputedStyle(box);
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    return {
      top: box.scrollTop, max: box.scrollHeight - box.clientHeight,
      lines: (box.clientHeight - pad) / parseFloat(cs.lineHeight),
    };
  });
  if (view.max <= 0) throw new Error('the buffer did not overflow the box, so nothing was tested');
  if (view.top < view.max - 1) {
    throw new Error(`the newest line is off screen: scrollTop ${view.top} of ${view.max}`);
  }
  if (Math.abs(view.lines - Math.round(view.lines)) > 0.02) {
    throw new Error(`the box is ${view.lines} lines tall, so the bottom one is cut in half`);
  }

  // Three taps in a run, on the text, at a real point.
  const at = await page.evaluate(() => {
    const b = document.querySelector('[data-annotate-ui] [data-d]').getBoundingClientRect();
    const box = document.querySelector('[data-annotate-ui] [data-d]')
      .parentElement.parentElement.getBoundingClientRect();
    return { x: b.x + 20, y: Math.max(b.y, box.y) + 8 };
  });
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(300);

  const took = await page.evaluate(() => {
    const parts = [...document.querySelectorAll('[data-annotate-ui] [data-d]')];
    const sel = parts.find(n => n.getAttribute('data-d') === 'sel');
    const all = parts.filter(n => /^(text|sel)$/.test(n.getAttribute('data-d')))
      .map(n => n.textContent).join('');
    return { sel: sel ? sel.textContent : null, all };
  });
  if (!took.sel) throw new Error('three taps selected nothing');
  if (took.sel !== took.all) {
    throw new Error('three taps took only part of it: ' + JSON.stringify(took.sel));
  }
};
