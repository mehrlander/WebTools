// The reader's compare-with-the-clipboard, added 2026-08-19.
//
// It exists for the case the stage's positional compare cannot serve: ONE file
// staged, which is exactly where a single pasted arrival lands you. There is no
// second position to pair with, so before this the reader had no compare
// affordance at all and the only route was to go find the other side, stage it,
// and come back.
//
// Stages one document, opens the reader on it, and taps the new action with a
// stubbed clipboard behind it. Ends on the diff, which is the payoff.
//
//   npm run shot -- app/index.html --query "view=stage" \
//     --script tools/render/scenarios/stage-compare-paste.mjs --wait 4000

const DOC = `# Q3 Budget Note

The agency requests $4.2M in maintenance funding.
This covers 12 FTE and ongoing system costs.
The request is consistent with prior biennia.
No policy change is implied.
`;

const EDIT = `# Q3 Budget Note

The agency requests $4.2M in maintenance funding.
This covers 12.0 FTE and recurring system costs.
The request is consistent with prior biennia.
It carries no policy change.
Fund split: 70% state, 30% local.
`;

export default async function (page) {
  await page.waitForSelector('[x-data*="stager"]', { timeout: 15000 });

  // One file staged, reader open on it. What does the header offer?
  const before = await page.evaluate(async (doc) => {
    Alpine.store('browser').stage = [];
    window.StageIntake.take({ text: doc, name: 'q3-budget-note.md', size: doc.length });
    const data = Alpine.$data(document.querySelector('[x-data*="stager"]'));
    await data.view(data.items[0]);
    await new Promise(r => setTimeout(r, 700));
    return { staged: data.items.length, offered: data._pActions(0).map(a => a.title) };
  }, DOC);
  await page.waitForTimeout(300);

  // The gesture. io.js is what takeClipboard reads through; stubbing it is how
  // a headless run puts something on the clipboard at all.
  const after = await page.evaluate(async (edit) => {
    window.io = { pasteItems: async () => [{ kind: 'text', type: 'text/plain', text: edit, size: edit.length }] };
    const data = Alpine.$data(document.querySelector('[x-data*="stager"]'));
    await data.compareWithPaste();
    await new Promise(r => setTimeout(r, 1200));
    return {
      staged: data.items.length,
      landedAt: data.items.findIndex(it => it.text === edit),
      readingPosition: data.preview?.i,
      mode: data.preview?.mode,
      pair: [data.diffA, data.diffB],
      rows: data.diffRows?.length ?? null,
      stat: data.diffStat,
      // What is actually painted, so an empty deck cannot pass as a diff.
      drawn: document.querySelectorAll('.fixed .bg-success\\/10, .fixed .bg-error\\/10').length,
      offered: data._pActions(data.preview?.i ?? 0).map(a => a.title),
    };
  }, EDIT);
  await page.waitForTimeout(500);

  console.log('\n--- compare with the clipboard ---');
  console.log('  one file staged, reader open:');
  console.log('    offered: ' + JSON.stringify(before.offered));
  console.log('  after the tap:');
  for (const [k, v] of Object.entries(after)) console.log(`    ${k}: ${JSON.stringify(v)}`);
  console.log('');
}
