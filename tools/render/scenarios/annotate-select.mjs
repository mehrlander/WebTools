// Shoot the selection surface on pages/annotate.html: three notes in
// the list, one of them SELECTED by clicking its highlight out in the document
// (not its row), and the visible DOM address under each. Confirms the round
// trip the list cannot show on its own, since a Custom Highlight has no DOM
// node to click and the hit has to come from the click point.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-select.mjs
export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });

  // Three notes, added through the public API so the shot is about selection
  // rather than about re-driving the bubble three times.
  await page.evaluate(() => {
    const A = window.Annotate;
    const doc = document;
    const mk = (needle, note) => {
      const walker = doc.createTreeWalker(doc.getElementById('doc'), NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const i = n.data.indexOf(needle);
        if (i < 0) continue;
        const r = doc.createRange();
        r.setStart(n, i); r.setEnd(n, i + needle.length);
        const q = A._quoteFor(doc.body, r);
        const block = n.parentElement.closest('p,li,h1,h2,h3') || n.parentElement;
        const addr = A._addressFor(block, r);
        A.add({ type: 'text', quote: q, selector: addr.selector, span: addr.span,
                label: A._headingTrail(block) }, note);
        return needle;
      }
      return null;
    };
    // Plain-prose needles only: a phrase spanning an inline <code> or <strong>
    // crosses text nodes, and a single-node range is what this shot needs.
    const want = [
      ['zero em dashes', 'the one rule every repo repeats'],
      ['wins wherever it conflicts', 'name the precedence here, not in each repo'],
      ['is not a fork', 'the standing decision worth quoting'],
      ['costs a round trip on work already decided', 'the argument in one line'],
      ['be wary of ideas', 'this is the whole of Keep focus'],
    ];
    for (const [needle, note] of want) {
      if (A.items.length >= 3) break;
      mk(needle, note);
    }
    if (A.items.length < 3) throw new Error('scenario needles missed: ' + A.items.length);
  });

  // Select the THIRD note by clicking its highlight in the document. A Custom
  // Highlight paints without a DOM node, so this is the path that only works
  // if hitTest reads live rects from the click point.
  const box = await page.evaluate(() => {
    const A = window.Annotate;
    const it = A.items[2];
    const r = A._resolveQuote(document.body, it.target.quote);
    r.startContainer.parentElement.scrollIntoView({ block: 'center' });
    const rect = r.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(300);
};
