// screenshot.mjs interaction scenario: the estate's Jots view with a
// populated pile.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/estate-jots.mjs \
//     --out tools/.preview/estate-jots.png
//
// The sandbox blocks api.github.com and the registry is private, so the
// scenario stubs the GH methods the estate touches and serves a fixture
// lists/jots.json. What the pixels prove: the capture box on top, the pile
// below it newest first, each row with the lightbulb mark, wrapping text,
// and its age at the right edge.
export default async function (page) {
  const ok = await page.evaluate(() => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.TOKEN = 'fixture-token';

    const h = (n) => new Date(Date.now() - n * 36e5).toISOString();
    const TODOS = {
      items: [
        { id: 't1', text: 'Wire the news dashboard panel', done: false, created_at: h(50) },
        { id: 't2', text: 'Refresh the show-repo thumbnail', done: false, created_at: h(20) },
        { id: 't3', text: 'Migrate the legacy .show-repo.json readers', done: true, created_at: h(80), done_at: h(6) },
      ],
    };
    const JOTS = {
      items: [
        { id: 'j1', text: 'A jots pile beside the to-do list: capture has no done state, only promotion or deletion', created_at: h(90) },
        { id: 'j2', text: 'Could the stage preview reuse the file viewer footer?', created_at: h(26) },
        { id: 'j3', text: 'Drain pass: an agent reads lists/jots.json and promotes each jot to chron, a task, or a to-do', created_at: h(3) },
        { id: 'j4', text: 'Jot commit messages carry the text, so the file history is a capture log', created_at: h(0) },
      ],
    };

    const origGet = window.GH.prototype.get;
    const origReq = window.GH.prototype.req;
    const origLs = window.GH.prototype.ls;
    window.GH.prototype.get = async function (name) {
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

    window.__shell.goJots();
    const host = [...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('estate('));
    if (!host) return 'no estate host';
    window.Alpine.$data(host).load();
    return true;
  });
  if (ok !== true) throw new Error('estate jots scenario: ' + ok);

  await page.waitForFunction(() => {
    const host = [...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('estate('));
    if (!host) return false;
    const d = window.Alpine.$data(host);
    return !d.jotLoading && d.jotItems.length === 4;
  }, { timeout: 20000 });
  await page.waitForTimeout(400);
}
