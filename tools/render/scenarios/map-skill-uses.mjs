// screenshot.mjs interaction scenario: the Map view's Skills tab WITH the
// invocation column, the number that says which skills actually fire.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/map-skill-uses.mjs \
//     --out tools/.preview/map-skill-uses.png --full
//
// Sibling of map-docs-reads.mjs and the same shape for the same reason: the
// real counts live in a private registry the sandbox cannot reach, so the cache
// here is synthetic. The numbers below are not invented, though. They are the
// 2026-08-30 fold over 266 recorded sessions, transcribed so the shot shows the
// spread the tab actually has: one skill carrying most of the traffic, a short
// middle, and a library where most rows never fired at all.
//
// That last group is the point of the column, so the scenario must not fill
// every row: a screenshot where everything has a number would prove the opposite
// of what the tab is for.
const USES = [
  ['tasks', 59, 60], ['caption', 5, 5], ['dataviz', 5, 5], ['artifact-design', 4, 4],
  ['daisy-alpine', 4, 4], ['wa-fiscal-reports', 4, 4], ['drs-funds', 3, 4],
  ['web-tools', 3, 3], ['ios-clipboard', 2, 2], ['markers', 2, 2], ['reading-cfl', 2, 2],
  ['search-chats', 2, 2], ['show-repo', 2, 2], ['succinct-text', 2, 2],
  ['windows-powershell', 2, 2], ['apple-shortcuts-actions', 1, 1], ['in-flight', 1, 1],
  ['show-diff', 1, 1], ['skill-prefs', 1, 1], ['trawl', 1, 1], ['xlsx', 1, 1],
];

export default async function (page) {
  const [skills, portable] = await page.evaluate(() => Promise.all([
    fetch('../../skills/manifest.csv').then(r => r.text()),
    fetch('../../docs/portable.csv').then(r => r.text()),
  ]));

  const ok = await page.evaluate(({ skillsText, portableText, uses }) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';

    const cache = {
      generatedAt: '2026-08-30T17:43:47Z',
      count: 266,
      skillAttention: uses.map(([path, sessions, count]) => ({
        path, sessions, count, last: '2026-08-29T20:00:16Z',
      })),
    };

    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (name) {
      if (name === 'skills/manifest.csv') return { text: skillsText };
      if (name === 'docs/portable.csv') return { text: portableText };
      if (name === 'state/sessions.json') return { text: JSON.stringify(cache) };
      if (name === '.claude/settings.json' || name === 'CLAUDE.md' || name === '.web-tools.json'
          || name === 'state/configs.json' || name === 'state/activity.json'
          || name === 'lists/todo.json' || name === 'lists/jots.json')
        throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };
    // The column is token-gated; the sandbox has no token, so say it has one.
    window.__shell.hasToken = () => true;

    window.__shell.goMap();
    return true;
  }, { skillsText: skills, portableText: portable, uses: USES });
  if (ok !== true) throw new Error('map-skill-uses scenario: ' + ok);

  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = window.Alpine.$data(el);
    d.mapTab = 'skills';
    d.loadSkillsReg();
    d.loadManifest();
    d.loadDocReads();
  });
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = el && window.Alpine.$data(el);
    return d && d.skillsReg && d.skillUses;
  }, { timeout: 20000 });
  await page.waitForTimeout(500);
}
