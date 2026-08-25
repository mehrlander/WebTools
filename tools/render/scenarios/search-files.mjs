// screenshot.mjs interaction scenario: the Files view walked down into a
// folder, with a file from it open in the shared viewer beside the listing.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/search-files.mjs \
//     --out tools/.preview/search-files.png --full
//
// The sibling scenario (search-cold.mjs) proves the walk at the repo root.
// This one proves the rest of it: a level below the root, the way back up at
// the top of the list, paths stated relative to the scope, the crumb trail,
// and the reader beside the results with its position counter.
//
// The sandbox blocks api.github.com for everything but the tree read the
// harness fulfils, so the file's bytes are served from the REAL committed
// source over a same-origin relative fetch. No token is set on the page;
// hasToken is stubbed instead, which is the one gate between this view and
// its data.
const FILE = 'lib/kits/estate-search.js';

export default async function (page) {
  const body = await page.evaluate(() => fetch('../../lib/kits/estate-search.js').then(r => r.text()));

  const ok = await page.evaluate(({ body, FILE }) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    const S = window.__shell;
    S.hasToken = () => true;
    S.estateRepos = [{ repo: 'mehrlander/web-tools' }, { repo: 'mehrlander/home' }];
    window.TOKEN = 'stub';

    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (name) {
      if (name === FILE) return { text: body };
      return origGet.call(this, name);
    };

    // The explorer's hand-off shape: a repo, a folder, and no query.
    S.goSearch({ mode: 'names', repo: 'mehrlander/web-tools', path: 'lib/kits' });
    return true;
  }, { body, FILE });
  if (ok !== true) throw new Error('search-files scenario: ' + ok);

  const findHost = () => [...document.querySelectorAll('[x-data]')]
    .find(el => (el.getAttribute('x-data') || '').includes('searchView('));
  await page.waitForFunction(findHost, { timeout: 20000 });
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('searchView('));
    const d = el && window.Alpine.$data(el);
    return d && d.ran && d.hits.length;
  }, { timeout: 20000 });

  await page.evaluate((FILE) => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('searchView('));
    const d = window.Alpine.$data(el);
    d.showFile(d.hits.find(h => h.path === FILE));
  }, FILE);
  await page.waitForFunction(() => {
    const v = document.getElementById('search-file-viewer');
    return v && v.__viewer && v.__viewer.content;
  }, { timeout: 20000 });
  await new Promise(r => setTimeout(r, 900));
}
