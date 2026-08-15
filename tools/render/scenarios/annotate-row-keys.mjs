// The note row's three keys, and the edit one of them leads to. The row has
// carried a bare ×, then a kebab menu, and now the verbs themselves: edit,
// copy, remove, floating over the note rather than taking a column off it.
// Replaces annotate-row-menu.mjs, retired with the menu (2026-08-15).
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-row-keys.mjs
//
// STATE=rows      two saved notes, keys showing            (the default)
// STATE=selected  a long-quoted note selected, so the wash behind the keys
//                 is read against the amber row rather than the white one
// STATE=edit      the first note reopened in the composer

const STATE = process.env.STATE || 'rows';

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });
  await page.evaluate((state) => {
    window.Annotate.clear();
    if (state === 'selected') {
      const it = window.Annotate.add(
        { type: 'text', quote: { exact: 'Remote-sandbox conventions for Claude Code web sessions', prefix: '', suffix: '' } },
        'A quote long enough to wrap, so the caption is read against the room the keys reserve.');
      window.Annotate.select(it.id, { scroll: false });
      return;
    }
    window.Annotate.add({ type: 'page' },
      'The ref bar wraps to two lines under 380px and pushes the guide off screen.');
    window.Annotate.add({ type: 'page' }, 'Second note, so the cluster can be read against a row it is not selected on.');
  }, STATE);
  await page.waitForTimeout(250);
  if (STATE === 'rows' || STATE === 'selected') return;
  await page.click('[data-annotate-ui] button[title="Edit this note"]');
  await page.waitForTimeout(400);
};
