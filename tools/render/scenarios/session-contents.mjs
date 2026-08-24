// The session deck's contents list, opened from the header mark.
//
//   node tools/render/screenshot.mjs pages/session.html \
//     --hash "gz=<a gzipped record>" \
//     --script tools/render/scenarios/session-contents.mjs \
//     --out tools/.preview/session-contents.png --width 390 --height 844
//
// jsdom answers whether the labeler is wired and what a row says
// (tools/test/session-render.test.mjs). What only a browser answers is whether
// thirty rows of mechanical titles are READABLE at 390px: that a title truncates
// to one line rather than pushing the panel wide, that the kind marks are
// distinguishable from each other at 16px, and that the row the reader is
// standing on is findable without scrolling, since the list opens on it.
//
// The page opens on the OUTLINE, and the deck is entered from it, which is the
// gap the contents list closes: the outline is where a reader jumps between
// cards, and stepping into the deck used to leave it behind. So the scenario
// enters the way a reader does, at a card in the middle, and then asks the deck
// for the same list the page it came from was showing.
const CARD = 5;

export default async function (page) {
  const row = `[aria-label="Read card ${CARD} in the deck"]`;
  await page.waitForSelector(row, { timeout: 20000 });
  await page.click(row);
  await page.waitForSelector('.sd-track', { timeout: 10000 });
  await page.waitForTimeout(900);

  const mark = '.sd-header > button[aria-haspopup="true"], .sd-header button:nth-child(2)';
  await page.waitForSelector(mark, { timeout: 10000 });
  await page.click(mark);
  await page.waitForSelector('.sd-index', { timeout: 10000 });
  await page.waitForTimeout(500);

  // The measurement the picture cannot make: the panel must stay inside the
  // frame, and every row must be one line of title. A row that wraps is a list
  // that scrolls twice as far as it should.
  const geom = await page.evaluate(() => {
    const s = document.querySelector('.sd-index');
    const rows = [...s.children];
    return {
      rows: rows.length,
      title: rows.map(r => r.textContent.trim()).slice(0, 3),
      panelW: s.clientWidth,
      frameW: document.querySelector('.sd-overlay').clientWidth,
      overflows: s.scrollWidth > s.clientWidth,
      current: rows.findIndex(r => r.getAttribute('aria-current') === 'true'),
      marks: [...new Set(rows.map(r => r.querySelector('i')?.className || ''))].length,
      // The other half of the labeler, read off the pager: a gap sits at each
      // exchange boundary and nowhere else, so the dots say how many cards each
      // question took rather than only how many there are.
      gaps: [...document.querySelectorAll('[aria-label^="Go to"]')]
        .map((d, i) => (d.style.marginLeft ? i : -1)).filter(i => i >= 0),
    };
  });
  // Reported through the PAGE console, which is the half the shot log keeps.
  await page.evaluate(g => console.log('contents ' + JSON.stringify(g)), geom);
  const fail = (m) => page.evaluate(x => console.log('FAIL ' + x), m);
  if (geom.panelW > geom.frameW) await fail('the panel is wider than the frame');
  if (geom.overflows) await fail('a row pushes the panel open');
  if (geom.current < 0) await fail('the reader is not marked');
  if (geom.marks < 2) await fail('every row carries the same kind mark');
  if (!geom.gaps.length) await fail('the pager shows no exchange boundary');
}
