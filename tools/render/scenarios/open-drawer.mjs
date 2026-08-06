// Open the FAB drawer and scroll the take grid into view, for a pixel shot of
// the take rows. Pairs with a nested --hash to show both sides at once.
export default async function (page) {
  await page.waitForTimeout(4000);
  await page.click('[aria-label="Web-tools panel"]');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').startsWith('fab'));
    if (el && window.Alpine) window.Alpine.$data(el).detect();
  });
  await page.waitForTimeout(600);
  // The take grid sits at the bottom of the drawer's scroll region.
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('span')].find(s => s.textContent.trim() === 'Take');
    label?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(400);
}
