// Inject fake activity data into the estate component so the token-gated Open
// view renders with content for a headless screenshot. Not committed as a
// fixture; a scratch harness for tuning the Open view layout. Exercises all
// three row states: a ready PR, a draft PR (with a session link), and a live
// branch with no PR yet, plus an open PR whose branch fell outside the recent
// window (the PR-only path).
export default async (page) => {
  await page.evaluate(() => {
    window.TOKEN = 'FAKE';
    window.__shell.estateSeen = true;   // mount the estate; the ?view query drives which panel shows
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const el = document.querySelector('[x-data="estate()"]');
    const d = window.Alpine.$data(el);
    d.authed = true; d.loading = false;
    const card = (repo, group, note) => ({ repo, icon: 'ph-bookmark-simple', note, group, order: 0,
      pins: [], hasLanding: false, meta: { desc: note, priv: repo.includes('private'), ago: '2h ago', ref: 'main' }, err: false, child: null, showChild: false });
    d.entries = [
      card('mehrlander/web-tools', 'core', 'Browser tools and kits'),
      card('mehrlander/web-tools-private', 'core', 'The private registry'),
      card('mehrlander/home', 'core', 'Knowledge base and agent memory'),
      card('mehrlander/chat-histories', 'archives', 'The chat archive'),
    ];
    const now = Date.now();
    const iso = (h) => new Date(now - h * 3600e3).toISOString();
    const sess = (id) => 'https://claude.ai/code/session_' + id;
    // Per repo: a set of active branches (recent work ahead of main) with
    // subjects, and open PRs whose head joins some of them. Coverage:
    //  web-tools        active branch + ready PR (+ session), a no-PR branch
    //  web-tools-private active branch + draft PR (+ session)
    //  home             active branch + draft PR (no session), plus an open PR
    //                   on an OLDER branch (not in the active set: PR-only row)
    //  chat-histories   a lone no-PR active branch
    const activity = {
      'mehrlander/web-tools': {
        pushedAt: iso(2), defaultBranch: 'main',
        counts: { branches: 24, active: 2, landed: 6, stranded: 1, scanned: 8, older: 12, openPRs: 1 },
        openPRs: [
          { number: 271, title: 'Open view: cross-repo live branches with caption-style links', head: 'claude/open-view-live-branches-yk24d9', draft: false, updatedAt: iso(2), session: sess('01OpenViewReadyAbc123'), aheadBy: 8, behindBy: 0 },
        ],
        scan: { scannedAt: iso(3), cap: 30, scanned: 8, older: 12, truncated: false, branches: [
          { name: 'claude/open-view-live-branches-yk24d9', sha: 'a1', group: 'active', date: iso(2), subject: 'Open view: highlight branches ahead of main, link the session', sessions: [sess('01OpenViewReadyAbc123')], sessionsExact: true },
          { name: 'claude/tighten-mobile-grid-mm01', sha: 'a2', group: 'stranded', date: iso(9), subject: 'Tighten the mobile grid and drop the hard borders', sessions: [sess('01NoPrBranchJkl012'), sess('01NoPrBranchEarlier')], sessionsExact: true, aheadBy: 3, behindBy: 12 },
        ] },
      },
      'mehrlander/web-tools-private': {
        pushedAt: iso(5), defaultBranch: 'main',
        counts: { branches: 11, active: 1, landed: 3, stranded: 0, scanned: 4, older: 5, openPRs: 1 },
        openPRs: [
          { number: 44, title: 'Registry: add the activity-cache session field', head: 'claude/registry-session-field-pp02', draft: true, updatedAt: iso(5), session: sess('01RegistryDraftDef456'), aheadBy: 2, behindBy: 1 },
        ],
        scan: { scannedAt: iso(6), cap: 30, scanned: 4, older: 5, truncated: false, branches: [
          { name: 'claude/registry-session-field-pp02', sha: 'b1', group: 'active', date: iso(5), subject: 'Store the PR session link in the activity cache' },
        ] },
      },
      'mehrlander/home': {
        pushedAt: iso(14), defaultBranch: 'main',
        counts: { branches: 31, active: 1, landed: 9, stranded: 2, scanned: 10, older: 18, openPRs: 2 },
        openPRs: [
          { number: 118, title: 'Chron: drain the dump and propose two threads', head: 'claude/chron-drain-2607-qq03', draft: true, updatedAt: iso(14), session: '', aheadBy: 5, behindBy: 3 },
          { number: 109, title: 'Tooling: branch-status report refinements', head: 'claude/branch-scan-report-rr04', draft: false, updatedAt: iso(70), session: sess('01OlderPrGhi789'), aheadBy: 0, behindBy: 41 },
        ],
        scan: { scannedAt: iso(15), cap: 30, scanned: 10, older: 18, truncated: false, branches: [
          { name: 'claude/chron-drain-2607-qq03', sha: 'c1', group: 'active', date: iso(14), subject: 'Promote nine dump files, seed the datashelf thread' },   // no session anywhere: icon stays hidden
        ] },
      },
      'mehrlander/chat-histories': {
        pushedAt: iso(30), defaultBranch: 'main',
        counts: { branches: 7, active: 1, landed: 2, stranded: 0, scanned: 3, older: 4, openPRs: 0 },
        openPRs: [],
        scan: { scannedAt: iso(31), cap: 30, scanned: 3, older: 4, truncated: false, branches: [
          { name: 'claude/catalog-coverage-refresh-ss05', sha: 'd1', group: 'stranded', date: iso(30), subject: 'Refresh the coverage report after the July batch', aheadBy: 1, behindBy: 58 },
        ] },
      },
    };
    d.authed = true; d.activityLoading = false;
    d.activityGeneratedAt = iso(1);
    d.activity = activity;
  });
  await page.waitForTimeout(400);

  // The route chips: the Branches pane reads the same manifest and PR file
  // lists the Routes pane loads, so this seeds that shared half directly rather
  // than letting the pane fetch (no token here). Files are chosen to exercise
  // all three cases: a narrow carrier (on), a widely shared one (near), and a
  // branch touching nothing any route declares.
  await page.evaluate(async () => {
    const d = window.Alpine.$data(document.querySelector('[x-data="estate()"]'));
    // The manifest is CSV and the app parses it with window.Csv; this line read
    // it with .json() and threw, which killed the whole evaluate and with it the
    // fixture seeding above. A scratch harness whose failure is a blank pane is
    // not a harness, so it is tolerant now: no chips beats no shot.
    try {
      const rows = window.Csv.rows(await (await fetch('/docs/app-routes.csv')).text());
      const vocab = window.Csv.rows(await (await fetch('/docs/vocabularies.csv')).text());
      const split = (v) => String(v || '').split(';').map(x => x.trim()).filter(Boolean);
      d.routeManifest = window.routeActivity.manifest(
        rows.map(r => ({ ...r, files: split(r.files), tabs: split(r.tabs) })), vocab);
    } catch (e) { console.warn('route chips unavailable:', e.message); }
    d.routeJoinTried = true;
    d.routeBranchFiles = [
      { repo: 'mehrlander/web-tools', name: 'claude/open-view-live-branches-yk24d9', pr: 271,
        files: ['lib/alpineComponents/map.js', 'lib/alpineComponents/tools.js'] },
      { repo: 'mehrlander/web-tools', name: 'claude/no-pr-branch', pr: 0,
        files: ['lib/alpineComponents/estate.js'] },
    ];
  });
  await page.waitForTimeout(300);
};
