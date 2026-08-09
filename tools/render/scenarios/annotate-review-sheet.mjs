// Shoot the review sheet on pages/annotate.html: the Notes tab, where the whole
// set is readable at once and each note gets an editor with room in it, rather
// than the 44-pixel compose box the panel has to make do with. Pass "md" or
// "json" through the ANNOTATE_TAB env to shoot a format tab instead.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-review-sheet.mjs
export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });

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
        const block = n.parentElement.closest('p,li,h1,h2,h3') || n.parentElement;
        const addr = A._addressFor(block, r);
        A.add({ type: 'text', quote: A._quoteFor(doc.body, r), selector: addr.selector,
                span: addr.span, label: A._headingTrail(block) }, note);
        return true;
      }
      return false;
    };
    // Plain-prose needles only: a phrase spanning an inline <code> or <strong>
    // crosses text nodes, and a single-node range is what this needs.
    mk('zero em dashes', 'the one rule every repo repeats, and the one most often broken');
    mk('wins wherever it conflicts', 'name the precedence here rather than in each repo');
    mk('is not a fork', 'the standing decision worth quoting back');
    A.review();
  });

  const tab = process.env.ANNOTATE_TAB;
  if (tab === 'md' || tab === 'json') {
    await page.click(`[data-annotate-ui] button:text-is("${tab === 'md' ? 'Markdown' : 'JSON'}")`);
  }
  await page.waitForTimeout(300);
};
