// `&pane=` and `&file=` on the branch takeover, in a real browser.
//
//   ADDR=file node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/branch-address.mjs \
//     --out tools/.preview/addr.png --width 430 --height 932
//
// The keys exist because the surfacing caption stopped enumerating a turn's
// files in chat on 2026-08-26 and started linking here instead, so a reply that
// points at one file needs an address that LANDS on that file. jsdom can say
// the option reached the slide (estate-detail-address, branch-brief-address);
// only a browser can say a deck really mounted on top of the branch, which is
// the whole claim the link makes.
//
// One address per run: the deck closes through history, and re-opening it by
// hand between cases lets the previous close land on top of the next open,
// which reads as the feature failing every other time.
//
//   ADDR=pane   the file list, one deck deep
//   ADDR=file   the file deck drilled on the named path, two decks deep
//   ADDR=miss   a path this branch does not touch: one deck deep, nothing opened
import openList from '/home/user/web-tools/tools/render/scenarios/estate-open.mjs';

export default async function (page, ctx) {
  const which = process.env.ADDR || 'file';
  await openList(page, ctx);
  await page.waitForTimeout(600);

  const out = await page.evaluate(async (which) => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const files = ['docs/SURFACING.md', 'lib/kits/file-deck.js', 'pages/branch.html'];
    const patch = '@@ -1,2 +1,3 @@\n a\n-b\n+c\n';
    window.GH.prototype.compare = async () => ({
      ahead_by: 3, behind_by: 0, total_commits: 3,
      commits: [{ sha: 'a1', commit: { message: 'x', committer: { date: '2026-08-26T09:00:00Z' } } }],
      files: files.map(f => ({ filename: f, status: 'modified', additions: 9, deletions: 2, patch })),
    });
    const origReq = window.GH.prototype.req;
    window.GH.prototype.req = async function (p) {
      if (p === '') return { default_branch: 'main' };
      if (/^pulls\?/.test(p)) return [{ number: 512, title: 'A guide', state: 'open', draft: true,
        body: 'Judgment.', updated_at: '2026-08-26T09:00:00Z' }];
      return origReq.call(this, p);
    };

    const es = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
    const row = es.openRows[0];
    const extra = { pane: { pane: 'files' },
                    file: { file: 'lib/kits/file-deck.js' },
                    miss: { file: 'docs/NOT-HERE.md' } }[which];

    const p = new URLSearchParams(location.search);
    p.set('view', 'activity');
    p.set('detail', row.repo + '@' + row.name);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    history.replaceState({}, '', location.pathname + '?' + p.toString());

    es._detailFromUrl = false;
    es.openDetailFromUrl();
    await wait(2600);

    const stack = window.swipeDeck.stack;
    const top = window.swipeDeck.top();
    const base = stack[0];
    const bb = base && base.deck.track.children[base.deck.active()]
                 .querySelector('[x-data^="branchBrief"]');
    return {
      depth: stack.length,
      header: top?.el.querySelector('h1')?.textContent?.trim() || '',
      crumb: top?.el.querySelector('h1 + p')?.textContent?.trim() || '',
      pane: bb ? window.Alpine.$data(bb).pane : '',
      link: (es.detailLink().split('?')[1] || ''),
    };
  }, which);

  console.log('\n── ADDR=' + which + ' ' + '─'.repeat(48));
  console.log('   deck depth : ' + out.depth + '   (1 = branch only, 2 = file deck drilled)');
  console.log('   top header : ' + JSON.stringify(out.header) + '  ' + JSON.stringify(out.crumb));
  console.log('   slide pane : ' + out.pane);
  console.log('   copy link  : ?' + out.link);
  console.log('─'.repeat(60) + '\n');
  await page.waitForTimeout(200);
}
