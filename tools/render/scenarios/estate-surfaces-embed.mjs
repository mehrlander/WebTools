// screenshot.mjs interaction scenario: the estate's Surfaces view rendering a
// kind:embed item (the chat-results live embed), collapsed.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/estate-surfaces-embed.mjs \
//     --out tools/.preview/estate-surfaces-embed.png
//
// The sandbox blocks api.github.com and the registry is private, so the
// scenario stubs the GH methods the estate touches and serves one surface
// (trawls.surface) holding the embed item. What the pixels prove: the embed
// row in the Surfaces list — icon, title (opens the full render), envelope
// pill, github link, snippet, commentary, and the "Expand embed" control. The
// iframe itself is left collapsed: its live render needs the deployed
// #chat-results= route (web-tools PR #264) and a token for the private
// envelope, neither of which exists headlessly.
export default async function (page) {
  const ok = await page.evaluate(() => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.TOKEN = 'fixture-token';

    const REGISTRY = {
      repos: [
        { repo: 'mehrlander/web-tools', icon: 'ph-toolbox', group: 'core', note: 'Browser tools and kits.' },
        { repo: 'mehrlander/web-tools-private', icon: 'ph-shield-check', group: 'core', note: 'The private registry.' },
      ],
    };
    const TRAWLS = {
      manifest: {
        name: 'Trawls',
        description: 'Live chat and trawl result sets, embedded from the chat-histories archive. Each item renders its results envelope through chat-results.html (a toss-render route), the same viewer a #chat-results= link opens.',
        category: 'showcase',
      },
      items: [
        {
          id: 'webi-drs', title: 'WEBI DRS trawl', kind: 'embed', page: 'chat-results',
          repo: 'mehrlander/chat-histories', path: 'results/webi-drs-data.json',
          snippet: 'A trawl of the chat archive for the WEBI/DRS budget-synthesis thread, emitted as a chat-results envelope.',
          commentary: 'Pilot for the Surfaces live-embed kind (kind: embed). Renders results/webi-drs-data.json through chat-results.html via toss-render’s #chat-results= route. Expand to embed in place, or open the title for the full-screen render.',
          added_at: '2026-07-21T00:00:00Z',
        },
      ],
    };

    const origGet = window.GH.prototype.get;
    const origReq = window.GH.prototype.req;
    const origLs = window.GH.prototype.ls;
    window.GH.prototype.get = async function (name) {
      if (name === '.web-tools.json' && this.repo === window.__shell.REGISTRY_REPO) return { text: JSON.stringify(REGISTRY) };
      if (name === 'surfaces/trawls.surface') return { text: JSON.stringify(TRAWLS) };
      if (name === 'state/configs.json' || name === 'state/activity.json') throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };
    window.GH.prototype.ls = async function (path) {
      if (path === 'surfaces') return [{ type: 'file', name: 'trawls.surface' }];
      return origLs.call(this, path);
    };
    window.GH.prototype.req = async function (path) {
      if (typeof path === 'string' && path.startsWith('/repos/'))
        return { default_branch: 'main', description: '', private: true, pushed_at: new Date(Date.now() - 36e5).toISOString() };
      return origReq.call(this, path);
    };

    window.__shell.goSurfaces();
    const host = [...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('estate('));
    if (!host) return 'no estate host';
    window.Alpine.$data(host).load();
    return true;
  });
  if (ok !== true) throw new Error('estate surfaces scenario: ' + ok);

  await page.waitForFunction(() => {
    const host = [...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('estate('));
    if (!host) return false;
    const d = window.Alpine.$data(host);
    return !d.surfLoading && d.surfaces.some(s => s.file === 'trawls.surface');
  }, { timeout: 20000 });
  await page.waitForTimeout(400);
}
