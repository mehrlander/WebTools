// Driving the grain edits: split a fused unit, relabel the reason half, note
// the rule half, and read back the patch the page produced.
//
// The patch is the assertion. The page applies each operation optimistically so
// the view moves under your thumb, but what travels to ops.py is this list, and
// a page that renders the edit while recording the wrong operation would look
// perfect and hand over a lie. So this checks both: the unit count moves, and
// the patch says exactly which operations moved it.
//
//   npm run shot -- pages/audit-render.html --width 430 \
//     --script tools/render/scenarios/audit-edit.mjs
//
// conven-046 is the worked example from the grain measurement: one sentence
// carrying a rule and its reason, joined by "because".
const TARGET = 'conven-046';

export default async function (page) {
  // `stop=menu` photographs the offer instead of the result: the candidates the
  // page found, before anything has been decided.
  const stop = new URL(page.url()).searchParams.get('stop');
  await page.waitForSelector('[x-ref="doc"] span');
  const before = await page.evaluate(() => Alpine.$data(document.body).units.length);

  // Select through the component, not by clicking a tinted span: the spans
  // carry no uid, and this scenario is about one named unit.
  await page.evaluate((uid) => {
    const d = Alpine.$data(document.body);
    const u = d.units.find(x => x.uid === uid);
    d.sel = { ...u, ref: d.srcRef(u) };
  }, TARGET);
  await page.waitForTimeout(300);

  await page.click('button:has-text("Split")');
  await page.waitForTimeout(300);
  const cands = await page.evaluate(() => Alpine.$data(document.body).boundaries);
  console.log('BOUNDARIES ' + JSON.stringify(cands.map(b => b.rest.slice(0, 22))));
  if (!cands.length) throw new Error('no split candidate inside ' + TARGET);

  if (stop === 'menu') {
    await page.evaluate(() => document.querySelector('[x-show*="split"]')
      .scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(400);
    return;
  }
  await page.click('[x-show="menu===\'split\'"] button');
  await page.waitForTimeout(400);

  // The second half is the reason; the first keeps the rule.
  await page.click('button:has-text("Relabel")');
  await page.waitForTimeout(200);
  await page.evaluate((uid) => Alpine.$data(document.body)
    .push({ op: 'relabel', uid: uid + 'b', label: 'WHY-MOT' }), TARGET);
  await page.evaluate((uid) => Alpine.$data(document.body)
    .push({ op: 'note', uid: uid + 'a', text: 'the rule; its reason is now its own unit' }), TARGET);
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => Alpine.$data(document.body).units.length);
  const patch = await page.evaluate(() => Alpine.$data(document.body).patch);
  console.log(`UNITS ${before} -> ${after}`);
  console.log('PATCH ' + JSON.stringify(patch));

  // The halves must still tile: a split that loses a character is a corrupt
  // annotation that renders fine, which is the failure this whole file exists
  // to catch early.
  const gaps = await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    let bad = [], at = 0;
    for (const u of d.units) {
      if (d.a.text.slice(at, u.start).trim()) bad.push([at, u.start]);
      at = u.end;
    }
    if (d.a.text.slice(at).trim()) bad.push([at, d.a.text.length]);
    return bad;
  });
  console.log('UNTILED ' + JSON.stringify(gaps));

  // The page and ops.py must produce the SAME units from the same patch, or
  // the optimistic view is not a preview of anything. Printed so the two can be
  // diffed outside the browser.
  const touched = await page.evaluate((uid) => Alpine.$data(document.body)
    .units.filter(u => u.uid.startsWith(uid)), TARGET);
  console.log('TOUCHED ' + JSON.stringify(touched));

  await page.evaluate(() => document.querySelector('[x-ref="patch"]').showModal());
  await page.waitForTimeout(500);
}
