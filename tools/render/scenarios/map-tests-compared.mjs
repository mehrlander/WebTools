// screenshot.mjs interaction scenario: the Map view's Tests tab with the
// `compared` toggle on, the comparison-grain reading
// (data/checks-reading/explanations.csv) under each file that has one.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/map-tests-compared.mjs \
//     --out tools/.preview/map-tests-compared.png --full
//
// Same stub shape as map-tests.mjs, serving both committed CSVs through GH.get
// with no token. Scoped to the `gate` kind so the shot stays legible: that is
// where the explained files sit. What the pixels prove: under a file, one block
// per comparison, the kind leading and "does not establish" closing.
export default async function (page) {
  const reg = await page.evaluate(() => fetch('../../docs/tests.csv').then(r => r.text()));
  const expl = await page.evaluate(() => fetch('../../data/checks-reading/explanations.csv').then(r => r.text()));
  const ok = await page.evaluate(([regText, explText]) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (name) {
      if (name === 'docs/tests.csv') return { text: regText };
      if (name === 'data/checks-reading/explanations.csv') return { text: explText };
      if (name === '.claude/settings.json' || name === 'CLAUDE.md' || name === '.web-tools.json'
          || name === 'docs/portable.csv' || name === 'state/configs.json' || name === 'state/activity.json'
          || name === 'lists/todo.json' || name === 'lists/jots.json')
        throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };
    window.__shell.goMap();
    return true;
  }, [reg, expl]);
  if (ok !== true) throw new Error('map-tests-compared scenario: ' + ok);
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
    d.testPick = { kind: 'gate' };
    d.testExplained = true;
  });
  await page.waitForTimeout(600);
  // The explained files sit under method read, below the fold at any height,
  // so bring the registry test's row to the top of the scrolling pane.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'tests-registry');
    if (btn) btn.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(300);
}
