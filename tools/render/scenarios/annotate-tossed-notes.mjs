// The case the unit tests stand in for, driven for real: annotate.html rendered
// through toss-render, so the kit runs in the subject frame and the drawer on
// screen is the shell's. Taps Review inside the frame and expects the shell's
// Notes tab to open with the frame's notes in it.
//
// This is the normal way a page under review is looked at, and it is where the
// first cut failed: Review reported "no drawer" with the launcher visible.
//
//   npm run shot -- pages/toss-render.html --script tools/render/scenarios/annotate-tossed-notes.mjs \
//     --hash '#gh=mehrlander/web-tools@<ref>:pages/annotate.html'
export default async (page) => {
  const frame = await page.waitForSelector('iframe', { timeout: 20000 });
  const f = await frame.contentFrame();
  await f.waitForSelector('#doc h1', { timeout: 20000 });

  // Take a note inside the frame, the way selecting text there would.
  await f.evaluate(() => {
    const A = window.Annotate;
    const walker = document.createTreeWalker(document.getElementById('doc'), NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const i = n.data.indexOf('zero em dashes');
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i); r.setEnd(n, i + 'zero em dashes'.length);
      const block = n.parentElement.closest('p,li,h1,h2,h3') || n.parentElement;
      const addr = A._addressFor(block, r);
      A.add({ type: 'text', quote: A._quoteFor(document.body, r), selector: addr.selector,
              span: addr.span, label: A._headingTrail(block) }, 'taken inside the tossed frame');
      return;
    }
  });

  // Review from the frame's card. The shell drawer has to hear it.
  await f.evaluate(() => window.Annotate.review());
  await page.waitForTimeout(600);

  const state = await page.evaluate(() => {
    const el = document.querySelector('[x-data^="fab"]');
    const d = el && window.Alpine.$data(el);
    return d ? { open: d.open, tab: d.activeTab, count: d.annItems.length, on: d.annOn,
                 subject: d.annSubject } : null;
  });
  if (!state) throw new Error('no shell fab mounted');
  if (!state.open || state.tab !== 'notes') {
    throw new Error('Review did not reach the shell drawer: ' + JSON.stringify(state));
  }
  if (state.count !== 1 || !state.on) {
    throw new Error('the drawer did not adopt the frame’s annotator: ' + JSON.stringify(state));
  }
  await page.waitForTimeout(300);
};
