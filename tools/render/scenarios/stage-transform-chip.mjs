// Paste a workbench bundle's sibling shapes onto the Stage and open one in the
// transform workbench, which is the door added 2026-08-18: the tool has shipped
// inside this app since the pre-build began globbing lib/alpineComponents, and
// until now nothing mounted it.
//
// Stages three transform-shaped items (a CSV, a JSON row array, a rows
// function) so the chip row shows all three kinds, then opens the CSV, which is
// the one whose rows the workbench can actually run.
//
//   npm run shot -- app/index.html --query "view=stage" \
//     --script tools/render/scenarios/stage-transform-chip.mjs --wait 4000

export default async function (page) {
  await page.waitForSelector('[x-data*="stager"]', { timeout: 15000 });

  const staged = await page.evaluate(() => {
    const CSV = 'code,label,jul,aug\nAA,Salaries,186927,186927\n'
              + 'BA,Social Security,9448,9448\nBB,Retirement,14407,14407';
    const ROWS = JSON.stringify([{ code: 'AA', jul: 186927 }, { code: 'BA', jul: 9448 }]);
    const FN = 'rows => rows.filter(r => r.jul > 10000)';
    Alpine.store('browser').stage = [];
    for (const t of [CSV, ROWS, FN]) window.StageIntake.take({ text: t, size: t.length });
    const el = document.querySelector('[x-data*="stager"]');
    return Alpine.$data(el).transformables.map(t => ({ name: t.item.name, kind: t.kind }));
  });
  await page.waitForTimeout(400);

  const opened = await page.evaluate(async () => {
    const data = Alpine.$data(document.querySelector('[x-data*="stager"]'));
    const csv = data.localItems.find(it => /\.csv$/.test(it.name));
    await data.openTransform(csv);
    await new Promise(r => setTimeout(r, 1500));
    const wb = document.querySelector('.tf-root')?.__workbench;
    return {
      open: !!data._tfDeck,
      mounted: !!wb,
      // What the workbench actually holds: the parsed rows, and the columns it
      // read off them. An empty set here would mean the door opened onto nothing.
      rows: wb?.raw?.length ?? null,
      cols: wb?.raw?.[0] ? Object.keys(wb.raw[0]) : null,
      ran: wb?.ran ?? null,
      // The pane the tool actually drew. An empty table with a full chrome
      // around it is the failure this scenario exists to catch: the render
      // hook returns silently when Tabulator is missing.
      tableRows: document.querySelectorAll('#tf-tab-target .tabulator-row').length,
    };
  });

  console.log('\n--- the transform chip ---');
  console.log('  recognized: ' + JSON.stringify(staged));
  console.log('  opened:     ' + JSON.stringify(opened));
  console.log('');
}
