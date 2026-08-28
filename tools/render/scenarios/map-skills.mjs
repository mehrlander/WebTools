// screenshot.mjs interaction scenario: the Map view's Skills tab, all three sets.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/map-skills.mjs --out tools/.preview/map-skills.png
//
// The sandbox blocks api.github.com, so the scenario serves the REAL committed
// skills/manifest.csv and docs/portable.csv (fetched relative, same origin) for
// the library and plugin sets, and a fixture config cache for the estate.
//
// THE ESTATE FIXTURE IS THE LIVE CACHE, not an illustrative one. Read
// 2026-08-28: home is the only repo declaring a skills key, with 11. A fixture
// showing four repos made the shot a picture of a tab nobody has, and it hid
// the singular ("1 repos") that the header was getting wrong.
//
// A token IS set here, unlike map-registries: the estate set reads the private
// registry's config cache, and the whole point of the shot is that all three
// sets render together. The tokenless reading (plugin and library, no estate)
// is what map-registries already proves about this component.
export default async function (page) {
  const manifest = await page.evaluate(() => fetch('../../skills/manifest.csv').then(r => r.text()));
  const portable = await page.evaluate(() => fetch('../../docs/portable.csv').then(r => r.text()));
  const ok = await page.evaluate(([manifestText, portableText]) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    window.TOKEN = 'fixture-token';

    const CONFIGS = { repos: {
      'mehrlander/web-tools': { config: { growth: 'data/doc-growth/web-tools.json' } },
      'mehrlander/home': { config: { growth: 'data/doc-growth.json', skills: [
        'blog', 'drain', 'drs-funds', 'farm-out', 'news', 'reading-cfl',
        'reading-fiscal-notes', 'review-threads', 'scare-quote',
        'update-full-picture', 'wa-fiscal-reports'] } },
      'mehrlander/chat-histories': { config: {} },
      'mehrlander/spend-wa': { config: {} },
    } };

    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (name) {
      if (name === 'skills/manifest.csv') return { text: manifestText };
      if (name === 'docs/portable.csv') return { text: portableText };
      if (/configs\.json$/.test(name)) return { text: JSON.stringify(CONFIGS) };
      if (name === '.claude/settings.json' || name === 'CLAUDE.md' || name === '.web-tools.json'
          || name === 'state/activity.json'
          || name === 'lists/todo.json' || name === 'lists/jots.json')
        throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };

    window.__shell.goMap();
    return true;
  }, [manifest, portable]);
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
    if (!d.manifest) d.loadManifest();
  });

  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = el && window.Alpine.$data(el);
    return d && d.skillsReg && d.estateSkills && d.manifest && !d.skillsLoading;
  }, { timeout: 20000 });

  // SKILLS_SET picks one of the three, SKILLS_Q searches across whichever are
  // in view. That is the tab's whole claim: a reader asking "is there a skill
  // for this" should not have to know which set answers.
  if (process.env.SKILLS_SET) {
    await page.evaluate((k) => {
      const el = [...document.querySelectorAll('[x-data]')]
        .find(e => (e.getAttribute('x-data') || '').includes('map('));
      window.Alpine.$data(el).skillSet = k;
    }, process.env.SKILLS_SET);
  }
  if (process.env.SKILLS_Q) {
    await page.evaluate((q) => {
      const el = [...document.querySelectorAll('[x-data]')]
        .find(e => (e.getAttribute('x-data') || '').includes('map('));
      window.Alpine.$data(el).skillQ = q;
    }, process.env.SKILLS_Q);
  }
  await page.waitForTimeout(400);
}
