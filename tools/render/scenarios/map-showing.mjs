// screenshot.mjs interaction scenario: the Map view's Showing tab (named
// Transport until 2026-08-04), how content moves, renders, and gets looked at.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/map-showing.mjs \
//     --out tools/.preview/map-showing.png --full
//
// The sandbox blocks api.github.com, so the scenario serves the REAL committed
// docs/routes.json (fetched relative, same origin) through a stubbed GH.get.
// No token is set: Showing is public, like the set half, so this also proves
// the tab renders for a tokenless reader while Scope & adoption stays gated.
// What the pixels prove: the three-tab strip, the address grammar with its
// used-by chips, the delivery modes with a trust icon per row, and the toss
// routes resolving each key to its renderer page.
export default async function (page) {
  // Four carriers, since the tab assembles one object from them; serving only
  // routes.json would leave the three tables empty and the shot would prove
  // the frame rather than the rows.
  const FILES = ['docs/routes.json', 'docs/routes-modes.csv',
                 'docs/routes-routes.csv', 'docs/showing-mechanisms.csv'];
  const routes = Object.fromEntries(await Promise.all(FILES.map(async f =>
    [f, await page.evaluate(p => fetch('../../' + p).then(r => r.text()), f)])));
  const ok = await page.evaluate((routesText) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';

    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (name) {
      if (routesText[name]) return { text: routesText[name] };
      if (name === '.claude/settings.json' || name === 'CLAUDE.md' || name === '.web-tools.json'
          || name === 'docs/portable.csv' || name === 'state/configs.json' || name === 'state/activity.json'
          || name === 'lists/todo.json' || name === 'lists/jots.json')
        throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };

    window.__shell.goMap();
    return true;
  }, routes);
  if (ok !== true) throw new Error('map-showing scenario: ' + ok);

  const host = () => [...document.querySelectorAll('[x-data]')]
    .find(el => (el.getAttribute('x-data') || '').includes('map('));

  await page.waitForFunction(host, { timeout: 20000 });
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = window.Alpine.$data(el);
    d.mapTab = 'showing';
    d.loadRoutes();
  });
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = el && window.Alpine.$data(el);
    return d && d.routes && !d.routesLoading;
  }, { timeout: 20000 });
  await page.waitForTimeout(500);
}
