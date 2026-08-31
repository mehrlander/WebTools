// screenshot.mjs interaction scenario: the Files view's results, opened in the
// swipe deck.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/search-deck.mjs \
//     --out tools/.preview/search-deck.png --width 430 --height 900
//
// Pass `sheet=1` in the query to photograph the CONTENTS list instead of the
// slide: fifty hits is far past the footer's countable dots, so the header
// mark is the affordance that keeps the set walkable.
//
// The sibling scenarios photograph the LIST (search-cold.mjs at a repo root,
// search-files.mjs a folder below it with a file open beside it). This one is
// the other reading of the same hits: the deck's header naming the file and
// where it lives, the contents mark beside it, and the file itself filling the
// slide. Shot at phone width by default, since going through fifty results by
// swiping is the case the deck exists for.
//
// Same two stubs the list scenarios use: the sandbox blocks api.github.com for
// everything but the tree read the harness fulfils, so the file's bytes come
// from the real committed source over a same-origin relative fetch, and
// hasToken is stubbed rather than a token being set.
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

    S.goSearch({ mode: 'names', repo: 'mehrlander/web-tools', path: 'lib/kits' });
    return true;
  }, { body, FILE });
  if (ok !== true) throw new Error('search-deck scenario: ' + ok);

  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('searchView('));
    const d = el && window.Alpine.$data(el);
    return d && d.ran && d.hits.length;
  }, { timeout: 20000 });

  // Through the button's own handler, at the file the deck should open on, so
  // the picture is of the route a reader takes rather than of a deck built by
  // the script.
  await page.evaluate((FILE) => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('searchView('));
    const d = window.Alpine.$data(el);
    return d.openDeck(d.fileHits.findIndex(h => h.path === FILE));
  }, FILE);

  await page.waitForSelector('.sd-overlay', { timeout: 20000 });
  await new Promise(r => setTimeout(r, 1600));

  if (new URL(page.url()).searchParams.get('sheet')) {
    await page.evaluate(() => document.querySelector('.sd-overlay [aria-expanded]')?.click());
    await new Promise(r => setTimeout(r, 700));
  }
}
