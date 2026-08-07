// Drive show-repo's Activity header into the mid-crawl state for a shot. Seeds
// the Open view through estate-open.mjs (same token-free cache fill), then sets
// the shell's activityRefreshing / activityProgress by hand: the real crawl
// needs the private registry and a token, neither of which the sandbox has, and
// what the shot is judging is the header's rendering, not the fanout.
//
//   npm run shot -- pages/show-repo/show-repo.html --script tools/render/scenarios/estate-activity-progress.mjs
//
// DONE / TOTAL override the counts (default 4 of 11). START=1 shows the state
// before the member list resolves (no denominator). TOAST=<changed|none|fail>
// fires the closing toast instead, which is the other half of the change.
import seedOpen from './estate-open.mjs';

export default async (page) => {
  await seedOpen(page);
  const mode = process.env.TOAST;
  if (mode) {
    await page.evaluate((m) => {
      const r = m === 'none' ? { total: 11, changed: [], failed: [], committed: false }
              : m === 'fail' ? { total: 11, changed: ['me/home'], failed: ['me/scratch', 'me/wa-bills'] }
              : { total: 11, changed: ['me/web-tools', 'me/home', 'me/chat-histories'], committed: true, failed: [] };
      window.__shell.reportActivityRefresh(r);
    }, mode);
    await page.waitForTimeout(400);
    return;
  }
  await page.evaluate(([done, total, start]) => {
    window.__shell.activityRefreshing = true;
    window.__shell.activityProgress = start
      ? { done: 0, total: 0, active: [] }
      : { done, total, active: ['me/chat-histories', 'me/home'] };
  }, [+(process.env.DONE || 4), +(process.env.TOTAL || 11), !!process.env.START]);
  await page.waitForTimeout(500);
};
