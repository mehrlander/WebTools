// Driving the grain edits: split a fused unit, relabel one half, note the
// other, and read back the patch the page produced.
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
// It picks its own target rather than naming one. An earlier version named
// conven-046, the worked example from the grain measurement, and went stale the
// first time that unit was actually split: a driver that has to be re-pointed
// after every pass is a driver nobody runs.
//
// `stop=menu` photographs the offer instead of the result: the candidates the
// page found, before anything has been decided.

export default async function (page) {
  const stop = new URL(page.url()).searchParams.get('stop');
  await page.waitForSelector('[x-ref="doc"] span');
  const before = await page.evaluate(() => Alpine.$data(document.body).units.length);

  // The first prose unit the page can offer a split inside. The page picks it,
  // since the spans carry a uid and the SCENARIO should not decide which unit
  // is splittable; but it is then selected BY A REAL TAP, and that part is not
  // ceremony. The panel is a pointer-anchored popover: setting `sel` from
  // script leaves `selPt` empty, so placement falls back to the unit's rect,
  // and a unit below the fold has none on screen. The panel then keeps its last
  // position, every button in it is "outside of the viewport", and the click
  // retries for thirty seconds. That is how this file broke silently.
  const target = await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    for (const u of d.units) {
      if (u.kind !== 'sent') continue;
      d.openSplit(u);
      if (d.boundaries.length) {
        d.menu = null;
        document.querySelector(`[data-uid="${CSS.escape(u.uid)}"]`)
          ?.scrollIntoView({ block: 'center' });
        return { uid: u.uid, label: u.label, at: d.boundaries[0].at };
      }
    }
    return null;
  });
  if (!target) throw new Error('no prose unit on this page carries a split candidate');
  await page.waitForTimeout(300);

  const box = await page.evaluate((t) => {
    const r = [...document.querySelector(`[data-uid="${CSS.escape(t.uid)}"]`).getClientRects()][0];
    return { x: r.left + Math.min(30, r.width / 2), y: (r.top + r.bottom) / 2 };
  }, target);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(300);
  const selected = await page.evaluate(() => Alpine.$data(document.body).sel?.uid);
  if (selected !== target.uid) throw new Error(`tap selected ${selected}, wanted ${target.uid}`);
  console.log('TARGET ' + JSON.stringify(target));

  await page.click('button:has-text("Split")');
  await page.waitForTimeout(300);
  const cands = await page.evaluate(() => Alpine.$data(document.body).boundaries);
  console.log('BOUNDARIES ' + JSON.stringify(cands.map(b => b.rest.slice(0, 22))));

  if (stop === 'menu') {
    await page.evaluate(() => document.querySelector('[x-show*="split"]')
      .scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(400);
    return;
  }
  await page.click('[x-show="menu===\'split\'"] button');
  await page.waitForTimeout(400);

  // THROUGH THE PILL, not through push(). The label pill is a span sized to the
  // current value with an invisible select over it, so the only thing proving
  // that control is still wired is driving the select the way a tap does. Any
  // label the vocabulary declares that is not the one the parent carried, so
  // the relabel is a real change whatever document is loaded.
  const relabelled = await page.evaluate((t) => {
    const d = Alpine.$data(document.body);
    const other = d.so.vocabulary.find(v => v.label !== t.label).label;
    const el = document.querySelector('[data-panel] label select');
    el.value = other;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return other;
  }, target);
  await page.waitForTimeout(300);
  const shown = await page.evaluate(() =>
    document.querySelector('[data-panel] label span').textContent.trim());
  if (shown !== relabelled) throw new Error(`pill reads ${shown} after relabel to ${relabelled}`);
  await page.evaluate((t) => Alpine.$data(document.body)
    .push({ op: 'note', uid: t.uid + 'b', text: 'the rule; what followed is now its own unit' }), target);
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

  // The page and ops.py must produce the SAME units from the same patch, or the
  // optimistic view is not a preview of anything. Printed so the two can be
  // diffed outside the browser; lib/kits/standoff.js is what the page ran.
  const touched = await page.evaluate((t) => Alpine.$data(document.body)
    .units.filter(u => u.uid.startsWith(t.uid)), target);
  console.log('TOUCHED ' + JSON.stringify(touched));

  await page.evaluate(() => document.querySelector('[x-ref="patch"]').showModal());
  await page.waitForTimeout(500);
}
