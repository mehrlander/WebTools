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
      + '       openFileCard(row, cls, ev){';
    const mk = (path, status, additions, deletions) =>
      ({ filename: path, status, additions, deletions, patch: patch(path) });
    window.GH.prototype.compare = async () => ({
      ahead_by: 6, behind_by: 0, total_commits: 6, commits: [],
      files: [
        mk('docs/branch-overlay.md', 'added', 96, 0),
        mk('lib/kits/file-card.js', 'added', 212, 0),
        mk('lib/alpineComponents/estate.js', 'modified', 148, 41),
        mk('lib/kits/branch-survey.js', 'modified', 74, 12),
        mk('docs/show-repo.md', 'modified', 43, 13),
        mk('pages/show-repo/show-repo.html', 'modified', 9, 4),
        mk('tools/test/estate-open-branches.test.mjs', 'modified', 38, 6),
        mk('docs/docs.json', 'modified', 2, 2),
        mk('lib/kits/legacy-shape.js', 'removed', 0, 130),
      ],
    });
  });

  const cls = ['changed', 'missing'].includes(process.env.CLS) ? process.env.CLS : 'added';
  const sel = { added: 'button[title^="The files this branch adds"]',
                changed: 'button[title^="The files this branch changed"]',
                // :visible matters: x-show leaves a hidden button on every row
                // that has nothing missing, and the first match would be one.
                missing: 'button:has-text("missing"):visible' }[cls];
  await page.locator(sel).first().click();
  await page.waitForTimeout(1200);      // the stubbed compare, then the render

  // One row opened in place, which is the diff the compare already carried.
  if (process.env.PATCH) {
    await page.evaluate((path) => {
      const d = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
      d.toggleFileCardPatch(path);
    }, process.env.PATCH);
    await page.waitForTimeout(400);
  }

  const out = await page.evaluate(() => {
    const d = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
    return { cls: d.fileCard?.cls, count: d.fileCardSummary?.count, lines: d.fileCardSummary?.lines,
             exts: (d.fileCard?.shape.exts || []).map(p => p.join(' ')).join(', '),
             dirs: (d.fileCard?.shape.dirs || []).map(p => p.join(' ')).join(', '),
             listed: d.fileCardList.length, open: d.fileCardOpen || '(none)',
             loading: !!d.fileCardMine?.loading, error: d.fileCardMine?.error || '' };
  });
  console.log('\n── the file card ' + '─'.repeat(43));
  console.log('   class / count : ' + out.cls + ' / ' + out.count);
  console.log('   lines         : ' + out.lines);
  console.log('   extensions    : ' + out.exts);
  console.log('   folders       : ' + out.dirs);
  console.log('   files listed  : ' + out.listed + (out.loading ? ' (still reading)' : ''));
  console.log('   opened in place: ' + out.open);
  if (out.error) console.log('   error         : ' + out.error);
  console.log('─'.repeat(60) + '\n');
  await page.waitForTimeout(200);
}
