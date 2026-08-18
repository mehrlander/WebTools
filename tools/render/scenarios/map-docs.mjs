// screenshot.mjs interaction scenario: the Map view's Docs tab, the
// documentation registry (docs/docs.csv) rendered live.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/map-docs.mjs \
//     --out tools/.preview/map-docs.png --full
//
// Same stub shape as map-showing.mjs: the sandbox blocks api.github.com, so
// the scenario serves the REAL committed docs/docs.csv through GH.get, with
// no token, proving the tab renders for a tokenless reader. What the pixels
// prove: the documents registry grouped by folder with status badges, and the
// shared-claims cards where an unchecked copy renders in the warning tone.
export default async function (page) {
  const reg = await page.evaluate(() => fetch('../../docs/docs.csv').then(r => r.text()));
  const ok = await page.evaluate((regText) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';

    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (name) {
      if (name === 'docs/docs.csv') return { text: regText };
      if (name === '.claude/settings.json' || name === 'CLAUDE.md' || name === '.web-tools.json'
          || name === 'docs/portable.csv' || name === 'state/configs.json' || name === 'state/activity.json'
          || name === 'lists/todo.json' || name === 'lists/jots.json')
        throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };

    window.__shell.goMap();
    return true;
  }, reg);
  if (ok !== true) throw new Error('map-docs scenario: ' + ok);

  const host = () => [...document.querySelectorAll('[x-data]')]
    .find(el => (el.getAttribute('x-data') || '').includes('map('));

  await page.waitForFunction(host, { timeout: 20000 });
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = window.Alpine.$data(el);
    d.mapTab = 'docs';
    d.loadDocsReg();
  });
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = el && window.Alpine.$data(el);
    return d && d.docsReg && !d.docsLoading;
  }, { timeout: 20000 });
  await page.waitForTimeout(500);
}
