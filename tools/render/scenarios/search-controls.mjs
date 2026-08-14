// screenshot.mjs interaction scenario: the Search view's scope controls, with
// the ref picker open.
//
//   node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/search-controls.mjs \
//     --out tools/.preview/search-controls.png --full
//
// The controls were a select and two text boxes, over a paragraph explaining
// in prose what the controls were for. What the pixels have to prove is the
// three replacements: repos as a single-select rail, the ref as a dated
// newest-first list whose box filters rather than leads, the folder as the
// tap-through picker, and no explanatory prose above any of them.
//
// The sandbox blocks the API, so the listing and the branch survey are stubbed.
export default async function (page) {
  const ok = await page.evaluate(() => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.__shell.hasToken = () => true;
    window.__shell.estateRepos = [{ repo: 'mehrlander/web-tools' }, { repo: 'mehrlander/home' },
                                  { repo: 'mehrlander/budget-wa' }];
    window.TOKEN = 'stub';
    window.EstateSearch = {
      ...window.EstateSearch,
      async names({ repos }) {
        const paths = ['CLAUDE.md', 'README.md', 'docs/CONVENTIONS.md', 'docs/show-repo.md',
                       'lib/gh-api.js', 'lib/kits/estate-search.js'];
        return { hits: paths.map(p => ({ repo: repos[0].repo, ref: repos[0].ref || '', path: p })),
                 total: paths.length, truncated: false, errors: [] };
      },
    };
    // The branch survey behind the ref picker.
    window.GH.prototype.branchesDated = async function () {
      return [
        { name: 'claude/centralize-file-viewer-search-en30ye', ago: '4m', subject: 'the branch in hand' },
        { name: 'main', ago: '2h', subject: 'the default' },
        { name: 'claude/registries-identity-8fk2la', ago: '1d', subject: 'merged work' },
        { name: 'claude/portable-align-9dj3nx', ago: '6d', subject: 'older work' },
      ];
    };
    window.__shell.goSearch();
    return true;
  });
  if (ok !== true) throw new Error('search-controls scenario: ' + ok);

  const data = () => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('searchView('));
    return el && window.Alpine.$data(el);
  };
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('searchView('));
    const d = el && window.Alpine.$data(el);
    return d && d.ran && d.hits.length;
  }, { timeout: 20000 });

  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('searchView('));
    const host = el.querySelector('[x-data^="refPicker"]');
    host.__refPicker.toggle();
  });
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('searchView('));
    const p = el.querySelector('[x-data^="refPicker"]')?.__refPicker;
    return p && p.open && !p.loading && p.rows.length;
  }, { timeout: 20000 });
  await new Promise(r => setTimeout(r, 600));
}
