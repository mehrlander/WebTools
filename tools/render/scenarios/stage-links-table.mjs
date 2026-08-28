// The payoff of the Inside row: tap the chip and the links are a table.
//
//   npm run shot -- app/index.html --query "view=stage" \
//     --script tools/render/scenarios/stage-links-table.mjs --width 390
//
// This is the half a logic test cannot claim. The extraction stages a `.csv`
// rather than a rendered list precisely so READ_MODE opens it as a filterable
// table and transformKindOf calls it rows; whether Tabulator actually draws it
// is a browser fact, and the transform chip's own scenario is here for the same
// reason (a missing Tabulator returns from its render hook in silence).
import paste from './stage-links-inside.mjs';

export default async (page) => {
  await paste(page);
  await page.evaluate(() => {
    const el = document.querySelector('[x-data*="stager"]');
    const d = window.Alpine.$data(el);
    d.extractLinks(d.extractables[0]);
  });
  await page.waitForTimeout(2500);
};
