// The start pin moves the start boundary, even where the two pins' touch
// targets overlap. BOTH WAYS OF MOVING IT, because the defect below reached
// them through one shared step and a gate watching only the drag let the
// second symptom through: reported 2026-09-07, after the drag was fixed.
//
// A pin's box is 32px wide and padded above and below the line it marks, so
// two pins on adjacent lines overlap wherever their x values are close. Both
// sit at the same z-index and `end` is appended last, so elementFromPoint
// answers `end` for a point inside both. Until 2026-09-07 the page took that
// answer, and a drag on the start pin moved the end boundary: the span looked
// like it was being carried bodily rather than having its left edge placed.
//
// Arming is the shared step. A drag reads the armed edge to pick a boundary
// and a tap reads it to place one, so the wrong pin arming looks like two
// unrelated faults: a drag that moves the far edge, and a tap that sends the
// far edge to where you pointed.
//
// This picks a selection whose pins actually overlap and fails if it cannot
// find one, since a version of this driver that silently tests the easy case
// would pass through the defect it exists to catch.
//
//   npm run shot -- pages/audit-render.html --width 430 \
//     --script tools/render/scenarios/audit-pin-overlap.mjs

const overlap = (a, b) => a.left < b.right && b.left < a.right
                       && a.top < b.bottom && b.top < a.bottom;

export default async function (page) {
  await page.waitForSelector('[x-ref="doc"] span');

  // Walk candidates until one paints two pins whose boxes overlap.
  const found = await page.evaluate(async (src) => {
    const d = Alpine.$data(document.body);
    const boxes = () => [...document.querySelectorAll('[data-edge]')]
      .map(b => ({ edge: b.getAttribute('data-edge'), r: b.getBoundingClientRect() }));
    const over = new Function('a', 'b', 'return ' + src);
    for (let k = 2; k < d.units.length - 2; k++) {
      const u = d.units[k];
      if (u.kind !== 'sent' || d.units[k - 1].kind !== 'sent') continue;
      d.sel = { ...u };
      document.querySelector(`[data-uid="${CSS.escape(u.uid)}"]`)?.scrollIntoView({ block: 'center' });
      d.placePins();
      await new Promise(r => setTimeout(r, 60));
      const bs = boxes();
      const s = bs.find(x => x.edge === 'start'), e = bs.find(x => x.edge === 'end');
      if (s && e && over(s.r, e.r))
        return { uid: u.uid, prevUid: d.units[k - 1].uid,
                 prev: { ...d.units[k - 1] }, sel: { ...u },
                 pin: { x: s.r.left + s.r.width / 2, y: s.r.top + s.r.height / 2 } };
    }
    return null;
  }, overlap.toString().replace(/^\(a, b\) =>\s*/, ''));
  if (!found) throw new Error('no selection on this page paints overlapping pins');
  console.log(`OVERLAP on ${found.uid}, start pin at ${Math.round(found.pin.x)},${Math.round(found.pin.y)}`);

  await page.mouse.move(found.pin.x, found.pin.y);
  await page.mouse.down();
  // RIGHTWARD, because that direction always has text under it. A boundary
  // sitting at the start of a wrapped line has nothing to its left but the
  // margin, so a leftward drag clamps and lands back on the offset it started
  // from: not the page failing, but a driver that reads it as failure cries
  // wolf, which it did the moment the header grew a line and moved the pin.
  // Which WAY the offset then goes is the page's business, since the aim point
  // maps through the line box; what is asserted below is that the start moved
  // and the end did not.
  for (let k = 1; k <= 6; k++) { await page.mouse.move(found.pin.x + k * 8, found.pin.y); await page.waitForTimeout(40); }
  await page.mouse.up();
  await page.waitForTimeout(400);

  const after = await page.evaluate((f) => {
    const d = Alpine.$data(document.body);
    const g = (uid) => { const u = d.units.find(x => x.uid === uid); return { start: u.start, end: u.end }; };
    return { prev: g(f.prevUid), sel: g(f.uid) };
  }, found);

  if (after.sel.end !== found.sel.end)
    throw new Error(`the END boundary moved: ${found.sel.end} -> ${after.sel.end}`);
  if (after.sel.start === found.sel.start)
    throw new Error('the start boundary did not move at all');
  if (after.prev.end !== after.sel.start)
    throw new Error(`the pair no longer tiles: prev ends ${after.prev.end}, sel starts ${after.sel.start}`);
  console.log(`DRAG start ${found.sel.start} -> ${after.sel.start}, end held at ${after.sel.end}`);

  // ── the tap path, on the same overlapping pins ──────────────────────────
  // Tap the pin to arm it, then tap inside the span to place the boundary.
  // Before the fix this armed `end`, and the second tap sent the span's END to
  // the tap: the span read as carried rather than trimmed.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[x-ref="doc"] span');
  const f2 = await page.evaluate(async (src) => {
    const d = Alpine.$data(document.body);
    const over = new Function('a', 'b', 'return ' + src);
    for (let k = 2; k < d.units.length - 2; k++) {
      const u = d.units[k];
      if (u.kind !== 'sent' || d.units[k - 1].kind !== 'sent') continue;
      d.sel = { ...u };
      document.querySelector(`[data-uid="${CSS.escape(u.uid)}"]`)?.scrollIntoView({ block: 'center' });
      d.placePins();
      await new Promise(r => setTimeout(r, 60));
      const bs = [...document.querySelectorAll('[data-edge]')]
        .map(b => ({ e: b.getAttribute('data-edge'), r: b.getBoundingClientRect() }));
      const s = bs.find(x => x.e === 'start'), e = bs.find(x => x.e === 'end');
      if (s && e && over(s.r, e.r))
        return { uid: u.uid, prevUid: d.units[k - 1].uid, sel: { start: u.start, end: u.end },
                 pin: { x: s.r.left + s.r.width / 2, y: s.r.top + s.r.height / 2 } };
    }
    return null;
  }, overlap.toString().replace(/^\(a, b\) =>\s*/, ''));
  if (!f2) throw new Error('no selection paints overlapping pins after reload');

  await page.mouse.click(f2.pin.x, f2.pin.y);
  await page.waitForTimeout(300);
  const armed = await page.evaluate(() => Alpine.$data(document.body).armed);
  if (armed !== 'start') throw new Error(`tapping the start pin armed ${armed}`);

  // A third of the way in, rightward of the start pin: the shrink the reader
  // is asking for.
  const aim = await page.evaluate((f) => {
    const d = Alpine.$data(document.body);
    // Scan forward for the first offset that maps to a painted character: a
    // third of the way in can land in markup, and a driver that gives up there
    // reports a defect it did not find.
    for (let at = Math.round(f.sel.start + (f.sel.end - f.sel.start) / 3); at < f.sel.end - 1; at++) {
      const hit = Standoff.nodeAt(d.$refs.doc, at);
      if (!hit) continue;
      const r = document.createRange();
      r.setStart(hit.node, hit.offset); r.setEnd(hit.node, hit.offset + 1);
      const b = r.getBoundingClientRect();
      if (b.width) return { at, x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }
    return null;
  }, f2);
  if (!aim) throw new Error('cannot locate the inward tap point');
  await page.mouse.click(aim.x, aim.y);
  await page.waitForTimeout(400);

  const t = await page.evaluate((f) => {
    const d = Alpine.$data(document.body);
    const g = (uid) => { const u = d.units.find(x => x.uid === uid); return { start: u.start, end: u.end }; };
    return { prev: g(f.prevUid), sel: g(f.uid) };
  }, f2);
  if (t.sel.end !== f2.sel.end)
    throw new Error(`the tap moved the END boundary: ${f2.sel.end} -> ${t.sel.end}`);
  if (t.sel.start === f2.sel.start) throw new Error('the tap did not move the start boundary');
  if (t.prev.end !== t.sel.start)
    throw new Error(`the pair no longer tiles: prev ends ${t.prev.end}, sel starts ${t.sel.start}`);
  console.log(`TAP  at ${aim.at}: start ${f2.sel.start} -> ${t.sel.start}, end held at ${t.sel.end}`);
}
