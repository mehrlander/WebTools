// Editing a note folds its row away, so the composer is the only copy of it on
// screen. Reopening one through the pencil used to put it in two places at
// once: in the composer with a caret in it, and as a static row underneath
// still showing the text being replaced.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-edit-row.mjs
//
// STATE=editing  the pencil open on note 2, its row gone from the list (default)
// STATE=saved    the same note saved, its row back with the new words
export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });
  const state = new URL(page.url()).searchParams.get('state') || 'editing';

  await page.evaluate(() => {
    const A = window.Annotate;
    A.add({ type: 'element', selector: '#doc h1', excerpt: 'Working conventions (portable)' },
      'Does the title still earn its own line?');
    A.add({ type: 'page' }, 'Three sections in and the scope is still not stated.');
    A.expand(true);
  });
  await page.waitForTimeout(200);

  // The pencil on the second row.
  await page.evaluate(() => window.Annotate.editNote(window.Annotate.items[1].id));
  await page.waitForTimeout(250);

  if (state === 'saved') {
    // The keyboard is the way into the text in a headless run, and its dismiss
    // is the way back out to the control row that carries Save.
    await page.evaluate(() => {
      const S = window.Annotate._state;
      const r = S.compView.getBoundingClientRect();
      const x = Math.round(r.left + 20), y = Math.round(r.bottom - 6);
      for (let i = 0; i < 2; i++) {
        S.compView.dispatchEvent(new PointerEvent('pointerup', {
          clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: true }));
      }
    });
    await page.fill('textarea[data-annotate-ui]', 'Scope is stated in section four, so this is answered.');
    await page.evaluate(() => document.querySelector('textarea[data-annotate-ui]').blur());
    await page.click('button[data-annotate-ui][title^="Save note"]');
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(300);
};
