// screenshot.mjs interaction scenario: the Repos cards showing each repo's OWN
// committed skills, the set the plugin never installs.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/estate-skills.mjs --out tools/.preview/estate-skills.png
//
// The sandbox blocks api.github.com and the registry is private, so the fixture
// serves the crawled config cache directly, each entry carrying the `align` row
// the crawl folds in (verdict, the four adoption signals, scope, and now
// skills). Repo names are the real estate's, because the point of the shot is
// that the ten skills committed in home and the fork sitting in wa-bills both
// have a surface for the first time.
//
// What the pixels prove: the sparkle chip carrying a count, the warning tone a
// forked skill puts on it, and the expanded name list with per-skill links.
// A repo with no committed skills shows no chip at all, which is the ordinary
// case and reads as quiet rather than as a missing check.
export default async function (page) {
  const ok = await page.evaluate(() => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.TOKEN = 'fixture-token';

    const align = (verdict, extra) => Object.assign({
      marketplace: true, plugins: ['portable'], conventionsWired: true,
      hasConfig: true, hasClaudeMd: true, hasSettings: true, verdict, scope: '',
    }, extra || {});

    const CONFIGS = { repos: {
      'mehrlander/home': { config: {
          estate: true, icon: 'ph-house', group: 'core', order: 0,
          note: 'Knowledge base and agent memory layer.',
          skills: ['blog', 'drain', 'drs-funds', 'farm-out', 'news', 'reading-cfl',
                   'reading-fiscal-notes', 'review-threads', 'update-full-picture',
                   'wa-fiscal-reports'] },
        align: align('aligned', { skills: ['blog', 'drain', 'drs-funds', 'farm-out', 'news',
          'reading-cfl', 'reading-fiscal-notes', 'review-threads', 'update-full-picture',
          'wa-fiscal-reports'] }) },
      'mehrlander/chat-histories': { config: {
          estate: true, icon: 'ph-chats', group: 'archives', order: 1,
          note: 'The chat archive.',
          skills: ['journal-month', 'process-snapshot', 'search-chats', 'trawl'] },
        align: align('partial', { plugins: [],
          skills: ['journal-month', 'process-snapshot', 'search-chats', 'trawl'] }) },
      'mehrlander/wa-bills': { config: {
          estate: true, icon: 'ph-gavel', group: 'data', order: 2,
          note: 'Bill tracking.',
          skills: [{ name: 'web-tools-conventions', origin: 'forked' }] },
        align: align('partial', { marketplace: false, plugins: [],
          skills: [{ name: 'web-tools-conventions', origin: 'forked' }] }) },
      'mehrlander/spend-wa': { config: {
          estate: true, icon: 'ph-scales', group: 'data', order: 3,
          note: 'Spending data. No skills of its own, so no chip.' },
        align: align('aligned') },
    } };

    const origGet = window.GH.prototype.get;
    const origReq = window.GH.prototype.req;
    const origLs = window.GH.prototype.ls;
    window.GH.prototype.get = async function (name) {
      if (/configs\.json$/.test(name) && this.repo === window.__shell.REGISTRY_REPO) {
        return { text: JSON.stringify(CONFIGS) };
      }
      return origGet.call(this, name);
    };
    window.GH.prototype.req = async function (path) {
      if (typeof path === 'string' && path.startsWith('/repos/')) {
        return { default_branch: 'main', description: '', private: true,
                 pushed_at: new Date(Date.UTC(2026, 7, 19)).toISOString() };
      }
      return origReq.call(this, path);
    };
    window.GH.prototype.ls = async function (path) {
      if (path === 'surfaces') throw Object.assign(new Error('404'), { status: 404 });
      return origLs.call(this, path);
    };

    window.__shell.goEstate();
    const host = [...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('estate('));
    if (!host) return 'no estate host';
    window.Alpine.$data(host).load();
    return true;
  });
  if (ok !== true) throw new Error('estate-skills scenario: ' + ok);

  await page.waitForFunction(() => {
    const host = [...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('estate('));
    if (!host) return false;
    const d = window.Alpine.$data(host);
    return !d.loading && d.entries.length >= 4;
  }, { timeout: 20000 });

  // Expand home's list, so the shot carries both readings at once: the chip as
  // a count on three cards, and the names it holds on one.
  // SKILLS_FORK=1 opens the fork instead, so one scenario carries both
  // readings: a repo's own local set, and the warning tone a copied hub skill
  // puts on the chip and on its own name.
  await page.evaluate((fork) => {
    const host = [...document.querySelectorAll('[x-data]')]
      .find(el => (el.getAttribute('x-data') || '').includes('estate('));
    window.Alpine.$data(host).skillsOpen = fork ? 'mehrlander/wa-bills' : 'mehrlander/home';
  }, !!process.env.SKILLS_FORK);
  await page.waitForTimeout(400);
}
