// screenshot.mjs interaction scenario: the estate's Guides pane, Activity's
// third sub-view.
//
//   npm run shot -- pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/estate-guides.mjs
//
// The sandbox blocks api.github.com and the registry is private, so the fixture
// stubs the two reads the pane makes: the registry's config cache (membership)
// and activity cache (the open-PR rows the link comes off), plus GH.prototype.ls
// for the per-ref directory listing. The real loadGuides() then runs against the
// stub, so what the shot exercises is the pane's own fold and card, not a
// hand-placed row.
//
// EMPTY=1 renders the no-guides state, which is what a repo without the shelf
// sees and the state most readers meet first.
const HOST = () => [...document.querySelectorAll('[x-data]')]
  .find(el => (el.getAttribute('x-data') || '').includes('estate('));

export default async function (page) {
  const empty = !!process.env.EMPTY;

  const ok = await page.evaluate((isEmpty) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.TOKEN = 'fixture-token';
    const REG = window.__shell.REGISTRY_REPO;

    const CONFIGS = { repos: {
      'mehrlander/web-tools': { config: { estate: true, icon: 'ph-toolbox', group: 'core', order: 1,
                                          note: 'Browser tools and kits; hosts this shell.' } },
      'mehrlander/home':      { config: { estate: true, icon: 'ph-house',   group: 'core', order: 0,
                                          note: 'Knowledge base and agent memory layer.' } },
    } };

    // Two repos, one carrying the open PR the in-flight guide hangs off. The PR
    // row shape is the cache's own: head + sessions, which is where the card's
    // branch and session links come from with nothing declared.
    const ACTIVITY = { generatedAt: '2026-08-07T03:00:00Z', repos: {
      'mehrlander/web-tools': {
        defaultBranch: 'main', counts: { openPRs: 1 }, recentCommits: [], survey: { branches: [] },
        // STALE ON PURPOSE: the crawl ran before #367 opened, which is the
        // exact state that made the pane report no guides while one was in
        // flight. The pane must find it anyway, from the live pulls() read.
        openPRs: [{ number: 364, head: 'claude/show-repo-progress-b8l63x', draft: true,
                    title: 'An older PR the crawl did catch', updatedAt: '2026-08-06T14:52:27Z',
                    sessions: ['https://claude.ai/code/session_01XG5'] }],
      },
      'mehrlander/home': {
        defaultBranch: 'main', counts: {}, recentCommits: [], survey: { branches: [] }, openPRs: [],
      },
    } };

    // What each ref's pages/guides/ holds. web-tools has one landed guide on
    // main and one in flight on the PR head; home has one landed.
    const SHELVES = isEmpty ? {} : {
      'mehrlander/web-tools@main': ['pages/guides/loader-contract.html'],
      'mehrlander/web-tools@claude/lib-kits-consolidation-pdhf41': ['pages/guides/code-layers.html'],
      'mehrlander/home@main': ['pages/guides/budget-stages.html'],
    };

    const origGet = window.GH.prototype.get;
    const origReq = window.GH.prototype.req;
    const origLs = window.GH.prototype.ls;

    window.GH.prototype.get = async function (name) {
      if (this.repo === REG && /configs\.json$/.test(name)) return { text: JSON.stringify(CONFIGS) };
      if (this.repo === REG && /activity\.json$/.test(name)) return { text: JSON.stringify(ACTIVITY) };
      return origGet.call(this, name);
    };
    window.GH.prototype.req = async function (path) {
      if (typeof path === 'string' && path.startsWith('/repos/')) {
        return { default_branch: 'main', description: '', private: false,
                 pushed_at: '2026-08-07T02:00:00Z' };
      }
      // The LIVE open-PR read, which is what sees #367 at all. It carries the
      // session in the PR body footer, the way the real endpoint does.
      if (typeof path === 'string' && path.startsWith('pulls?state=open')) {
        if (this.repo !== 'mehrlander/web-tools') return [];
        return [{ number: 367, title: 'Measure the code layers before moving anything',
                  draft: true, updated_at: '2026-08-07T02:00:00Z',
                  head: { ref: 'claude/lib-kits-consolidation-pdhf41' },
                  body: 'Session: https://claude.ai/code/session_01ADXgdUAYGTAAydrjrXjYWS' }];
      }
      return origReq.call(this, path);
    };
    // The pane's one read. A ref with no shelf throws, which is the normal
    // answer for most repos and most branches, and the path the fold treats as
    // "no guides here" rather than as a fault.
    window.GH.prototype.ls = async function (path) {
      if (path === 'pages/guides') {
        const files = SHELVES[`${this.repo}@${this.ref}`];
        if (!files) throw Object.assign(new Error('404'), { status: 404 });
        return files.map(p => ({ type: 'file', name: p.split('/').pop(), path: p }));
      }
      if (path === 'surfaces') throw Object.assign(new Error('404'), { status: 404 });
      return origLs.call(this, path);
    };

    window.__shell.goGuides();
    const host = [...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('estate('));
    if (!host) return 'no estate host';
    window.Alpine.$data(host).load();
    return true;
  }, empty);
  if (ok !== true) throw new Error('estate-guides scenario: ' + ok);

  // Wait for the pane's own read to settle rather than a fixed sleep, so the
  // shot cannot catch a half-built list and call it the rendering.
  await page.waitForFunction((isEmpty) => {
    const host = [...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('estate('));
    if (!host) return false;
    const d = window.Alpine.$data(host);
    if (d.guidesBusy) return false;
    return isEmpty ? !!d.guidesLoadedAt : d.guideRows.length >= 3;
  }, { timeout: 20000 }, empty);

  const rows = await page.evaluate(() => {
    const d = window.Alpine.$data([...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('estate(')));
    return d.guideRows.map(r => `${r.path} prs=${r.prs.length} main=${r.onMain}`);
  });
  console.log('ASSERT guideRows: ' + JSON.stringify(rows));
  await page.waitForTimeout(300);
}
