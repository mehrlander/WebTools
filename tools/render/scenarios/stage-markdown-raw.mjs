// The payoff of the html pill's "To markdown": the page is markdown, opened RAW.
//
//   npm run shot -- app/index.html --query "view=stage" \
//     --script tools/render/scenarios/stage-markdown-raw.mjs --width 390
//
// This is the half a logic test cannot claim, and it is a claim about the
// OVERRIDE: every other `.md` in this app renders, and the stage's own reader
// sends a conversion to `raw` instead, because a conversion is a payload to copy
// rather than a document to read. What has to be on screen is the markdown as
// written, links and all, not a rendering of it.
import paste from './stage-flavor-bar.mjs';

export default async (page) => {
  await paste(page);
  await page.evaluate(async () => {
    const el = document.querySelector('[x-data*="stager"]');
    const d = window.Alpine.$data(el);
    const html = d.offers.find(o => d.flavorLabel(o) === 'html');
    await d.runAction(html, { id: 'markdown', label: 'To markdown' });
  });
  await page.waitForTimeout(2500);
};
