// The aim menu labels itself from the declared kind, not from strings of its
// own.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/kind-labels-the-aim.mjs
//
// The row read "Section" on every page it appeared on, which is the aim's
// implementation name rather than what the aim is about: a rendered document
// carries a DOM structure and a markdown structure at once and only one of them
// has sections in the sense meant here. kits/md-doc.js now declares its KIND
// (docs/routes-kinds.csv is the owner) and kits/annotate.js reads the label off
// the declaration, so the next kind to declare labels itself too.
//
// Driven here rather than in jsdom because the chip is synced on a mode change
// and on the md-doc:declared event, and neither fires without a real render.

const aimRow = (page, i) => page.evaluate((n) => {
  const menu = window.Annotate._state.aimMenu;
  const b = menu.children[n];
  return b ? { label: b._label.textContent, hint: b._hint.textContent, title: b.title,
               shown: b.style.display !== 'none' } : null;
}, i);

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 20000 });
  console.log('DECLARED ' + JSON.stringify(await page.evaluate(() => {
    const box = document.querySelector('[data-md-doc]');
    return { sections: box?.__mdDoc?.sections.length || 0, kind: box?.__mdDoc?.kind?.kind || null };
  })));

  // syncChips runs on the declaration event and on every mode change; the aim
  // menu is built at mount, so the label has to be re-read rather than set once.
  await page.evaluate(() => window.Annotate.startPick({ aim: 'section' }));
  await page.waitForTimeout(200);

  // Index 2 is Section: Page leads the menu, then Element, Section, Region.
  console.log('SECTION  ' + JSON.stringify(await aimRow(page, 2)));
  console.log('ELEMENT  ' + JSON.stringify(await aimRow(page, 1)));

  // The reading chip is icon-only, so its tooltip is its label, and it named
  // the DOM on a reading that is markdown's whenever the aim is a section.
  console.log('CHIP     ' + JSON.stringify(await page.evaluate(() => {
    const S = window.Annotate._state;
    const box = document.querySelector('[data-md-doc]');
    // The aim goes in BEFORE the reading is chosen: renderDom names the chip
    // from the subject it finds, so choosing the reading first would ask about
    // nothing and write the DOM wording it then never revisits.
    S.aimEl = box.querySelector('[data-md-section]'); S.aimKind = 'section';
    window.Annotate.expand(true);
    window.Annotate.setReading('dom');
    return { title: S.readChips.dom.title, drawn: S.domBody.textContent.slice(0, 40).trim() };
  })));
};
