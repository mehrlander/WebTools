// screenshot.mjs interaction scenario: the Map view's Docs tab WITH the
// readership column, the half map-docs.mjs cannot show.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/map-docs-reads.mjs \
//     --out tools/.preview/map-docs-reads.png --full
//
// Two scenarios rather than one, because they prove opposite things and a
// single shot would prove neither cleanly. map-docs.mjs holds a tokenless
// reader and shows the census rendering without the column; this one holds a
// token and shows the column. The real counts live in a private registry the
// sandbox cannot reach, so the cache here is synthetic, chosen to put both
// empty states on screen beside a populated row: a doc nobody opened reads a
// dash, and an injected doc says "injected" rather than the zero no file tool
// can avoid giving it.
export default async function (page) {
  const reg = await page.evaluate(() => fetch('../../docs/docs.csv').then(r => r.text()));
  const ok = await page.evaluate((regText) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';

    const docs = JSON.parse(regText).documents.map(d => d.path);
    // A plausible spread: the two biggest docs read often, a tail read once or
    // twice, and everything else untouched.
    const busy = docs.filter(p => !/CONVENTIONS|SURFACING/.test(p)).slice(0, 12);
    const cache = {
      generatedAt: '2026-08-06T12:00:00Z',
      count: 42,
      docAttention: busy.map((path, i) => ({
        path: 'web-tools/' + path,
        sessions: Math.max(1, 11 - i),
        count: Math.max(1, 11 - i) * 3,
        last: '2026-08-0' + (5 - (i % 5)) + 'T20:00:00Z',
      })),
    };

    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (name) {
      if (name === 'docs/docs.csv') return { text: regText };
      if (name === 'state/sessions.json') return { text: JSON.stringify(cache) };
      if (name === '.claude/settings.json' || name === 'CLAUDE.md' || name === '.web-tools.json'
          || name === 'docs/portable.csv' || name === 'state/configs.json' || name === 'state/activity.json'
          || name === 'lists/todo.json' || name === 'lists/jots.json')
        throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };
    // The column is token-gated; the sandbox has no token, so say it has one.
    window.__shell.hasToken = () => true;

    window.__shell.goMap();
    return true;
  }, reg);
  if (ok !== true) throw new Error('map-docs-reads scenario: ' + ok);

  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = window.Alpine.$data(el);
    d.mapTab = 'docs';
    d.loadDocsReg();
  });
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = el && window.Alpine.$data(el);
    return d && d.docsReg && !d.docsLoading && d.docReads;
  }, { timeout: 20000 });
  await page.waitForTimeout(500);
}
