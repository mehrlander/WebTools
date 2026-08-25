// screenshot.mjs interaction scenario: data-view's `#item=` addressing, read
// and written. The delivery half (toss-render handing a trailing #frag to the
// rendered page) is proved by tools/render/scenarios/toss-fragment.mjs; this
// is the consumer, driven directly so the assertions are about the page rather
// than the shell around it.
//
//   node tools/render/screenshot.mjs pages/data-view.html \
//     --hash "item=README.md" \
//     --script tools/render/scenarios/data-view-item.mjs
//
// The built-in demo envelope is the fixture: three items (contributions.csv,
// shape.json, README.md), inline, so nothing here touches the network.
//
// Six assertions, printed as ASSERT lines for the caller to read:
//   1. name form     — #item=README.md opens item 2, in that item's own view.
//   2. index form    — #item=1 opens item 1.
//   3. miss          — an unknown name opens item 0 and raises no error,
//                      and the address is corrected to what is on screen.
//   4. write-back    — selecting an item puts its name in the fragment.
//   5. neighbours    — a sibling key in the fragment survives the write.
//   6. no back stack — the writes are replaceState, so one entry, not four.
export default async function (page) {
  const base = page.url().split('#')[0];

  const state = () => page.evaluate(() => {
    const app = window.Alpine.$data(document.querySelector('[x-data^="app"]'));
    const v = document.getElementById('dv-viewer')?.__viewer;
    return { sel: app.sel, error: app.error, hash: location.hash, file: v?.file || '', mode: v?.mode || '' };
  });

  // Load the page AT a fragment. The reload is not belt and braces: a goto
  // that changes only the fragment is a same-document navigation, so the page
  // would keep the state it already had and every read here would be of the
  // previous case.
  const at = async (frag) => {
    await page.goto(base + (frag ? '#' + frag : ''), { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1800);
    return state();
  };

  const ok = (label, cond, detail) =>
    console.log(`ASSERT ${cond ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);

  // 1. The name form, as delivered by the harness's own --hash.
  const named = await state();
  ok('name form: #item=README.md opens item 2', named.sel === 2 && named.file === 'README.md',
     JSON.stringify(named));
  ok('name form: the item\'s declared view still wins', named.mode === 'preview',
     'mode ' + JSON.stringify(named.mode));

  // 2. The index form.
  const indexed = await at('item=1');
  ok('index form: #item=1 opens item 1', indexed.sel === 1 && indexed.file === 'shape.json',
     JSON.stringify(indexed));

  // 3. A miss falls back to item 0 without erroring, and says so in the URL.
  const missed = await at('item=nope.txt');
  ok('miss: falls back to item 0, no error', missed.sel === 0 && missed.error === '',
     JSON.stringify(missed));
  ok('miss: the address is corrected to what is shown', missed.hash === '#item=contributions.csv',
     'got ' + JSON.stringify(missed.hash));

  // 4 and 5. Selecting writes back, beside a key the page does not own.
  await at('item=0&keep=me');
  const entriesBefore = await page.evaluate(() => history.length);
  await page.evaluate(() => window.Alpine.$data(document.querySelector('[x-data^="app"]')).open(2));
  await page.waitForTimeout(1200);
  const written = await state();
  ok('write-back: selecting an item addresses it', /(^|[#&])item=README\.md([&]|$)/.test(written.hash),
     'hash ' + JSON.stringify(written.hash));
  ok('write-back: a neighbouring key survives', /(^|[#&])keep=me([&]|$)/.test(written.hash),
     'hash ' + JSON.stringify(written.hash));

  // 6. Two more selections, to show the back stack is not growing.
  await page.evaluate(async () => {
    const app = window.Alpine.$data(document.querySelector('[x-data^="app"]'));
    await app.open(1); await app.open(0);
  });
  await page.waitForTimeout(1200);
  const entriesAfter = await page.evaluate(() => history.length);
  ok('no back stack: three selections add no history entries',
     entriesAfter === entriesBefore, `history.length ${entriesBefore} -> ${entriesAfter}`);

  // Land on a real item for the shot itself.
  await page.evaluate(() => window.Alpine.$data(document.querySelector('[x-data^="app"]')).open(2));
  await page.waitForTimeout(1200);
}
