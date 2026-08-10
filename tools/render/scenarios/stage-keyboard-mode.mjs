// The stage's dictation card with the keyboard open, which is where the
// "recording?" reading was reported. Same three signals as the annotator's
// composer: the glyph on the way out, its fill, and whether the mic still
// holds its slot.
//
//   npm run shot -- pages/show-repo/show-repo.html --query view=stage \
//     --script tools/render/scenarios/stage-keyboard-mode.mjs
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
  await page.evaluate(() => window.__sr.say('This', true));
  await page.waitForTimeout(200);

  await page.click('button[title^="Type instead"]');
  await page.waitForTimeout(500);

  const row = await page.evaluate(() => {
    // Scoped by TITLE, not by the word Done: show-repo has other buttons whose
    // text contains it, and the first scenario picked one of those up.
    const done = document.querySelector('button[title="Done: back to dictation"]');
    const btns = [...document.querySelectorAll('button')];
    const m = btns.find(b => b.querySelector('.ph-microphone') && b.offsetParent !== null);
    return {
      done: done ? { glyph: (done.querySelector('i') || {}).className || '',
                     text: done.textContent.trim(), cls: done.className } : null,
      mic: m ? { disabled: m.disabled } : null,
    };
  });
  if (!row.done) throw new Error('no Done button in keyboard mode');
  if (!row.done.text.includes('Done')) throw new Error('the exit button lost its word');
  if (/ph-microphone/.test(row.done.glyph)) {
    throw new Error('the way out of the keyboard is wearing a microphone again');
  }
  if (/btn-warning/.test(row.done.cls)) throw new Error('and it is amber again');
  if (!row.mic) throw new Error('the mic vanished, so Done slid into its slot');
  if (!row.mic.disabled) throw new Error('the mic is live while the keyboard is open');
};
