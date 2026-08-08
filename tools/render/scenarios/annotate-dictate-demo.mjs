// Shoot the voice-first compose surface on pages/annotate.html: a staged
// selection, dictation running, committed text plus a live interim, and the
// punctuation row that replaces the engine's guesses. SpeechRecognition is
// stubbed, so this exercises the real compose path without a microphone.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-dictate-demo.mjs
export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });

  // Install the stub AFTER load, not through addInitScript: the harness has
  // already navigated by the time a scenario runs, so an init script would
  // apply to a page that never comes, and headless Chromium's own
  // webkitSpeechRecognition would answer instead. The kit resolves the
  // constructor lazily at start(), so replacing it here is in time.
  await page.evaluate(() => {
    class FakeSR {
      constructor() { window.__sr = this; }
      start() { setTimeout(() => this.onstart && this.onstart(), 0); }
      stop() { setTimeout(() => this.onend && this.onend(), 0); }
      say(text, final) {
        const results = [Object.assign([{ transcript: text }], { isFinal: !!final })];
        this.onresult({ resultIndex: 0, results });
      }
    }
    window.SpeechRecognition = FakeSR;
    window.webkitSpeechRecognition = FakeSR;
  });

  // Stage a selection the ordinary way, then open the draft.
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

  // Dictate: two final utterances with a tapped comma between them, so the
  // shot shows continuation casing, then leave an interim mid-flight.
  await page.click('button[data-annotate-ui][title^="Dictate"]');
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__sr.say('this rule is the one every repo repeats.', true));
  await page.click('button[data-annotate-ui][title="Insert ,"]');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__sr.say('So it belongs in the hub', true));
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__sr.say('rather than in each', false));
  await page.waitForTimeout(400);
};
