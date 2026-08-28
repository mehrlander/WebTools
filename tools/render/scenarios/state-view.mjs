// Populate the State view for a headless screenshot. The view's whole content
// is ages read from the registry, which needs a token the sandbox does not
// have, so the two reads it makes (one `ls state` for sizes, one commit read
// per file for the write time) are stubbed with plausible values and the two
// browser rows are seeded so every row type renders: a current cache, a stale
// one, a cache this browser has never checked, and the entity index with no
// button at all.
//
// `?crawl=1` adds the mid-refresh posture: the busy flags and the shell's
// progress channel, which no stub of the reads can produce, since the bars draw
// from a running crawl. It lights every slot at once so all three bar shapes
// render in one frame. That is a fixture convenience and not a claim about the
// crawls: the Activity group's one press runs its two halves in SEQUENCE, so
// live you see the sessions bar finish before the branches bar starts.
export default async (page) => {
  await page.evaluate(() => {
    window.TOKEN = 'FAKE';
    // The controls are gated on the shell's own auth verdict, not on TOKEN
    // alone, so without this every Refresh renders disabled and the colour
    // treatment cannot be seen.
    window.__shell.hasToken = () => true;
    const now = Date.now();
    const iso = (h) => new Date(now - h * 3600e3).toISOString();

    // Sizes come off the directory listing; dates off one commit read per file.
    const SIZES = { 'configs.json': 67520, 'activity.json': 379637, 'sessions.json': 285556, 'entities.json': 838136 };
    const DATES = {
      'state/configs.json': iso(5),        // inside 2x its 6h throttle: current
      'state/activity.json': iso(2),
      'state/sessions.json': iso(31),      // past 2x its 3h throttle: stale
      'state/entities.json': iso(24 * 41), // past the 30-day check: stale
    };
    // The probe: one account listing and one commits call on the registry's
    // sessions/ tree, both compared against the rows' own built dates. Seeded
    // so every reading renders: repos pushed since (configs and activity, which
    // read the same listing against different built dates), and records written
    // since (sessions).
    window.GH.prototype.repos = async function () {
      return [
        { full_name: 'mehrlander/web-tools', pushed_at: iso(1) },
        { full_name: 'mehrlander/web-tools-private', pushed_at: iso(1.5) },
        { full_name: 'mehrlander/home', pushed_at: iso(3) },
        { full_name: 'mehrlander/shortcut-tools', pushed_at: iso(9) },
        { full_name: 'mehrlander/wps', pushed_at: iso(30) },
      ];
    };
    window.GH.prototype.ls = async function (p) {
      if (p !== 'state') return [];
      return Object.entries(SIZES).map(([name, size]) => ({ name, path: 'state/' + name, size, type: 'file' }));
    };
    // The History panel asks for a page of commits rather than one. Uneven
    // gaps, because an even cadence would make the summary's median look like
    // a property of the schedule when it is a property of the estate.
    const GAPS_H = [0, 3, 9, 4, 27, 6, 5, 52, 7, 11];
    window.GH.prototype.history = async function (p, limit = 20) {
      // The sessions store is written one commit per record, so the probe reads
      // this path rather than a cache file.
      if (p === 'sessions') {
        return [8, 20, 26, 34].map((h, i) => ({ sha: 's' + i, msg: 'sessions: record',
                                                date: iso(h), author: 'mehrlander' }));
      }
      if (!DATES[p]) return [];
      const base = +new Date(DATES[p]);
      let t = base;
      return GAPS_H.slice(0, limit).map((g, i) => {
        t -= g * 3600e3;
        return { sha: 'c' + i + '0f9ab3', msg: 'Update cache via show-repo',
                 date: new Date(t).toISOString(), author: 'mehrlander' };
      });
    };
    // The peek reads at main; the history panel reads the SAME path at a commit
    // sha, so the stand-in varies with `this.ref`. Each version carries a
    // per-repo hash, which is the fingerprint the real caches store and the
    // panel diffs on, and a couple of them move per version so an expanded
    // interval names records instead of reporting nothing changed.
    const MEMBERS = ['mehrlander/web-tools', 'mehrlander/home', 'mehrlander/web-tools-private',
                     'mehrlander/budget-wa', 'mehrlander/fn-data', 'mehrlander/wps',
                     'mehrlander/shortcut-tools', 'mehrlander/doc-audit', 'mehrlander/surfacer'];
    // Hours ago, per repo, for the commits the Branches rail draws. Uneven on
    // purpose: a working day looks like a burst and a gap, not a metronome.
    const COMMIT_HOURS = [
      [0.4, 1.1, 1.4, 3, 6, 21, 44, 51, 96, 120],
      [2, 2.3, 5, 9, 30, 74, 140],
      [0.8, 4, 4.5, 11, 19, 26, 60, 88, 155],
      [7, 33, 81, 129],
      [1.7, 12, 18, 47, 108],
      [23, 64, 151],
      [3.5, 3.9, 16, 40, 92],
      [10, 55, 133],
      [0.6, 5.5, 28, 70, 118, 160],
    ];
    const SESS = (i) => 'https://claude.ai/code/session_01J' + (i + 20).toString(36).toUpperCase();
    // [hours ago it was last active, minutes it ran, title state]. The live one
    // leads: last active a few minutes ago, having started nine hours back.
    const SESSION_HOURS = [
      [0.1, 540, 'named'], [1.2, 46, 'named'], [2.6, 19, 'untitled'], [4, 71, 'named'],
      [8, 25, 'named'], [13, 88, 'untitled'], [20, 34, 'named'], [27, 52, 'named'],
      [35, 17, 'named'], [46, 63, 'old'], [59, 29, 'named'], [72, 41, 'old'],
      [95, 22, 'named'], [118, 57, 'old'], [140, 36, 'named'], [161, 48, 'old'],
    ];
    const SESSION_TITLES = [
      'Both spans on the state rail', 'Session titles beside the entity index',
      'Read the session card as a log', 'One Growth tab with a corpus control',
      'The nav re-reads after the crawl',
    ];
    const realGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (p) {
      if (!String(p).startsWith('state/')) return realGet.call(this, p);
      // The call log the crawls write as they close, last run per key. Shaped
      // like a real activity run: a tree read per scanned branch is what makes
      // the count what it is, which is the reading the tab exists for.
      if (p === 'state/calls.json') {
        const rows = [];
        const push = (m, u, ms, b) => rows.push({ m, u, s: 200, ms, b });
        push('GET', 'user/repos?sort=updated&per_page=100', 240, 66120);
        for (const repo of ['web-tools', 'home', 'web-tools-private', 'chat-histories', 'wps']) {
          push('GET', `repos/mehrlander/${repo}/branches?per_page=100`, 90 + repo.length, 4210);
          push('GET', `repos/mehrlander/${repo}/commits?sha=main&per_page=12`, 110, 8800);
          push('GET', `repos/mehrlander/${repo}/pulls?state=all&per_page=100`, 130, 12400);
          for (let i = 0; i < 6; i++)
            push('GET', `repos/mehrlander/${repo}/git/trees/${'a1b2c3d4e5f6'.repeat(3).slice(0, 40)}?recursive=1`, 70 + i, 31000);
        }
        rows.push({ m: 'PUT', u: 'repos/mehrlander/web-tools-private/contents/state/activity.json',
                    s: 201, ms: 420, b: 512 });
        return { text: JSON.stringify({ generatedAt: iso(0), runs: {
          activity: { at: iso(0.02), ms: 21000, verb: 'Scanning branches', unit: 'repos',
                      calls: rows.length, rows, truncated: false },
        } }, null, 2) };
      }
      const v = /^c(\d)/.test(this.ref) ? +this.ref[1] : 0;   // which committed version
      const repos = {};
      MEMBERS.forEach((repo, i) => {
        repos[repo] = { config: { estate: true, group: 'core' }, fetchedAt: iso(2),
                        hash: 'h' + i + ((i + v) % 3 === 0 ? v : 0),
                        // What the two rails are drawn from. Spread over the
                        // full week the wide rail shows, and denser inside the
                        // last day, because that is the shape the pair exists
                        // to make legible: an even scatter would photograph the
                        // same on both rails and show nothing about either.
                        recentCommits: COMMIT_HOURS[i % COMMIT_HOURS.length]
                          .map((h, j) => ({ sha: 'c' + i + j + 'f9ab3', date: iso(h) })) };
      });
      // The sessions cache keys by store path and fingerprints on the record's
      // blob sha, so the row would diff against an empty map without its own
      // stand-in. Its grain is the point: a store with 40 records and 2 moving
      // reads nothing like one with 9 repos and 6 moving.
      const byPath = {};
      for (let i = 0; i < 40; i++) {
        const day = '2026-08-0' + (1 + (i % 9));
        byPath['sessions/2026/08/' + day + '-' + (i + 10).toString(16) + 'a4b2c1.json'] =
          { id: (i + 10).toString(16) + 'a4b2c1', day, sha: 'b' + i + (i % 7 === v % 7 ? v : 0) };
      }
      // The `runs` ring the crawls now append to the commit they were making
      // anyway: the newest version carries the whole window, which is the one
      // eager read the History panel makes.
      // Walked off the same gaps as the commits and stamped a few seconds
      // before each, which is where a real record lands: the crawl writes `at`
      // into the file it is about to commit. Capped short of the window on
      // purpose, so the oldest rows show the honest absent case for a commit
      // that predates the ring.
      // The sessions rows, which the Sessions rail and the titles row both
      // read: `ended` is what the rail draws (a live session rewrites it every
      // turn, so `started` would pin a working session to hours ago), and the
      // title column is the export's, joined on. Three states, because the
      // titles row counts them apart: a joined title, a session id with no
      // title in this export, and a record too old to carry an id at all.
      const rows = SESSION_HOURS.map(([h, mins, kind], i) => ({
        id: (i + 16).toString(16) + 'a4b2c1',
        repo: MEMBERS[i % MEMBERS.length],
        started: iso(h + mins / 60), ended: iso(h), mins,
        agent: kind === 'old' ? '' : SESS(i),
        title: kind === 'named' ? SESSION_TITLES[i % SESSION_TITLES.length] : '',
      }));

      let rt = +new Date(DATES['state/activity.json']);
      const runs = GAPS_H.slice(0, 6).map((g, i) => {
        rt -= g * 3600e3;
        return { at: new Date(rt - 4000).toISOString(),
                 ms: 9000 + i * 7400, checked: 9, changed: 2 + (i % 4), failed: i === 3 ? 1 : 0 };
      }).reverse();
      return { text: JSON.stringify({
        generatedAt: iso(2), repos, byPath, runs, rows,
        // The export is a dated snapshot from another venue, so the row that
        // reports it states the file's own date rather than the moment it was
        // read. Two days back, which is a capture that has been missed once.
        titlesAt: new Date(now - 2 * 86400e3).toISOString().slice(0, 10),
        titlesFrom: 'claude-code-web/'
          + new Date(now - 2 * 86400e3).toISOString().slice(0, 10) + '-sessions.csv',
      }, null, 2) };
    };

    // Two of the three checked-stamps exist; sessions has none, so that row
    // reads "not this browser", which is the honest state on a fresh device
    // and the one a lone as-of could not express.
    localStorage.setItem('wt:configCacheCheckedAt', String(now - 12 * 60e3));
    localStorage.setItem('wt:activityCacheCheckedAt', String(now - 40 * 60e3));
    localStorage.removeItem('wt:sessionsCacheCheckedAt');

    // The search caches keep their own counts: session state, nothing
    // committed.
    const realStats = window.EstateSearch.stats;
    window.EstateSearch.stats = () => ({ ...realStats(), trees: 11, records: 42 });

    // `?open=<key>` opens that row's panel, `?read=contents|history` picks the
    // reading, and `?diff=<i,…>` expands intervals, since the magnitude is lazy
    // and never renders on its own. Read BEFORE goState below, which calls the
    // shell's syncUrl and rewrites location.search to the keys the shell owns;
    // `read` rather than `tab` because `tab` is one of those keys.
    window.__STATE_OPEN = new URLSearchParams(location.search).get('open') || '';
    window.__STATE_TAB = new URLSearchParams(location.search).get('read') || 'contents';
    window.__STATE_DIFF = new URLSearchParams(location.search).get('diff') || '';
    // `?crawl=1` freezes the view mid-refresh, which no stub of the reads can
    // produce: the bars draw from the shell's progress channel, which only a
    // running crawl fills. Read here with the others, before syncUrl rewrites
    // the query.
    window.__STATE_CRAWL = new URLSearchParams(location.search).get('crawl') || '';

    // Honor an `?item=` on the address so the scenario can shoot an aimed link
    // (what an age pill opens) as well as the bare view.
    window.__shell.goState(new URLSearchParams(location.search).get('item') || '');
    // A `?view=state` address mounts the view during boot, so its first read ran
    // before these stubs and found no token. Announcing auth is exactly what the
    // shell does when a real token resolves, and it is what makes the deep-link
    // case work rather than sitting on its signed-out state.
    document.dispatchEvent(new CustomEvent('web-tools:auth-state', { detail: 'auth' }));
  });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const key = window.__STATE_OPEN;
    if (!key) return;
    const el = document.querySelector('[x-data="stateView()"]');
    const d = window.Alpine.$data(el);
    const row = d.rows.find(r => r.key === key) || (d.offline?.key === key ? d.offline : null);
    if (!row) return;
    d.tab = window.__STATE_TAB;
    await d.toggleOpen(row);
    for (const i of window.__STATE_DIFF.split(',').filter(s => s !== '')) await d.diffAt(row, +i);
  });
  await page.waitForTimeout(1500);

  // The mid-crawl posture, on top of everything above: the row a crawl was
  // started from draws its progress under the ages. The shapes are the ones the
  // three crawls publish, so the screenshot shows what each actually says: the
  // activity crawl on its scan pass with two repos in flight, the sessions
  // crawl reading record blobs six at a time, and the unpooled config fan-out
  // counting with nothing to name.
  await page.evaluate(() => {
    if (!window.__STATE_CRAWL) return;
    const s = window.__shell;
    s.configRefreshing = true;
    s.activityRefreshing = true;
    s.sessionsRefreshing = true;
    s.crawlProgress = {
      configs:  { verb: 'Reading configs',    unit: 'repos',   done: 31, total: 44, active: [],
                  calls0: 341 },
      activity: { verb: 'Scanning branches', unit: 'repos',   done: 4,  total: 11,
                  active: ['mehrlander/chat-histories', 'mehrlander/home'], calls0: 313 },
      sessions: { verb: 'Reading records',    unit: 'records', done: 18, total: 120,
                  active: ['sessions/2026/08/2026-08-16-aaaa1111.json',
                           'sessions/2026/08/2026-08-16-bbbb2222.json'],
                  calls0: 402 },
    };
    // The wire tail reads gh-boot's traffic ledger, which in the sandbox holds
    // the page's own boot rather than a crawl. These are the calls each crawl
    // really makes, so the line shows what a reader would see mid-run; the
    // ledger is a plain array on the window, so writing it is the whole stub.
    window.__traffic = [
      { url: 'https://api.github.com/repos/mehrlander/home/git/trees/main?recursive=1',
        method: 'GET', status: 200, t: Date.now() },
    ];
    window.__trafficTotals = { calls: 468 };
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    if (!window.__STATE_CRAWL) return;
    window.dispatchEvent(new CustomEvent('traffic'));
  });
  await page.waitForTimeout(400);
};
