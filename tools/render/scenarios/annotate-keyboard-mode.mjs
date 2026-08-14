// The composer with the keyboard open. It used to ask whether the exit button
// read as "typing" rather than "recording", a pixel question three attempts
// failed at (a microphone glyph, then an amber fill, then a green check). The
// row is gone in keyboard mode now, so the question retires with it and this
// asserts what replaced it: no control of any kind while the keyboard is up,
// and the keyboard's own dismiss brings the row back with the words kept.
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

  // The double tap on the read surface, which is the only way in now that the
  // pencil is retired: two pointerups inside the double window, aimed at the
  // canvas under the words.
  await page.evaluate(() => {
    const S = window.Annotate._state;
    const r = S.compView.getBoundingClientRect();
    const x = Math.round(r.left + 20), y = Math.round(r.bottom - 6);
    for (let i = 0; i < 2; i++) {
      S.compView.dispatchEvent(new PointerEvent('pointerup', {
        clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: true }));
    }
  });
  await page.waitForTimeout(400);

  const CONTROLS = ['[title^="Dictate"]', '[title^="Recording"]', '[title^="Undo"]', '[title^="Redo"]',
                   '[title^="Delete the last word"]', '[title^="Save note"]', '[title^="Press and drag"]'];
  const seenCount = () => page.evaluate((sel) => sel
    .map(q => document.querySelector('[data-annotate-ui] button' + q))
    .filter(b => b && getComputedStyle(b).display !== 'none' && b.offsetParent !== null).length, CONTROLS);

  const open = await seenCount();
  if (open) throw new Error(`${open} control(s) still on screen with the keyboard open`);
  const marks = await page.evaluate(() =>
    getComputedStyle(window.Annotate._state.compPunct).display !== 'none');
  if (marks) throw new Error('the punctuation pad is showing under an open keyboard');

  // The dismiss, which on a phone is the keyboard's own key and here is the
  // blur that key amounts to. It ends edit mode, keeps the text, and gives the
  // row back, which is the whole of why the row could go.
  await page.fill('textarea[data-annotate-ui]', 'typed, then dismissed');
  await page.evaluate(() => document.querySelector('textarea[data-annotate-ui]').blur());
  await page.waitForTimeout(300);
  const back = await seenCount();
  if (back !== CONTROLS.length - 1) {   // Dictate and Recording are one button in two states
    throw new Error(`the control row did not come back: ${back} of ${CONTROLS.length - 1}`);
  }
  const kept = await page.evaluate(() => window.Annotate._state.dict.text);
  if (kept !== 'typed, then dismissed') throw new Error('the dismiss lost the typed text: ' + kept);

  // THE SECOND DOOR. A long press off the words asks for the keyboard too,
  // which matters because the double tap became the only way in when the
  // pencil was retired, and one way in is a bet on one gesture landing. Aimed
  // at the canvas under the last line, where a press has no other meaning.
  await page.evaluate(() => {
    const S = window.Annotate._state;
    const r = S.compView.getBoundingClientRect();
    S.compView.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: Math.round(r.left + 20), clientY: Math.round(r.bottom - 6),
      bubbles: true, pointerType: 'touch', isPrimary: true }));
  });
  await page.waitForTimeout(700);           // past the kit's 450ms hold
  const held = await page.evaluate(() => window.Annotate._state.editing);
  if (!held) throw new Error('a long press on the canvas did not open the keyboard');
};
