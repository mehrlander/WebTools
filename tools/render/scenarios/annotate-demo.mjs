// Shoot the annotator mid-flight on pages/annotate.html: two text notes made
// through the real selection path (select → "+ note" → type → save), the
// panel open with both rows, and the quote highlights painted by the CSS
// Custom Highlight API.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-demo.mjs
export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });

  const annotate = async (needle, note) => {
    await page.evaluate((text) => {
      const walker = document.createTreeWalker(document.getElementById('doc'), NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const i = n.data.indexOf(text);
        if (i > -1) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + text.length);
          const sel = getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
          n.parentElement.scrollIntoView({ block: 'center' });
          document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
          return;
        }
      }
      throw new Error('needle not found: ' + text);
    }, needle);
    await page.waitForSelector('[data-annotate-ui]:has-text("+ note")', { timeout: 5000 });
    await page.click('button[data-annotate-ui]:has-text("+ note")');
    await page.fill('textarea[data-annotate-ui]', note);
    await page.click('button[data-annotate-ui][title^="Save note"]');
    await page.waitForTimeout(150);
  };

  await annotate('zero em dashes', 'House style: this is the rule every repo repeats.');
  await annotate('A consistency ask is not a fork',
    'Candidate for promotion into the tasks skill?');

  // Scroll back to the first highlight so both the paint and the panel show.
  await page.evaluate(() => {
    document.getElementById('doc').scrollIntoView({ block: 'start' });
    window.scrollTo(0, 260);
  });
  await page.waitForTimeout(400);
};
