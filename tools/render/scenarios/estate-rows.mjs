// screenshot.mjs interaction scenario: the estate's grouped-grid Repos view
// with a nested companion card.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/estate-rows.mjs --out tools/.preview/estate-rows.png
//
// The sandbox blocks api.github.com and the real registry is private, so the
// scenario stubs the GH instance methods the estate touches with a neutral
// fixture. Membership and fields now come from the registry's crawled config
// cache (state/configs.json), one entry per repo, so the fixture serves that;
// repo names are invented except the strings the public page already names (the
// default repo, the registry repo, the home hinge). What the pixels prove: the
// grouped sections, and the web-tools-private strip nested under the web-tools
// card, at the viewport the shot is taken at.
export default async function (page) {
  const ok = await page.evaluate(() => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.TOKEN = 'fixture-token';

    // The config cache the estate reads: { repos: { name: { config } } }, each
    // repo carrying its own estate:true, group, order, icon, note, and pins.
    const CONFIGS = { repos: {
      'mehrlander/home':              { config: { estate: true, icon: 'ph-house',         group: 'core',     order: 0, note: 'Knowledge base and agent memory layer.', pins: ['chron', 'created'],
                                                    projects: ['projects/news', 'projects/bills', 'projects/budget-wa'] } },
      'mehrlander/web-tools':         { config: { estate: true, icon: 'ph-toolbox',       group: 'core',     order: 1, note: 'Browser tools and kits; hosts this shell.', pins: ['pages', 'lib', 'docs/CONVENTIONS.md'] } },
      'mehrlander/web-tools-private': { config: { estate: true, icon: 'ph-shield-check',  group: 'core',     order: 2, note: 'The private registry.', pins: ['surfaces', 'state'] } },
      'mehrlander/field-notes':       { config: { estate: true, icon: 'ph-chats',         group: 'archives', order: 3, note: 'An archive repo, off to the side.' } },
      'mehrlander/data-one':          { config: { estate: true, icon: 'ph-scales',        group: 'data',     order: 4, note: 'A data repo.' } },
      'mehrlander/data-two':          { config: { estate: true, icon: 'ph-chart-line-up', group: 'data',     order: 5, note: 'Another data repo.' } },
      'mehrlander/gizmos':            { config: { estate: true, icon: 'ph-lightning',     group: 'tools',    order: 6, note: 'A tools repo, off to the side.' } },
    } };

    const origGet = window.GH.prototype.get;
    const origReq = window.GH.prototype.req;
    const origLs = window.GH.prototype.ls;
    window.GH.prototype.get = async function (name) {
      if (/configs\.json$/.test(name) && this.repo === window.__shell.REGISTRY_REPO) {
        return { text: JSON.stringify(CONFIGS) };
      }
      return origGet.call(this, name);
    };
    window.GH.prototype.req = async function (path) {
      if (typeof path === 'string' && path.startsWith('/repos/')) {
        const repo = path.slice('/repos/'.length);
        const priv = repo !== 'mehrlander/web-tools';
        return { default_branch: 'main', description: '', private: priv,
                 pushed_at: new Date(Date.now() - 36e5 * (3 + repo.length)).toISOString() };
      }
      return origReq.call(this, path);
    };
    window.GH.prototype.ls = async function (path) {
      if (path === 'surfaces') throw Object.assign(new Error('404'), { status: 404 });
      return origLs.call(this, path);
    };

    // A bare open already mounted the estate (it is the front door), with the
    // pre-patch token state; re-run its load now that the fixture is in place.
    window.__shell.goEstate();
    const host = [...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('estate('));
    if (!host) return 'no estate host';
    window.Alpine.$data(host).load();
    return true;
  });
  if (ok !== true) throw new Error('estate scenario: ' + ok);

  await page.waitForFunction(() => {
    const host = [...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('estate('));
    if (!host) return false;
    const d = window.Alpine.$data(host);
    return !d.loading && d.groupSections.length >= 2 && d.entries.some(e => e.child);
  }, { timeout: 20000 });
  await page.waitForTimeout(400);
  // ESTATE_FLIP=1 renders the nested card's private face (the globe toggle
  // flipped), so both faces can be screenshotted from the one scenario.
  if (process.env.ESTATE_FLIP) {
    await page.evaluate(() => {
      const host = [...document.querySelectorAll('[x-data]')]
        .find(el => (el.getAttribute('x-data') || '').includes('estate('));
      const d = window.Alpine.$data(host);
      const parent = d.entries.find(e => e.child);
      if (parent) parent.showChild = true;
    });
  }
  await page.waitForTimeout(150);
}
