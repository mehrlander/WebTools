// The Branches window pill: the reader's time slice over the Recent scope.
//
//   npm run shot -- app/index.html --script tools/render/scenarios/branches-window.mjs
//
// WINDOW=1|3|7|14 picks the slice (default 3). The fixture seeds branch rows at
// known ages so the count beside the pill is checkable rather than incidental.
export default async function (page) {
  const want = +(process.env.WINDOW || 3);
  const ok = await page.evaluate((w) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.TOKEN = 'fixture-token';
    const REG = window.__shell.REGISTRY_REPO;
    const day = 864e5, now = Date.now();
    const at = (d, name, pr) => ({ name, date: new Date(now - d * day).toISOString(),
      sha: 's' + d + name, subject: 'work ' + d + 'd old', group: 'active',
      nUnique: 0, nLanded: 0, nMissing: 0, missingPaths: [], sessions: [] });
    const CONFIGS = { repos: { 'mehrlander/web-tools': { config: { estate: true, group: 'core', order: 1 } } } };
    const ACTIVITY = { generatedAt: new Date(now).toISOString(), repos: {
      'mehrlander/web-tools': { defaultBranch: 'main', counts: { openPRs: 0 }, recentCommits: [], openPRs: [],
        scan: { branches: [at(0.2,'claude/today-a'), at(0.5,'claude/today-b'), at(2,'claude/two-days'),
                             at(5,'claude/five-days'), at(9,'claude/nine-days'), at(13,'claude/thirteen-days')] } } } };
    const origGet = window.GH.prototype.get, origReq = window.GH.prototype.req, origLs = window.GH.prototype.ls;
    window.GH.prototype.get = async function (n) {
      if (this.repo === REG && /configs\.json$/.test(n)) return { text: JSON.stringify(CONFIGS) };
      if (this.repo === REG && /activity\.json$/.test(n)) return { text: JSON.stringify(ACTIVITY) };
      return origGet.call(this, n);
    };
    window.GH.prototype.req = async function (p) {
      if (typeof p === 'string' && p.startsWith('/repos/')) return { default_branch: 'main', private: false, pushed_at: new Date(now).toISOString() };
      if (typeof p === 'string' && p.startsWith('pulls?state=open')) return [];
      return origReq.call(this, p);
    };
    window.GH.prototype.ls = async function (p) {
      if (p === 'surfaces' || p === 'pages/guides') throw Object.assign(new Error('404'), { status: 404 });
      return origLs.call(this, p);
    };
    window.__shell.goActivity();
    window.__shell.setBranchWindow(w);
    const host = [...document.querySelectorAll('[x-data]')].find(el => (el.getAttribute('x-data') || '').includes('estate('));
    if (!host) return 'no estate host';
    const d = window.Alpine.$data(host);
    d.load();
    return true;
  }, want);
  if (ok !== true) throw new Error('branches-window: ' + ok);

  await page.waitForFunction(() => {
    const host = [...document.querySelectorAll('[x-data]')].find(el => (el.getAttribute('x-data') || '').includes('estate('));
    const d = host && window.Alpine.$data(host);
    return d && !d.activityLoading && d.allBranchRows.length >= 6;
  }, { timeout: 20000 });

  const out = await page.evaluate(() => {
    const d = window.Alpine.$data([...document.querySelectorAll('[x-data]')].find(el => (el.getAttribute('x-data') || '').includes('estate(')));
    return { window: d.branchWindow, coverage: d.windowCoverage,
             shown: d.openBranches.map(r => r.name), url: location.search };
  });
  console.log('ASSERT ' + JSON.stringify(out));
  await page.waitForTimeout(300);
}
