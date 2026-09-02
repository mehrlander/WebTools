// screenshot.mjs interaction scenario: the verdict lens, with a decision on it.
//
//   node tools/render/screenshot.mjs pages/audit-render.html \
//     --script tools/render/scenarios/audit-verdict.mjs \
//     --out tools/.preview/audit-verdict.png
//
// What the pixels have to prove: switching the lens repaints the SAME document
// against the other question, and a DROP is struck through. The stored run is
// almost all KEEP, so the lens on its own photographs a grey page and proves
// nothing; this decides two units first, through the same `verdict` operation a
// tap on the panel's select would push.
//
// It picks its own targets by position rather than by uid, so it does not go
// stale the first time the grain moves under it.
//
// `stop=label` decides the same two units and leaves the LABEL lens on, which
// is the other half of the claim: a DROP is struck through under either lens,
// because hiding the destructive verdict behind a switch would let a reader
// browse labels over text the pass has already condemned.
export default async function (page) {
  await page.waitForSelector('[x-ref="doc"] span');
  await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    const prose = d.units.filter(u => u.kind === 'sent');
    d.push({ op: 'verdict', uid: prose[2].uid, verdict: 'DROP' });
    d.push({ op: 'verdict', uid: prose[5].uid, verdict: 'MOVE' });
    d.sel = null;
    d.lens = new URL(location.href).searchParams.get('stop') === 'label' ? 'label' : 'verdict';
    d.paint();
  });
  await page.waitForTimeout(600);
}
