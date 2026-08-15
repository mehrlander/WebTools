// The stage's pad showing the stitch key: a caret dropped in a sentence gap
// the pause invented turns the top cell, the one that writes a full stop, into
// the cell that takes one back. Same swap as the annotator's card, same kit
// verb (kits/dictate.js stitch()).
//
//   npm run shot -- pages/show-repo/show-repo.html --query view=stage \
//     --script tools/render/scenarios/stage-stitch.mjs
//
// STATE=gap       the caret in the gap, stitch key showing   (the default)
// STATE=stitched  after the tap

const STATE = process.env.STATE || 'gap';

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
  await page.evaluate(() => window.__sr.say('I went down to the store this morning', true));
  await page.waitForTimeout(200);

  const at = (fn) => page.evaluate((body) => {
    const host = document.querySelector('[x-data]');
    const d = window.Alpine.$data(document.querySelector('[x-ref="dictBody"]').closest('[x-data]'));
    // eslint-disable-next-line no-new-func
    new Function('d', body)(d);
    return !!host;
  }, fn);

  await at(`d._dict.text = 'I went down to the store this morning. And then I remembered the list.';
            d.dictText = d._dict.text; d.dictPaint();`);
  await page.waitForTimeout(200);
  await at(`d._dict.caretAt(d._dict.text.indexOf('. And') + 1); d.dictPaint();`);
  await page.waitForTimeout(300);
  if (STATE === 'gap') return;
  await at(`d.dictMark('stitch');`);
  await page.waitForTimeout(300);
};
