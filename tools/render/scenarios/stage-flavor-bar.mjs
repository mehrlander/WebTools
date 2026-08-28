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
  // The markdown pill's tooltip, held open. It is the one preview that has to
  // be shot rather than asserted twice over: the conversion is Turndown's,
  // fetched on the hover, and the tooltip is CSS a logic test cannot see.
  await page.evaluate(async () => {
    const el = document.querySelector('[x-data*="stager"]');
    const d = window.Alpine.$data(el);
    await d.mdFor(d.pasteMarkdown[0].flavor);
  });
  await page.waitForTimeout(400);
  // Every box measured, because the one thing a CSS tooltip cannot do is flip:
  // daisyUI centres it on its anchor, so a 224px box over the first pill in the
  // row hung 85px off the left edge of a phone until the content was pinned to
  // the pill's left edge instead. The log is where that stays checked.
  const boxes = await page.evaluate(() => {
    const root = document.querySelector('[x-data*="stager"]');
    return [...root.querySelectorAll('.tooltip')].map(t => {
      t.classList.add('tooltip-open');
      const r = t.querySelector('.tooltip-content').getBoundingClientRect();
      t.classList.remove('tooltip-open');
      return [Math.round(r.left), Math.round(r.right)];
    });
  });
  const off = boxes.filter(([l, r]) => l < 0 || r > 390);
  console.log('tooltip boxes ' + JSON.stringify(boxes) + (off.length ? ' OFF-SCREEN' : ' all on screen'));

  await page.evaluate(() => {
    const root = document.querySelector('[x-data*="stager"]');
    [...root.querySelectorAll('.tooltip')]
      .find(t => /markdown/.test(t.textContent)).classList.add('tooltip-open');
  });
  await page.waitForTimeout(600);
};
