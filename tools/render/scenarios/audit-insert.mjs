// Driving an insertion: arm a boundary, type text the document does not have,
// and read it back where it would land.
//
//   npm run shot -- pages/audit-render.html --width 430 \
//     --script tools/render/scenarios/audit-insert.mjs
//
// The assertions are the point, not the picture. An insertion is inert with
// respect to every span invariant, so a page that recorded the wrong anchor, or
// mapped the inserted text, would look exactly right: the units still tile, the
// spans still resolve, and the render shows a sentence in the place a reader
// asked for one. So this checks the patch, the anchor, and the one thing the
// picture cannot show, which is that no boundary can land inside text that has
// no offsets.
//
// `stop=head` photographs the head insertion instead, the boundary that follows
// no unit and that the page could not address at all until insert arrived.

export default async function (page) {
  const stop = new URL(page.url()).searchParams.get('stop');
  await page.waitForSelector('[x-ref="doc"] span');

  // The page picks the unit, so this does not go stale when the grain moves.
  // Anything but the last, since the boundary being armed here is an `end` with
  // a unit on each side: the tail is the `stop=head` case's mirror and is
  // reached the same way.
  const target = await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    const u = d.units[Math.min(3, d.units.length - 2)];
    d.sel = { ...u, ref: d.srcRef(u) };
    d.armed = 'end';
    document.querySelector(`[data-uid="${CSS.escape(u.uid)}"]`)
      ?.scrollIntoView({ block: 'center' });
    return { uid: u.uid, after: d.armedEdge?.after, shiftable: d.armedEdge?.shiftable };
  });
  console.log('ARMED ' + JSON.stringify(target));
  if (target.after !== target.uid) throw new Error(`armed edge names ${target.after}, wanted ${target.uid}`);
  if (!target.shiftable) throw new Error('an interior boundary reported itself unshiftable');

  const TEXT = 'A sentence the document does not have.';
  const head = stop === 'head';
  await page.evaluate(({ TEXT, head }) => {
    const d = Alpine.$data(document.body);
    if (head) { d.sel = { ...d.units[0], ref: d.srcRef(d.units[0]) }; d.armed = 'start'; }
    d.push({ op: 'insert', after: d.armedEdge.after, text: head ? 'A lead sentence.' : TEXT });
  }, { TEXT, head });
  await page.waitForTimeout(400);

  const state = await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    return { patch: d.patch, insertions: d.so.insertions, units: d.units.length,
             complaints: Standoff.check(d.so, d.a.text) };
  });
  console.log('PATCH ' + JSON.stringify(state.patch));
  console.log('INSERTIONS ' + JSON.stringify(state.insertions));
  if (state.complaints.length) throw new Error('the annotation complains: ' + state.complaints.join('; '));

  // Drawn where it lands, and NOT mapped. mapText is what gives a run an offset;
  // an unmapped node offers none, so no boundary can be placed inside text the
  // document does not contain. That is the invariant the picture cannot show.
  const drawn = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-ins]')];
    return els.map(el => ({
      after: el.dataset.ins,
      text: el.textContent,
      mapped: !!el.querySelector('[data-src]') || el.hasAttribute('data-src'),
      // BETWEEN BLOCKS, not beside a piece. The page renders the document once
      // and a unit is now several tinted pieces inside the document's own
      // elements, so an insertion at a block boundary belongs after that block.
      // Dropping it beside the piece would put a block element inside the
      // paragraph or heading the piece belongs to.
      prevHolds: el.previousElementSibling
        ?.querySelector(`[data-uid="${CSS.escape(el.dataset.ins || '')}"]`) != null,
      prevTag: el.previousElementSibling?.tagName ?? null,
    }));
  });
  console.log('DRAWN ' + JSON.stringify(drawn));
  if (drawn.length !== 1) throw new Error(`${drawn.length} insertions drawn, wanted 1`);
  if (drawn[0].mapped) throw new Error('the inserted text was mapped; a boundary could land in it');
  if (!head && !drawn[0].prevHolds)
    throw new Error(`drawn after a ${drawn[0].prevTag} that does not hold ${target.uid}`);
  if (head && drawn[0].prevTag !== null)
    throw new Error('a head insertion should open the document, not follow a block');

  const off = await page.evaluate(() => {
    const el = document.querySelector('[data-ins]');
    const r = el.getBoundingClientRect();
    el.scrollIntoView({ block: 'center' });
    return Standoff.offsetAt(document, r.left + r.width / 2, r.top + r.height / 2);
  });
  console.log('OFFSET-INSIDE-INSERTION ' + JSON.stringify(off));
  if (off !== null) throw new Error(`an offset (${off}) was found inside the inserted text`);
  await page.waitForTimeout(300);
}
