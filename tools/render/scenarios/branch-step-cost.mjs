// What a step through the branch takeover actually costs, measured in a real
// browser rather than argued from the code.
//
//   DETAIL=1 node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/branch-step-cost.mjs \
//     --out tools/.preview/branch-step-cost.png --width 390 --height 844 --full
//
// jsdom can hold the message contract (tools/test/branch-brief-embedded.test.mjs
// and the takeover cases in estate-open-branches) but not the two facts that
// made the swipe feel slow, because both are properties of a real frame:
//
//   1. whether a step RELOADS the document. Under the old src swap it did, and
//      the whole library booted again before the first API call went out. The
//      probe is object identity: a `contentWindow` that survives a step is a
//      frame that was talked to, not replaced. Patches applied to the frame's
//      GH before the step also survive, which is the same fact from the other
//      side and is why this scenario can measure anything at all.
//
//   2. how many round trips a step spends. The counters below are per branch,
//      so the numbers say plainly which reads are on the critical path: the
//      repo meta (gone, the shell passes &base=), the compare and the PR list
//      (together now, not one after the other), and the content registry (once
//      per ref, and started beside the compare rather than after it).
//
// It also drives the case the header could not show before: a branch whose PR
// has MERGED. The activity crawl asks GitHub for open pull requests only, so
// the shell's own row has no number for it; the number in the shot came up
// through the frame's report.
import openList from './estate-open.mjs';

const BODY = `Stepping through branches is a message now, not a document load.

**Notes / Risk:** the frame is opened once per takeover and asked for each branch.`;

// Keyed to the branches estate-open seeds, because the row the header question
// turns on has to be a real one: `claude/pdf-ink-alignment` is in the survey
// with no entry in `openPRs`, which is exactly the shape a branch takes once
// its PR has merged. The shell's row therefore knows of no PR for it, and the
// number in the shot can only have come up through the frame.
const cmp = (files, over = {}) => ({
  ahead_by: 3, behind_by: 0, total_commits: 1,
  commits: [{ sha: 'a1b2c3d4', commit: { message: 'work', committer: { date: '2026-08-06T09:00:00Z' } } }],
  files: files.map(f => ({ filename: f, status: 'modified', additions: 12, deletions: 3, patch: '@@ -1 +1 @@' })),
  ...over,
});

const FIXTURE = {
  'claude/show-repo-activity-filters': {
    compare: cmp(['lib/alpineComponents/estate.js', 'pages/branch.html']),
    pulls: [{ number: 298, title: 'Open view: repo chips, lifespan, GitHub menu',
              state: 'open', draft: true, body: BODY, updated_at: '2026-08-06T09:00:00Z' }],
  },
  'claude/fab-render-toss': {
    compare: cmp(['lib/alpineComponents/fab.js']),
    pulls: [{ number: 296, title: 'Singleton fab with toss-render', state: 'open', draft: false,
              body: BODY, updated_at: '2026-08-03T09:00:00Z' }],
  },
  'claude/pdf-ink-alignment': {
    compare: cmp(['lib/kits/pdf.js']),
    // Merged, and therefore invisible to the crawl.
    pulls: [{ number: 401, title: 'Align ink strokes to the page box', state: 'closed',
              merged_at: '2026-08-01T09:00:00Z', body: BODY, updated_at: '2026-08-01T09:00:00Z' }],
  },
};

// Settled means the frame is showing the branch the SHELL is on, not merely
// that it is showing something. Waiting on `brief && !loading` alone passes
// instantly on the branch before the step, which is the trap that made the
// first run of this scenario report four steps the frame never took.
const settled = (page, branch) => page.waitForFunction((want) => {
  const fr = document.querySelector('iframe[src*="branch.html"]');
  const el = fr && fr.contentDocument && fr.contentDocument.getElementById('mount');
  const d = el && fr.contentWindow.Alpine.$data(el);
  return !!(d && d.brief && !d.loading && (!want || d.branch === want));
}, branch || null, { timeout: 25000 });

export default async function (page, ctx) {
  await openList(page, ctx);   // DETAIL=1 opens the takeover on the first row

  // One repo, every scope, so the sequence is deterministic and reaches the
  // landed-and-merged rows the default scope hides.
  await page.evaluate(() => {
    const es = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
    es.closeDetail();
    es.branchScope = 'all';
    es.openRepoFilter = 'me/web-tools';
    es.openBranchDetail(es.openRows[0]);
  });
  await page.waitForTimeout(900);

  // Instrument the frame. Counting inside GH.prototype rather than at the
  // network is deliberate: these are the calls the page CHOOSES to make, which
  // is the thing under measurement, and the sandbox would refuse them anyway.
  const booted = await page.evaluate(async (fx) => {
    const fr = document.querySelector('iframe[src*="branch.html"]');
    if (!fr) return 'no takeover frame';
    const w = fr.contentWindow;
    for (let i = 0; i < 150 && !(w.GH && w.Alpine && w.BranchBrief); i++) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (!w.GH || !w.BranchBrief) return 'the embedded page never booted';

    window.__calls = [];
    const at = (ref) => fx[ref] || fx[Object.keys(fx)[0]];
    w.GH.prototype.compare = async function (base, head) {
      window.__calls.push('compare ' + head);
      await new Promise(r => setTimeout(r, 120));       // a plausible round trip
      return at(head).compare;
    };
    w.GH.prototype.req = async function (p) {
      if (p === '') { window.__calls.push('meta ' + this.repo); return { default_branch: 'main' }; }
      const m = /head=([^&]*)/.exec(p || '');
      const head = m ? decodeURIComponent(m[1]).split(':')[1] : '?';
      window.__calls.push('pulls ' + head);
      await new Promise(r => setTimeout(r, 120));
      return at(head).pulls;
    };
    w.GH.prototype.get = async function (p) {
      window.__calls.push('get ' + this.ref + ':' + p);
      await new Promise(r => setTimeout(r, 120));
      throw Object.assign(new Error('404'), { status: 404 });
    };
    // Re-open the branch now that GH answers, since the first load ran against
    // a sandbox that refuses GitHub.
    const d = w.Alpine.$data(w.document.getElementById('mount'));
    d.brief = null;
    w.BranchBrief.forget();
    d.forgetRegistry();
    await d.load();
    return true;
  }, FIXTURE);
  if (booted !== true) throw new Error('branch-step-cost: ' + booted);
  await settled(page);

  const report = { steps: [] };

  // The identity probe, taken before anything moves.
  await page.evaluate(() => {
    const fr = document.querySelector('iframe[src*="branch.html"]');
    window.__win0 = fr.contentWindow;
    window.__patched0 = fr.contentWindow.GH.prototype.compare;
  });

  for (const dir of [1, 1, -1, 1]) {
    const before = Date.now();
    const want = await page.evaluate((d) => {
      window.__calls = [];
      const es = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
      es.detailStep(d);
      return es.detailRow.name;
    }, dir);
    await settled(page, want);
    const row = await page.evaluate(() => {
      const fr = document.querySelector('iframe[src*="branch.html"]');
      const w = fr.contentWindow;
      const d = w.Alpine.$data(w.document.getElementById('mount'));
      const es = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
      return {
        branch: d.branch,
        files: d.brief.files.length,
        calls: window.__calls.slice(),
        sameWindow: w === window.__win0,
        stillPatched: w.GH.prototype.compare === window.__patched0,
        headerPr: es.detailPrNumber,
        headerPrState: es.detailPrState,
        rowPr: es.detailRow?.pr?.number || 0,
      };
    });
    report.steps.push({ ...row, ms: Date.now() - before });
  }

  console.log('\n── branch step cost ' + '─'.repeat(40));
  for (const s of report.steps) {
    console.log(`  ${s.branch}`);
    console.log(`    reloaded document : ${s.sameWindow ? 'no' : 'YES'}  (patched GH survived: ${s.stillPatched})`);
    console.log(`    API calls         : ${s.calls.length ? s.calls.join(', ') : '(none: already read)'}`);
    console.log(`    settled in        : ${s.ms} ms`);
    console.log(`    header PR         : ${s.headerPr || '(none)'} ${s.headerPrState}` +
                `  [row knew: ${s.rowPr || 'nothing'}]`);
  }
  console.log('─'.repeat(60) + '\n');

  if (report.steps.some(s => !s.sameWindow)) throw new Error('branch-step-cost: a step reloaded the frame');
  await page.waitForTimeout(500);
}
