// Drive the fab's Traffic tab for a pixel check. The BOOT band is real: the
// sandbox serves the page over loopback with every CDN request resolved from
// node_modules, so the resource rows, their states and their sizes are whatever
// this render actually cost. The API band cannot be real (there is no token
// here and no GitHub reachable), so it is seeded with a crawl of the shape
// show-repo's activity pass produces.
//
//   npm run shot -- pages/show-repo/show-repo.html --script tools/render/scenarios/fab-traffic.mjs
//
// STATE=bands    the three bands, resource list collapsed        (the default)
// STATE=rows     the per-resource list expanded
// STATE=repo     the API ledger cut by target repo instead of endpoint
// STATE=quiet    no API calls yet, which is what a cold page shows
// STATE=scripts  the Inspect tab, for the size chips on the script rows

const CRAWL = [
  // Two code loads: same contents/ endpoint as a plain file read, separated
  // only by the via marker gh-boot's get() wrapper sets.
  ['https://api.github.com/repos/mehrlander/web-tools/contents/lib/kits/surface.js?ref=main', 9200, 70, 'GET', 'kits/surface.js'],
  ['https://api.github.com/repos/mehrlander/web-tools/contents/lib/kits/console.js?ref=main', 6100, 64, 'GET', 'kits/console.js'],
  ['https://api.github.com/repos/mehrlander/web-tools/commits?sha=main&per_page=16', 4213, 180],
  ['https://api.github.com/repos/mehrlander/web-tools/commits/9f3a1c2', 12844, 140],
  ['https://api.github.com/repos/mehrlander/web-tools/commits/2da60c3', 9331, 132],
  ['https://api.github.com/repos/mehrlander/web-tools/commits/d0409ef', 7710, 129],
  ['https://api.github.com/repos/mehrlander/home/contents/.web-tools.json?ref=main', 1904, 96],
  ['https://api.github.com/repos/mehrlander/budget-wa/contents/.web-tools.json?ref=main', 2233, 101],
  ['https://api.github.com/repos/mehrlander/spend-wa/contents/.web-tools.json?ref=main', 1755, 88],
  ['https://api.github.com/repos/mehrlander/chat-histories/contents/.web-tools.json?ref=main', 2010, 94],
  ['https://api.github.com/repos/mehrlander/fn-data/contents/.web-tools.json?ref=main', null, 91],
  ['https://api.github.com/repos/mehrlander/web-tools/branches?per_page=100', 18422, 260],
  ['https://api.github.com/repos/mehrlander/web-tools/pulls?state=open', 26105, 310],
  ['https://api.github.com/graphql', 41288, 420],
  // A write, so the shot shows the column that exists to make one visible.
  ['https://api.github.com/repos/mehrlander/web-tools-private/contents/state/activity.json', 812, 240, 'PUT'],
];

const STATE = process.env.STATE || 'bands';

export default async (page) => {
  await page.waitForFunction(() => window.Alpine && document.querySelector('[x-data^="fab"]'),
    null, { timeout: 15000 });

  await page.evaluate(([crawl, state]) => {
    const el = document.querySelector('[x-data^="fab"]');
    const d = window.Alpine.$data(el);

    if (state !== 'quiet') {
      // Seed the ledger in the shape gh-boot's fetch wrapper records, running
      // totals included: the tab reads the totals rather than the rows, since
      // the rows trim and the totals do not.
      const now = Date.now();
      window.__traffic = crawl.map(([url, wire, ms, method, via], i) => ({
        url, wire, ms, method: method || 'GET', via: via || null, status: 200, error: null, t: now - (crawl.length - i) * 400,
      }));
      window.__trafficTotals = {
        calls: crawl.length,
        wire: crawl.reduce((s, c) => s + (c[1] || 0), 0),
        unknown: crawl.filter(c => c[1] === null).length,
        errors: 0,
        writes: crawl.filter(c => c[3] && c[3] !== 'GET').length,
        ms: crawl.reduce((s, c) => s + c[2], 0),
        trimmed: 0,
      };
      window.__trafficRate = 4952;
      window.__trafficRateReset = now + 42 * 60000;
    }

    d.open = true;
    d.activeTab = state === 'scripts' ? 'inspect' : 'traffic';
    if (state === 'scripts') d.detect();
    else d.refreshTraffic();
    d.trafRowsOpen = state === 'rows';
    if (state === 'repo') d.trafCut = 'repo';
  }, [CRAWL, STATE]);

  await page.waitForTimeout(600);
};
