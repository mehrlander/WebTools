// screenshot.mjs interaction scenario: a numbered list renders as one, and a
// sentence taken from inside an item stays inside it.
//
//   node tools/render/screenshot.mjs pages/audit-render.html --width 900 \
//     --script tools/render/scenarios/audit-list.mjs
//
// THE MECHANISM THIS ONCE GUARDED IS GONE, and the property is not. The page
// used to render each unit as markdown on its own, so a numbered list survived
// only if every item was one unit carrying its own marker: a unit holding just
// `1. ` drew an <ol> with an empty <li>, an item that had lost its marker drew
// as a bare paragraph, and the three items renumbered to 1,1,1 unless marked
// read each authored ordinal into its own <ol start=N>. The document is rendered
// once now and the <ol> is its own, so all of that is structurally impossible.
//
// What is checked instead is what a reader actually sees: one list, three
// numbered items, and every unit's text inside the item it belongs to. That last
// one is the same question one level up, and the answer no longer depends on the
// grain at all.
export default async function (page) {
  await page.waitForSelector('[x-ref="doc"] [data-uid]');
  const out = await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    const at = d.a.text.indexOf('ask three questions in order');
    const units = d.units.filter(u => u.start > at && u.start < at + 460);
    // The <li> each unit's text landed in, by the piece rather than by a
    // per-unit element: a unit is several pieces now, and any of them answers.
    const liOf = (u) => document.querySelector(`[data-uid="${CSS.escape(u.uid)}"]`)?.closest('li');
    const lis = [...new Set(units.map(liOf).filter(Boolean))];
    const ol = lis[0]?.closest('ol');
    return {
      units: units.map(u => ({ uid: u.uid, text: d.a.text.slice(u.start, u.start + 3),
                               li: lis.indexOf(liOf(u)) })),
      items: lis.length,
      oneList: lis.every(li => li.closest('ol') === ol),
      ordinals: ol ? [...ol.children].map(li => getComputedStyle(li, '::marker').content
                                              || String([...ol.children].indexOf(li) + 1)) : [],
      empties: lis.filter(li => !li.textContent.trim()).length,
      lefts: lis.map(li => Math.round(li.getBoundingClientRect().left)),
      section: at,
    };
  });
  console.log('LIST ' + JSON.stringify(out.units));
  console.log('SHAPE ' + JSON.stringify({ items: out.items, oneList: out.oneList,
                                          empties: out.empties, lefts: out.lefts }));

  if (out.items !== 3) throw new Error(`expected 3 list items, saw ${out.items}`);
  if (!out.oneList) throw new Error('the three items are not in one <ol>');
  if (out.empties) throw new Error(`${out.empties} list item(s) render empty`);
  if (new Set(out.lefts).size !== 1)
    throw new Error(`the items sit at different indents: ${out.lefts}`);

  // EVERY UNIT BETWEEN THE FIRST ITEM AND THE LAST IS INSIDE AN ITEM, including
  // the ones carrying no marker. That is the whole claim: text keeps the element
  // status it had in the document, whatever the annotation did to the boundaries
  // around it. Bounded by the list's own extent rather than by a character
  // window, since the prose after it is legitimately outside.
  const first = out.units.findIndex(u => u.li >= 0);
  const last = out.units.map(u => u.li >= 0).lastIndexOf(true);
  const loose = out.units.slice(first, last + 1).filter(u => u.li < 0);
  if (first < 0) throw new Error('no unit landed in a list item at all');
  if (loose.length)
    throw new Error(`inside the list but outside any item: ` +
                    loose.map(u => `${u.uid} (${u.text})`).join(', '));

  await page.evaluate((at) => {
    const d = Alpine.$data(document.body);
    const u = d.units.find(x => x.start > at);
    document.querySelector(`[data-uid="${CSS.escape(u.uid)}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, out.section);
  await page.waitForTimeout(400);
}
