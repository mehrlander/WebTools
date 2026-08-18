// screenshot.mjs interaction scenario: the Map view's Tests tab, the test
// census (docs/tests.json) rendered live with the assertion names expanded.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/map-tests.mjs \
//     --out tools/.preview/map-tests.png --full
//
// Same stub shape as map-harness.mjs: the sandbox blocks api.github.com, so the
// scenario serves the REAL committed docs/tests.json through GH.get, with no
// token. What the pixels prove: the `names` toggle expanding every row's
// assertion list, the method heading saying which axis it is, and a compressed
// `protects` sitting above a list rather than absorbing it.
//
// Scoped to the `kit` kind so the shot stays legible: the toggle is deliberately
// census-wide, and 119 expanded files is a page nobody reads. That pairing, a
// global expansion plus a kind filter, is the interaction worth showing.
export default async function (page) {
  const reg = await page.evaluate(() => fetch('../../docs/tests.json').then(r => r.text()));
  const ok = await page.evaluate((regText) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';

    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (name) {
      if (name === 'docs/tests.json') return { text: regText };
      if (name === '.claude/settings.json' || name === 'CLAUDE.md' || name === '.web-tools.json'
          || name === 'docs/portable.csv' || name === 'state/configs.json' || name === 'state/activity.json'
          || name === 'lists/todo.json' || name === 'lists/jots.json')
        throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };

    window.__shell.goMap();
    return true;
  }, reg);
  if (ok !== true) throw new Error('map-tests scenario: ' + ok);

  const host = () => [...document.querySelectorAll('[x-data]')]
    .find(el => (el.getAttribute('x-data') || '').includes('map('));

  await page.waitForFunction(host, { timeout: 20000 });
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = window.Alpine.$data(el);
    d.mapTab = 'tests';
    d.loadTestsReg();
  });
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = el && window.Alpine.$data(el);
    return d && d.testsReg && !d.testsLoading;
  }, { timeout: 20000 });
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = window.Alpine.$data(el);
    d.testKind = 'kit';
    d.testNames = true;
  });
  await page.waitForTimeout(600);
}
