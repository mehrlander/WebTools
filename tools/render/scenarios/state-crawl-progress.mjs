// Screenshot driver: the State view mid-crawl, all three rows.
//
// The bar draws from the shell's progress channel, which only a real crawl (a
// token, the network) ever fills, so this stands in for the crawl and writes the
// slots directly. The shapes are the ones the crawls publish: the activity crawl
// on its survey pass with two repos in flight, the sessions crawl reading record
// blobs six at a time, the config crawl counting an unpooled fan-out with
// nothing to name.
export default async function (page) {
  await page.evaluate(() => {
    const s = window.__shell;
    s.goState();
    s.configRefreshing = true;
    s.activityRefreshing = true;
    s.sessionsRefreshing = true;
    s.crawlProgress = {
      configs:  { verb: 'Reading configs',    unit: 'repos',   done: 31, total: 44, active: [] },
      activity: { verb: 'Surveying branches', unit: 'repos',   done: 4,  total: 11,
                  active: ['mehrlander/chat-histories', 'mehrlander/home'] },
      sessions: { verb: 'Reading records',    unit: 'records', done: 18, total: 120,
                  active: ['sessions/2026/08/2026-08-16-aaaa1111.json',
                           'sessions/2026/08/2026-08-16-bbbb2222.json'] },
    };
  });
  await page.waitForTimeout(600);
}
