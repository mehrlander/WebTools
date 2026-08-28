// screenshot.mjs interaction scenario: the estate sidebar's app-view rows when
// two repos promote pages carrying the same label.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/sidebar-view-labels.mjs \
//     --out tools/.preview/sidebar-view-labels.png
//
// COLLIDE=0 stages the same estate with the labels already distinct, for the
// control shot: nothing is suffixed when nothing repeats.
//
// The fixture is the real 2026-08-26 shape, which is why it is worth a shot at
// all: web-tools promoted its own pages/doc-growth.html and home promoted THE
// SAME PAGE with a different ?src=. Two correct entries, and the sidebar
// rendered both as the words "Doc Growth" with nothing to choose between them.
// Note the cross-repo path on home's entry: both views address web-tools, so
// the row has to name the promoting repo rather than the page's own.
export default async function (page) {
  const collide = process.env.COLLIDE !== '0';
  const ok = await page.evaluate((collide) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.TOKEN = 'fixture-token';

    const growth = (path, query, label, slug) => ({
      path, query, title: 'Doc Growth', appView: true,
      viewLabel: label, icon: 'ph-chart-scatter', slug,
    });

    const CONFIGS = { repos: {
      'mehrlander/web-tools': { config: { estate: true, icon: 'ph-toolbox', group: 'core', order: 1,
        note: 'The public hub.',
        pages: [growth('pages/doc-growth.html', '', 'Doc Growth', 'doc-growth')] } },
      'mehrlander/home': { config: { estate: true, icon: 'ph-house', group: 'core', order: 0,
        note: 'Knowledge base and agent memory layer.',
        pages: [
          { path: 'projects/budget-drs/app/view/app.html', title: 'Budget DRS', appView: true,
            viewLabel: 'Budget DRS', icon: 'ph-steps', slug: 'budget-drs' },
          { path: 'mehrlander/web-tools:pages/links.html', title: 'Links', appView: true,
            viewLabel: 'Links', icon: 'ph-bookmarks-simple' },
          growth('mehrlander/web-tools:pages/doc-growth.html',
                 'src=mehrlander/home:data/doc-growth.json',
                 collide ? 'Doc Growth' : 'Corpus Growth', 'home-growth'),
        ] } },
      'mehrlander/web-tools-private': { config: { estate: true, icon: 'ph-shield-check',
        group: 'core', order: 2, note: 'The private registry.' } },
    } };

    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (name) {
      if (/configs\.json$/.test(name)) return { text: JSON.stringify(CONFIGS) };
      if (/^(state\/|lists\/)/.test(name) || name === '.web-tools.json'
          || name === 'CLAUDE.md' || name === '.claude/settings.json')
        throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };
    // The crawl would overwrite the fixture with a real read it cannot make.
    window.__shell.refreshConfigCache = async () => ({ skipped: true });
    window.__shell.goDashboard();
    return true;
  }, collide);
  if (ok !== true) throw new Error('sidebar-view-labels scenario: ' + ok);

  await page.evaluate(() => window.__shell.loadEstateSidebar());
  await page.waitForFunction(() => (window.__shell?.appViews || []).length >= 4, { timeout: 20000 });
  await page.evaluate(() => { window.__shell.sidebarOpen = true; });
  await page.waitForTimeout(400);
}
