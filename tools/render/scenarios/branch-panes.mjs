// Two panes on a branch, and what the third one used to carry.
//
//   node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/branch-panes.mjs \
//     --out tools/.preview/branch-panes.png --width 430 --height 932
//
// Commits was a third tab whose count restated the strip's ahead figure and
// whose twelve subjects sat beside a PR body describing the same work in
// prose. The one case it answered alone is a branch with NO pull request,
// where the subjects are the only account there is, and that case moved into
// the Guide pane. So there are two things to see here, and only in a browser,
// since both turn on which pane a real mount settles on:
//
//   - a branch WITH a guide opens on it, and the strip is Guide | Files;
//   - a branch WITHOUT one opens on Files, and its Guide pane holds the
//     commits, fetched by the tap rather than up front.
import openList from '/home/user/web-tools/tools/render/scenarios/estate-open.mjs';

export default async function (page, ctx) {
  await openList(page, ctx);
  await page.waitForTimeout(600);

  const out = await page.evaluate(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const patch = '@@ -1,2 +1,3 @@\n a\n-b\n+c\n';
    const names = ['docs/note.md', 'lib/thing.js'];
    let compares = 0;
    window.GH.prototype.compare = async (b, head) => {
      compares++;
      return {
        ahead_by: 2, behind_by: 0, total_commits: 2,
        commits: [
          { sha: 'aaa1111', commit: { message: 'first thing\n\nbody', committer: { date: '2026-08-13T09:00:00Z' } } },
          { sha: 'bbb2222', commit: { message: 'second thing', committer: { date: '2026-08-14T09:00:00Z' } } },
        ],
        files: names.map(f => ({ filename: f, status: 'modified', additions: 4, deletions: 1, patch })),
      };
    };
    // The switch under test: the first branch has a PR and the second has
    // none. It keys on the BRANCH rather than on a flag flipped mid-run,
    // because swipe-deck builds the neighbouring slide at open: a flag flipped
    // after that arrives too late, and both slides read as having a guide.
    const es = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
    // The estate's own row calls it `name`; branch-brief calls it `branch`.
    const bareBranch = es.openRows[1]?.name || '';
    const origReq = window.GH.prototype.req;
    window.GH.prototype.req = async function (p) {
      if (p === '') return { default_branch: 'main' };
      if (/^pulls\?/.test(p)) {
        if (bareBranch && p.includes(encodeURIComponent(bareBranch))) return [];
        return [{ number: 411, title: 'A guide', state: 'open', draft: true,
                  body: 'Judgment about the branch.', updated_at: '2026-08-13T09:00:00Z' }];
      }
      return origReq.call(this, p);
    };
    es.openBranchDetail(es.openRows[0]);
    for (let i = 0; i < 120 && !es._deck; i++) await wait(50);
    await wait(1400);

    const deck = () => window.swipeDeck.top();
    const view = () => {
      const d = deck();
      const slide = d.deck.track.children[d.deck.active()];
      return { bb: window.Alpine.$data(slide.querySelector('[x-data^="branchBrief"]')), slide };
    };
    // The view's own strip, not every tab in the slide: each file card carries
    // a strip of its own, and an unscoped selector reports those too.
    const tabs = (slide) => [...(slide.querySelector('[role="tablist"]')?.children || [])]
      .map(a => a.textContent.replace(/\s+/g, ' ').trim()).join(' | ');

    const a = view();
    const guided = { tabs: tabs(a.slide), pane: a.bb.pane, hasGuide: a.bb.hasGuide,
                     // The deferral still holds: a guided slide renders on the
                     // pulls call and has read no diff.
                     deferred: !!a.bb.brief?.pending };

    // A branch with no PR: same mount, next slide.
    deck().deck.go(1);
    await wait(1800);
    const b = view();
    const bare = { tabs: tabs(b.slide), pane: b.bb.pane, hasGuide: b.bb.hasGuide };

    // Its Guide pane is the commit list, and asking for it is what fetches.
    b.bb.pane = 'guide';
    if (!b.bb.hasGuide) await b.bb.ensureCompare();
    await wait(600);
    const shown = b.slide.textContent.replace(/\s+/g, ' ');
    const commits = { heading: shown.includes('What this branch did'),
                      noPr: shown.includes('no pull request describes it'),
                      subjects: ['first thing', 'second thing'].filter(s => shown.includes(s)).join(', ') };

    return { guided, bare, commits, compares };
  });

  console.log('\n── two panes, and where the third one went ' + '─'.repeat(18));
  console.log('   a branch with a guide  : ' + JSON.stringify(out.guided));
  console.log('   a branch without one   : ' + JSON.stringify(out.bare));
  console.log('   and its Guide pane     : ' + JSON.stringify(out.commits));
  console.log('   compares over the run  : ' + out.compares);
  console.log('─'.repeat(60) + '\n');
  await page.waitForTimeout(300);
}
