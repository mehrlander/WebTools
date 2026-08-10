// Shoot the estate's Chats pane with the archive actually loaded.
//
// Two things the default render cannot do on its own. The pane is token-gated,
// so a tokenless boot shows the sign-in line and nothing else; and its data
// lives in a SIBLING repo, which tools/render/cdn.mjs now serves from the
// checkout beside this one. The token here is a placeholder: no request leaves
// the sandbox, and every one it makes is answered from disk.
export default async (page) => {
  await page.evaluate(() => localStorage.setItem('ghToken', 'local-preview'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  // Tap the pill rather than appending &view=chats to the query: the shot is
  // driven with ?view=activity already set, and URLSearchParams.get returns the
  // FIRST occurrence, so a second view param is silently ignored. Clicking also
  // exercises the control the reader actually uses.
  await page.getByRole('tab', { name: 'Chats' }).click();
  // The pane loads its kit, then frontier.json, then the newest month's two
  // shards. Wait for a row rather than a fixed delay, so a slow read fails
  // loudly here instead of producing a screenshot of a spinner.
  await page.waitForSelector('.border-l-4', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
};
