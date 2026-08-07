// Scrolls the code-layers guide to its argument section, so the options, the target
// concept, and the migration steps are inspectable rather than assumed from a
// shot of the header.
//
//   npm run shot -- pages/guides/code-layers.html --script tools/render/scenarios/code-layers-guide-lower.mjs --height 1500
//
// AT=options|concept|migration picks the section (default options).
export default async (page) => {
  const at = process.env.AT || 'options';
  const idx = { options: 2, concept: 3, migration: 4 }[at] ?? 2;
  await page.waitForTimeout(1200);
  await page.evaluate((i) => {
    const s = document.querySelectorAll('section');
    if (s[i]) s[i].scrollIntoView({ block: 'start' });
  }, idx);
  await page.waitForTimeout(400);
};
