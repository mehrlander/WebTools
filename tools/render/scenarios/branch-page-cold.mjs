// A COLD pages/branch.html: the branch view with NO host lending it anything,
// which is the half of the two-host contract the other scenarios never shoot.
// Every other branch driver here (branch-panes, branch-verdict, branch-deck,
// branch-takeover) opens the takeover inside app/index.html, where show-repo's
// crawl lends `facts` and a `scan` and the compare waits for a tap. This mounts
// the same component as a page, where nothing is lent and the compare is read
// up front.
//
//   npm run shot -- pages/branch.html \
//     --hash 'gh=mehrlander/web-tools@claude/example&base=main' \
//     --script tools/render/scenarios/branch-page-cold.mjs --width 430 --height 620
//
// The sandbox has no token, so the compare, the pulls call and the two trees
// are stubbed and the page is driven through its real load(); the markup, the
// classes and the gates are the page's own.
//
// WHAT IT WAS BUILT TO SETTLE, 2026-09-04: the takeover drew a verdict strip
// over its file list ("on main | 8 all | 3 landed | 3 differs | 2 missing") and
// this page drew none, which read as two implementations. It is one, and the
// strip was a gate: the scan rides ensureCompare(), and load() called that only
// for a branch with no guide, so a branch WITH a pull request paid for the
// compare and never measured it. The console block below is the evidence, and
// `scan measured` is the line that was false.
//
// The PULL is the fixture's load-bearing half for the same reason: drop it and
// the branch has no guide, load() asks for the compare, and the bug hides.
export default async function (page) {
  await page.waitForFunction(() => {
    const el = document.getElementById('mount');
    return el && window.Alpine && window.Alpine.$data(el) && !window.Alpine.$data(el).loading;
  }, { timeout: 30000 });

  const out = await page.evaluate(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const patch = '@@ -1,2 +1,3 @@\n a\n-b\n+c\n';
    // Three landed, three differing, two missing, the same partition
    // branch-verdict.mjs uses: a strip showing one chip proves nothing.
    const landed  = ['docs/show-repo.md', 'lib/kits/branch-status.js', 'pages/branch.html'];
    const differs = ['lib/alpineComponents/estate.js', 'docs/branch-overlay.md', 'tools/test/branch-status.test.mjs'];
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
        // Keyed on the BASE, not the branch: a cold page addresses the tip tree
        // by branch name, so a name test matches the wrong side and quietly
        // answers both reads with the base tree.
        const onTip = !new RegExp('trees/' + 'main').test(p);
        return { truncated: false, tree: [
          ...landed.map((f, i) => blob(f, 'same' + i)),
          ...differs.map((f, i) => blob(f, (onTip ? 'tip' : 'base') + i)),
          ...(onTip ? missing.map((f, i) => blob(f, 'only' + i)) : []),
        ] };
      }
      if (/^pulls\?/.test(p)) return [{
        number: 591, state: 'open', draft: true,
        title: 'Surfacing tab reads in the deck; the peek card carries its own mark',
        body: 'The Map view\'s Surfacing tab reads its own doc in the swipe deck.\n\n'
            + '[//]: # (guide)\n\n**Next steps / open threads:**\n- a CSV branch for renderDoc\n\n[//]: # (/guide)\n',
        html_url: 'https://github.com/mehrlander/web-tools/pull/591',
        head: { ref: 'claude/example' }, base: { ref: 'main' },
        user: { login: 'mehrlander' }, updated_at: '2026-09-04T10:00:00Z',
        merged_at: null, closed_at: null,
      }];
      return origReq.call(this, p);
    };

    window.BranchBrief.forget();
    const d = window.Alpine.$data(document.getElementById('mount'));
    await d.load();
    await wait(2500);                        // the compare, then the two trees

    // The heading row BY BOUNDING BOX, because "this host does not have those
    // controls" and "they are off the right edge of the screenshot" look
    // identical in a crop, and the second is what a desktop-width report of
    // the first turned out to be.
    const box = (el) => { const r = el?.getBoundingClientRect?.();
      return r ? Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) : 'absent'; };
    return {
      hasGuide: d.hasGuide, pending: !!d.brief?.pending,
      files: d.brief?.files.length || 0, deckFiles: d.deckFiles.length,
      measured: !!d.scan, verdict: !!d.verdict,
      chips: d.pathStateChips.map(c => c.n + ' ' + c.label).join(', '),
      head: {
        deck: box(document.querySelector('#mount .ph-cards-three')?.closest('button')),
        github: box(document.querySelector('#mount .ph-github-logo')?.closest('summary')),
        plus: box(document.querySelector('#mount .ph-plus')?.closest('a')),
        width: document.documentElement.clientWidth,
      },
    };
  });

  console.log('\n── a cold pages/branch.html, branch WITH a pull request ' + '─'.repeat(5));
  console.log('   hasGuide         : ' + out.hasGuide);
  console.log('   compare pending  : ' + out.pending + '   (false = read up front, nothing lent the head)');
  console.log('   files / deck     : ' + out.files + ' / ' + out.deckFiles);
  console.log('   scan measured    : ' + out.measured);
  console.log('   verdict strip    : ' + out.verdict + '   chips: ' + (out.chips || '(none)'));
  console.log('   heading row      : deck ' + out.head.deck + ' | github ' + out.head.github
              + ' | plus ' + out.head.plus + '   (viewport ' + out.head.width + 'px)');
  console.log('─'.repeat(60) + '\n');
  await page.waitForTimeout(300);
}
