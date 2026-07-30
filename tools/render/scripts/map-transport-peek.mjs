// Open show-repo's Map view on the Transport tab and hold the pointer over one
// of its exact-file jump-overs, so the reworked header and the source peek both
// render headlessly. The tab is public (it reads the hub's docs/routes.json),
// so this needs no token: the sandbox's contents-API shim serves the manifest
// from the working tree, which is also what makes a branch's routes.json the
// one under test.
//
//   npm run shot -- pages/show-repo/show-repo.html --script tools/render/scripts/map-transport-peek.mjs
//
// PEEK picks which icon is hovered:
//   curate   the header's manifest link, docs/routes.json      (default)
//   renderer the header's renderer link, pages/toss-render.html
//   route    the first toss-route row's renderer
//   doc      a markdown row on The set tab, for the rendered rendition
//   none     no hover, for a shot of the header alone

export default async (page) => {
  await page.waitForFunction(() => window.__shell && window.Alpine, null, { timeout: 15000 });
  await page.evaluate(() => window.__shell.goMap());
  // The set tab is the Map's default, so the markdown case never leaves it.
  if (process.env.PEEK === 'doc') {
    await page.waitForSelector("a[data-peek$=\".md\"]", { timeout: 15000 });
    const row = page.locator('a[data-peek$=".md"]').first();
    await row.locator('xpath=..').hover();
    await row.hover();
    await page.waitForTimeout(1800);
    return;
  }
  // The Map mounts, then its Transport tab fetches the manifest on first open.
  await page.waitForSelector('[role="tab"]:has-text("Transport")', { timeout: 15000 });
  await page.locator('[role="tab"]', { hasText: 'Transport' }).click();
  await page.waitForSelector('text=Toss routes', { timeout: 15000 });
  await page.waitForTimeout(400);

  const which = process.env.PEEK || 'curate';
  if (which === 'none') return;
  const icon =
    // Exact title: "… on GitHub" also matches the set tab's rows, which are
    // rendered but hidden behind their tab, and .first() would pick one of those.
    which === 'renderer' ? page.locator('a[title="pages/toss-render.html on GitHub"]').first() :
    which === 'route'    ? page.locator('a[title="Open the renderer on GitHub"][data-peek]').first() :
                           page.locator('a[title^="Curate the manifest"]').first();
  // A route row's icon only appears on row hover, so land on the row first.
  if (which === 'route') await icon.locator('xpath=..').hover();
  await icon.hover();
  // Clears the card's ~320 ms dwell plus its fetch; the two manifests the
  // header points at are seeded by the view, so only a cold address waits.
  await page.waitForTimeout(1400);
};
