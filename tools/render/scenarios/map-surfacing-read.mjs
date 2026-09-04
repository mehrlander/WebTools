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
//   peek   hover the header's SURFACING.md mark, for the card       (default)
//   deck   Read, filling the content pane
//   dock   Read, then the pane toggle, so the doc sits beside the cards

export default async (page) => {
  await page.waitForFunction(() => window.__shell && window.Alpine, null, { timeout: 15000 });
  await page.evaluate(() => window.__shell.goMap());
  await page.waitForSelector('[role="tab"]:has-text("Surfacing")', { timeout: 15000 });
  await page.locator('[role="tab"]', { hasText: 'Surfacing' }).click();
  await page.waitForSelector('text=Reference is a link', { timeout: 15000 });
  await page.waitForTimeout(400);

  const mode = process.env.MODE || 'peek';
  if (mode === 'peek') {
    // Exact title, since "… on GitHub" also matches rows rendered behind the
    // other tabs, and .first() would pick one of those.
    await page.locator('a[title="docs/SURFACING.md on GitHub"]').first().hover();
    // Clears the card's 320 ms dwell plus the fetch. The doc is not one of the
    // manifests the view seeds, so this address is cold.
    await page.waitForTimeout(2200);
    return;
  }

  await page.locator('button:has-text("Read")').first().click();
  await page.waitForSelector('[data-deck-content]', { timeout: 15000 });
  await page.waitForTimeout(1600);   // marked + md-doc load, then the render

  if (mode === 'dock') {
    await page.locator('button[title="Dock beside the list"]').first().click();
    await page.waitForTimeout(600);
  }
};
