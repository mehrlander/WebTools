// screenshot.mjs interaction scenario: the Map view's Skills tab, both halves.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/map-skills.mjs --out tools/.preview/map-skills.png
//
// The sandbox blocks api.github.com, so the scenario serves the REAL committed
// skills/manifest.csv (fetched relative, same origin) for the library half, and
// a fixture config cache for the estate half. The estate numbers are the ones
// measured on 2026-08-20: home 10, chat-histories 4, wa-bills 1 forked.
//
// A token IS set here, unlike map-registries: the estate half reads the private
// registry's config cache, and the whole point of the shot is that both halves
// render together. The tokenless reading (library only, no estate section) is
// what map-registries already proves about this component.
export default async function (page) {
  const manifest = await page.evaluate(() => fetch('../../skills/manifest.csv').then(r => r.text()));
  const ok = await page.evaluate((manifestText) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.TOKEN = 'fixture-token';

    const CONFIGS = { repos: {
      'mehrlander/web-tools': { align: { skills: ['caption', 'tasks', 'tree'] } },
      'mehrlander/home': { align: { skills: [
        'blog', 'drain', 'drs-funds', 'farm-out', 'news', 'reading-cfl',
        'reading-fiscal-notes', 'review-threads', 'update-full-picture', 'wa-fiscal-reports'] } },
      'mehrlander/chat-histories': { align: { skills: [
        'journal-month', 'process-snapshot', 'search-chats', 'trawl'] } },
      'mehrlander/wa-bills': { align: { skills: [
        { name: 'web-tools-conventions', origin: 'forked' }] } },
      'mehrlander/spend-wa': { align: { skills: [] } },
    } };

    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (name) {
      if (name === 'skills/manifest.csv') return { text: manifestText };
      if (/configs\.json$/.test(name)) return { text: JSON.stringify(CONFIGS) };
      if (name === '.claude/settings.json' || name === 'CLAUDE.md' || name === '.web-tools.json'
          || name === 'docs/portable.csv' || name === 'state/activity.json'
          || name === 'lists/todo.json' || name === 'lists/jots.json')
        throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };

    window.__shell.goMap();
    return true;
  }, manifest);
  if (ok !== true) throw new Error('map-skills scenario: ' + ok);

  const findHost = () => [...document.querySelectorAll('[x-data]')]
    .find(el => (el.getAttribute('x-data') || '').includes('map('));

  await page.waitForFunction(() => [...document.querySelectorAll('[x-data]')]
    .some(el => (el.getAttribute('x-data') || '').includes('map(')), { timeout: 20000 });

  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = window.Alpine.$data(el);
    d.mapTab = 'skills';
    d.loadSkillsReg();
    d.loadEstateSkills();
  });

  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = el && window.Alpine.$data(el);
    return d && d.skillsReg && d.estateSkills && !d.skillsLoading;
  }, { timeout: 20000 });

  // SKILLS_Q filters both halves at once, which is the tab's whole claim: a
  // reader asking "is there a skill for this" should not have to know which
  // repo answers.
  if (process.env.SKILLS_Q) {
    await page.evaluate((q) => {
      const el = [...document.querySelectorAll('[x-data]')]
        .find(e => (e.getAttribute('x-data') || '').includes('map('));
      window.Alpine.$data(el).skillQ = q;
    }, process.env.SKILLS_Q);
  }
  await page.waitForTimeout(400);
}
