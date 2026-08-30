// screenshot.mjs interaction scenario: the Map view's Injection tab.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/map-injection.mjs --out tools/.preview/map-injection.png
//
// The sandbox blocks api.github.com, so the scenario serves the REAL committed
// docs/injection.json (fetched relative, same origin) rather than a fixture:
// the tab's whole claim is that these are measured figures, and a made-up
// reading would make the shot a picture of a session nobody had.
//
// Tokenless, like map-registries. The tab reads one file from the hub and
// nothing from the private registry, so the tokenless reading is the only one.
export default async function (page) {
  const injection = await page.evaluate(() => fetch('../../docs/injection.json').then(r => r.text()));
  const ok = await page.evaluate((injectionText) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (name) {
      if (name === 'docs/injection.json') return { text: injectionText };
      if (name === '.claude/settings.json' || name === 'CLAUDE.md' || name === '.web-tools.json'
          || name === 'state/activity.json'
          || name === 'lists/todo.json' || name === 'lists/jots.json')
        throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };
    window.__shell.goMap();
    return true;
  }, injection);
  if (ok !== true) throw new Error('map-injection scenario: ' + ok);

  const host = () => [...document.querySelectorAll('[x-data]')]
    .find(e => (e.getAttribute('x-data') || '').includes('map('));

  await page.waitForFunction(() => [...document.querySelectorAll('[x-data]')]
    .some(el => (el.getAttribute('x-data') || '').includes('map(')), { timeout: 20000 });

  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = window.Alpine.$data(el);
    d.mapTab = 'injection';
    d.loadInjection();
  });

  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = el && window.Alpine.$data(el);
    return d && d.injection && !d.injectionLoading;
  }, { timeout: 20000 });
}
