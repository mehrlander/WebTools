// The payoff of the links pill: tap it and the links are a rendered, tappable
// markdown list.
//
//   npm run shot -- app/index.html --query "view=stage" \
//     --script tools/render/scenarios/stage-links-list.mjs --width 390
//
// This is the half a logic test cannot claim. The extraction stages a `.md`
// precisely so READ_MODE opens it as a rendered preview: the same lines that
// paste anywhere as `- [text](url)` arrive here as a list you can tap. It was a
// `.csv` for a day, reasoned from the machinery rather than from the errand.
import paste from './stage-flavor-bar.mjs';

export default async (page) => {
  await paste(page);
  await page.evaluate(() => {
    const el = document.querySelector('[x-data*="stager"]');
    const d = window.Alpine.$data(el);
    d.extractLinks(d.pasteLinks[0]);
  });
  await page.waitForTimeout(2500);
};
