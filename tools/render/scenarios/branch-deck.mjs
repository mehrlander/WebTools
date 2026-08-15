// The branch takeover and the file reader are ONE mechanism, checked in a real
// browser because the claim is about the platform's gesture and not about our
// arithmetic.
//
//   node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/branch-deck.mjs \
//     --out tools/.preview/two-decks.png --width 390 --height 844
//
// It replaced branch-step-cost.mjs, which measured what a step through an
// EMBEDDED PAGE cost: whether the iframe reloaded, and how many round trips
// went out. Both questions retired with the iframe on 2026-08-13. What is
// worth measuring now is that the conversion actually happened and holds:
//
//   - there is no iframe at all;
//   - the branch track is a native scroll-snap container, so the gesture is
//     the compositor's rather than a hand-rolled drag on the main thread;
//   - the header follows the reader, carrying the branch, its repo, and a PR
//     number that for a MERGED pull request can only have come up through the
//     slide's own read (the activity crawl asks for open ones only);
//   - the address follows the slide;
//   - a mounted slide has NOT read the compare, so it carries a rendered guide,
//     a head filled from the host's lent facts, and no files at all until the
//     reader opens the pane that needs them;
//   - the file deck DRILLS from the branch deck, wearing a back chevron and
//     the branch as its crumb, and one Back returns to the branch that was
//     left rather than closing the stack.
//
// Two faults this scenario caught, neither visible to jsdom: opening a branch
// while one was open stacked a second branch deck instead of replacing it, and
// a slide rendered nothing at all because the shell registers the branchBrief
// COMPONENT but not the KIT it reads.
import openList from '/home/user/web-tools/tools/render/scenarios/estate-open.mjs';

// The conversion, end to end: the branch level is a swipe-deck now, the file
// level drills from it, and both are the same mechanism.
export default async function (page, ctx) {
  await openList(page, ctx);
  await page.waitForTimeout(600);

  const out = await page.evaluate(async () => {
    const files = ['lib/kits/swipe-deck.js', 'lib/kits/file-deck.js', 'docs/show-repo.md'];
    const patch = '@@ -1,3 +1,4 @@\n context\n-old line\n+new line\n+added\n';
    window.GH.prototype.compare = async (b, head) => ({
      ahead_by: 4, behind_by: 0, total_commits: 1,
      commits: [{ sha: 'a1', commit: { message: head, committer: { date: '2026-08-13T09:00:00Z' } } }],
      files: files.map((f, i) => ({ filename: f, status: 'modified', additions: 12 + i, deletions: 3, patch })),
    });
    const origReq = window.GH.prototype.req;
    window.GH.prototype.req = async function (p) {
      if (p === '') return { default_branch: 'main' };
      if (/^pulls\?/.test(p)) return [{ number: 411, title: 'A guide', state: 'open', draft: true,
        body: 'Judgment about the branch.', updated_at: '2026-08-13T09:00:00Z' }];
      return origReq.call(this, p);
    };
    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (p) {
      if (p === 'data/design/content.csv') throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, p);
    };

    const es = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
    const rows = es.openRows.length;
    es.openBranchDetail(es.openRows[0]);
    for (let i = 0; i < 120 && !es._deck; i++) await new Promise(r => setTimeout(r, 50));
    await new Promise(r => setTimeout(r, 1500));

    const deck = () => window.swipeDeck.top();
    const hdr = () => {
      const d = deck(), h = d.el.querySelector('h1'), s = d.el.querySelector('h1 + p');
      return { title: h.textContent, sub: s.textContent,
               pill: d.el.querySelector('.rounded-full.border').textContent.replace(/\s+/g, ''),
               btn: d.el.querySelector('button[aria-label="Back"]') ? '‹' : '✕' };
    };
    const branchDeck = deck();
    const trackIsNative = (() => {
      const t = branchDeck.deck.track;
      const cs = getComputedStyle(t);
      return { overflowX: cs.overflowX, snapType: cs.scrollSnapType || cs.webkitScrollSnapType };
    })();
    const noIframe = !document.querySelector('iframe[src*="branch.html"]');
    const opened = hdr();

    // Step a branch, natively.
    branchDeck.deck.go(1);
    await new Promise(r => setTimeout(r, 1400));
    const stepped = hdr();
    const addr = new URLSearchParams(location.search).get('detail');

    // Drill into the files from inside the branch slide. Opening Files is what
    // ASKS for the compare: a slide mounts on the pulls call alone, so until
    // this pair runs there is no file list to drill into. That is the deferral,
    // and here it is in a browser rather than in jsdom.
    const slide = branchDeck.deck.track.children[branchDeck.deck.active()];
    const bb = window.Alpine.$data(slide.querySelector('[x-data^="branchBrief"]'));
    const deferred = { pending: bb.brief?.pending, files: bb.brief?.files.length,
                       ahead: bb.brief?.ahead, state: bb.brief?.state };
    bb.pane = 'files';
    await bb.ensureCompare();
    await new Promise(r => setTimeout(r, 500));
    const read = { pending: bb.brief?.pending, files: bb.brief?.files.length };
    await bb.openFileDeck(1);
    await new Promise(r => setTimeout(r, 900));
    const drilled = hdr();
    const depth = window.swipeDeck.stack.length;

    // And back out.
    history.back();
    await new Promise(r => setTimeout(r, 700));
    const back = { depth: window.swipeDeck.stack.length, ...hdr() };

    return { rows, noIframe, trackIsNative, opened, stepped, addr, deferred, read, drilled, depth, back,
             slides: branchDeck.deck.count,
             mounted: branchDeck.el.querySelectorAll('[x-data^="branchBrief"]').length };
  });

  console.log('\n── one mechanism, two levels ' + '─'.repeat(32));
  console.log('   iframe gone                : ' + out.noIframe);
  console.log('   branch track               : overflow-x ' + out.trackIsNative.overflowX
              + ', scroll-snap-type ' + out.trackIsNative.snapType);
  console.log('   slides / branch views live : ' + out.slides + ' / ' + out.mounted);
  console.log('   opened   ' + JSON.stringify(out.opened));
  console.log('   stepped  ' + JSON.stringify(out.stepped));
  console.log('   address follows            : ' + out.addr);
  console.log('   on a mounted slide         : ' + JSON.stringify(out.deferred));
  console.log('   after opening Files        : ' + JSON.stringify(out.read));
  console.log('   drilled  ' + JSON.stringify(out.drilled) + '   stack depth ' + out.depth);
  console.log('   after Back                 : depth ' + out.back.depth + '  ' + out.back.title);
  console.log('─'.repeat(60) + '\n');
  await page.waitForTimeout(300);
}
