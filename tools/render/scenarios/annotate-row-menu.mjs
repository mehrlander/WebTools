// The note row's menu, and the edit it leads to. The row used to carry a bare
// ×; it carries a kebab now, and behind it the edit that used to mean going to
// the drawer. Also the reason the chips look narrower here: they lost their
// glyphs and a size.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-row-menu.mjs
//
// STATE=menu  the menu open on a saved note        (the default)
// STATE=edit  that note reopened in the composer

const STATE = process.env.STATE || 'menu';

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });
  await page.evaluate(() => {
    window.Annotate.clear();
    window.Annotate.add({ type: 'page' },
      'The ref bar wraps to two lines under 380px and pushes the guide off screen.');
  });
  await page.waitForTimeout(200);
  await page.click('[data-annotate-ui] button[data-annotate-menu]');
  await page.waitForTimeout(250);
  if (STATE === 'menu') return;
  await page.click('div[data-annotate-menu] button:has-text("Edit")');
  await page.waitForTimeout(400);
};
