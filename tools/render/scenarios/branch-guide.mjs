// screenshot.mjs interaction scenario: pages/branch.html showing a branch with
// its guide, the PR body rendered on the page rather than linked away to.
//
//   node tools/render/screenshot.mjs pages/branch.html \
//     --script tools/render/scenarios/branch-guide.mjs \
//     --out tools/.preview/branch-guide.png --full
//
// The sandbox proxy blocks api.github.com, so the live fetch path cannot run.
// The compare is built from the LOCAL git repo (this branch against main: real
// commits, real changed files, real patches), and the PR list is a fixture
// carrying a real guide body, since a guide is exactly the thing whose shape
// the pixels are meant to show. What the pixels prove: the guide renders, its
// file links become chips, and the derived file list sits under it. What they
// do not: the network plumbing (tools/test/branch-brief.test.mjs) or the
// re-aiming rules (tools/test/guide-render.test.mjs).
import { execFileSync } from 'node:child_process';

const BODY = `Each row in the Map view's Docs tab now says how many distinct sessions opened that file. Reach says who *can* get to a doc; this says who did.

**Changed:**
- [lib/kits/repo-sessions-cache.js](https://github.com/mehrlander/web-tools/blob/claude/show-repo-progress-b8l63x/lib/kits/repo-sessions-cache.js) ([main](https://github.com/mehrlander/web-tools/blob/main/lib/kits/repo-sessions-cache.js))
- [pages/branch.html](https://github.com/mehrlander/web-tools/blob/claude/show-repo-progress-b8l63x/pages/branch.html) ([main](https://github.com/mehrlander/web-tools/blob/main/pages/branch.html))
- [docs/show-repo.md](https://github.com/mehrlander/web-tools/blob/claude/show-repo-progress-b8l63x/docs/show-repo.md)

**Next steps / open threads:**
- The live cache has no docFiles yet, so the column populates on the next Sessions crawl.

**Notes / Risk:** Suite green with the pre-build rebuilt. The column is absent, not blank, without a token.

[Session](https://claude.ai/code/session_01XG5Lhhh7d3GUtorKu1TBFY)`;

export default async function (page, { repoRoot }) {
  const git = (...a) => execFileSync('git', ['-C', repoRoot, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').trim();
  const base = 'origin/main';

  const commits = git('log', '--reverse', `${base}..HEAD`, '--format=%H%x1f%ci%x1f%s')
    .trimEnd().split('\n').filter(Boolean).map(l => {
      const [sha, date, subject] = l.split('\x1f');
      return { sha, commit: { message: subject, committer: { date: new Date(date).toISOString() } } };
    });
  const files = git('diff', '--numstat', `${base}...HEAD`).trimEnd().split('\n').filter(Boolean)
    .map(l => {
      const [add, del, filename] = l.split('\t');
      return { filename, status: 'modified', additions: Number(add) || 0, deletions: Number(del) || 0,
               patch: '@@ (patch elided in the fixture) @@' };
    });

  const fixture = {
    branch,
    compare: { ahead_by: commits.length, behind_by: 0, total_commits: commits.length, commits, files },
    pulls: [
      { number: 364, title: 'Docs registry: a readership column, over a rollup that can answer it',
        state: 'open', draft: true, body: BODY, updated_at: '2026-08-06T18:00:00Z' },
      { number: 359, title: 'Activity: a Sessions tab, and To-do + Jot merged into Lists',
        state: 'closed', merged_at: '2026-08-05T21:07:45Z', body: 'Earlier PR on this branch.',
        updated_at: '2026-08-05T21:07:45Z' },
    ],
  };

  const ok = await page.evaluate(async (fx) => {
    if (!window.Alpine || !window.GH || !window.BranchBrief) return 'page did not boot';
    window.GH.prototype.compare = async () => fx.compare;
    window.GH.prototype.req = async (p) => {
      if (/^pulls\?/.test(p)) return fx.pulls;
      if (p === '') return { default_branch: 'main' };
      return {};
    };
    // The per-file cards fetch their own content; the fixture patch is enough
    // for a collapsed row, and an unreachable body is not what is on trial.
    window.GH.prototype.get = async () => ({ text: '' });

    const host = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('branchPage'));
    if (!host) return 'no branchPage';
    await window.Alpine.$data(host).open({ repo: 'mehrlander/web-tools', ref: fx.branch, base: 'main' });
    return true;
  }, fixture);
  if (ok !== true) throw new Error('branch-guide scenario: ' + ok);

  await page.waitForFunction(() => {
    const el = document.getElementById('mount');
    const d = el && window.Alpine.$data(el);
    return d && d.brief && !d.loading && d.guideHtml;
  }, { timeout: 20000 });
  await page.waitForTimeout(600);
}
