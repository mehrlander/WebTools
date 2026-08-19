// screenshot.mjs interaction scenario: the Map view's Registries tab, the
// declaration table of docs/registries.md rendered as cards.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/map-registries.mjs \
//     --out tools/.preview/map-registries.png --full
//
// The sandbox blocks api.github.com, so the scenario serves the REAL committed
// docs/registries.csv and docs/properties.csv (fetched relative, same origin) through a stubbed GH.get.
// No token is set, which also proves the tab renders for a tokenless reader.
// What the pixels prove: the three areas with the membership question under
// each heading, and a card leading with its title and gloss before the id,
// carrier, target grain, scope, and property badges.
export default async function (page) {
  const props = await page.evaluate(() => fetch('../../docs/registries.csv').then(r => r.text()));
  const decls = await page.evaluate(() => fetch('../../docs/properties.csv').then(r => r.text()));
  const ok = await page.evaluate(([propsText, declsText]) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';

    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (name) {
      if (name === 'docs/registries.csv') return { text: propsText };
      if (name === 'docs/properties.csv') return { text: declsText };
      if (name === '.claude/settings.json' || name === 'CLAUDE.md' || name === '.web-tools.json'
          || name === 'docs/portable.csv' || name === 'state/configs.json' || name === 'state/activity.json'
          || name === 'lists/todo.json' || name === 'lists/jots.json')
        throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };

    window.__shell.goMap();
    return true;
  }, [props, decls]);
  if (ok !== true) throw new Error('map-registries scenario: ' + ok);

  const host = () => [...document.querySelectorAll('[x-data]')]
    .find(el => (el.getAttribute('x-data') || '').includes('map('));

  await page.waitForFunction(host, { timeout: 20000 });
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = window.Alpine.$data(el);
    d.mapTab = 'registries';
    d.loadPropsReg();
  });
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = el && window.Alpine.$data(el);
    return d && d.propsReg && !d.propsLoading;
  }, { timeout: 20000 });
  await page.waitForTimeout(500);
}
