// The file card: one of a branch row's two file pairs, opened.
//
//   node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/branch-file-card.mjs \
//     --out tools/.preview/file-card.png
//
// CLS=changed or CLS=missing opens another pair; the missing one needs
// SCOPE=stranded, since only a surveyed row has a verdict. PATCH=<path>
// expands that file's diff in place.
//
// The card paints its first two bands from the crawl's own digest and then
// fetches the compare for the file names, so the compare is stubbed here: the
// sandbox has no token, and what the shot is for is the card's three bands
// together, not the network.
import openList from '/home/user/web-tools/tools/render/scenarios/estate-open.mjs';

export default async function (page, ctx) {
  await openList(page, ctx);
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    // The compare embeds a unified diff beside every file, which is what lets a
    // card row open without asking anybody, so the stub carries one too.
    const patch = (name) => '@@ -1204,7 +1204,12 @@ ' + name + '\n'
      + ' const rows = []\n'
      + '-      fileCount(row){ return row.nFiles ?? null },\n'
      + '+      fileStats(row){\n'
      + '+        if (row.stats?.n) return row.stats\n'
      + '+        return null\n'
      + '+      },\n'
      + ' \n'
      + '       openRowCard(row, cls, ev){';
    const mk = (path, status, additions, deletions) =>
      ({ filename: path, status, additions, deletions, patch: patch(path) });
    // Main's newest commits, as the crawl stores them: the behind card reads
    // these and nothing else, which is the point of the card being free.
    const d = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
    d.activity['me/web-tools'].recentCommits = [
      { sha: 'f1a2b3c4d5e6', msg: 'Stage intake: one tray per workspace', date: '2026-08-19T09:10:00Z', author: 'mehrlander' },
      { sha: 'a9b8c7d6e5f4', msg: 'Per-repo crawl progress on the State view', date: '2026-08-18T17:40:00Z', author: 'mehrlander' },
      { sha: '112233445566', msg: 'Revise the HTML style guide for clarity', date: '2026-08-18T11:02:00Z', author: 'mehrlander' },
      { sha: '778899aabbcc', msg: 'Record the carrier-stub rule the migration earned', date: '2026-08-17T20:15:00Z', author: 'mehrlander' },
      { sha: 'ddeeff001122', msg: 'concept-lab: note the sibling that ran the same problem', date: '2026-08-17T08:30:00Z', author: 'mehrlander' },
    ];
    window.GH.prototype.compare = async () => ({
      // ahead_by matches the commit list: GitHub keeps them in step below its
      // 250-commit cap, and a stub that did not would teach the shot a lie.
      ahead_by: 3, behind_by: 3, total_commits: 3,
      merge_base_commit: { sha: '778899aabbcc' },
      commits: [
        { sha: 'aa11bb22cc33', commit: { message: 'Name the third class in the branch verdict\n\nbody',
          committer: { date: '2026-08-19T10:00:00Z' }, author: { name: 'mehrlander' } } },
        { sha: 'dd44ee55ff66', commit: { message: 'Straighten the branch row: session left, files as a route',
          committer: { date: '2026-08-19T11:30:00Z' }, author: { name: 'mehrlander' } } },
        { sha: '99aa88bb77cc', commit: { message: 'A file card on each pair',
          committer: { date: '2026-08-19T12:45:00Z' }, author: { name: 'mehrlander' } } },
      ],
      files: [
        mk('docs/branch-overlay.md', 'added', 96, 0),
        mk('lib/kits/file-card.js', 'added', 212, 0),
        mk('lib/alpineComponents/estate.js', 'modified', 148, 41),
        mk('lib/kits/branch-survey.js', 'modified', 74, 12),
        mk('docs/show-repo.md', 'modified', 43, 13),
        mk('pages/show-repo/show-repo.html', 'modified', 9, 4),
        mk('tools/test/estate-open-branches.test.mjs', 'modified', 38, 6),
        mk('docs/docs.json', 'modified', 2, 2),
        // Past what the crawl stored, deliberately: a live read is newer than
        // the cache, so the card opens over a row it disagrees with. That gap
        // is the case this scenario exists to show being closed.
        mk('docs/harness.json', 'modified', 3, 1),
        mk('docs/tests.json', 'modified', 4, 1),
        mk('tools/render/scenarios/branch-file-card.mjs', 'added', 66, 0),
        mk('lib/kits/legacy-shape.js', 'removed', 0, 130),
      ],
    });
  });

  // What the crawl stored, read BEFORE the card runs: the card's own compare is
  // newer, and absorbing it should move these.
  const was = await page.evaluate(() => {
    const d = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
    const r = d.openRows[0];
    return { parts: JSON.parse(JSON.stringify(d.fileParts(r) || {})), ahead: r.ahead, behind: r.behind };
  });

  const cls = ['changed', 'missing', 'ahead', 'behind'].includes(process.env.CLS) ? process.env.CLS : 'added';
  const sel = { added: 'button[title^="The files this branch adds"]',
                changed: 'button[title^="The files this branch changed"]',
                ahead: 'button[title^="Commits this branch has"]',
                behind: 'button[title^="Commits main has"]',
                // :visible matters: x-show leaves a hidden button on every row
                // that has nothing missing, and the first match would be one.
                missing: 'button:has-text("missing"):visible' }[cls];
  await page.locator(sel).first().click();
  await page.waitForTimeout(1200);      // the stubbed compare, then the render

  // One row opened in place, which is the diff the compare already carried.
  if (process.env.PATCH) {
    await page.evaluate((path) => {
      const d = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
      d.toggleRowCardPatch(path);
    }, process.env.PATCH);
    await page.waitForTimeout(400);
  }

  const out = await page.evaluate(() => {
    const d = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
    return { cls: d.rowCard?.cls, count: d.rowCardSummary?.count, lines: d.rowCardSummary?.lines,
             exts: (d.rowCard?.shape?.exts || []).map(p => p.join(' ')).join(', '),
             dirs: (d.rowCard?.shape?.dirs || []).map(p => p.join(' ')).join(', '),
             listed: d.rowCardList.length, open: d.rowCardOpen || '(none)',
             kind: d.rowCard?.kind,
             commits: (d.rowCardCommits || []).map(x => x.sha.slice(0, 7)).join(', '),
             gap: d.rowCardCommitGap,
             loading: !!d.rowCardMine?.loading, error: d.rowCardMine?.error || '',
             parts: JSON.parse(JSON.stringify(d.fileParts(d.openRows[0]) || {})),
             ahead: d.openRows[0]?.ahead, behind: d.openRows[0]?.behind, fresh: d.freshCount,
             wrote: JSON.stringify(d.activity['me/web-tools']?.openPRs?.[0]?.stats || null)?.slice(0, 120),
             rowRepo: d.openRows[0]?.repo + '@' + d.openRows[0]?.name,
             rowStats: JSON.stringify(d.openRows[0]?.stats || null)?.slice(0, 120) };
  });
  console.log('\n── the file card ' + '─'.repeat(43));
  console.log('   class / count : ' + out.cls + ' / ' + out.count);
  console.log('   lines         : ' + out.lines);
  console.log('   extensions    : ' + out.exts);
  console.log('   folders       : ' + out.dirs);
  console.log('   files listed  : ' + out.listed + (out.loading ? ' (still reading)' : ''));
  console.log('   opened in place: ' + out.open);
  if (out.kind === 'commits')
    console.log('   commits        : ' + (out.commits || '(none)') + (out.gap ? ' +' + out.gap + ' past the cache' : ''));
  console.log('   row was        : ' + JSON.stringify(was.parts) + ' ahead ' + was.ahead + ' behind ' + was.behind);
  console.log('   wrote to PR    : ' + out.wrote);
  console.log('   row is         : ' + out.rowRepo + ' stats ' + out.rowStats);
  console.log('   row now        : ' + JSON.stringify(out.parts) + ' ahead ' + out.ahead + ' behind ' + out.behind
              + ' (' + out.fresh + ' re-read)');
  if (out.error) console.log('   error         : ' + out.error);
  console.log('─'.repeat(60) + '\n');
  await page.waitForTimeout(200);
}
