// Open the Map view's Surfacing tab and exercise the two doors in its header:
// the Read button, which now opens the house swipe deck rather than routing to
// the Files view, and the doc's GitHub mark, whose peek card carries a mark of
// its own.
//
//   npm run shot -- app/index.html --script tools/render/scenarios/map-surfacing-read.mjs
//
// The tab is public (it reads the hub's docs/surfacing.csv), so this needs no
// token: the sandbox's contents-API shim serves the manifest and the doc from
// the working tree, which is what makes a branch's copy the one under test.
//
// MODE picks what is rendered:
//   none   the tab as it stands, for the header and the lede
//   peek   hover the header's SURFACING.md mark, for the card       (default)
//   deck   the deck door, filling the content pane
//   dock   the door, then the pane toggle, so the doc sits beside the cards
//   csv    docked, then swiped to the index slide, for the table rendition
//   over   docked, then a peek opened from the list, which must sit ABOVE it
//   docs   the Docs tab's own door, over its selected folder
//   lead   a card title tapped, which docks the deck and marks its bullet
//   region a region door tapped, which docks the deck and marks the heading
//   tests  the Tests tab's door, over the suite as its strip has cut it

export default async (page) => {
  await page.waitForFunction(() => window.__shell && window.Alpine, null, { timeout: 15000 });
  await page.evaluate(() => window.__shell.goMap());
  await page.waitForSelector('[role="tab"]:has-text("Surfacing")', { timeout: 15000 });
  await page.locator('[role="tab"]', { hasText: 'Surfacing' }).click();
  await page.waitForSelector('text=Reference is a link', { timeout: 15000 });
  await page.waitForTimeout(400);

  const mode = process.env.MODE || 'peek';
  if (mode === 'none') return;
  if (mode === 'peek') {
    // Exact title, since "… on GitHub" also matches rows rendered behind the
    // other tabs, and .first() would pick one of those.
    await page.locator('a[title="docs/SURFACING.md on GitHub"]').first().hover();
    // Clears the card's 320 ms dwell plus the fetch. The doc is not one of the
    // manifests the view seeds, so this address is cold.
    await page.waitForTimeout(2200);
    return;
  }

  if (mode === 'lead') {
    // A card well down the list, so the mark has to have scrolled the slide to
    // be visible at all: a shot of the top of the doc would pass either way.
    await page.locator('button[title^="Show Toss data"]').first().click();
    await page.waitForTimeout(3200);
    return;
  }
  if (mode === 'region') {
    // The course's heading sits past every primitive, so a mark visible in
    // the shot proves the deck landed there rather than merely opened.
    await page.locator('button[title^="Show The surfacing course"]').first().click();
    await page.waitForTimeout(3200);
    return;
  }
  if (mode === 'tests') {
    await page.locator('[role="tab"]', { hasText: 'Tests' }).click();
    await page.waitForSelector('.ph-flask', { timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.locator('button[title$="checks one at a time"]').first().click();
    await page.waitForSelector('[data-deck-content]', { timeout: 15000 });
    await page.waitForTimeout(2200);
    return;
  }
  if (mode === 'docs') {
    // The Surfacing tab's own door is already in the DOM and hidden behind its
    // section, and waitForSelector waits for the FIRST match to become visible,
    // so anchoring on the shared title would wait on the wrong button forever.
    await page.locator('[role="tab"]', { hasText: 'Docs' }).click();
    await page.waitForSelector('button[title="Read 55 files one at a time"], .ph-books',
                               { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
    return;
  }
  await page.locator('button[title$="one at a time"]').first().click();
  await page.waitForSelector('[data-deck-content]', { timeout: 15000 });
  await page.waitForTimeout(1600);   // marked + md-doc load, then the render

  if (mode !== 'deck') {
    await page.locator('button[title="Dock beside the list"]').first().click();
    await page.waitForTimeout(700);
  }
  if (mode === 'csv') {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1600);
  }
  if (mode === 'over') {
    // The regression this covers is a z-index one: the card is appended at
    // install and the deck's overlay when it opens, so an equal z-index put
    // every peek UNDER the deck the moment one was open.
    await page.locator('a[title="docs/SURFACING.md on GitHub"]').first().hover();
    await page.waitForTimeout(1800);
  }
};
