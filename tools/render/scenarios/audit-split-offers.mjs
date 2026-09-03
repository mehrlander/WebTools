// screenshot.mjs interaction scenario: what the split menu offers, and what it
// refuses.
//
//   npm run shot -- pages/audit-render.html --width 900 \
//     --script tools/render/scenarios/audit-split-offers.mjs
//
// TWO RULES, AND THE SECOND IS A ROUND TRIP. A heading is one unit, so the menu
// offers nothing inside one: its `:` fires the clause branch, and the offer was
// to cut three of CONVENTIONS.md's section titles from their own claims. And a
// unit spanning a blank line offers that blank line, which the clause regex
// cannot see: a `shift` across one makes a `mixed` unit, and until this the menu
// offered nothing at all on one, so a heading dragged into the paragraph below
// it could be put back only by undo.
//
// The round trip is the assertion worth having: shift makes it mixed, split at
// the offered boundary puts the two kinds back. Either half alone would pass
// while the interface stayed one-way.

const offersOf = (page, uid) => page.evaluate((uid) => {
  const d = Alpine.$data(document.body);
  const u = d.units.find(x => x.uid === uid);
  d.openSplit(u);
  const out = { kind: u.kind, note: d.splitNote, at: d.boundaries.map(b => b.at) };
  d.menu = null;
  return out;
}, uid);

export default async function (page) {
  await page.waitForSelector('[x-ref="doc"] [data-uid]');

  // ── a heading is one unit ───────────────────────────────────────────────
  const heads = await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    return d.units.filter(u => /^h[1-6]$/.test(u.kind)).map(u => u.uid);
  });
  const headRows = [];
  for (const uid of heads) headRows.push({ uid, ...(await offersOf(page, uid)) });
  console.log('HEADINGS ' + JSON.stringify({ n: headRows.length,
    offered: headRows.filter(r => r.at.length).map(r => r.uid),
    note: [...new Set(headRows.map(r => r.note))] }));
  if (headRows.length < 5) throw new Error(`only ${headRows.length} headings to check`);
  const offered = headRows.filter(r => r.at.length);
  if (offered.length)
    throw new Error(`a heading offered a split: ${offered.map(r => r.uid).join(', ')}`);
  // A DEAD CONTROL AND A REFUSAL DRAW THE SAME PICTURE unless the empty state
  // says which it is, so the note is asserted, not just the count.
  if (!headRows.every(r => /heading/.test(r.note)))
    throw new Error(`the empty menu does not say why: ${JSON.stringify(headRows[0].note)}`);

  // ── prose still gets its clause offers ──────────────────────────────────
  const prose = await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    let units = 0, offers = 0, dupes = 0;
    for (const u of d.units) {
      d.openSplit(u);
      const at = d.boundaries.map(b => b.at);
      if (u.kind === 'sent') { units++; offers += at.length; }
      if (new Set(at).size !== at.length) dupes++;
      if (at.some((x, i) => i && x < at[i - 1])) dupes++;   // and in order
    }
    d.menu = null;
    return { units, offers, dupes };
  });
  console.log('PROSE ' + JSON.stringify(prose));
  if (prose.offers < 10) throw new Error(`only ${prose.offers} clause offers left across the document`);
  if (prose.dupes) throw new Error(`${prose.dupes} unit(s) offer a boundary twice or out of order`);

  // ── the round trip: shift makes it mixed, split puts it back ────────────
  const trip = await page.evaluate(() => {
    const d = Alpine.$data(document.body), t = d.a.text;
    const h = d.units.find(u => /^h[1-6]$/.test(u.kind) && u.start > 800);
    const next = d.units[d.units.indexOf(h) + 1];
    const before = [h.kind, next.kind];
    d.sel = { ...h, ref: d.srcRef(h) };
    d.push({ op: 'shift', after: h.uid, to: next.start + Math.floor((next.end - next.start) / 2) });

    const m = d.units.find(u => u.uid === h.uid);
    d.openSplit(m);
    const at = d.boundaries.map(b => b.at);
    const want = t.indexOf('\n\n', m.start) + 2;      // where a reader would cut
    const mixedKind = m.kind;
    if (!at.includes(want)) { d.menu = null; return { before, mixedKind, at, want, took: null }; }

    d.push({ op: 'split', uid: m.uid, at: want });
    const halves = d.units.filter(u => u.uid.startsWith(h.uid)).map(u => [u.uid, u.kind]);
    return { before, mixedKind, at, want, took: halves,
             bad: Standoff.check(d.so, d.a.text) };
  });
  console.log('ROUNDTRIP ' + JSON.stringify(trip));
  // Constructed, because the payload holds no unit that reaches both branches.
  // A block ending in a period matches the clause branch (whose `\s+` eats the
  // blank line) AND the block branch, at the same offset: without the dedupe
  // the menu shows one boundary twice, and both buttons carry the same `at`, so
  // the second is a no-op the reader cannot tell from the first.
  const twice = await page.evaluate(() => {
    const d = Alpine.$data(document.body), t = d.a.text;
    const i = d.units.findIndex((u, k) => k > 0 && u.kind === 'sent'
      && /\.$/.test(t.slice(u.start, u.end).trim())
      && /\n[ \t]*\n/.test(t.slice(u.end, d.units[k + 1]?.start ?? u.end)));
    if (i < 0) return null;
    const u = d.units[i], next = d.units[i + 1];
    d.sel = { ...u, ref: d.srcRef(u) };
    d.push({ op: 'shift', after: u.uid, to: next.start + Math.floor((next.end - next.start) / 2) });
    const m = d.units.find(x => x.uid === u.uid);
    d.openSplit(m);
    const at = d.boundaries.map(b => b.at);
    d.menu = null; d.undo();
    return { uid: m.uid, kind: m.kind, at, unique: new Set(at).size };
  });
  console.log('BOTHBRANCHES ' + JSON.stringify(twice));
  if (!twice) throw new Error('no unit ends a block with a period, so the dedupe is untested');
  if (twice.kind !== 'mixed') throw new Error(`constructed ${twice.kind}, wanted mixed`);
  if (twice.unique !== twice.at.length)
    throw new Error(`one boundary offered twice: ${JSON.stringify(twice.at)}`);

  if (trip.mixedKind !== 'mixed')
    throw new Error(`the shift produced ${trip.mixedKind}, so this is not testing the mixed case`);
  if (!trip.took)
    throw new Error(`no offer at the block boundary ${trip.want}; offered ${JSON.stringify(trip.at)}`);
  if (trip.bad.length) throw new Error('the split broke the partition: ' + trip.bad.join('; '));
  // THE POINT: the halves derive back to what the shift destroyed. A split that
  // landed one character off would still tile and would not do this.
  if (trip.took.map(h => h[1]).join() !== trip.before.join())
    throw new Error(`the halves came back as ${JSON.stringify(trip.took)}, `
                  + `not ${JSON.stringify(trip.before)}`);
  await page.waitForTimeout(300);
}
