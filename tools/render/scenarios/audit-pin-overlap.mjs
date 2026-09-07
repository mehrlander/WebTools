// The start pin moves the start boundary, even where the two pins' touch
// targets overlap.
//
// A pin's box is 32px wide and padded above and below the line it marks, so
// two pins on adjacent lines overlap wherever their x values are close. Both
// sit at the same z-index and `end` is appended last, so elementFromPoint
// answers `end` for a point inside both. Until 2026-09-07 the page took that
// answer, and a drag on the start pin moved the end boundary: the span looked
// like it was being carried bodily rather than having its left edge placed.
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
  for (let k = 1; k <= 6; k++) { await page.mouse.move(found.pin.x - k * 8, found.pin.y); await page.waitForTimeout(40); }
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
  console.log(`MOVED start ${found.sel.start} -> ${after.sel.start}, end held at ${after.sel.end}`);
}
