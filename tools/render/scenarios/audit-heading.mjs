// screenshot.mjs interaction scenario: a boundary dragged into a heading's own
// line leaves the heading one heading.
//
//   npm run shot -- pages/audit-render.html --width 900 \
//     --script tools/render/scenarios/audit-heading.mjs
//
// THIS IS THE CASE THAT MOTIVATED RENDERING THE DOCUMENT ONCE. The page used to
// render each unit as markdown on its own, so a unit's text had to be a whole
// markdown construct or it drew as something else. Move the boundary before a
// heading forward past the `##` and the heading's opening words joined the
// previous unit, which then rendered as a heading itself; the words left behind
// had lost their marker and drew as a paragraph. One drag, two elements wrong,
// and the document's outline changed under an annotation that never claimed to
// touch it.
//
// The fix is structural: the document is rendered once and the units are painted
// over its text nodes, so an <h2> is the document's own and no boundary can
// unmake it. What is asserted here is exactly that, from both sides, because the
// report named both: the boundary moving INTO the heading and the one moving OUT
// of it. `audit-list.mjs` guards the same property for list items.
//
// The offsets are read off the render rather than typed, so this does not go
// stale when the payload is refreshed or the grain moves.

const H = 'h1,h2,h3,h4,h5,h6';

const read = (page, uids) => page.evaluate(({ uids, H }) => {
  const d = Alpine.$data(document.body);
  const box = document.querySelector('[x-ref="doc"]');
  const heads = [...box.querySelectorAll(H)];
  const of = (uid) => [...box.querySelectorAll(`[data-uid="${CSS.escape(uid)}"]`)];
  return {
    heads: heads.map(h => ({ tag: h.tagName, text: h.textContent.trim(),
                             uids: [...new Set([...h.querySelectorAll('[data-uid]')]
                                     .map(el => el.dataset.uid))] })),
    where: Object.fromEntries(uids.map(uid => [uid,
      [...new Set(of(uid).map(el => (el.closest(H) ? 'heading' : el.closest('p,li') ? 'body' : 'other')))].sort()])),
    kinds: Object.fromEntries(uids.map(uid =>
      [uid, d.units.find(u => u.uid === uid)?.kind])),
    bad: Standoff.check(d.so, d.a.text),
  };
}, { uids, H });

export default async function (page) {
  await page.waitForSelector('[x-ref="doc"] [data-uid]');

  // A heading with a neighbour on each side, and an interior offset the
  // interface could actually reach: `rectAt` answers only where mapText found
  // the run, which is the same gate the pins go through.
  const t = await page.evaluate(({ H }) => {
    const d = Alpine.$data(document.body);
    for (let i = 1; i < d.units.length - 1; i++) {
      const u = d.units[i];
      if (!/^h[1-6]$/.test(u.kind)) continue;
      const piece = [...document.querySelectorAll(`[data-uid="${CSS.escape(u.uid)}"][data-src]`)]
        .find(el => el.closest(H) && el.textContent.trim().includes(' '));
      if (!piece) continue;
      const gap = piece.textContent.indexOf(' ', 1);
      const into = +piece.dataset.src + gap + 1;          // inside the heading's words
      const next = d.units[i + 1];
      const outOf = next.start + Math.min(24, Math.floor((next.end - next.start) / 2));
      if (!(u.start < into && into < u.end)) continue;
      if (!d.rectAt(into)) continue;                      // the drag can reach it
      d.sel = { ...u, ref: d.srcRef(u) };
      document.querySelector(`[data-uid="${CSS.escape(u.uid)}"]`)
        ?.scrollIntoView({ block: 'center' });
      return { uid: u.uid, prev: d.units[i - 1].uid, next: next.uid,
               tag: piece.closest(H).tagName, text: piece.closest(H).textContent.trim(),
               into, outOf };
    }
    throw new Error('no heading with a neighbour and a reachable interior offset');
  }, { H });
  console.log('HEADING ' + JSON.stringify(t));

  const before = await read(page, [t.prev, t.uid, t.next]);
  console.log('BEFORE ' + JSON.stringify({ heads: before.heads.length, kinds: before.kinds }));
  if (before.bad.length) throw new Error('the payload arrived broken: ' + before.bad.join('; '));

  // ── the boundary moves INTO the heading ─────────────────────────────────
  await page.evaluate(({ prev, into }) => {
    Alpine.$data(document.body).push({ op: 'shift', after: prev, to: into });
  }, t);
  await page.waitForTimeout(300);

  const inside = await read(page, [t.prev, t.uid, t.next]);
  const still = inside.heads.find(h => h.text === t.text);
  console.log('INTO ' + JSON.stringify({ heads: inside.heads.length, kept: !!still,
                                         uids: still?.uids, kinds: inside.kinds,
                                         where: inside.where }));
  if (inside.bad.length) throw new Error('the shift broke the partition: ' + inside.bad.join('; '));
  if (inside.heads.length !== before.heads.length)
    throw new Error(`the document had ${before.heads.length} headings and now has ${inside.heads.length}`);
  if (!still) throw new Error(`"${t.text}" is no longer a heading element`);
  if (still.tag !== t.tag) throw new Error(`the heading changed level: ${t.tag} -> ${still.tag}`);
  // THE PAYOFF: one heading, two units. The boundary is drawn inside it, which
  // is what the reader asked for, and the element it is drawn in is unmoved.
  if (still.uids.length !== 2 || !still.uids.includes(t.prev) || !still.uids.includes(t.uid))
    throw new Error(`the heading should carry ${t.prev} and ${t.uid}, carries ${still.uids}`);
  // And the previous unit reaches into the heading WITHOUT dragging its own
  // paragraph along: it is painted in both places, not moved to one.
  if (String(inside.where[t.prev]) !== 'body,heading')
    throw new Error(`${t.prev} paints in ${inside.where[t.prev]}, wanted both`);

  // ── and back OUT of it, into the material that follows ──────────────────
  await page.evaluate(({ uid, outOf }) => {
    Alpine.$data(document.body).push({ op: 'shift', after: uid, to: outOf });
  }, t);
  await page.waitForTimeout(300);

  const out = await read(page, [t.prev, t.uid, t.next]);
  const after = out.heads.find(h => h.text === t.text);
  console.log('OUTOF ' + JSON.stringify({ heads: out.heads.length, kept: !!after,
                                          uids: after?.uids, where: out.where }));
  if (out.bad.length) throw new Error('the second shift broke the partition: ' + out.bad.join('; '));
  if (!after) throw new Error(`"${t.text}" stopped being a heading when the boundary left it`);
  if (out.heads.length !== before.heads.length)
    throw new Error(`heading count moved to ${out.heads.length}`);
  // THE OTHER HALF OF THE REPORT: the heading's unit now owns the opening of the
  // next paragraph, and that text stays a paragraph. Promoting it was the
  // defect.
  if (after.text !== t.text)
    throw new Error(`the heading absorbed body text: "${after.text}"`);
  if (String(out.where[t.uid]) !== 'body,heading')
    throw new Error(`${t.uid} paints in ${out.where[t.uid]}, wanted both`);
}
