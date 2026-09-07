// Reaching a boundary past the pair it separates: the merges plus the shift,
// counted, and undone one step at a time.
//
//   npm run shot -- pages/audit-render.html --width 430 --touch \
//     --script tools/render/scenarios/audit-absorb.mjs
//
// A shift moves one boundary within one pair. A tap beyond that pair used to
// be refused outright, which stated the operation's definition rather than
// answering the reader's intent. It now absorbs what it crosses, one merge per
// span, and says how many and which. What is asserted here is that the
// annotation stays whole through it: the units still tile, the count matches
// the units that disappeared, and each merge is its own patch entry, so undo
// walks back through the sequence rather than off it.

export default async function (page) {
  await page.waitForSelector('[x-ref="doc"] span');

  const f = await page.evaluate(async () => {
    const d = Alpine.$data(document.body);
    for (let k = 3; k < d.units.length - 5; k++) {
      const u = d.units[k];
      if (u.kind !== 'sent') continue;
      d.sel = { ...u };
      document.querySelector(`[data-uid="${CSS.escape(u.uid)}"]`)?.scrollIntoView({ block: 'center' });
      d.placePins();
      await new Promise(r => setTimeout(r, 80));
      const e = [...document.querySelectorAll('[data-edge]')]
        .map(x => ({ e: x.getAttribute('data-edge'), r: x.getBoundingClientRect() }))
        .find(x => x.e === 'end');
      if (e) return { uid: u.uid, count: d.units.length, patch: d.patch.length,
                      sel: { start: u.start, end: u.end },
                      far: { start: d.units[k + 2].start, end: d.units[k + 2].end },
                      pin: { x: e.r.left + e.r.width / 2, y: e.r.top + e.r.height / 2 } };
    }
    return null;
  });
  if (!f) throw new Error('no prose unit with two spans past it');

  await page.touchscreen.tap(f.pin.x, f.pin.y);
  await page.waitForTimeout(300);
  const aim = await page.evaluate((f) => {
    const d = Alpine.$data(document.body);
    for (let at = f.far.start + 4; at < f.far.end - 1; at++) {
      const h = Standoff.nodeAt(d.$refs.doc, at);
      if (!h) continue;
      const r = document.createRange();
      r.setStart(h.node, h.offset); r.setEnd(h.node, h.offset + 1);
      const b = r.getBoundingClientRect();
      if (b.width) return { at, x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }
    return null;
  }, f);
  if (!aim) throw new Error('cannot locate a point past the pair');
  await page.touchscreen.tap(aim.x, aim.y);
  await page.waitForTimeout(450);

  const after = await page.evaluate((f) => {
    const d = Alpine.$data(document.body);
    const us = [...d.units].sort((a, b) => a.start - b.start);
    const u = d.units.find(x => x.uid === f.uid);
    return { msg: d.opErr, count: d.units.length, patch: d.patch.length,
             sel: u ? { start: u.start, end: u.end } : null,
             complaints: Standoff.check(d.so, d.a.text),
             gaps: us.slice(1).filter((x, i) => x.start < us[i].end).length };
  }, f);

  const n = Number((after.msg.match(/absorbed (\d+)/) || [])[1]);
  if (!n) throw new Error(`no absorb reported: ${after.msg}`);
  if (f.count - after.count !== n)
    throw new Error(`reported ${n} absorbed, ${f.count - after.count} units disappeared`);
  if (after.complaints.length) throw new Error('the annotation broke: ' + after.complaints[0]);
  if (after.gaps) throw new Error('the units no longer tile');
  if (after.sel.end !== aim.at) throw new Error(`the boundary is at ${after.sel.end}, asked ${aim.at}`);
  if (after.patch !== f.patch + n + 1)
    throw new Error(`expected ${n} merges plus a shift, patch grew by ${after.patch - f.patch}`);
  console.log(`ABSORB ${after.msg}  |  units ${f.count} -> ${after.count}, patch +${after.patch - f.patch}`);

  // One step of undo puts the shift back and leaves the merges standing.
  await page.evaluate(() => Alpine.$data(document.body).undo());
  await page.waitForTimeout(250);
  const undone = await page.evaluate((f) => {
    const d = Alpine.$data(document.body);
    const u = d.units.find(x => x.uid === f.uid);
    return { end: u?.end, at: d.at, complaints: Standoff.check(d.so, d.a.text) };
  }, f);
  if (undone.complaints.length) throw new Error('undo broke the annotation');
  if (undone.end === after.sel.end) throw new Error('undo did not move the boundary back');
  console.log(`UNDO   one step: boundary back to ${undone.end}, patch head at ${undone.at}`);
}
