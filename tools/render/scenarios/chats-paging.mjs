// The Chats pane's paging control: load one earlier month on demand and shoot
// the footer, which is where the pane states how much of the archive is NOT on
// screen. Same token and sibling-repo mechanics as chats-pane.mjs.
export default async (page) => {
  await page.evaluate(() => localStorage.setItem('ghToken', 'local-preview'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.getByRole('tab', { name: 'Chats' }).click();
  await page.waitForSelector('.border-l-4', { timeout: 20000 }).catch(() => {});
  const earlier = page.getByRole('button', { name: /Earlier month|Nothing earlier/ });
  await earlier.click();
  // The second month is a bigger shard than the first, so wait for the button
  // to come back rather than for a fixed interval.
  await page.waitForFunction(
    () => !document.body.innerText.includes('Reading…'), null, { timeout: 30000 }
  ).catch(() => {});
  await earlier.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
};
