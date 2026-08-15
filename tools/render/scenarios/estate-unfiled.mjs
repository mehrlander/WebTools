// screenshot.mjs interaction scenario: the Repos view's Unfiled section, the
// account repos that are NOT on the estate.
//
//   node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/estate-unfiled.mjs --out tools/.preview/estate-unfiled.png
//
// The sandbox blocks api.github.com and the real registry is private, so the
// scenario stubs the GH methods the estate touches. The fixture's shape is the
// point: an account list carrying BOTH members and non-members (which is what
// /user/repos actually returns and what the estate has always fetched), a
// config cache in which only some of them opt in, one repo archived on GitHub,
// and one carrying conventions:'optout'. Repo names are invented except the
// strings the public page already names.
//
// What the pixels prove: the rule below the cards, the three groups with the
// two settled ones folded, the row anatomy at the shot's viewport, and that an
// archived row is muted and offers no write action.
//
// ESTATE_UNFILED_OPEN=1 unfolds Set aside and Retired, for the second shot.
export default async function (page) {
  const ok = await page.evaluate(() => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.TOKEN = 'fixture-token';

    const ACCOUNT = [
      // On the estate (cards above the rule).
      { full_name: 'mehrlander/home',      description: 'Knowledge base and agent memory layer.', private: true,  language: 'Shell',      default_branch: 'main', pushed_at: '2026-08-15T02:03:00Z' },
      { full_name: 'mehrlander/web-tools', description: 'Repository for browser tools',           private: false, language: 'JavaScript', default_branch: 'main', pushed_at: '2026-08-15T14:41:38Z' },
      // Not on the estate (rows below it).
      { full_name: 'mehrlander/ise-tools', description: '',                                        private: false, language: 'PowerShell', default_branch: 'main', pushed_at: '2026-07-10T20:07:52Z' },
      { full_name: 'mehrlander/mnemonics', description: '',                                        private: false, language: 'HTML',       default_branch: 'main', pushed_at: '2026-07-03T02:22:48Z' },
      { full_name: 'mehrlander/scratch',   description: 'Odds and ends.',                          private: true,  language: '',           default_branch: 'main', pushed_at: '2026-06-14T21:34:51Z' },
      { full_name: 'mehrlander/oldest',    description: 'Six years untouched.',                    private: false, language: '',           default_branch: 'master', pushed_at: '2020-01-06T05:14:39Z' },
      { full_name: 'mehrlander/sidelined', description: 'Alive, just not on the dashboard.',       private: true,  language: 'Python',     default_branch: 'main', pushed_at: '2026-06-02T16:06:54Z' },
      { full_name: 'mehrlander/retired',   description: 'Finished; archived on GitHub.',           private: false, language: 'JavaScript', default_branch: 'main', pushed_at: '2026-05-11T14:27:28Z', archived: true },
    ];

    // Only the first two opt in. `sidelined` states the other position; the
    // archived one carries no config at all, which is the common case and the
    // reason archived has to work without one.
    const CONFIGS = { repos: {
      'mehrlander/home':      { config: { estate: true, icon: 'ph-house',   group: 'core', order: 0, note: 'Knowledge base and agent memory layer.' } },
      'mehrlander/web-tools': { config: { estate: true, icon: 'ph-toolbox', group: 'core', order: 1, note: 'Browser tools and kits; hosts this shell.' } },
      'mehrlander/sidelined': { config: { conventions: 'optout' } },
      'mehrlander/retired':   { config: null },
    } };

    const origGet = window.GH.prototype.get;
    const origReq = window.GH.prototype.req;
    const origLs = window.GH.prototype.ls;
    window.GH.prototype.repos = async function () { return ACCOUNT; };
    window.GH.prototype.get = async function (name) {
      if (/configs\.json$/.test(name) && this.repo === window.__shell.REGISTRY_REPO) {
        return { text: JSON.stringify(CONFIGS) };
      }
      return origGet.call(this, name);
    };
    window.GH.prototype.req = async function (path) {
      if (typeof path === 'string' && path.startsWith('/repos/')) {
        const hit = ACCOUNT.find(r => r.full_name === path.slice('/repos/'.length));
        if (hit) return hit;
        return { default_branch: 'main', description: '', private: true, pushed_at: '' };
      }
      return origReq.call(this, path);
    };
    window.GH.prototype.ls = async function (path) {
      if (path === 'surfaces') throw Object.assign(new Error('404'), { status: 404 });
      return origLs.call(this, path);
    };

    window.__shell.goEstate();
    const host = [...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('estate('));
    if (!host) return 'no estate host';
    window.Alpine.$data(host).load();
    return true;
  });
  if (ok !== true) throw new Error('estate-unfiled scenario: ' + ok);

  await page.waitForFunction(() => {
    const host = [...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('estate('));
    if (!host) return false;
    const d = window.Alpine.$data(host);
    return !d.loading && d.unfiledSections.length === 3;
  }, { timeout: 20000 });

  if (process.env.ESTATE_UNFILED_OPEN) {
    await page.evaluate(() => {
      const host = [...document.querySelectorAll('[x-data]')]
        .find(el => (el.getAttribute('x-data') || '').includes('estate('));
      const d = window.Alpine.$data(host);
      d.unfiledOpen.aside = true;
      d.unfiledOpen.retired = true;
    });
  }
  await page.waitForTimeout(400);
}
