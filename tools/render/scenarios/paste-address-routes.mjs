// A pasted ADDRESS opens what it names; everything else still stages.
//
// Three pastes, one after another, against the claim added 2026-08-28: the
// estate app had exactly one paste behavior (all content, to the Stage) while
// toss-render two clicks away had routed by shape since it was written.
//
// Public addresses only, deliberately. Headless carries no GitHub token, so a
// private repo would 404 and the run would report a token problem as a routing
// one. web-tools reading its own files is the same code path.
//
//   npm run shot -- app/index.html --script tools/render/scenarios/paste-address-routes.mjs --wait 4000

const paste = (text) => {
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  document.body.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: dt, bubbles: true, cancelable: true,
  }));
};

export default async function (page) {
  await page.evaluate(() => window.__shell?.goMap?.());
  await page.waitForTimeout(600);

  const run = async (label, text) => {
    await page.evaluate(([fn, t]) => { new Function('text', '(' + fn + ')(text)')(t); },
                        [paste.toString(), text]);
    await page.waitForTimeout(2200);
    const state = await page.evaluate(() => {
      const s = window.Alpine?.store('browser') || {};
      return {
        view: window.__shell?.view,
        openFile: window.__shell?.openFilePath || '',
        repo: s.repo,
        staged: (s.stage || []).map(it => it.name || it.path),
      };
    });
    console.log(label + ': ' + JSON.stringify(state));
    return state;
  };

  // 1. the bare grammar
  await run('address        ', 'mehrlander/web-tools:docs/routes-paste.csv');
  // 2. a toss link, whose subject is what pasting it means
  await page.evaluate(() => window.__shell?.goMap?.());
  await page.waitForTimeout(500);
  await run('toss link      ',
    'https://mehrlander.github.io/web-tools/pages/toss-render.html#gh=mehrlander/web-tools:docs/routes-modes.csv');
  // 3. prose is still content, and still lands on the Stage
  await run('prose (stages) ', 'just some words that are not an address at all');
}
