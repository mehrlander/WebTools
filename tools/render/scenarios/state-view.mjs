// Populate the State view for a headless screenshot. The view's whole content
// is ages read from the registry, which needs a token the sandbox does not
// have, so the two reads it makes (one `ls state` for sizes, one commit read
// per file for the write time) are stubbed with plausible values and the two
// browser rows are seeded so every row type renders: a current cache, a stale
// one, a cache this browser has never checked, and the entity index with no
// button at all.
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
    const realGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (p) {
      if (!String(p).startsWith('state/')) return realGet.call(this, p);
      const v = /^c(\d)/.test(this.ref) ? +this.ref[1] : 0;   // which committed version
      const repos = {};
      MEMBERS.forEach((repo, i) => {
        repos[repo] = { config: { estate: true, group: 'core' }, fetchedAt: iso(2),
                        hash: 'h' + i + ((i + v) % 3 === 0 ? v : 0) };
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
      let rt = +new Date(DATES['state/activity.json']);
      const runs = GAPS_H.slice(0, 6).map((g, i) => {
        rt -= g * 3600e3;
        return { at: new Date(rt - 4000).toISOString(),
                 ms: 9000 + i * 7400, checked: 9, changed: 2 + (i % 4), failed: i === 3 ? 1 : 0 };
      }).reverse();
      return { text: JSON.stringify({ generatedAt: iso(2), repos, byPath, runs }, null, 2) };
    };

    // Two of the three checked-stamps exist; sessions has none, so that row
    // reads "not this browser", which is the honest state on a fresh device
    // and the one a lone as-of could not express.
    localStorage.setItem('wt:configCacheCheckedAt', String(now - 12 * 60e3));
    localStorage.setItem('wt:activityCacheCheckedAt', String(now - 40 * 60e3));
    localStorage.removeItem('wt:sessionsCacheCheckedAt');

    // The guides shelf keeps its stamp on the shell; the search caches keep
    // their own counts. Both are session state with nothing committed.
    window.__shell.guidesLoadedAt = new Date(now - 4 * 60e3).toISOString();
    const realStats = window.EstateSearch.stats;
    window.EstateSearch.stats = () => ({ ...realStats(), trees: 11, records: 42 });

    // Honor an `?item=` on the address so the scenario can shoot an aimed link
    // (what an age pill opens) as well as the bare view.
    window.__shell.goState(new URLSearchParams(location.search).get('item') || '');
    // `?peek=<key>` opens that row's JSON, so the embedded viewer can be shot.
    // `?hist=<key>` opens its change log instead, with `?diff=<i>` expanding one
    // interval, since the magnitude is lazy and never renders on its own.
    window.__STATE_PEEK = new URLSearchParams(location.search).get('peek') || '';
    window.__STATE_HIST = new URLSearchParams(location.search).get('hist') || '';
    window.__STATE_DIFF = new URLSearchParams(location.search).get('diff') || '';
    // A `?view=state` address mounts the view during boot, so its first read ran
    // before these stubs and found no token. Announcing auth is exactly what the
    // shell does when a real token resolves, and it is what makes the deep-link
    // case work rather than sitting on its signed-out state.
    document.dispatchEvent(new CustomEvent('web-tools:auth-state', { detail: 'auth' }));
  });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const key = window.__STATE_PEEK || window.__STATE_HIST;
    if (!key) return;
    const el = document.querySelector('[x-data="stateView()"]');
    const d = window.Alpine.$data(el);
    const row = d.rows.find(r => r.key === key) || (d.offline?.key === key ? d.offline : null);
    if (!row) return;
    if (window.__STATE_PEEK) return d.togglePeek(row);
    await d.toggleHist(row);
    for (const i of window.__STATE_DIFF.split(',').filter(s => s !== '')) await d.diffAt(row, +i);
  });
  await page.waitForTimeout(1500);
};
