// Shoot the stage's dictation bar: the third intake, driven through a stubbed
// recognizer. Same tactic as annotate-dictate-demo (install the stub after
// load, since the kit resolves its constructor lazily at start()); the mic
// button appears without a reload because stage.js reads availability as a
// getter rather than caching it at init.
//
//   npm run shot -- app/index.html --query view=stage \
//     --script tools/render/scenarios/stage-dictate.mjs
export default async (page) => {
  await page.evaluate(() => {
    class FakeSR {
      constructor() { window.__sr = this; }
      start() { setTimeout(() => this.onstart && this.onstart(), 0); }
      stop() { setTimeout(() => this.onend && this.onend(), 0); }
      say(text, final) {
        this.onresult({ resultIndex: 0,
          results: [Object.assign([{ transcript: text }], { isFinal: !!final })] });
      }
    }
    window.SpeechRecognition = FakeSR;
  });

  const mic = page.locator('button[title="Dictate a staged file"]');
  await mic.waitFor({ state: 'visible', timeout: 15000 });
  await mic.click();
  await page.waitForTimeout(800);

  await page.evaluate(() => window.__sr.say('the stage takes a file that exists nowhere yet', true));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__sr.say('spoken instead of pasted', false));
  await page.waitForTimeout(400);
};
