// Drive show-repo's Branches or Sessions pane into the mid-crawl state for a
// shot. Seeds the pane's list first (the same token-free cache fill those two
// scenarios already do), then writes the shell's busy flag and its progress
// slot by hand: the real crawl needs the private registry and a token, neither
// of which the sandbox has, and what the shot is judging is the rendering, not
// the fanout.
//
//   npm run shot -- app/index.html --script tools/render/scenarios/estate-crawl-progress.mjs
//   CRAWL=sessions npm run shot -- app/index.html --query view=sessions \
//     --script tools/render/scenarios/estate-crawl-progress.mjs --height 900
//
// CRAWL=activity|sessions picks the pane (default activity). DONE / TOTAL
// override the counts. START=1 shows the state before the denominator resolves.
// TOAST=<changed|none|fail> fires the activity crawl's closing toast instead,
// which is the other half of that change.
//
// One scenario for both panes because there is one channel: the slot's shape,
// its verb and its unit are the crawl's, so a second driver would only restate
// the first with a different key.
import seedOpen from './estate-open.mjs';
import seedSessions from './estate-sessions.mjs';

const SLOTS = {
  activity: { seed: seedOpen, busy: 'activityRefreshing',
              slot: { verb: 'Scanning branches', unit: 'repos', done: 4, total: 11,
                      active: ['me/chat-histories', 'me/home'] } },
  sessions: { seed: seedSessions, busy: 'sessionsRefreshing',
              slot: { verb: 'Reading records', unit: 'records', done: 18, total: 120,
                      active: ['sessions/2026/08/2026-08-16-aaaa1111.json',
                               'sessions/2026/08/2026-08-16-bbbb2222.json'] } },
};

export default async (page) => {
  const key = process.env.CRAWL === 'sessions' ? 'sessions' : 'activity';
  const conf = SLOTS[key];
  await conf.seed(page);

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

  await page.evaluate(([k, busy, slot, done, total, start]) => {
    window.__shell[busy] = true;
    // A slot with no denominator is the honest opening state, not a zero bar:
    // the click opens it and the member list takes a read or two to arrive.
    const filled = start ? { ...slot, done: 0, total: 0, active: [] }
                         : { ...slot, done, total };
    window.__shell.crawlProgress = { ...window.__shell.crawlProgress, [k]: filled };
  }, [key, conf.busy, conf.slot, +(process.env.DONE || conf.slot.done),
      +(process.env.TOTAL || conf.slot.total), !!process.env.START]);
  await page.waitForTimeout(500);
};
