// The edge gestures on a phone, driven with real touch: tap a unit to make it
// active, tap a pinhead to arm the boundary, tap in the text to place it, and
// drag the pad to walk it.
//
//   npm run shot -- pages/audit-render.html --width 390 --height 844 --touch \
//     --script tools/render/scenarios/audit-edges.mjs
//
// A BOUNDARY IS THE OBJECT. The end of one unit is the start of the next, so a
// move touches both and the partition cannot come apart; what this asserts is
// that it does not, on the real document, after every gesture.
//
// EDGES ARE A READ-VIEW AFFORDANCE, so this drives the rendered text. Every
// offset comes from lib/kits/standoff.js's map, which finds each rendered text
// node in the source and refuses what it cannot find: markup is in no text node
// and an inline construct is atomic, so a boundary inside `**` or a link's
// label is not a place the interface can reach.
//
// The pad is checked with a DIAGONAL drag on purpose. A boundary often sits at
// the end of a line, so a purely horizontal drag runs into space that belongs
// to no span and the boundary holds still. That is correct behaviour and it
// reads as a dead control, which is how the first version of this file passed
// while proving nothing.
//
// STATE=look  arm an edge and stop, for the picture
const STATE = process.env.STATE || 'full';

const active = (page, pick) => page.evaluate((pick) => {
  const d = Alpine.$data(document.body);
  const open = (i) => {
    const el = document.querySelector(`[data-uid="${d.units[i].uid}"]`);
    return el && [...el.querySelectorAll('[data-src]:not([data-atomic])')]
      .some(s => s.firstChild && s.firstChild.length > 12);
  };
  let i = 3;
  while (i < d.units.length - 1 && !open(i)) i++;
  const u = pick === 'wide' ? (d.units.find(x => x.words > 12 && x.kind === 'sent') || d.units[i])
                            : d.units[i];
  d.sel = { ...u, ref: d.srcRef(u) };
  d.paint();
  return { uid: u.uid, start: u.start, end: u.end };
}, pick);

export default async function (page) {
  await page.waitForSelector('[x-ref="doc"] span[data-uid]');

  if (STATE === 'look') {
    await active(page, 'wide');
    await page.evaluate(() => Alpine.$data(document.body).$nextTick(() => {
      const d = Alpine.$data(document.body); d.armed = 'end'; d.placePins();
    }));
    await page.waitForTimeout(700);
    return;
  }

  const u = await active(page, 'narrow');
  await page.waitForTimeout(400);
  const pins = await page.evaluate(() => Alpine.$data(document.body).pins
    .map(p => ({ edge: p.edge, at: p.at })));
  console.log('UNIT ' + JSON.stringify(u));
  console.log('PINS ' + JSON.stringify(pins));
  if (pins.length !== 2) throw new Error('a unit between two others has two boundaries');

  // Arm the end pin by tapping its head.
  const head = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[aria-label$="boundary"]')]
      .find(el => el.getAttribute('aria-label').startsWith('end')).getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.touchscreen.tap(head.x, head.y);
  await page.waitForTimeout(300);
  console.log('ARMED ' + await page.evaluate(() => Alpine.$data(document.body).armed));

  // Place it: a tap in the text with a pin armed moves the boundary there.
  const spot = await page.evaluate((uid) => {
    const unit = document.querySelector(`[data-uid="${uid}"]`);
    const run = [...unit.querySelectorAll('[data-src]:not([data-atomic])')]
      .find(s => s.firstChild && s.firstChild.length > 12);
    if (!run) throw new Error('no open run inside ' + uid + ' to aim at');
    const r = document.createRange();
    r.setStart(run.firstChild, 8); r.collapse(true);
    const b = r.getBoundingClientRect();
    return { x: b.left + 1, y: b.top + b.height / 2, want: +run.dataset.src + 8 };
  }, u.uid);
  await page.touchscreen.tap(spot.x, spot.y);
  await page.waitForTimeout(400);
  const placed = await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    return { patch: d.patch, armed: d.armed, complaints: Standoff.check(d.so, d.a.text) };
  });
  console.log('PLACED want=' + spot.want + ' ' + JSON.stringify(placed));
  if (placed.complaints.length) throw new Error('placing broke the partition');

  // Walk it with the pad. One drag has to leave exactly one more operation.
  await page.evaluate(() => { Alpine.$data(document.body).armed = 'end'; });
  await page.waitForTimeout(300);
  const pad = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find(el => el.textContent.includes('drag the edge'))?.getBoundingClientRect();
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
  });
  if (!pad) throw new Error('no pad while a boundary is armed');
  await page.mouse.move(pad.x, pad.y);
  await page.mouse.down();
  for (let i = 0; i < 30; i++) { await page.mouse.move(pad.x + i * 3, pad.y + i * 2); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const walked = await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    return { ops: d.patch.length, last: d.patch[d.patch.length - 1],
             complaints: Standoff.check(d.so, d.a.text) };
  });
  console.log('WALKED ' + JSON.stringify(walked));

  // The point of editing against the render: markup is not a place. Every
  // atomic span refuses an offset, so no gesture can put a boundary inside a
  // link's label or a bold run.
  const refused = await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    const atoms = [...document.querySelectorAll('[data-atomic]')].slice(0, 20);
    let asked = 0, gave = 0;
    for (const a of atoms) {
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
  if (walked.ops !== 2) throw new Error('one drag must record one operation, got ' + walked.ops);
  if (walked.complaints.length) throw new Error('the drag broke the partition');
}
