// Screenshot driver: the docked deck with its seam, mid-drag.
//
//   npm run shot -- app/index.html --script tools/render/scenarios/deck-split.mjs --height 900
//
// The dock needs a deck open and the pane preference set, neither of which a
// cold load has, and the handle only draws its readout while a drag is live.
// So this opens a deck, docks it, and presses the seam without releasing, which
// is the state worth looking at and the one no static shot can reach.
export default async (page) => {
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.gh.load('kits/swipe-deck.js'));
  await page.evaluate(() => window.gh.load('kits/dock-split.js'));
  await page.waitForFunction(() => !!window.swipeDeck && !!window.dockSplit && typeof window.__deckWidth === 'function');
  await page.evaluate(async () => {
    window.swipeDeck.open({
      count: 3,
      title: 'docs/showing.md',
      subtitle: 'a file, beside the list it came from',
      render: (i, el) => {
        // Inline styles, for the same reason the seam's placement is inline:
        // this markup is created after the page's Tailwind build has scanned,
        // so a utility class here may render as nothing at all.
        const d = document.createElement('div');
        d.style.cssText = 'padding:2rem;max-width:44rem;line-height:1.6';
        d.innerHTML = '<h2 style="font-size:1.25rem;font-weight:600;margin-bottom:.75rem">'
          + 'Showing: getting a thing in front of a viewer</h2>'
          + '<p style="margin-bottom:.75rem">The estate answers one question in a dozen ways: '
          + 'something exists somewhere, and someone needs to look at it.</p>'
          + '<p>Drag the seam on the left to give the list more room, or the file more.</p>';
        el.appendChild(d);
      },
      start: 0,
    });
    window.__deckPane('dock');
    await new Promise(r => setTimeout(r, 400));
    window.__deckWidth(52, true);
    await new Promise(r => setTimeout(r, 200));
  });
  const box = await (await page.$('.dk-split')).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2, { steps: 8 });
  await page.waitForTimeout(300);
};
