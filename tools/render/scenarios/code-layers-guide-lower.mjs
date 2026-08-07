// Opens one tab of the code-layers guide, so each of the four can be inspected
// rather than assumed from a shot of the first.
//
//   npm run shot -- pages/guides/code-layers.html --script tools/render/scenarios/code-layers-guide-lower.mjs
//
// TAB=now|options|target|migration (default options). The page routes on
// #tab=, so this drives the real router rather than poking Alpine state.
export default async (page) => {
  const tab = process.env.TAB || 'options';
  await page.evaluate((t) => { location.hash = 'tab=' + t; }, tab);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
};
