// screenshot.mjs interaction scenario: the Map view's first two tabs, both
// halves populated. (Formerly portable-view.mjs, for the view's old name; the
// component became map() in the rename, which left this scenario waiting on an
// x-data that no longer existed.) The third tab has its own scenario,
// map-showing.mjs, since it loads a different manifest.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/map-set-adoption.mjs \
//     --out tools/.preview/map-set-adoption.png
//
// The sandbox blocks api.github.com, so the scenario serves the REAL committed
// docs/portable.csv (fetched relative, same origin) and fakes a small
// ecosystem for the adoption probe: the hub, the registry, one fully aligned
// consumer, one partial, one unaligned. What the pixels prove: the set's
// grouped rows (title, role, use badge), and the adoption rows' verdict
// badges and per-signal check/x chips.
export default async function (page) {
  const manifest = await page.evaluate(() => fetch('../../docs/portable.csv').then(r => r.text()));
  const ok = await page.evaluate((manifestText) => {
    if (!window.Alpine || !window.__shell || !window.GH || !window.PortableAlign) return 'no shell';
    window.TOKEN = 'fixture-token';

    const HUB = 'mehrlander/web-tools';
    const REG = window.__shell.REGISTRY_REPO;
    const REG_CFG = {
      repos: [
        { repo: 'mehrlander/home', icon: 'ph-house', group: 'core' },
        { repo: 'mehrlander/chat-histories', icon: 'ph-chats', group: 'archives' },
        { repo: 'mehrlander/scratch', icon: 'ph-flask', group: 'other' },
      ],
    };
    const ALIGNED_SETTINGS = {
      extraKnownMarketplaces: { 'web-tools': { source: { source: 'github', repo: HUB } } },
      enabledPlugins: { 'portable@web-tools': true, 'daisy-alpine@web-tools': true },
      hooks: { SessionStart: [] },
    };
    const FILES = {
      [HUB + '::docs/portable.csv']: manifestText,
      [REG + '::.web-tools.json']: JSON.stringify(REG_CFG),
      'mehrlander/home::.claude/settings.json': JSON.stringify(ALIGNED_SETTINGS),
      'mehrlander/home::CLAUDE.md': 'Run /web-tools at the start of any session that will modify files.',
      'mehrlander/home::.web-tools.json': JSON.stringify({ estate: true }),
      'mehrlander/chat-histories::.web-tools.json': JSON.stringify({ estate: true }),
      'mehrlander/chat-histories::CLAUDE.md': 'Archive layout notes.',
    };

    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (name) {
      const key = this.repo + '::' + name;
      if (key in FILES) return { text: FILES[key] };
      if (name === '.claude/settings.json' || name === 'CLAUDE.md' || name === '.web-tools.json'
          || name === 'docs/portable.csv' || name === 'state/configs.json' || name === 'state/activity.json'
          || name === 'lists/todo.json' || name === 'lists/jots.json')
        throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };

    window.__shell.goMap();
    return true;
  }, manifest);
  if (ok !== true) throw new Error('map scenario: ' + ok);

  await page.waitForFunction(() => {
    const host = [...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('map('));
    if (!host) return false;
    const d = window.Alpine.$data(host);
    return d.manifest && !d.adoptLoading && d.rows.length === 5 && d.rows.every(r => !r.loading);
  }, { timeout: 20000 });
  await page.waitForTimeout(400);
}
