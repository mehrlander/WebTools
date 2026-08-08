// screenshot.mjs interaction scenario: the Map view's Harness tab, the harness
// census (docs/harness.json) rendered live.
//
//   node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/map-harness.mjs \
//     --out tools/.preview/map-harness.png --full
//
// Same stub shape as map-docs.mjs: the sandbox blocks api.github.com, so the
// scenario serves the REAL committed docs/harness.json through GH.get, with no
// token. What the pixels prove: the layer strip with per-layer blank-role
// counts, the invocation badges, and a blank role rendering in the warning
// tone rather than being hidden.
export default async function (page) {
  const reg = await page.evaluate(() => fetch('../../docs/harness.json').then(r => r.text()));
  const ok = await page.evaluate((regText) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';

    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (name) {
      if (name === 'docs/harness.json') return { text: regText };
      if (name === '.claude/settings.json' || name === 'CLAUDE.md' || name === '.web-tools.json'
          || name === 'docs/portable.json' || name === 'state/configs.json' || name === 'state/activity.json'
          || name === 'lists/todo.json' || name === 'lists/jots.json')
        throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };

    window.__shell.goMap();
    return true;
  }, reg);
  if (ok !== true) throw new Error('map-harness scenario: ' + ok);

  const host = () => [...document.querySelectorAll('[x-data]')]
    .find(el => (el.getAttribute('x-data') || '').includes('map('));

  await page.waitForFunction(host, { timeout: 20000 });
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = window.Alpine.$data(el);
    d.mapTab = 'harness';
    d.loadToolsReg();
  });
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = el && window.Alpine.$data(el);
    return d && d.toolsReg && !d.toolsLoading;
  }, { timeout: 20000 });
  await page.waitForTimeout(500);
}
