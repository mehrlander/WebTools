// Shoot the flavors bar after a web-page paste, with one flavor's preview open.
// A copy off a page splits across two clipboard flavors: text/plain holds every
// link's LABEL and not one of its addresses, text/html holds the addresses
// inside markup nobody wants to read. The bar names both, ticks the one the
// stage took, offers the links as a pill beside them, and each pill's eye shows
// the bytes, which is the only way to tell those two apart before staging one.
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
  // The html's own preview: the flavor that carries the addresses, which reads
  // as markup and is exactly what a title attribute could never have told you.
  await page.evaluate(() => {
    const el = document.querySelector('[x-data*="stager"]');
    const d = window.Alpine.$data(el);
    d.peek('flavor', d.offers.find(o => d.flavorLabel(o) === 'html'));
  });
  await page.waitForTimeout(500);
};
