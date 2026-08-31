// Undo and redo over the patch cursor.
//
// UNDO IS FREE BECAUSE THE PATCH IS DECLARATIVE. What is on screen is
// apply(base, patch.slice(0, at)), so stepping back is decrementing a number
// and replaying: there is no inverse operation to write and none to get wrong,
// and the two implementations stay one rule. `at` is a cursor into the patch,
// not its length, so a new operation after an undo truncates the redo tail the
// way every editor does.
//
// What travels is the APPLIED prefix. An undone operation is not a judgment the
// reader stands behind, so it must not ride out in the patch or the commit
// message, which is the half a screenshot cannot show.
//
//   npm run shot -- pages/audit-render.html --width 390 --height 844 \
//     --script tools/render/scenarios/audit-undo.mjs

export default async function (page) {
  await page.waitForSelector('[x-ref="doc"] span[data-uid]');
  const step = (n) => page.evaluate(() => {
    const d = Alpine.$data(document.body);
    return { at: d.at, len: d.patch.length, units: d.units.length,
             undo: d.canUndo, redo: d.canRedo,
             bad: Standoff.check(d.so, d.a.text).length };
  });
  await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    const u = d.units[3];
    d.sel = { ...u, ref: d.srcRef(u) };
    d.push({ op: 'move', after: u.uid, to: u.end + 6 });
    d.push({ op: 'relabel', uid: u.uid, label: d.so.vocabulary.find(v => v.label !== u.label).label });
    d.push({ op: 'note', uid: u.uid, text: 'three' });
  });
  await page.waitForTimeout(300);
  console.log('AFTER 3 ' + JSON.stringify(await step()));
  const lab3 = await page.evaluate(() => Alpine.$data(document.body).units[3].label);

  await page.evaluate(() => { const d = Alpine.$data(document.body); d.undo(); d.undo(); });
  await page.waitForTimeout(300);
  console.log('UNDO x2 ' + JSON.stringify(await step()));
  const noted = await page.evaluate(() => 'note' in Alpine.$data(document.body).units[3]);
  const lab1 = await page.evaluate(() => Alpine.$data(document.body).units[3].label);
  console.log('note gone: ' + !noted + ' | label back: ' + (lab1 !== lab3));
  console.log('PATCH SENT ' + await page.evaluate(() => Alpine.$data(document.body).patchJson.replace(/\s+/g, ' ')));

  await page.evaluate(() => Alpine.$data(document.body).redo());
  await page.waitForTimeout(200);
  console.log('REDO ' + JSON.stringify(await step()));

  // A new operation after an undo truncates the tail.
  await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    d.push({ op: 'note', uid: d.units[3].uid, text: 'branching' });
  });
  await page.waitForTimeout(200);
  console.log('BRANCH ' + JSON.stringify(await step()));
}
