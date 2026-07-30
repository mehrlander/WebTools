// screenshot.mjs interaction scenario: the estate sidebar's Repos index with a
// repo carrying PROJECT rows under it, the block this session's header/project
// changes act on.
//
//   node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/sidebar-projects.mjs \
//     --out tools/.preview/sidebar-projects.png
//
// The sandbox blocks api.github.com and the registry is private, so the config
// cache (state/configs.json) is stubbed with a fixture shaped like the real one:
// one entry per repo carrying its own estate/group/order/icon, plus `projects`
// on the hinge repo and `tracker` where the rows' board links read from. Repo
// and project names mirror the ones the screenshot in the task shows, so the
// pixels are comparable to what the user is looking at.
export default async function (page) {
  const ok = await page.evaluate(() => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.TOKEN = 'fixture-token';

    const CONFIGS = { repos: {
      'mehrlander/home': { config: {
        estate: true, icon: 'ph-house', group: 'core', order: 0,
        tracker: 'tracker/board.md',
        projects: ['projects/news', 'projects/bills', 'projects/budget-drs',
                   'projects/budget-wa', 'projects/fiscal-notes', 'projects/wps'],
      } },
      'mehrlander/web-tools':         { config: { estate: true, icon: 'ph-toolbox',       group: 'core',  order: 1, tracker: 'tracker/board.md' } },
      'mehrlander/web-tools-private': { config: { estate: true, icon: 'ph-shield-check',  group: 'core',  order: 2 } },
      'mehrlander/chat-histories':    { config: { estate: true, icon: 'ph-chats',         group: 'core',  order: 3 } },
      'mehrlander/spend-wa':          { config: { estate: true, icon: 'ph-currency-dollar', group: 'data', order: 4 } },
      'mehrlander/wa-bills':          { config: { estate: true, icon: 'ph-scales',        group: 'data',  order: 5 } },
      'mehrlander/fn-data':           { config: { estate: true, icon: 'ph-chart-line-up', group: 'data',  order: 6 } },
      'mehrlander/shortcut-tools':    { config: { estate: true, icon: 'ph-lightning',     group: 'tools', order: 7 } },
    } };

    const origGet = window.GH.prototype.get;
    const origReq = window.GH.prototype.req;
    window.GH.prototype.get = async function (name) {
      if (/configs\.json$/.test(name) && this.repo === window.__shell.REGISTRY_REPO) {
        return { text: JSON.stringify(CONFIGS) };
      }
      throw Object.assign(new Error('404'), { status: 404 });
    };
    window.GH.prototype.req = async function (path) {
      if (typeof path === 'string' && path.startsWith('/repos/')) {
        const repo = path.slice('/repos/'.length);
        return { default_branch: 'main', description: '',
                 private: repo !== 'mehrlander/web-tools' && repo !== 'mehrlander/wa-bills'
                          && repo !== 'mehrlander/shortcut-tools',
                 pushed_at: new Date(0).toISOString() };
      }
      return origReq.call(this, path);
    };

    // The sidebar is filled by the shell itself, so re-run its loader now that
    // the fixture is in place: that path assigns through the component, which
    // is what makes the new rows reactive.
    return window.__shell.loadEstateSidebar().then(() => true);
  });
  if (ok !== true) throw new Error('sidebar-projects scenario: ' + ok);

  await page.waitForFunction(
    () => document.body.innerText.includes('budget-drs'), { timeout: 20000 });
  await page.waitForTimeout(500);
}
