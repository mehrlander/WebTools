// screenshot.mjs interaction scenario: the Search view's COLD OPEN — the header
// nav's Search tapped with nothing seeded, which is what anyone opening the
// central file surface for the first time gets.
//
//   node tools/render/screenshot.mjs pages/show-repo/show-repo.html \
//     --script tools/render/scenarios/search-cold.mjs \
//     --out tools/.preview/search-cold.png --full
//
// This is the state that shipped wrong once: an empty box over an empty list
// with its own button greyed out, and no account of why. What the pixels have
// to prove is that a bare arrival scopes to the browsed repo and lists it.
//
// The sandbox blocks the API, so the tree read behind the listing is stubbed;
// nothing else about the arrival is.
export default async function (page) {
  const ok = await page.evaluate(() => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.__shell.hasToken = () => true;
    window.__shell.estateRepos = [{ repo: 'mehrlander/web-tools' }, { repo: 'mehrlander/home' }];
    window.TOKEN = 'stub';
    window.EstateSearch = {
      ...window.EstateSearch,
      async names({ q, repos }) {
        const paths = ['CLAUDE.md', 'README.md', 'package.json', 'docs/CONVENTIONS.md',
                       'docs/SURFACING.md', 'docs/show-repo.md', 'lib/gh-api.js',
                       'lib/kits/estate-search.js', 'pages/show-repo/show-repo.html'];
        const hits = paths.filter(p => p.toLowerCase().includes((q || '').toLowerCase()))
          .map(p => ({ repo: repos[0].repo, ref: repos[0].ref || '', path: p }));
        return { hits, total: hits.length, truncated: false, errors: [] };
      },
    };
    window.__shell.goSearch();   // the header nav's tap: no options at all
    return true;
  });
  if (ok !== true) throw new Error('search-cold scenario: ' + ok);

  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('searchView('));
    const d = el && window.Alpine.$data(el);
    return d && d.ran && d.hits.length;
  }, { timeout: 20000 });
  await new Promise(r => setTimeout(r, 600));
}
