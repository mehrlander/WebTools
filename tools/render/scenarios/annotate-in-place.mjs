// The three paths a mouse never exercised, driven on pages/annotate.html:
// an ELEMENT picked by a plain tap (no mousemove first, which is what a phone
// sends and what the mode used to require), a SELECTION noted from the card's
// own bar rather than from the chip floating beside the text, and the set read
// IN PLACE, drawn on the page with the list folded away.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-in-place.mjs
//
// What the PNG is evidence of: an outline round the picked paragraph, a
// dashed box round the quoted passage, each note's words beside it, and a card
// reduced to its header strip. What it cannot be evidence of is the touch
// dispatch itself; the taps below are synthesized pointer events, so the check
// is that the kit needs nothing but them, not that iOS sends them.
export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });

  const save = async (note) => {
    // The composer opens in dictation mode, so the keyboard is the way in for
    // a headless run: the pencil is a mode switch, and Done is the same key.
    await page.click('button[data-annotate-ui][title^="Type instead"]');
    await page.fill('textarea[data-annotate-ui]', note);
    await page.click('button[data-annotate-ui][title^="Save note"]');
    await page.waitForTimeout(150);
  };

  // ── A selection, noted from the card ─────────────────────────────────────
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.getElementById('doc'), NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const i = n.data.indexOf('zero em dashes');
      if (i > -1) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + 'zero em dashes'.length);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        n.parentElement.scrollIntoView({ block: 'center' });
        document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        return;
      }
    }
    throw new Error('needle not found');
  });
  // The bar, not the floating chip: it is inside the card, which is the whole
  // difference on a phone.
  await page.waitForSelector('button[data-annotate-ui][title="Note the text you selected"]');
  await page.click('button[data-annotate-ui][title="Note the text you selected"]');
  await save('The rule every repo repeats.');

  // ── An element, picked by a tap ──────────────────────────────────────────
  await page.click('button[data-annotate-ui][title^="Tap to select an element"]');
  const box = await page.evaluate(() => {
    const h = [...document.querySelectorAll('#doc h2')][0];
    h.scrollIntoView({ block: 'center' });
    const r = h.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  // Down and up in one place, with no move between: the gesture a finger makes.
  await page.evaluate(({ x, y }) => {
    const cover = [...document.querySelectorAll('div[data-annotate-ui]')]
      .filter(d => d.style.cursor === 'crosshair').pop();
    const at = (type) => cover.dispatchEvent(new PointerEvent(type, {
      clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: true }));
    at('pointerdown');
    at('pointerup');
  }, box);
  await page.waitForSelector('button[data-annotate-ui][title="Note this element"]');
  await page.click('button[data-annotate-ui][title="Note this element"]');
  await save('Does this heading still earn its own section?');

  // ── And read the pair in place ───────────────────────────────────────────
  await page.click('button[data-annotate-ui][title^="Show every note"]');
  await page.evaluate(() => window.scrollTo(0, Math.max(0, window.scrollY - 120)));
  await page.waitForTimeout(400);
};
