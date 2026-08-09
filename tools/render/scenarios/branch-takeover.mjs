// screenshot.mjs interaction scenario: show-repo's branch-detail takeover with
// the embedded branch page fully rendered, guide and all.
//
//   DETAIL=1 node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/branch-takeover.mjs \
//     --out tools/.preview/branch-takeover.png --width 390 --height 844 --full
//
// estate-open.mjs already drives the Activity list and taps a row open
// (DETAIL=1), which proves the takeover's own chrome: the header, the position
// counter, the arrows, the swipe surface. What it cannot show is the BODY,
// because the embedded page reads the compare API live and the sandbox blocks
// api.github.com, so the shot stops at a spinner. That gap is the reason this
// scenario exists: the takeover is where a branch is actually read, and a
// screenshot of its chrome around a spinner proves the half nobody doubted.
//
// So this composes estate-open and then reaches INTO the frame. Same-origin
// under the local server, so the shell can patch the embedded page's GH and
// re-run its load, exactly as the drawer's Inspect tab reaches a tossed
// subject. What the pixels prove: the takeover embeds the real branch page,
// which renders the guide, the chips, and the changed-file list inside it.
// What they do not: the network path, or the deployed shell (github.io serves
// pages/branch.html from the default branch, so the embedded page's own markup
// is main's until this merges).
import openList from './../scripts/estate-open.mjs';

const BODY = `Each row in the Map view's Docs tab now says how many distinct sessions opened that file.

**Changed:**
- [lib/kits/repo-sessions-cache.js](https://github.com/me/web-tools/blob/claude/show-repo-activity-filters/lib/kits/repo-sessions-cache.js)
- [pages/branch.html](https://github.com/me/web-tools/blob/claude/show-repo-activity-filters/pages/branch.html)

**Notes / Risk:** Suite green with the pre-build rebuilt.`;

export default async function (page, ctx) {
  await openList(page, ctx);   // DETAIL=1 in the environment opens the takeover

  const fixture = {
    branch: 'claude/show-repo-activity-filters',
    compare: {
      ahead_by: 6, behind_by: 0, total_commits: 2,
      commits: [
        { sha: 'a1b2c3d4', commit: { message: 'Open view: repo chips', committer: { date: '2026-08-04T09:00:00Z' } } },
        { sha: 'e5f6a7b8', commit: { message: 'Lifespan on the row', committer: { date: '2026-08-06T09:00:00Z' } } },
      ],
      files: [
        { filename: 'lib/kits/repo-sessions-cache.js', status: 'modified', additions: 56, deletions: 7, patch: '@@ -1 +1 @@' },
        { filename: 'pages/branch.html', status: 'modified', additions: 65, deletions: 23, patch: '@@ -1 +1 @@' },
        { filename: 'docs/show-repo.md', status: 'modified', additions: 72, deletions: 12, patch: '@@ -1 +1 @@' },
        { filename: 'tools/test/guide-render.test.mjs', status: 'added', additions: 120, deletions: 0, patch: '@@ -0,0 +1 @@' },
      ],
    },
    pulls: [{ number: 298, title: 'Open view: repo chips, lifespan, GitHub menu',
              state: 'open', draft: true, body: BODY, updated_at: '2026-08-06T09:00:00Z' }],
  };

  const ok = await page.evaluate(async (fx) => {
    const fr = document.querySelector('iframe[src*="branch.html"]');
    if (!fr) return 'no takeover frame';
    const w = fr.contentWindow;
    // The frame boots its own lib chain; wait for it rather than racing it.
    for (let i = 0; i < 150 && !(w.GH && w.Alpine && w.BranchBrief); i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (!w.GH || !w.BranchBrief) return 'the embedded page never booted';

    w.GH.prototype.compare = async () => fx.compare;
    w.GH.prototype.req = async (p) => /^pulls\?/.test(p) ? fx.pulls : (p === '' ? { default_branch: 'main' } : {});
    w.GH.prototype.get = async () => ({ text: '' });

    const host = [...w.document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('branchPage'));
    if (!host) return 'no branchPage in the frame';
    await w.Alpine.$data(host).open({ repo: 'me/web-tools', ref: fx.branch, base: 'main' });
    return true;
  }, fixture);
  if (ok !== true) throw new Error('branch-takeover scenario: ' + ok);

  await page.waitForFunction(() => {
    const fr = document.querySelector('iframe[src*="branch.html"]');
    const el = fr && fr.contentDocument && fr.contentDocument.getElementById('mount');
    const d = el && fr.contentWindow.Alpine.$data(el);
    return d && d.brief && !d.loading && d.guideHtml;
  }, { timeout: 25000 });
  await page.waitForTimeout(600);
}
