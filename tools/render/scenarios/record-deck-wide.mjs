// The record deck on a WIDE, SPARSE record, which is the case the format has
// to survive rather than the case it looks good in.
//
//   node tools/render/screenshot.mjs pages/data-view.html \
//     --script tools/render/scenarios/record-deck-wide.mjs \
//     --out tools/.preview/record-deck-wide.png --width 390 --height 844
//
// Forty columns, most of them blank on the row, one 300-character note and one
// unbroken 120-character token. That shape is not invented: budget-drs's data
// explorer holds a 90-column fact table, and a fact table is mostly blank on
// any given row. Two things are being looked at:
//
//   - the empty fields are COLLAPSED and COUNTED, so the card is the eight
//     fields that say something rather than forty lines of which thirty-two
//     say nothing, and the reader can still see that thirty-two exist;
//   - nothing pushes the slide wider than the track. An unbroken token is the
//     classic way that happens, and when it does every index past the wide
//     slide is wrong (swipe-deck's own note).
export default async function (page) {
  await page.waitForSelector('#dv-viewer', { timeout: 15000 });

  const rows = await page.evaluate(async () => {
    const cols = ['vendor', 'agency', 'amount', 'note', 'ref'];
    for (let i = 1; i <= 35; i++) cols.push('attr_' + String(i).padStart(2, '0'));
    const filled = {
      vendor: 'ODP BUSINESS SOLUTIONS LLC',
      agency: 'Retirement Systems',
      amount: '606.88',
      note: 'A three-hundred character note, of the kind a real ledger carries in exactly one column and nowhere else, which is what makes it the field that decides whether this format holds together on a phone or quietly pushes the card past the edge of the track it is supposed to fit inside of.',
      ref: 'AFRS-2024-0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001',
      attr_01: '2023-25', attr_02: 'EA', attr_03: '0',
    };
    const row2 = { ...filled, vendor: 'STAPLES CONTRACT & COMMERCIAL', amount: '254.46' };
    const header = cols.join(',');
    const line = (r) => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(',');
    const csv = [header, line(filled), line(row2)].join('\n');
    const v = document.getElementById('dv-viewer').__viewer;
    v.defaultMode = 'table';
    await v.show('ledger.csv', csv, { local: true });
    return cols.length;
  });
  console.log('  columns', rows);

  await page.waitForSelector('#tab-deck button', { timeout: 15000 });
  await page.click('#tab-deck button');
  await page.waitForSelector('.sd-track', { timeout: 10000 });
  await page.waitForTimeout(700);

  const geom = await page.evaluate(() => {
    const t = document.querySelector('.sd-track');
    const s = t.children[0];
    const toggle = s.querySelector('button');
    return {
      track: t.clientWidth, slide: s.clientWidth, scrollW: s.scrollWidth,
      shown: s.querySelectorAll('dl:not(.hidden) > div').length,
      toggle: toggle && toggle.textContent.trim(),
      docScroll: document.documentElement.scrollWidth,
    };
  });
  console.log('  wide geometry', JSON.stringify(geom));
  if (geom.slide !== geom.track) console.log('  FAIL slide is not one track wide');
  if (geom.scrollW > geom.slide) console.log('  FAIL a field pushes the slide open');
}
