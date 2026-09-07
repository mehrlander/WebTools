// The file deck's slide is the DOCUMENT; its controls are in the deck header.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/deck-chrome.mjs \
//     --out tools/.preview/deck-chrome.png --width 390 --height 844
//
// A slide used to open with a row of chrome over the file: the path (already
// in the header, truncated a second way), three layout icons, a copy button, a
// github menu, and a door to the sidebar on the header beside them. All of it
// is about the file the header is already naming, so it sits beside the name
// now and the slide is the document. Asked for 2026-09-07.
//
// jsdom holds the halves: that a hosted card draws no row (file-review-card)
// and that the deck asks the card for its controls (file-deck-chrome). What it
// cannot hold is the two meeting, which needs a real Alpine tree in a real
// header with a real width:
//
//   - the slide carries none of the card's OWN controls, at any tab (a
//     rendered document's section control is the content's, not the card's,
//     and rightly stays);
//   - the header carries the file's, and they fit a 390px row beside a title;
//   - tapping a layout in the HEADER moves the card, and the header's own
//     active mark follows, because the card tells it to;
//   - a swipe re-points the header at the file it landed on;
//   - the github menu opens from the header and lands on screen.
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
      commits: [{ sha: 'a1', commit: { message: head, committer: { date: '2026-09-07T09:00:00Z' } } }],
      files: files.map((f, i) => ({ filename: f, status: 'modified', additions: 12 + i,
                                    deletions: 3, patch })),
    });
    const origReq = window.GH.prototype.req;
    window.GH.prototype.req = async function (p) {
      if (p === '') return { default_branch: 'main' };
      if (/^pulls\?/.test(p)) return [{ number: 411, title: 'A guide', state: 'open', draft: true,
        body: 'Judgment about the branch.', updated_at: '2026-09-07T09:00:00Z' }];
      return origReq.call(this, p);
    };
    // Both sides answer and differ by ref, which is what gives the card a
    // comparison to lay out: with the two sides identical there is nothing to
    // choose between and the layouts are correctly absent.
    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (p) {
      if (!files.includes(p)) return origGet.call(this, p);
      return { text: '# Note\n\nbody of ' + p + ' at ' + (this.ref || '?'), size: 12, sha: 'deadbeef' };
    };

    const es = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
    es.openBranchDetail(es.openRows[0]);
    for (let i = 0; i < 120 && !es._deck; i++) await wait(50);
    await wait(1200);

    const branchDeck = window.swipeDeck.top();
    const slide = branchDeck.deck.track.children[branchDeck.deck.active()];
    const bb = window.Alpine.$data(slide.querySelector('[x-data^="branchBrief"]'));
    bb.pane = 'files';
    await bb.ensureCompare();
    await wait(400);
    await bb.openFileDeck(0);
    await wait(1400);

    const look = () => {
      const d = window.swipeDeck.top();
      const hdr = d.el.querySelector('.sd-header');
      const sl = d.deck.track.children[d.deck.active()];
      const card = sl.querySelector('[x-data^="fileReview"]');
      const cd = card && window.Alpine.$data(card);
      const hr = hdr.getBoundingClientRect();
      const btns = [...hdr.querySelectorAll('button')].filter(b => b.offsetParent !== null);
      return {
        at: d.deck.active(), title: hdr.querySelector('h1')?.textContent || '',
        tab: cd && cd.tab,
        header: btns.map(b => (b.title || '') + (b.className.includes('btn-active') ? ' *' : '')),
        headerFits: hdr.scrollWidth <= Math.ceil(hr.width),
        // VISIBLE, not merely present: x-show leaves a row in the DOM.
        onTheSlide: card ? [...card.querySelectorAll('button,summary')]
          .filter(e => e.offsetParent !== null)
          .map(e => e.tagName + ':' + (e.title || e.className.slice(0, 30) || e.textContent.trim().slice(0, 20))) : null,
      };
    };
    const tap = (re) => {
      const hdr = window.swipeDeck.top().el.querySelector('.sd-header');
      [...hdr.querySelectorAll('button')].find(b => re.test(b.title || ''))?.click();
    };

    const opened = look();
    tap(/side by side/); await wait(900);
    const tapped = look();
    tap(/^Read$/); await wait(900);
    window.swipeDeck.top().deck.go(1); await wait(1400);
    const swiped = look();

    tap(/GitHub/i); await wait(400);
    const m = document.querySelector('.sd-hdr-menu');
    const menu = !m ? null : {
      rows: [...m.querySelectorAll('a,button')].map(a => a.textContent.trim()),
      onScreen: m.getBoundingClientRect().right <= innerWidth + 1,
    };
    if (m) m.remove();
    window.swipeDeck.top().deck.go(0); await wait(900);
    return { opened, tapped, swiped, menu };
  });

  console.log('\n── the slide is the document ' + '─'.repeat(32));
  console.log('   opened  : ' + JSON.stringify(out.opened));
  console.log('   tapped  : ' + JSON.stringify(out.tapped));
  console.log('   swiped  : ' + JSON.stringify(out.swiped));
  console.log('   gh menu : ' + JSON.stringify(out.menu));
  console.log('─'.repeat(60) + '\n');
  await page.waitForTimeout(300);
}
