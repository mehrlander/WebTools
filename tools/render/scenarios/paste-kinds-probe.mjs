// Measure what the CURRENT paste intake makes of four transform-shaped
// payloads: the workbench's own {fn,data} bundle, a CSV, a JSON array of row
// objects, and a bare `rows => rows` function. Reports the staged name and the
// mode the stage's preview would open it in, which together are the whole of
// what the intake decides today.
//
// A probe, not a shot: the console line is the output, the PNG incidental. It
// asserts nothing, so it is a scenario rather than a test; what it records is
// the intake's behavior AS OF 2026-08-18, which is under discussion. Measured
// then: a bundle and a JSON row array both name .json and open as a tree, a
// CSV and a rows function both fall through to .txt, and only a TSV reaches
// the table. The naming IS the routing, since READ_MODE keys on extension
// alone, so any change to what these become is a change to nameForText.
//
//   npm run shot -- app/index.html --script tools/render/scenarios/paste-kinds-probe.mjs

export default async function (page) {
  const out = await page.evaluate(async () => {
    const BUNDLE = JSON.stringify({
      fn: 'H4sIAAAAAAAA', fn_tidy: 'H4sIAAAAAAAB',
      data: 'H4sIAAAAAAAC', src: 'H4sIAAAAAAAD',
      meta: { combine: true, tagCol: '' },
    });
    const CSV = 'code,label,jul,aug\nAA,Salaries,186927,186927\nBA,Social Security,9448,9448';
    const ROWS = JSON.stringify([
      { code: 'AA', label: 'Salaries', jul: 186927 },
      { code: 'BA', label: 'Social Security', jul: 9448 },
    ]);
    const FN = 'rows => rows.filter(r => r.jul > 10000).map(r => ({ ...r, big: true }))';
    const TSV = 'code\tlabel\tjul\nAA\tSalaries\t186927\nBA\tSocial Security\t9448';

    const results = [];
    for (const [kind, text] of [['bundle', BUNDLE], ['csv', CSV], ['json rows', ROWS],
                                ['rows fn', FN], ['tsv (control)', TSV]]) {
      Alpine.store('browser').stage = [];
      const added = window.StageIntake.take({ text, size: text.length });
      const it = added[0] || {};
      const ext = String(it.name || '').split('.').pop();
      results.push({
        kind,
        name: it.name || '(nothing staged)',
        // The mode the stage preview would open it in: extension-keyed, so the
        // name the intake chose IS the routing decision.
        mode: window.ViewRegistry.READ_MODE({ ext, content: it.text || '' }),
      });
    }
    Alpine.store('browser').stage = [];
    return results;
  });
  console.log('\n--- what a paste becomes today ---');
  for (const r of out) console.log(`  ${r.kind.padEnd(14)} -> ${r.name.padEnd(26)} opens as: ${r.mode}`);
  console.log('');
}
