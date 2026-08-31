// screenshot.mjs interaction scenario: what the Contents lane says when the
// code-search fetch is REJECTED rather than answered.
//
//   node tools/render/screenshot.mjs app/index.html --query "case=limit" \
//     --script tools/render/scenarios/search-limit.mjs --width 900
//
// `case=limit` spends the code_search bucket; `case=refused` leaves budget on
// it. The two are the whole point of the second call: the same browser-level
// "Failed to fetch" resolves to different readings, and neither of them is
// "Failed to fetch".
//
// Both sides are stubbed on GH.prototype.req, which is the seam the diagnosis
// runs across: the search rejects with status 0 (what gh-api sets when the
// browser never showed the page a response) and /rate_limit answers.
export default async function (page) {
  const kind = new URL(page.url()).searchParams.get('case') || 'limit';

  const ok = await page.evaluate((kind) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    const S = window.__shell;
    S.hasToken = () => true;
    S.estateRepos = [{ repo: 'mehrlander/web-tools' }, { repo: 'mehrlander/home' }];
    window.TOKEN = 'stub';

    const orig = window.GH.prototype.req;
    window.GH.prototype.req = async function (path, opts) {
      if (String(path).startsWith('/search/code')) {
        throw Object.assign(new Error('Network error on GET ' + path + ': Failed to fetch'), { status: 0 });
      }
      if (String(path) === '/rate_limit') {
        return { resources: { code_search: {
          limit: 10, remaining: kind === 'limit' ? 0 : 7,
          reset: Math.round(Date.now() / 1000) + 38,
        } } };
      }
      return orig.call(this, path, opts);
    };

    S.goSearch({ mode: 'contents', repo: 'mehrlander/web-tools', q: 'register' });
    return true;
  }, kind);
  if (ok !== true) throw new Error('search-limit scenario: ' + ok);

  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('searchView('));
    const d = el && window.Alpine.$data(el);
    return d && d.ran && !d.busy && d.error;
  }, { timeout: 20000 });
  await new Promise(r => setTimeout(r, 500));
}
