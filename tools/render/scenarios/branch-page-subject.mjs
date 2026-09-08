// The branch page saying WHICH document is being read, and the sidebar hearing it.
//
//   npm run shot -- pages/branch.html \
//     --hash 'gh=mehrlander/web-tools@claude/example&base=main' \
//     --script tools/render/scenarios/branch-page-subject.mjs --width 430 --height 780
//
// The strip holds several documents and which one is showing is chosen inside
// the page, so nothing above it can derive that: the sidebar builds its layer
// strip by walking live frames, and a markdown panel is a div in this document
// rather than a frame. The page announces on the subject channel instead, the
// one the file deck already speaks, with route 'deck' for an in-document
// subject.
//
// jsdom holds the announcing half (branch-brief-subject), and cannot hold the
// half this exists for: that a real fab, mounted by gh-boot on this real page,
// ADOPTS the announcement and draws its compare bar on it. The bar is gated on
// `subjectBase`, and before this landed the page announced nothing while
// mounting up to three reading cards that each subscribe to the pair the bar
// publishes. Listeners wired, control hidden.
//
// What it reports, in order: what was announced, what the fab made of it, and
// whether the bar is actually on screen at a phone's drawer width rather than
// merely present in the tree.
export default async function (page) {
  await page.waitForFunction(() => {
    const el = document.getElementById('mount');
    return el && window.Alpine && window.Alpine.$data(el) && !window.Alpine.$data(el).loading;
  }, { timeout: 30000 });

  const out = await page.evaluate(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const patch = '@@ -1,2 +1,3 @@\n a\n-b\n+c\n';
    // Two reviewable documents and one file that stays in the list, so the
    // strip has a position to be in and moving it is a real move.
    const docs = ['docs/SNAGS.md', 'docs/loader.md'];
    const all = [...docs, 'lib/kits/branch-status.js'];

    window.GH.prototype.compare = async () => ({
      ahead_by: 3, behind_by: 0, total_commits: 3,
      commits: [{ sha: 'aaa1', commit: { message: 'Announce the document',
                                         committer: { date: '2026-09-08T09:00:00Z' } } }],
      files: all.map(f => ({ filename: f, status: 'modified', additions: 12, deletions: 3, patch })),
    });
    const origReq = window.GH.prototype.req;
    window.GH.prototype.req = async function (p) {
      if (/^git\/trees\//.test(p)) return { truncated: false, tree: all.map((f, i) => ({ path: f, type: 'blob', sha: 's' + i })) };
      if (/^pulls\?/.test(p)) return [];
      return origReq.call(this, p);
    };
    // Both sides answer and differ by ref, so a card has a comparison to make.
    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (p) {
      if (!all.includes(p)) return origGet.call(this, p);
      return { text: '# ' + p + '\n\nbody at ' + (this.ref || '?'), size: 24, sha: 'deadbeef' };
    };

    window.BranchBrief.forget();
    const d = window.Alpine.$data(document.getElementById('mount'));
    await d.load();
    await wait(2000);

    const announced = () => {
      const s = window.__tossSubject;
      return s ? { repo: s.repo, ref: s.ref, path: s.path, route: s.route, base: s.base } : null;
    };
    const first = announced();

    // The fab, mounted by gh-boot on this page like any other. It adopts on the
    // toss-subject event the channel fires, so by here it has already heard.
    const fabEl = document.querySelector('[x-data^="fab"]');
    const f = fabEl && window.Alpine.$data(fabEl);
    const adopted = f ? { path: f.path, ref: f.ref, route: f.subjectRoute,
                          base: f.subjectBase, baseName: f.subjectBaseName,
                          via: f.subjectVia ? f.subjectVia.path : null,
                          liveTwin: f.liveTwin } : null;

    // Which of the page's cards are listening for the answer this bar
    // publishes. This is the count that was hidden behind a hidden control.
    const listening = [...document.querySelectorAll('[x-data^="fileReview"]')]
      .map(el => window.Alpine.$data(el)).filter(c => c.read).length;

    if (f) { f.open = true; f.activeTab = 'render'; }
    await wait(700);

    // THE BAR BY BOUNDING BOX, because "the drawer has no compare bar" and "it
    // is drawn off the edge of a phone's drawer" look identical in a crop.
    const box = (el) => {
      const r = el?.getBoundingClientRect?.();
      if (!r || !r.width || !r.height) return 'absent';
      return Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height);
    };
    const barEl = [...document.querySelectorAll('.ph-git-diff')]
      .map(i => i.closest('div.relative'))
      .find(el => el && /\bvs\b/.test(el.textContent || ''));
    const bar = { box: box(barEl), says: (barEl?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) };

    // And it follows the strip: step to the second document and the drawer
    // re-points, without the reader touching the drawer.
    d.goRev(1);
    await wait(500);
    const second = announced();
    const afterPath = f ? f.path : null;
    d.goRev(0);
    await wait(400);

    return { docs: d.reviewableFiles.map(x => x.path), listening,
             first, second, afterPath, adopted, bar,
             width: document.documentElement.clientWidth };
  });

  const p = (k, v) => console.log('   ' + k.padEnd(18) + ': ' + v);
  console.log('\n── the branch page announcing its document ' + '─'.repeat(18));
  p('strip holds', out.docs.join(', '));
  p('cards listening', out.listening + '   (each subscribes to web-tools:compare-ref)');
  p('announced', out.first ? out.first.repo + '@' + out.first.ref + ':' + out.first.path
      + '  route=' + out.first.route + ' base=' + out.first.base : '(nothing)');
  p('fab adopted', out.adopted ? out.adopted.path + '  route=' + out.adopted.route
      + ' base=' + out.adopted.base + ' via=' + out.adopted.via
      + ' liveTwin=' + out.adopted.liveTwin : '(no fab)');
  p('compare bar', out.bar.box + '   (viewport ' + out.width + 'px)');
  p('  it says', out.bar.says || '(nothing)');
  p('after goRev(1)', (out.second ? out.second.path : '(nothing)') + '  fab now at ' + out.afterPath);
  console.log('─'.repeat(60) + '\n');
  await page.waitForTimeout(300);
}
