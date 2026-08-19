// screenshot.mjs interaction scenario: the Search view's COLD OPEN — the header
// nav's Search tapped with nothing seeded, which is what anyone opening the
// central file surface for the first time gets.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/search-cold.mjs \
//     --out tools/.preview/search-cold.png --full
//
// This is the state that shipped wrong once: an empty box over an empty list
// with its own button greyed out, and no account of why. What the pixels have
// to prove is that a bare arrival scopes to the browsed repo and WALKS it:
// folders first, then files, at the repo root, with the folder counts.
//
// The listing comes off the real committed tree through a stubbed tree read,
// so the shape is the repo's own; nothing else about the arrival is stubbed.
export default async function (page) {
  const ok = await page.evaluate(() => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.__shell.hasToken = () => true;
    window.__shell.estateRepos = [{ repo: 'mehrlander/web-tools' }, { repo: 'mehrlander/home' }];
    window.TOKEN = 'stub';
    const PATHS = [
      'CLAUDE.md', 'README.md', 'package.json',
      'docs/CONVENTIONS.md', 'docs/SURFACING.md', 'docs/show-repo.md',
      'docs/envelopes/surface.md', 'docs/environment/capabilities.md',
      'lib/gh-api.js', 'lib/gh-boot.js', 'lib/kits/estate-search.js',
      'lib/alpineComponents/search-view.js', 'lib/alpineComponents/ref-picker.js',
      'app/index.html', 'pages/toss-render.html',
      'tools/build/build-lib.mjs', 'tools/test/search-view.test.mjs',
    ];
    // The real level and names calls, over a stubbed tree: the walk is the
    // thing under test, so only the fetch is replaced. Sizes come off the same
    // entries in the real read, so the stub carries them too; they are the
    // path's length scaled, which is arbitrary but stable across runs.
    const sizes = Object.fromEntries(PATHS.map(p => [p, p.length * 137]));
    window.EstateSearch.tree = async () => ({ paths: PATHS, sizes, truncated: false });
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
