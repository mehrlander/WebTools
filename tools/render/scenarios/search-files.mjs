// screenshot.mjs interaction scenario: the Search view as the central file
// surface — a folder-scoped listing with no query at all, and the file from it
// open in the shared viewer beside the results.
//
//   node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/search-files.mjs \
//     --out tools/.preview/search-files.png --full
//
// The sandbox blocks api.github.com, so EstateSearch.names is stubbed with a
// listing shaped exactly as the real one returns it, and the file read is
// served from the REAL committed source over a same-origin relative fetch. No
// token is set on the page; hasToken is stubbed instead, which is the one gate
// between this view and its data.
//
// What the pixels prove: the mode pills, the scope crumb trail, the "List"
// verb on an empty query, the results column beside the reader, the position
// counter, and the viewer's own chrome over a real file.
const FILE = 'lib/kits/estate-search.js';

export default async function (page) {
  const body = await page.evaluate(() => fetch('../../lib/kits/estate-search.js').then(r => r.text()));

  const ok = await page.evaluate(({ body, FILE }) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    const S = window.__shell;
    S.hasToken = () => true;
    S.estateRepos = [{ repo: 'mehrlander/web-tools' }, { repo: 'mehrlander/home' }];
    window.TOKEN = 'stub';

    const PATHS = ['annotate.js', 'branch-survey.js', 'estate-search.js', 'github-links.js',
                   'repo-address.js', 'source-peek.js', 'stage.js', 'swipe-deck.js', 'text-diff.js'];
    window.EstateSearch = {
      ...window.EstateSearch,
      async names({ under }) {
        return {
          hits: PATHS.map(p => ({ repo: 'mehrlander/web-tools', ref: '', path: (under || 'lib/kits') + '/' + p })),
          total: PATHS.length, truncated: false, errors: [],
        };
      },
    };
    window.GH.prototype.get = async function (name) {
      if (name === FILE) return { text: body };
      throw Object.assign(new Error('404'), { status: 404 });
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
