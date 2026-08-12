// The page-level note and the two controls it arrived with: the Page chip that
// opens a draft with nothing to aim at, the review button that reads the
// drawer's state instead of guessing, and the launcher's long-press menu that
// reaches the annotator without opening the drawer first.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-page-note.mjs
//
// STATE=draft  the Page draft open on the card                  (the default)
// STATE=saved  the note saved, drawer open on Notes beside it
// STATE=menu   the launcher's long-press menu

const STATE = process.env.STATE || 'draft';

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });
  await page.waitForFunction(() => window.Alpine && document.querySelector('[x-data^="fab"]'),
    null, { timeout: 15000 });

  if (STATE === 'menu') {
    await page.evaluate(() => {
      const d = window.Alpine.$data(document.querySelector('[x-data^="fab"]'));
      d.openFabMenu();
    });
    await page.waitForTimeout(400);
    return;
  }

  // The real path: tap Page, type the complaint, save it.
  await page.click('button[data-annotate-ui]:has-text("Page")');
  await page.click('button[data-annotate-ui][title^="Type instead"]');
  await page.fill('textarea[data-annotate-ui]',
    'The ref bar wraps to two lines under 380px and pushes the guide off screen. '
    + 'Wanted: it truncates the branch name instead.');

  if (STATE === 'draft') { await page.waitForTimeout(300); return; }

  await page.click('button[data-annotate-ui][title^="Save note"]');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const d = window.Alpine.$data(document.querySelector('[x-data^="fab"]'));
    d.open = true;
    d.activeTab = 'notes';
    d.annSync();
  });
  await page.waitForTimeout(600);
};
