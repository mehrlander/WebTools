// Shoot the flavors bar after a web-page paste, with one flavor's preview open.
// A copy off a page splits across two clipboard flavors: text/plain holds every
// link's LABEL and not one of its addresses, text/html holds the addresses
// inside markup nobody wants to read. The bar names both, ticks the one the
// stage took, offers the links and the whole-page conversion as pills beside
// them, and hovering any pill shows what is inside it, which is the only way to
// tell two flavors apart before staging one.
//
//   npm run shot -- app/index.html --query "view=stage" \
//     --script tools/render/scenarios/stage-flavor-bar.mjs --width 390
//
// The event is synthesized for the reason stage-paste-flavors.mjs gives: the
// sandbox has no clipboard, and what is under test is the reading of a
// DataTransfer rather than the platform's construction of one.
export default async (page) => {
  await page.waitForSelector('[x-data*="stager"]', { timeout: 15000 });
  await page.evaluate(async () => {
    const text = [
      'Working conventions Surfacing Portable docs',
      'The stage The show-repo shell Envelopes',
      'Ask on GitHub',
    ].join('\n');
    const html = `<div>
      <p><a href="https://github.com/mehrlander/web-tools/blob/main/docs/CONVENTIONS.md">Working conventions</a>
         <a href="https://github.com/mehrlander/web-tools/blob/main/docs/SURFACING.md">Surfacing</a>
         <a href="https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md">Portable docs</a></p>
      <p><a href="https://github.com/mehrlander/web-tools/blob/main/docs/stage.md">The stage</a>
         <a href="https://github.com/mehrlander/web-tools/blob/main/docs/show-repo.md">The show-repo shell</a>
         <a href="https://github.com/mehrlander/web-tools/tree/main/docs/envelopes">Envelopes</a></p>
      <p><a href="#top">Back to top</a>
         <a href="mailto:ask@example.com">Ask</a>
         <a href="https://github.com/mehrlander/web-tools/issues">on GitHub</a></p>
    </div>`;
    await window.StageIntake.takePaste({
      types: ['text/plain', 'text/html'],
      files: [],
      getData: (t) => (t === 'text/plain' ? text : t === 'text/html' ? html : ''),
    });
  });
  await page.waitForTimeout(600);
  // The html flavor's peek, opened by a real hover. The card is the house one
  // (kits/source-peek.js), so this shoots the kit's own placement and dwell
  // rather than anything this view draws: 320 ms before it opens, left-aligned
  // to the pill, flipped above when it does not fit below.
  const pill = await page.evaluateHandle(() => {
    const root = document.querySelector('[x-data*="stager"]');
    return [...root.querySelectorAll('[data-peek]')].find(b => /html/.test(b.textContent));
  });
  await pill.asElement().hover();
  await page.waitForTimeout(900);
  const box = await page.evaluate(() => {
    const c = document.getElementById('wt-source-peek');
    if (!c || c.style.display === 'none') return null;
    const r = c.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.right), Math.round(r.top)];
  });
  console.log('peek card ' + JSON.stringify(box)
    + (box && box[0] >= 0 && box[1] <= 390 ? ' on screen' : ' OFF-SCREEN or closed'));
};
