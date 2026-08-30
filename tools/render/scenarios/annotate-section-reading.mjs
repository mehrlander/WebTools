// The section aim's markdown reading, and the hierarchy it steps through.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-section-reading.mjs
//
// A rendered markdown document has TWO structures over it and they disagree:
// the DOM's (`article > div > h3`) and markdown's (`### Form` inside `## Marker`
// inside `# Status`), which are flat siblings in the DOM. This drives the
// second one. jsdom has no layout and no declared render, so this is the only
// place the section step is exercised at all.

const head = (page) => page.evaluate(() =>
  (window.Annotate._state.domBody.firstElementChild?.textContent || '').trim());
const crumbs = (page) => page.evaluate(() =>
  [...document.querySelectorAll('[data-peek-crumb]')].map(b => b.textContent.trim()));

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 20000 });
  console.log('RENDER ' + JSON.stringify(await page.evaluate(() => {
    const box = document.querySelector('[data-md-doc]');
    return { sections: box?.__mdDoc?.sections.length || 0 };
  })));

  await page.evaluate(() => window.Annotate.startPick({ aim: 'section' }));
  await page.waitForTimeout(250);
  console.log('ARMED  ' + JSON.stringify(await page.evaluate(() =>
    ({ expanded: window.Annotate.expanded, reading: window.Annotate.reading }))));

  // A point inside a DEEP section, so the step has somewhere to go, and ABOVE
  // THE CARD: arming opens it, and `block:'center'` puts the paragraph after a
  // heading almost exactly on its top edge (measured: the point landed at 501
  // against a card at 488 and every tap hit the panel).
  const at = await page.evaluate(() => {
    const box = document.querySelector('[data-md-doc]');
    const secs = box.__mdDoc.sections;
    const deep = secs.reduce((a, b) => (b.depth > a.depth ? b : a), secs[0]);
    const h = box.querySelector(`[data-md-section="${deep.index}"]`);
    h.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -120);
    const p = h.nextElementSibling || h;
    const r = p.getBoundingClientRect();
    const card = window.Annotate._state.panel.getBoundingClientRect();
    return { x: Math.round(r.left + 30), y: Math.round(r.top + 6),
             cardTop: Math.round(card.top), aimed: deep.title, depth: deep.depth };
  });
  console.log('POINT  ' + JSON.stringify(at));

  for (const n of [1, 2, 3]) {
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(220);
    console.log(`TAP${n}   ${await head(page)}`);
  }
  console.log('CRUMBS ' + JSON.stringify(await crumbs(page)));
  console.log('PANE\n' + await page.evaluate(() =>
    window.Annotate._state.domBody.textContent.replace(/\s*\n\s*/g, ' ').slice(0, 420)));

  // Back to the innermost, for the shot.
  await page.evaluate(() => {
    const bs = [...document.querySelectorAll('[data-peek-crumb]')];
    bs.find(b => b.dataset.peekCrumb === '0')?.click();
  });
  await page.waitForTimeout(250);
};
