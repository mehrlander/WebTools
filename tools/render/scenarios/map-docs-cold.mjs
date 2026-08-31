// screenshot.mjs interaction scenario: the Map view's Docs tab sorted coldest
// first, with the unresolved-reads strip above it.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/map-docs-cold.mjs \
//     --out tools/.preview/map-docs-cold.png --full
//
// The third of the readership scenarios. map-docs.mjs holds a tokenless reader
// and shows the registry with no column; map-docs-reads.mjs holds a token and
// shows the column in registry order; this one shows the two things that make
// the column answerable rather than merely present, which is the ordering that
// puts the unread at the top and the reads that landed on no file at all.
//
// The five phantom paths are the real ones, read out of the 2026-08-30 fold:
// three cut short of their .md, one pluralised folder, and docs/html-style.md,
// which is a session reaching for HTML-STYLE.md by the name it assumed. That
// last row is the reason the strip exists, so it is transcribed rather than
// invented.
const PHANTOMS = [
  ['web-tools/docs/html-style.md', 1, '2026-08-26'],
  ['web-tools/docs/SNAGS.m', 1, '2026-08-05'],
  ['web-tools/docs/TRACKER.m', 1, '2026-08-08'],
  ['web-tools/docs/show-repo.m', 1, '2026-08-07'],
  ['web-tools/docs/pages.md', 1, '2026-08-14'],
];

export default async function (page) {
  const reg = await page.evaluate(() => fetch('../../docs/docs.csv').then(r => r.text()));

  const ok = await page.evaluate(({ regText, phantoms }) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';

    // The registry is a CSV and is parsed through the app's own kit, the way
    // loadDocsReg does. It was JSON until the table moved out of docs.json.
    const docs = window.Csv.rows(regText).map(d => d.path);
    // Only the top of the folder gets a count, so the sort has a cold tail to
    // lift: a fixture where every row is read cannot show an ordering by reads.
    const busy = docs.filter(p => /^docs\/[^/]+$/.test(p)).slice(0, 8);
    const cache = {
      generatedAt: '2026-08-30T17:43:47Z',
      count: 266,
      docAttention: [
        ...busy.map((path, i) => ({
          path: 'web-tools/' + path,
          sessions: Math.max(1, 16 - i * 2),
          count: Math.max(1, 16 - i * 2) * 2,
          last: '2026-08-29T20:00:16Z',
        })),
        ...phantoms.map(([path, sessions, day]) => ({
          path, sessions, count: sessions, last: day + 'T12:00:00Z',
        })),
      ],
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
    window.__shell.hasToken = () => true;

    window.__shell.goMap();
    return true;
  }, { regText: reg, phantoms: PHANTOMS });
  if (ok !== true) throw new Error('map-docs-cold scenario: ' + ok);

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
  // The control cycles registry -> cold -> hot, so one press is the cold view.
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    window.Alpine.$data(el).cycleDocSort();
  });
  await page.waitForTimeout(500);
}
