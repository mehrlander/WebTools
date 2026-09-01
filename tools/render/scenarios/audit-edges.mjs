// The edge gestures on a phone, driven with real touch.
//
// EDGES ARE A READ-VIEW AFFORDANCE, so this drives the rendered text. Every
// offset comes from lib/kits/standoff.js's map, which finds each rendered text
// node in the source and refuses what it cannot find: markup is in no text node
// and an inline construct is atomic, so a boundary inside `**` or a link's label
// is not a place the interface can reach.
//
// The pins themselves are lib/kits/dictate.js's, the same ones the dictation
// page uses: a ball on a stem covering the line, above on the left and below on
// the right, red with a light centre when armed.
//
// EACH GESTURE STARTS FROM A FRESH SELECTION. Chaining them read as a series of
// dead controls and was not: an earlier version left a two-character unit
// behind, and every later gesture was correctly refused for having nowhere to
// go. A driver that cannot tell "refused" from "broken" reports neither.
//
//   npm run shot -- pages/audit-render.html --width 390 --height 844 --touch \
//     --script tools/render/scenarios/audit-edges.mjs
//
// STATE=look  arm an edge and stop, for the picture

const STATE = process.env.STATE || 'full';

// Select a unit that has a neighbour on each side and an open (non-atomic) run
// long enough to aim at, and wait for its pins.
const fresh = (page) => page.evaluate(() => {
  const d = Alpine.$data(document.body);
  const open = (u) => {
    const el = document.querySelector(`[data-uid="${u.uid}"]`);
    return el && [...el.querySelectorAll('[data-src]:not([data-atomic])')]
      .some(s => s.firstChild && s.firstChild.length > 24);
  };
  for (let i = 3; i < d.units.length - 1; i++) {
    const u = d.units[i];
    if (u.kind !== 'sent' || !open(u)) continue;
    d.sel = { ...u, ref: d.srcRef(u) };
    d.armed = null;
    d.paint();
    if (d.edges.length === 2 && d.edges.every(e => d.rectAt(e.at))) return { ...u };
  }
  throw new Error('no unit with two locatable boundaries and an open run');
});

const state = (page) => page.evaluate(() => {
  const d = Alpine.$data(document.body);
  return { ops: d.patch.length, at: d.at, armed: d.armed,
           end: d.units.find(u => u.uid === d.sel?.uid)?.end,
           bad: Standoff.check(d.so, d.a.text).length };
});

export default async function (page) {
  await page.waitForSelector('[x-ref="doc"] span[data-uid]');

  const u = await fresh(page);
  await page.waitForTimeout(400);
  if (STATE === 'look') {
    await page.evaluate(() => { const d = Alpine.$data(document.body); d.armed = 'end'; d.placePins(); });
    await page.waitForTimeout(500);
    return;
  }
  const pins = await page.evaluate(() => [...document.querySelectorAll('[data-edge]')]
    .map(el => el.getAttribute('data-edge')));
  console.log('UNIT ' + JSON.stringify({ uid: u.uid, start: u.start, end: u.end }));
  console.log('PINS ' + JSON.stringify(pins));
  if (pins.length !== 2) throw new Error('a unit between two others has two boundaries');

  // IS THE STEM ON THE LINE IT MARKS? Measured, because that was the reported
  // defect and because a missing pin and a misplaced one are the same picture.
  const align = await page.evaluate(() => {
    const d = Alpine.$data(document.body); const out = {};
    for (const e of d.edges) {
      const line = d.rectAt(e.at), pin = document.querySelector(`[data-edge="${e.edge}"]`);
      if (!line || !pin) continue;
      const bar = pin.firstElementChild.getBoundingClientRect();
      const dot = pin.lastElementChild.getBoundingClientRect();
      out[e.edge] = { dTop: Math.round(bar.top - line.top),
                      dBottom: Math.round(bar.bottom - line.bottom),
                      dLeft: Math.round(bar.left + bar.width / 2 - line.left),
                      ball: dot.top + dot.height / 2 < line.top ? 'above' : 'below' };
    }
    return out;
  });
  console.log('ALIGN ' + JSON.stringify(align));
  for (const [edge, m] of Object.entries(align))
    if (Math.abs(m.dTop) > 2 || Math.abs(m.dBottom) > 2 || Math.abs(m.dLeft) > 2)
      throw new Error(`the ${edge} stem is off its line: ${JSON.stringify(m)}`);
  if (align.start?.ball !== 'above' || align.end?.ball !== 'below')
    throw new Error('above on the left and below on the right is what tells the two apart');

  // ── tap a pinhead to arm it, and it goes red ────────────────────────────
  const dot = await page.evaluate(() => {
    const b = document.querySelector('[data-edge="end"]').lastElementChild.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.touchscreen.tap(dot.x, dot.y);
  await page.waitForTimeout(300);
  const armed = await page.evaluate(() => ({
    armed: Alpine.$data(document.body).armed,
    red: document.querySelector('[data-edge="end"]').lastElementChild
           .getAttribute('style').includes('#dc2626'),
  }));
  console.log('ARMED ' + JSON.stringify(armed));
  if (armed.armed !== 'end' || !armed.red) throw new Error('a tapped pinhead must arm and go red');

  // ── a tap in the text places the armed boundary there ───────────────────
  const spot = await page.evaluate((uid) => {
    const unit = document.querySelector(`[data-uid="${uid}"]`);
    const run = [...unit.querySelectorAll('[data-src]:not([data-atomic])')]
      .find(s => s.firstChild && s.firstChild.length > 24);
    const r = document.createRange();
    r.setStart(run.firstChild, 8); r.collapse(true);
    const b = r.getBoundingClientRect();
    return { x: b.left + 1, y: b.top + b.height / 2, want: +run.dataset.src + 8 };
  }, u.uid);
  await page.touchscreen.tap(spot.x, spot.y);
  await page.waitForTimeout(400);
  const placed = await state(page);
  // WORD SNAPPING MOVED THE TARGET, so the assertion is the contract rather
  // than the raw offset. A tap eight characters into a run lands mid-word and
  // the page snaps to the nearer word edge, which is the point of it. Checking
  // for `spot.want` exactly asked the driver to carry a second copy of
  // snapWord, and it silently became an assertion about the OLD behaviour the
  // day snapping landed.
  const land = await page.evaluate(({ want, got }) => {
    const t = Alpine.$data(document.body).a.text, W = /[\w'\u2019-]/;
    return { onEdge: !(W.test(t[got - 1] || '') && W.test(t[got] || '')),
             drift: got - want, around: t.slice(got - 8, got + 8) };
  }, { want: spot.want, got: placed.end });
  console.log('PLACED want=' + spot.want + ' ' + JSON.stringify({ ...placed, ...land }));
  if (placed.ops !== 1) throw new Error('the tap did not place the boundary');
  if (!land.onEdge) throw new Error(`the boundary cut a word: …${land.around}…`);
  if (Math.abs(land.drift) > 20) throw new Error(`snapped ${land.drift} chars, which is past a word`);
  if (placed.bad) throw new Error('placing broke the partition');

  // ── the pad walks it, and one drag is one operation ─────────────────────
  await fresh(page);
  await page.waitForTimeout(300);
  await page.evaluate(() => { const d = Alpine.$data(document.body); d.armed = 'end'; d.placePins(); });
  await page.waitForTimeout(300);
  const pad = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find(el => el.textContent.includes('drag the edge'))?.getBoundingClientRect();
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
  });
  if (!pad) throw new Error('no pad while a boundary is armed');
  const beforePad = (await state(page)).ops;
  await page.mouse.move(pad.x, pad.y);
  await page.mouse.down();
  // BACK ALONG THE SAME LINE. A boundary often sits at a line end, where a
  // rightward drag runs into space no span owns and the boundary correctly
  // holds still; that reads as a dead control and is how the first version of
  // this file passed while proving nothing.
  for (let i = 0; i < 30; i++) { await page.mouse.move(pad.x - i * 3, pad.y + i); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const walked = await state(page);
  console.log('WALKED ' + JSON.stringify(walked));
  if (walked.ops !== beforePad + 1) throw new Error('one pad drag must record one operation');
  if (walked.bad) throw new Error('the pad drag broke the partition');

  // ── the pin itself drags ────────────────────────────────────────────────
  // pages/dictate.html's gesture: the aim point is the bar's centre carried by
  // the finger's delta, one to one, so what moves under the ball is what the
  // ball was already marking. Arming happens on the way DOWN, so the ring is
  // under the finger before it moves.
  await fresh(page);
  await page.waitForTimeout(300);
  const beforePin = (await state(page)).ops;
  const bar = await page.evaluate(() => {
    const b = document.querySelector('[data-edge="end"]').firstElementChild.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.move(bar.x, bar.y);
  await page.mouse.down();
  const redOnDown = await page.evaluate(() => Alpine.$data(document.body).armed);
  // AIM WHERE THE TEXT IS, rather than always leftward. A boundary at a line
  // END has nothing to its right, which is why this dragged left; a boundary at
  // a line START has nothing to its left, and then the same drag proves nothing
  // and reads as a dead control. Which one this is depends on which unit
  // `fresh` picked, so the direction is asked rather than assumed: offsetAt
  // answers null off the run, and the side that answers is the side to walk.
  const dir = await page.evaluate(([x, y]) => {
    const d = Alpine.$data(document.body), here = d.offsetAt(x, y);
    for (const s of [-1, 1]) if (d.offsetAt(x + s * 60, y) != null
                                 && d.offsetAt(x + s * 60, y) !== here) return s;
    return 0;
  }, [bar.x, bar.y]);
  if (!dir) throw new Error('the armed boundary has reachable text on neither side');
  for (let i = 1; i <= 30; i++) { await page.mouse.move(bar.x + dir * i * 3, bar.y); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const dragged = await state(page);
  console.log('PINDRAG armed-on-down=' + redOnDown + ' dir=' + dir + ' ' + JSON.stringify(dragged));
  if (redOnDown !== 'end') throw new Error('the pin must arm on the way down, before it moves');
  if (dragged.ops !== beforePin + 1) throw new Error('one pin drag must record one operation');
  if (dragged.bad) throw new Error('the pin drag broke the partition');

  // ── markup is not a place ───────────────────────────────────────────────
  const refused = await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    let asked = 0, gave = 0;
    for (const a of [...document.querySelectorAll('[data-atomic]')].slice(0, 20)) {
      const n = a.firstChild;
      if (!n || n.nodeType !== 3 || !n.length) continue;
      const r = document.createRange();
      r.setStart(n, Math.min(1, n.length - 1)); r.collapse(true);
      const b = r.getBoundingClientRect();
      if (!b.width && !b.height) continue;
      asked++;
      if (d.offsetAt(b.left + 1, b.top + b.height / 2) != null) gave++;
    }
    return { asked, gave };
  });
  console.log('MARKUP ' + JSON.stringify(refused));
  if (refused.gave) throw new Error(refused.gave + ' offsets came back from inside markup');

  // ── every boundary in the document has a pin ────────────────────────────
  // A boundary that falls in markup once got no pin at all, which meant every
  // list item lost its opening handle: a whole class of boundary was
  // unreachable from the page and nothing said so, since a missing pin and an
  // unlocatable one draw the same picture. Counted rather than sampled, because
  // the defect is systematic and one unit that happens to work proves nothing.
  const reach = await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    const miss = [];
    for (const u of d.units) {
      d.sel = { ...u, ref: d.srcRef(u) };
      for (const e of d.edges) if (!d.rectAt(e.at, e.edge)) miss.push(`${u.uid}:${e.edge}`);
    }
    d.sel = null;
    // The first unit opens the document and the last one closes it, so those
    // two carry one boundary each rather than two.
    return { units: d.units.length, miss };
  });
  console.log('REACH ' + JSON.stringify(reach));
  if (reach.miss.length) throw new Error(`no pin for ${reach.miss.length} boundaries: ${reach.miss.slice(0, 6)}`);
}
