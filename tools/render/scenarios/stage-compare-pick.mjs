// The reader's compare picker, added 2026-08-19.
//
// The stage's pair used to be positional: side A slid to `min(i, n-2)` and side
// B was always the next file along, so only ADJACENT pairs could be expressed
// and "the first against the last" had no way to be said. A is now the file you
// are on and B is a pick, defaulting to the neighbour.
//
// Stages four documents, opens the reader on the FIRST, and picks the LAST,
// which is the pair the old rule could not reach. Ends on the open picker over
// that comparison, so the shot shows both halves at once.
//
//   npm run shot -- app/index.html --query "view=stage" \
//     --script tools/render/scenarios/stage-compare-pick.mjs --wait 4000

const DOCS = [
  ['q3-note-v1.md', `# Q3 Budget Note

The agency requests $4.2M in maintenance funding.
This covers 12 FTE and ongoing system costs.
The request is consistent with prior biennia.
No policy change is implied.
`],
  ['reviewer-comments.md', `# Reviewer comments

Check the FTE figure against the staffing table.
Ask whether the fund split is supported.
`],
  ['q3-note-v2.md', `# Q3 Budget Note

The agency requests $4.2M in maintenance funding.
This covers 12 FTE and ongoing system costs.
The request is consistent with prior biennia.
No policy change is implied.
Fund split: 70% state, 30% local.
`],
  ['q3-note-final.md', `# Q3 Budget Note

The agency requests $4.2M in maintenance funding.
This covers 12.0 FTE and recurring system costs.
The request is consistent with prior biennia.
It carries no policy change.
Fund split: 70% state, 30% local.
`],
];

export default async function (page) {
  await page.waitForSelector('[x-data*="stager"]', { timeout: 15000 });

  const opened = await page.evaluate(async (docs) => {
    Alpine.store('browser').stage = [];
    for (const [name, text] of docs) window.StageIntake.take({ text, name, size: text.length });
    const data = Alpine.$data(document.querySelector('[x-data*="stager"]'));
    await data.view(data.items[0]);
    await new Promise(r => setTimeout(r, 500));
    await data.togglePreviewDiff();
    await new Promise(r => setTimeout(r, 900));
    return { defaultPair: [data.diffA, data.diffB], label: data.previewPairLabel() };
  }, DOCS);
  await page.waitForTimeout(300);

  const picked = await page.evaluate(async () => {
    const data = Alpine.$data(document.querySelector('[x-data*="stager"]'));
    const last = data.items[data.items.length - 1];
    data.compareWith(data.itemKey(last));
    await new Promise(r => setTimeout(r, 900));
    // Reopen the list so the shot carries the picker and the diff together.
    data.compareOpen = true;
    data._pRebuild();
    await new Promise(r => setTimeout(r, 700));
    return {
      pair: [data.diffA, data.diffB],
      label: data.previewPairLabel(),
      stat: data.diffStat,
      options: data.compareOptions().map(o => o.label + ' · ' + o.note),
      // What is painted, so an empty list cannot pass as a picker.
      rowsDrawn: document.querySelectorAll('.fixed .bg-success\\/10, .fixed .bg-error\\/10').length,
    };
  });
  await page.waitForTimeout(500);

  console.log('\n--- the compare picker ---');
  console.log('  opened on the first file:');
  console.log('    default pair: ' + JSON.stringify(opened.defaultPair) + '  ' + opened.label);
  console.log('  after picking the last:');
  for (const [k, v] of Object.entries(picked)) console.log(`    ${k}: ${JSON.stringify(v)}`);
  console.log('');
}
