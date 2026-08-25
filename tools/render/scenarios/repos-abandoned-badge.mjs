// The repo card's abandoned badge: the count of branches whose PR was closed
// unmerged, beside the stranded and open-PR counts. Same seed as
// activity-pr-state.mjs, shown on the Repos grid rather than the Branches pane,
// since the badge is derived from those very rows.
import seedPrState from './activity-pr-state.mjs';

export default async (page, ctx) => {
  await seedPrState(page, ctx);
  await page.evaluate(() => window.__shell.goEstate?.());
  await page.waitForTimeout(500);
};
