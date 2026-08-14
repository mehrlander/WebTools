// The sidebar owns the second ref, and the file surface does what it is told.
//
//   node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/sidebar-compare.mjs \
//     --out tools/.preview/sidebar-compare.png --width 430 --height 932
//
// jsdom holds each half of this on its own: the fab publishes a pair
// (fab-toss.test.mjs) and a card adopts one (file-review-card.test.mjs). What
// it cannot hold is that the two halves meet, because meeting requires the
// deck to have announced a base, the drawer to be open over it, and a real
// Alpine tree in between. This runs the round trip:
//
//   - the deck announces its merge base, so the compare bar appears at all
//     (it is hidden for a subject with no second version in play);
//   - the slide's strip is the file and one Compare pane, not four readings
//     of a pair the card no longer owns;
//   - picking another branch in the drawer moves the card's base, drops the
//     API patch (only ever true of the merge base) and refetches one side;
//   - turning it off leaves the file alone on the strip.
import openList from '/home/user/web-tools/tools/render/scenarios/estate-open.mjs';

export default async function (page, ctx) {
  await openList(page, ctx);
  await page.waitForTimeout(600);

  const out = await page.evaluate(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    // Not real repo paths: gh.load() fetches the shell's own kits through the
    // same client, so a get() stub that answers everything hands the loader
    // prose where it expected JavaScript.
    const files = ['notes/plan.txt', 'docs/note.md'];
    const patch = '@@ -1,3 +1,4 @@\n context\n-old line\n+new line\n+added\n';
    window.GH.prototype.compare = async (b, head) => ({
      ahead_by: 4, behind_by: 0, total_commits: 1,
      commits: [{ sha: 'a1', commit: { message: head, committer: { date: '2026-08-13T09:00:00Z' } } }],
      files: files.map((f, i) => ({ filename: f, status: 'modified', additions: 12 + i,
                                    deletions: 3, patch })),
    });
    const origReq = window.GH.prototype.req;
    window.GH.prototype.req = async function (p) {
      if (p === '') return { default_branch: 'main' };
      if (/^pulls\?/.test(p)) return [{ number: 411, title: 'A guide', state: 'open', draft: true,
        body: 'Judgment about the branch.', updated_at: '2026-08-13T09:00:00Z' }];
      return origReq.call(this, p);
    };
    // Every content read answers, and says which ref it answered from, so a
    // moved base is visible in the bytes rather than only in the state.
    const reads = [];
    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (p) {
      if (!files.includes(p)) return origGet.call(this, p);
      reads.push((this.ref || '?') + ':' + p);
      return { text: '# Note\n\nbody of ' + p + ' at ' + (this.ref || '?'), size: 12, sha: 'deadbeef' };
    };

    const es = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
    es.openBranchDetail(es.openRows[0]);
    for (let i = 0; i < 120 && !es._deck; i++) await wait(50);
    await wait(1200);

    // Down to a file.
    const branchDeck = window.swipeDeck.top();
    const slide = branchDeck.deck.track.children[branchDeck.deck.active()];
    const bb = window.Alpine.$data(slide.querySelector('[x-data^="branchBrief"]'));
    bb.pane = 'files';
    await bb.ensureCompare();
    await wait(400);
    await bb.openFileDeck(0);
    await wait(900);

    const fab = window.Alpine.$data([...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').startsWith('fab')));
    const card = () => {
      const d = window.swipeDeck.top();
      const el = d.deck.track.children[d.deck.active()].querySelector('[x-data^="fileReview"]');
      return window.Alpine.$data(el);
    };
    const strip = () => card().panes.map(p => p.label).join(' | ');

    const announced = { base: fab.subjectBase, name: fab.compareName,
                        path: fab.path, ref: fab.ref };
    const opened = { strip: strip(), tab: card().tab, base: card().base,
                     baseName: card().baseName, patch: !!card().patch };

    // The drawer, over the slide, with the compare bar in it.
    fab.open = true;
    fab.activeTab = 'render';
    await wait(600);
    const barText = [...document.querySelectorAll('.ph-git-diff')]
      .map(i => i.parentElement?.textContent.replace(/\s+/g, ' ').trim())
      .filter(t => t && t.includes('vs'))[0] || '(no bar)';

    // Pick another branch to compare against.
    const before = reads.length;
    fab.compareWith('claude/elsewhere');
    await wait(1200);
    const picked = { strip: strip(), base: card().base, baseName: card().baseName,
                     patch: !!card().patch, tab: card().tab,
                     fetched: reads.slice(before) };

    // And off.
    fab.compareStop();
    await wait(400);
    const off = { strip: strip(), tab: card().tab };

    // Back to the announced base, which is how the reader returns without
    // having to remember what it was.
    fab.compareWith('');
    await wait(900);
    const back = { strip: strip(), baseName: card().baseName };

    return { announced, opened, barText, picked, off, back };
  });

  console.log('\n── the sidebar owns the second ref ' + '─'.repeat(26));
  console.log('   the deck announced      : ' + JSON.stringify(out.announced));
  console.log('   the compare bar reads   : ' + out.barText);
  console.log('   the slide opened on     : ' + JSON.stringify(out.opened));
  console.log('   after picking a branch  : ' + JSON.stringify(out.picked));
  console.log('   after turning it off    : ' + JSON.stringify(out.off));
  console.log('   back to the merge base  : ' + JSON.stringify(out.back));
  console.log('─'.repeat(60) + '\n');

  // Where the shot is pointed. Default is the bar in place under the ref bar;
  // SHOT=menu opens the picker, SHOT=card closes the drawer and leaves the
  // slide on its Compare pane, which is the half a reader on a phone sees.
  const shot = process.env.SHOT || '';
  if (shot) {
    await page.evaluate(async (which) => {
      const fab = window.Alpine.$data([...document.querySelectorAll('[x-data]')]
        .find(e => (e.getAttribute('x-data') || '').startsWith('fab')));
      if (which === 'menu') { fab.compareMenu = true; return; }
      fab.open = false;
      const d = window.swipeDeck.top();
      const el = d.deck.track.children[d.deck.active()].querySelector('[x-data^="fileReview"]');
      window.Alpine.$data(el).setTab('diff');
    }, shot);
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(300);
}
