// screenshot.mjs interaction scenario: the estate's Lists pane with the Pin
// block populated above To-do and Jot.
//
//   node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/estate-pins.mjs \
//     --out tools/.preview/estate-pins.png
//
// The sandbox blocks api.github.com and the registry is private, so the
// scenario stubs the GH methods the estate touches and serves fixture list
// files. What the pixels prove: the Pin block on top with its address+title
// add form, pins in a multi-column grid grouped by group (repo short name
// as fallback), each with the push-pin mark, title, and note; To-do and Jot
// unchanged in their halves below.
export default async function (page) {
  const ok = await page.evaluate(() => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.TOKEN = 'fixture-token';

    const h = (n) => new Date(Date.now() - n * 36e5).toISOString();
    const PINS = {
      items: [
        { id: 'p1', target: 'mehrlander/home:chron/2026/08/2026-08-07-merge-methods-and-ancestry.md',
          title: 'Merge methods and ancestry',
          note: 'Which merges keep the tip as a main ancestor.', group: 'Git', created_at: h(2) },
        { id: 'p2', target: 'mehrlander/web-tools:docs/loader.md',
          title: 'The loader contract', group: 'Git', created_at: h(30) },
        { id: 'p3', target: 'mehrlander/home:projects/budget-drs/data/design/LAYERS.md',
          title: 'Layer vocabulary', note: 'The settled names for the structured stages.', created_at: h(60) },
        { id: 'p4', target: 'mehrlander/home:links/washington-state.md',
          title: 'WA links dossier', created_at: h(80) },
      ],
    };
    const TODOS = {
      items: [
        { id: 't1', text: 'Wire the news dashboard panel', done: false, created_at: h(50) },
        { id: 't2', text: 'Refresh the show-repo thumbnail', done: false, created_at: h(20) },
      ],
    };
    const JOTS = {
      items: [
        { id: 'j1', text: 'We could make it so you can add comments to a jot or a to-do', created_at: h(26) },
        { id: 'j2', text: 'Possibly the Lists page should show a consolidated tracker view', created_at: h(3) },
      ],
    };

    const origGet = window.GH.prototype.get;
    const origReq = window.GH.prototype.req;
    const origLs = window.GH.prototype.ls;
    window.GH.prototype.get = async function (name) {
      if (name === 'lists/pins.json' && this.repo === window.__shell.REGISTRY_REPO) return { text: JSON.stringify(PINS) };
      if (name === 'lists/jots.json' && this.repo === window.__shell.REGISTRY_REPO) return { text: JSON.stringify(JOTS) };
      if (name === 'lists/todo.json' && this.repo === window.__shell.REGISTRY_REPO) return { text: JSON.stringify(TODOS) };
      if (name === '.web-tools.json' && this.repo === window.__shell.REGISTRY_REPO) return { text: '{"repos":[]}' };
      if (name === 'state/configs.json' || name === 'state/activity.json')
        throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };
    window.GH.prototype.ls = async function (path) {
      if (path === 'surfaces') return [];
      return origLs.call(this, path);
    };
    window.GH.prototype.req = async function (path) {
      if (typeof path === 'string' && path.startsWith('/repos/'))
        return { default_branch: 'main', description: '', private: true, pushed_at: new Date(Date.now() - 36e5).toISOString() };
      return origReq.call(this, path);
    };

    window.__shell.goTodo();
    const host = [...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('estate('));
    if (!host) return 'no estate host';
    window.Alpine.$data(host).load();
    return true;
  });
  if (ok !== true) throw new Error('estate pins scenario: ' + ok);

  await page.waitForFunction(() => {
    const host = [...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('estate('));
    if (!host) return false;
    const d = window.Alpine.$data(host);
    return !d.pinLoading && d.pinItems.length === 4 && !d.jotLoading;
  }, { timeout: 20000 });
  await page.waitForTimeout(400);
}
