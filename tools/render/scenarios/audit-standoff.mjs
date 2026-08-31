// The Standoff view: the annotation as data, and the committed bytes under it.
export default async function (page) {
  await page.waitForSelector('button:has-text("Standoff")');
  await page.click('button:has-text("Standoff")');
  await page.waitForTimeout(600);
  // Scope to the view's own table: a bare `table tbody tr` also counts the
  // Reading dialog's two tables, which is how this first reported 91 for 81.
  const n = await page.evaluate(() => document.querySelectorAll(
    '[x-show*="standoff"] table tbody tr').length);
  console.log('STANDOFF unit rows: ' + n);
}
