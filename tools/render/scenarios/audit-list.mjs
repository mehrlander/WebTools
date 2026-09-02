// screenshot.mjs interaction scenario: a numbered list renders as one.
//
//   node tools/render/screenshot.mjs pages/audit-render.html --width 900 \
//     --script tools/render/scenarios/audit-list.mjs
//
// Each unit is rendered as markdown ON ITS OWN, so a numbered list only survives
// if each item is one unit carrying its own marker. When the segmenter cut `1. `
// off as a sentence, the marker rendered as an <ol> with an empty <li> and the
// item rendered as a bare paragraph: three empty numbers over three unindented
// sentences, which is a document nobody would read as a list.
//
// The numbering across separately-rendered items is the second half and it is
// not free: `2. …` alone is an <ol start="2"> only because marked reads the
// authored number. So the check is the rendered ordinal, not the presence of a
// list.
export default async function (page) {
  await page.waitForSelector('[x-ref="doc"] span');
  const out = await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    const at = d.a.text.indexOf('ask three questions in order');
    const items = d.units.filter(u => u.start > at && u.start < at + 400);
    const marks = items.map(u => {
      const el = document.querySelector(`[data-uid="${CSS.escape(u.uid)}"]`);
      const li = el?.querySelector('li');
      return { uid: u.uid, text: d.a.text.slice(u.start, u.start + 3),
               isList: !!li, empty: li ? !li.textContent.trim() : null,
               start: el?.querySelector('ol')?.getAttribute('start') };
    });
    return { marks, section: at };
  });
  console.log('LIST ' + JSON.stringify(out.marks));

  const numbered = out.marks.filter(m => /^\d\.\s/.test(m.text));
  if (numbered.length !== 3) throw new Error(`expected 3 numbered items, saw ${numbered.length}`);
  for (const m of numbered) {
    if (!m.isList) throw new Error(`${m.uid} carries a marker but renders as prose`);
    if (m.empty) throw new Error(`${m.uid} renders an empty list item`);
  }
  // Separately rendered items keep their authored ordinal: 1, then start="2",
  // then start="3". A missing `start` on the second or third means all three
  // drew as "1".
  const starts = numbered.map(m => m.start ?? '1');
  if (starts.join(',') !== '1,2,3') throw new Error(`the list renumbers: ${starts}`);

  // A CONTINUATION is a sentence from inside an item, and it has to sit on the
  // item's indent rather than back at the prose margin. Measured against the
  // item above it, not against a constant, since the indent comes from the
  // prose styles and a constant would agree with them only by luck.
  const indent = await page.evaluate((at) => {
    const d = Alpine.$data(document.body);
    const item = d.units.find(u => u.start > at && /^\s{0,3}2\.\s/.test(d.a.text.slice(u.start, u.start + 4)));
    const cont = d.units.find(u => u.start > item.end);
    const box = (u) => document.querySelector(`[data-uid="${CSS.escape(u.uid)}"]`)
      ?.querySelector('li')?.getBoundingClientRect().left;
    return { item: box(item), cont: box(cont), contText: d.a.text.slice(cont.start, cont.start + 20) };
  }, out.section);
  console.log('INDENT ' + JSON.stringify(indent));
  if (indent.cont == null) throw new Error('the continuation renders outside any list item');
  if (Math.abs(indent.cont - indent.item) > 1)
    throw new Error(`the continuation sits at ${indent.cont}, the item it belongs to at ${indent.item}`);

  await page.evaluate((at) => {
    const d = Alpine.$data(document.body);
    const u = d.units.find(x => x.start > at);
    document.querySelector(`[data-uid="${CSS.escape(u.uid)}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, out.section);
  await page.waitForTimeout(400);
}
