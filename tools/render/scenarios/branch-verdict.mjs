// The content verdict in the branch view's Files pane: the three counts as a
// filter strip, and the missing mark on the rows it applies to.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/branch-verdict.mjs \
//     --out tools/.preview/branch-verdict.png --width 430 --height 932
//
// FILTER=missing narrows the pane through the strip, which is what the estate
// row's `11 missing` chip does when it opens this view.
//
// The verdict needs three reads the sandbox has no token for: the compare, and
// a recursive tree for each side. All three are stubbed, and the trees are
// built to produce one of each answer rather than a single class, since a strip
// showing one chip proves nothing about a partition.
import openList from '/home/user/web-tools/tools/render/scenarios/estate-open.mjs';

export default async function (page, ctx) {
  process.env.SCOPE = 'stranded';           // the surveyed rows live here
  await openList(page, ctx);
  await page.waitForTimeout(600);

  const out = await page.evaluate(async (filter) => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const patch = '@@ -1,2 +1,3 @@\n a\n-b\n+c\n';
    // Three landed, three differing, two missing. The tip and the base agree on
    // the first three, hold different bytes for the next three, and the base
    // has never seen the last two.
    const landed  = ['docs/show-repo.md', 'lib/kits/branch-survey.js', 'pages/branch.html'];
    const differs = ['lib/alpineComponents/estate.js', 'docs/branch-overlay.md', 'tools/test/branch-survey.test.mjs'];
    const missing = ['tracker/tasks/0031-fund-splits.md', 'projects/budget-drs/data/design/LAYERS.md'];
    const all = [...landed, ...differs, ...missing];
    const blob = (path, sha) => ({ path, type: 'blob', sha });

    window.GH.prototype.compare = async () => ({
      ahead_by: 9, behind_by: 4, total_commits: 9,
      commits: [{ sha: 'aaa1', commit: { message: 'Name the third class', committer: { date: '2026-08-16T09:00:00Z' } } }],
      files: all.map(f => ({ filename: f, status: 'modified', additions: 12, deletions: 3, patch })),
    });
    const origReq = window.GH.prototype.req;
    window.GH.prototype.req = async function (p) {
      if (/^git\/trees\//.test(p)) {
        // Keyed on the BASE, not the branch: the view addresses the tip tree
        // by SHA where the host lent one, so a branch-name test matches the
        // wrong side and quietly answers both reads with the base tree.
        const onTip = !new RegExp('trees/' + 'main').test(p);
        return { truncated: false, tree: [
          ...landed.map((f, i) => blob(f, 'same' + i)),
          ...differs.map((f, i) => blob(f, (onTip ? 'tip' : 'base') + i)),
          ...(onTip ? missing.map((f, i) => blob(f, 'only' + i)) : []),
        ] };
      }
      if (/^pulls\?/.test(p)) return [];
      return origReq.call(this, p);
    };

    const es = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
    const row = es.openRows.find(r => r.nUnique) || es.openRows[0];
    es.openBranchFiles(row, filter || '');
    for (let i = 0; i < 120 && !es._deck; i++) await wait(50);
    await wait(2200);                        // the compare, then the two trees

    const d = window.swipeDeck.top();
    const slide = d.deck.track.children[d.deck.active()];
    const bb = window.Alpine.$data(slide.querySelector('[x-data^="branchBrief"]'));
    return { pane: bb.pane, fileState: bb.fileState, measured: !!bb.survey,
             counts: bb.pathStateChips.map(c => c.n + ' ' + c.label).join(', '),
             total: bb.verdict?.nUnique, showing: bb.filteredFiles.length,
             sums: bb.verdict ? bb.verdict.nLanded + bb.verdict.nDiffers + bb.verdict.nMissing : null };
  }, process.env.FILTER || '');

  console.log('\n── the content verdict, in the Files pane ' + '─'.repeat(19));
  console.log('   pane / filter    : ' + out.pane + ' / ' + (out.fileState || '(all)'));
  console.log('   measured here    : ' + out.measured);
  console.log('   chips            : ' + out.counts);
  console.log('   partition        : ' + out.sums + ' of ' + out.total + ' touched paths');
  console.log('   files showing    : ' + out.showing);
  console.log('─'.repeat(60) + '\n');
  await page.waitForTimeout(300);
}
