// screenshot.mjs interaction scenario: the Map view's Growth tab, federated.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/map-growth.mjs --out tools/.preview/map-growth.png
//
// GROWTH_REPO selects a corpus (default: the hub). The point of the shot is the
// corpus strip, which exists because this chart was two top-level app views
// until 2026-08-28, one per repo, rendering as the words "Doc Growth" twice in
// the estate nav with nothing to choose between them.
//
// A token is set, since the strip is built from the private registry's config
// cache. Without one the tab still renders the hub's chart, because that
// payload is the page's own built-in default and a public fetch; the strip is
// what goes away, and that is the tokenless reading worth remembering.
//
// The framed chart itself will not paint here: it is an iframe onto
// pages/doc-growth.html, which pulls Alpine and daisyUI from the CDN. The
// scenario is about the chrome around it.
export default async function (page) {
  const ok = await page.evaluate(() => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.TOKEN = 'fixture-token';

    // The live cache, read 2026-08-28: two repos declare a payload, in two
    // different places, which is why `growth` carries a path and not a boolean.
    const CONFIGS = { repos: {
      'mehrlander/web-tools': { config: { growth: 'data/doc-growth/web-tools.json' } },
      'mehrlander/home': { config: { growth: 'data/doc-growth.json' } },
      'mehrlander/chat-histories': { config: {} },
      'mehrlander/gone': { config: null },
    } };

    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (name) {
      if (/configs\.json$/.test(name)) return { text: JSON.stringify(CONFIGS) };
      if (name === '.claude/settings.json' || name === 'CLAUDE.md' || name === '.web-tools.json'
          || name === 'state/activity.json'
          || name === 'lists/todo.json' || name === 'lists/jots.json')
        throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };

    window.__shell.goMap();
    return true;
  });
  if (ok !== true) throw new Error('map-growth scenario: ' + ok);

  await page.waitForFunction(() => [...document.querySelectorAll('[x-data]')]
    .some(el => (el.getAttribute('x-data') || '').includes('map(')), { timeout: 20000 });

  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = window.Alpine.$data(el);
    d.mapTab = 'growth';
    d.loadTab('growth');
  });

  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = el && window.Alpine.$data(el);
    return d && d.estateGrowth && d.estateGrowth.length > 1;
  }, { timeout: 20000 });

  if (process.env.GROWTH_REPO) {
    await page.evaluate((repo) => {
      const el = [...document.querySelectorAll('[x-data]')]
        .find(e => (e.getAttribute('x-data') || '').includes('map('));
      window.Alpine.$data(el).selectGrowthRepo(repo);
    }, process.env.GROWTH_REPO);
  }
  await page.waitForTimeout(500);
}
