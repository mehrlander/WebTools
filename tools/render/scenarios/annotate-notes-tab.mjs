// The drawer's Notes tab: the annotator's review surface in the sidebar rather
// than in a modal of its own. Seeds three notes through the kit, then opens the
// fab on the tab. STATE picks which of the three readings to shoot.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-notes-tab.mjs
//
// STATE=notes  the working list, one note selected      (the default)
// STATE=md     the markdown exactly as Copy hands it over
// STATE=json   the same for annotate/1
// STATE=off    the tab before the annotator is on

const STATE = process.env.STATE || 'notes';

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });
  await page.waitForFunction(() => window.Alpine && document.querySelector('[x-data^="fab"]'),
    null, { timeout: 15000 });

  await page.evaluate((state) => {
    const A = window.Annotate;
    const doc = document;
    if (state === 'off') A.disable();
    else {
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
      // Plain-prose needles only: a phrase spanning an inline <code> or
      // <strong> crosses text nodes, and a single-node range is what this needs.
      A.clear();
      mk('zero em dashes', 'the one rule every repo repeats, and the one most often broken');
      mk('wins wherever it conflicts', 'name the precedence here rather than in each repo');
      mk('is not a fork', 'the standing decision worth quoting back');
      A.select(A.items[2].id, { scroll: false });
    }

    const d = window.Alpine.$data(document.querySelector('[x-data^="fab"]'));
    d.open = true;
    d.activeTab = 'notes';
    d.annSetTab(state === 'md' ? 'md' : state === 'json' ? 'json' : 'notes');
    d.annSync();
  }, STATE);

  await page.waitForTimeout(700);
};
