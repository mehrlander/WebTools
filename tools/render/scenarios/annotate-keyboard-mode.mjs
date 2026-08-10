// The composer with the keyboard open. The question this answers is whether
// the mode reads as "typing" rather than "recording", which is a pixel
// question: the glyph, the fill, and whether the mic button still holds its
// slot are three separate signals that have twice been read together.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-keyboard-mode.mjs
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
    const w = document.createTreeWalker(document.getElementById('doc'), NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
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
  await page.evaluate(() => window.__sr.say('This', true));
  await page.waitForTimeout(200);

  await page.click('button[data-annotate-ui][title^="Type instead"]');
  await page.waitForTimeout(400);

  const row = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('[data-annotate-ui] button')];
    const done = btns.find(b => (b.textContent || '').includes('Done'));
    const mic = btns.find(b => b.querySelector('.ph-microphone'));
    const seen = (el) => el && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
    return {
      done: done ? { glyph: done.querySelector('i').className, shown: seen(done) } : null,
      mic: mic ? { shown: seen(mic), disabled: mic.disabled } : null,
    };
  });
  if (!row.done || !row.done.shown) throw new Error('no Done button in keyboard mode');
  if (/ph-microphone/.test(row.done.glyph)) {
    throw new Error('the way out of the keyboard is wearing a microphone again');
  }
  if (!row.mic || !row.mic.shown) throw new Error('the mic vanished, so Done slid into its slot');
  if (!row.mic.disabled) throw new Error('the mic is live while the keyboard is open');
};
