// A FINGER, not a mouse, which is the only way this defect is visible.
//
//   npm run shot -- pages/audit-render.html --width 430 --touch \
//     --script tools/render/scenarios/audit-pin-touch.mjs
//
// --touch is not optional here and the driver refuses without it. Tapping a pin
// with a finger puts this on the document:
//
//   click(touch), pointerdown(touch), touchstart, pointerup, touchend, click
//
// The leading click is synthesized into the document under the pin and arrives
// BEFORE any pointerdown. hit() runs on click while the tap's offset is
// recorded on pointerdown, so that phantom ran with no offset of its own: it
// spent the arming, and where an earlier tap had left an offset standing it
// placed the boundary at a point nobody had aimed at. A mouse always orders
// pointerdown before click, so a mouse driver sees none of it and passes.

export default async function (page) {
  if (!(await page.evaluate(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0)))
    throw new Error('run this with --touch: a mouse cannot produce the event order it tests');
  await page.waitForSelector('[x-ref="doc"] span');

  const f = await page.evaluate(async () => {
    const d = Alpine.$data(document.body);
    for (let k = 3; k < d.units.length - 3; k++) {
      const u = d.units[k];
      if (u.kind !== 'sent' || d.units[k - 1].kind !== 'sent') continue;
      d.sel = { ...u };
      document.querySelector(`[data-uid="${CSS.escape(u.uid)}"]`)?.scrollIntoView({ block: 'center' });
      d.placePins();
      await new Promise(r => setTimeout(r, 80));
      const b = [...document.querySelectorAll('[data-edge]')]
        .map(x => ({ e: x.getAttribute('data-edge'), r: x.getBoundingClientRect() }));
      const s = b.find(x => x.e === 'start');
      if (s) return { uid: u.uid, prevUid: d.units[k - 1].uid, sel: { start: u.start, end: u.end },
                      pin: { x: s.r.left + s.r.width / 2, y: s.r.top + s.r.height / 2 } };
    }
    return null;
  });
  if (!f) throw new Error('no prose unit with a neighbour on this page');

  await page.touchscreen.tap(f.pin.x, f.pin.y);
  await page.waitForTimeout(350);
  // THE ASSERTION THE OLD PAGE FAILED. The phantom click ran hit(), which set
  // armed to null, so the pin disarmed itself the instant it was armed.
  const armed = await page.evaluate(() => Alpine.$data(document.body).armed);
  if (armed !== 'start') throw new Error(`the pin did not stay armed: ${armed}`);

  const aim = await page.evaluate((f) => {
    const d = Alpine.$data(document.body);
    for (let at = Math.round(f.sel.start + (f.sel.end - f.sel.start) / 2); at < f.sel.end - 1; at++) {
      const h = Standoff.nodeAt(d.$refs.doc, at);
      if (!h) continue;
      const r = document.createRange();
      r.setStart(h.node, h.offset); r.setEnd(h.node, h.offset + 1);
      const b = r.getBoundingClientRect();
      if (b.width) return { at, x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }
    return null;
  }, f);
  if (!aim) throw new Error('cannot locate an inward tap point');
  await page.touchscreen.tap(aim.x, aim.y);
  await page.waitForTimeout(450);

  const t = await page.evaluate((f) => {
    const d = Alpine.$data(document.body);
    const g = (uid) => { const u = d.units.find(x => x.uid === uid); return { start: u.start, end: u.end }; };
    return { prev: g(f.prevUid), sel: g(f.uid), trace: d.trace,
             selUid: d.sel?.uid, selSpan: d.sel ? [d.sel.start, d.sel.end] : null };
  }, f);
  // THE SELECTION IS PART OF THE OUTCOME, not decoration. ops.shift returns the
  // left unit of the pair, so re-selecting the return value moved the highlight
  // onto the neighbour and the reader saw the whole span jump. The boundary
  // being right is not enough when the thing on screen is a different span.
  if (t.selUid !== f.uid)
    throw new Error(`the highlight left the subject: editing ${f.uid}, now on ${t.selUid}`);
  if (t.selSpan[1] !== f.sel.end)
    throw new Error(`the selected span's end moved: ${f.sel.end} -> ${t.selSpan[1]}`);
  if (t.sel.end !== f.sel.end) throw new Error(`the end boundary moved: ${f.sel.end} -> ${t.sel.end}`);
  if (t.sel.start === f.sel.start) throw new Error('the tap did not move the start boundary');
  if (t.prev.end !== t.sel.start) throw new Error('the pair no longer tiles');
  console.log(`TOUCH start ${f.sel.start} -> ${t.sel.start}, end held at ${t.sel.end}`);
  console.log(`      still editing ${t.selUid}, now [${t.selSpan}]`);
  console.log('  ' + t.trace.join('\n  '));
}
