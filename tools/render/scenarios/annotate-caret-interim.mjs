// The two things a reader watches while dictating into a caret: the caret
// itself (a pulsing bar, so a placed insertion point looks live) and the
// hypothesis, which paints AT that caret rather than at the end of the buffer.
// Speech is stubbed, so this is the real compose path without a microphone.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-caret-interim.mjs
//
// STATE=caret   text, a caret placed mid-buffer, a live hypothesis   (default)
// STATE=end     the same hypothesis with no caret, appended as before

const STATE = process.env.STATE || 'caret';

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });

  // Installed after load for the same reason annotate-dictate-demo says: the
  // harness has already navigated, and the kit resolves the constructor lazily
  // at start(), so replacing it here is in time.
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

  await page.click('button[data-annotate-ui]:has-text("Page")');
  await page.waitForTimeout(200);

  await page.evaluate((state) => {
    const S = window.Annotate._state;
    S.dict.start();
    window.__sr.say('The ref bar wraps to two lines and pushes the guide off screen.', true);
    // A caret in the middle of the settled text: the state where the old paint
    // put the incoming words at the bottom and then jumped them up here.
    if (state === 'caret') S.dict.caretAt(S.dict.text.indexOf('and pushes'));
    window.__sr.say('under 380px', false);
  }, STATE);

  await page.waitForTimeout(500);
};
