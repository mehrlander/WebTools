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
    window.GH.prototype.ls = async function (p) {
      if (p !== 'state') return [];
      return Object.entries(SIZES).map(([name, size]) => ({ name, path: 'state/' + name, size, type: 'file' }));
    };
    window.GH.prototype.history = async function (p) {
      return DATES[p] ? [{ sha: 'abc1234', msg: 'Update cache via show-repo', date: DATES[p], author: 'mehrlander' }] : [];
    };
    // The JSON peek reads the file itself. A small stand-in with the real
    // shape (a generatedAt plus a repos map) is enough to exercise the viewer's
    // tree mode without shipping a 400 KB fixture.
    const realGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (p) {
      if (!String(p).startsWith('state/')) return realGet.call(this, p);
      return { text: JSON.stringify({
        generatedAt: iso(2),
        repos: {
          'mehrlander/web-tools': { config: { estate: true, group: 'core', icon: 'ph-toolbox' }, fetchedAt: iso(2) },
          'mehrlander/home': { config: { estate: true, group: 'core', icon: 'ph-house' }, fetchedAt: iso(2) },
          'mehrlander/web-tools-private': { config: { estate: true, group: 'core' }, fetchedAt: iso(2) },
        },
      }, null, 2) };
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
    window.__STATE_PEEK = new URLSearchParams(location.search).get('peek') || '';
    // A `?view=state` address mounts the view during boot, so its first read ran
    // before these stubs and found no token. Announcing auth is exactly what the
    // shell does when a real token resolves, and it is what makes the deep-link
    // case work rather than sitting on its signed-out state.
    document.dispatchEvent(new CustomEvent('web-tools:auth-state', { detail: 'auth' }));
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const key = window.__STATE_PEEK;
    if (!key) return;
    const el = document.querySelector('[x-data="stateView()"]');
    const d = window.Alpine.$data(el);
    const row = d.rows.find(r => r.key === key) || (d.offline?.key === key ? d.offline : null);
    if (row) d.togglePeek(row);
  });
  await page.waitForTimeout(1500);
};
