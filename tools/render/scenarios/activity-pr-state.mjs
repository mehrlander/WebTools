// The Branches pane's PR states, seeded rather than crawled: what became of
// each branch, across all six answers the row can now give (ready, draft,
// merged, closed-unmerged, never proposed, past the index's reach).
//
// Modelled on activity-fake.mjs, and seeded with the real shape that exposed
// the bug: the top of the Recent window is mostly branches whose PR has already
// merged, which the open-PRs-only read reported as "no PR".
export default async (page) => {
  await page.evaluate(() => {
    window.TOKEN = 'FAKE';
    window.__shell.estateSeen = true;
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const d = window.Alpine.$data(document.querySelector('[x-data="estate()"]'));
    d.authed = true; d.loading = false; d.activityLoading = false;
    const card = (repo, note) => ({ repo, icon: 'ph-bookmark-simple', note, group: 'core', order: 0,
      pins: [], hasLanding: false, meta: { desc: note, priv: false, ago: '2h ago', ref: 'main' },
      err: false, child: null, showChild: false });
    d.entries = [card('mehrlander/web-tools', 'Browser tools and kits'),
                 card('mehrlander/home', 'Knowledge base and agent memory')];
    const now = Date.now();
    const iso = (h) => new Date(now - h * 3600e3).toISOString();
    const sess = (id) => 'https://claude.ai/code/session_' + id;
    const br = (name, date, subject, extra = {}) =>
      ({ name, sha: name, group: 'active', date, subject, sessions: [sess('01' + name.slice(-8))],
         sessionsExact: true, aheadBy: 4, behindBy: 2, ...extra });

    d.activityGeneratedAt = iso(0.02);
    d.activity = {
      'mehrlander/web-tools': {
        pushedAt: iso(1), defaultBranch: 'main',
        counts: { branches: 24, active: 5, landed: 6, stranded: 1, surveyed: 8, older: 12, openPRs: 1 },
        openPRs: [
          { number: 430, title: 'Say what became of a branch, not just whether it has an open PR',
            head: 'claude/activity-view-pr-status-04nhwp', draft: true, updatedAt: iso(0.4),
            session: sess('01ActivityPrStatus'), aheadBy: 3, behindBy: 0 },
        ],
        // The any-state index: one row per head, newest PR per head.
        branchPRs: [
          { head: 'claude/activity-view-pr-status-04nhwp', number: 430, state: 'open', draft: true, count: 1 },
          { head: 'claude/centralize-file-viewer-search-en30ye', number: 425, state: 'merged', draft: false, count: 3 },
          { head: 'claude/stage-view-rename-consolidate-7iwtny', number: 423, state: 'merged', draft: false, count: 1 },
          { head: 'claude/note-taking-sidebar-issues-ehn0je', number: 428, state: 'merged', draft: false, count: 3 },
          { head: 'claude/cem-survey-powershell-oxl71l', number: 426, state: 'closed', draft: true, count: 1 },
        ],
        prReach: iso(21 * 24),
        survey: { surveyedAt: iso(1), cap: 30, surveyed: 8, older: 12, truncated: false, branches: [
          br('claude/activity-view-pr-status-04nhwp', iso(0.4), 'Read the PR index, not just the open list'),
          br('claude/centralize-file-viewer-search-en30ye', iso(1), 'Say the config cache, and log the term the assessment squared'),
          br('claude/stage-view-rename-consolidate-7iwtny', iso(2), "Merge remote-tracking branch 'origin/main' into claude/stage-view"),
          br('claude/note-taking-sidebar-issues-ehn0je', iso(12), 'Claim the three shortcuts a keyboard has no other route to'),
          br('claude/cem-survey-powershell-oxl71l', iso(14), 'conventions: define a local term or drop it'),
          br('claude/scratch-no-pr-yet', iso(20), 'A branch pushed without a pull request'),
        ] },
      },
      'mehrlander/home': {
        pushedAt: iso(14), defaultBranch: 'main',
        counts: { branches: 31, active: 1, landed: 9, stranded: 2, surveyed: 10, older: 18, openPRs: 0 },
        openPRs: [],
        // An index that WAS capped, and a branch older than it reaches: the row
        // that must not claim there is no PR.
        branchPRs: [{ head: 'claude/cem-survey-powershell-oxl71l', number: 214, state: 'merged', draft: false, count: 1 }],
        prReach: iso(10),
        survey: { surveyedAt: iso(14), cap: 30, surveyed: 10, older: 18, truncated: false, branches: [
          br('claude/cem-survey-powershell-oxl71l', iso(14), 'full-picture: restamp the as-of date at wrap-up'),
          br('claude/older-than-the-index', iso(40), 'Work from before the PR index reaches'),
        ] },
      },
    };
    // Every seeded row inside one window, so the pane shows the whole set.
    window.__shell.branchWindow = 7;
    d.branchScope = 'active';
  });
  await page.waitForTimeout(500);
};
