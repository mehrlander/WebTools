// The Showing tab's Paste section: one row per surface that reads the
// clipboard, what each recognizes, and what each declines to.
//
//   npm run shot -- app/index.html --script tools/render/scenarios/showing-paste-rows.mjs --wait 4000

export default async function (page) {
  await page.evaluate(() => window.__shell?.goMap?.());
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const m = document.querySelector('[x-data*="mapView"]')?.__x?.$data
           || window.Alpine?.$data(document.querySelector('[x-show*="mapTab"]')?.closest('[x-data]'));
    if (m) { m.mapTab = 'showing'; m.loadRoutes?.(); }
  });
  await page.waitForTimeout(2500);
  // Scroll the Paste heading into view so the shot is of the new section.
  await page.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].find(n => n.textContent.trim() === 'Paste');
    h?.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(600);
  const rows = await page.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].find(n => n.textContent.trim() === 'Paste');
    return h ? [...h.parentElement.querySelectorAll('.flex-col > div')].length : -1;
  });
  console.log('showing-paste-rows: ' + rows + ' rows rendered');
}
