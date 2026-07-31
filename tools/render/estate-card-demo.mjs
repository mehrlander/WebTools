// Screenshot driver: render the estate's Repos grid with seeded entries.
//
// The estate is cross-repo and token-gated, and the headless interceptor only
// answers for web-tools (tools/render/cdn.mjs REPO) and deliberately does not
// impersonate /user. So a plain shot of show-repo shows the signed-out single
// card, which cannot show what a real card looks like. This seeds the mounted
// component with entries and an activity map instead, which is enough for a
// layout read: the card's markup does not care where its entry came from.
//
//   npm run shot -- pages/show-repo/show-repo.html --script tools/render/estate-card-demo.mjs
//
// Not a test. It proves nothing about live data, only about how a populated
// card stacks.
export default async (page) => {
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    const root = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('estate'));
    if (!root) throw new Error('estate root not found');
    const d = window.Alpine.$data(root);

    // pins and projects are seeded even though the current card ignores them:
    // that is what makes this driver usable against main for a before/after,
    // where those two bands still render.
    const entry = (repo, icon, note, group, order, pins, projects) => ({
      repo, icon, note, group, order, pins, projects,
      hasLanding: false, hasSurface: repo.endsWith('home'),
      meta: { priv: repo.endsWith('home'), desc: note, ago: '2 hours ago' },
      err: false, child: null, showChild: false,
    });

    d.authed = true;
    d.loading = false;
    d.entries = [
      entry('mehrlander/home', 'ph-house',
        'Knowledge base and agent memory layer; projects incl. budget-drs live here.', 'core', 9,
        ['projects/budget-drs', 'chron', 'created', 'full-picture.md', 'trackers.md'],
        [{ path: 'news', label: 'news' },
         { path: 'projects/bills', label: 'bills' },
         { path: 'projects/budget-drs', label: 'budget-drs' },
         { path: 'projects/budget-wa', label: 'budget-wa' },
         { path: 'projects/fiscal-notes', label: 'fiscal-notes' },
         { path: 'projects/wps', label: 'wps' }]),
      entry('mehrlander/web-tools', 'ph-toolbox',
        'The public hub: conventions, the portable plugin, and the shared page library.', 'core', 1,
        ['lib', 'pages', 'docs', 'tracker'], []),
    ];
    d.activity = {
      'mehrlander/home':      { counts: { branches: 7, stranded: 3, openPRs: 2 } },
      'mehrlander/web-tools': { counts: { branches: 4, stranded: 0, openPRs: 1 } },
    };
  });
  await page.waitForTimeout(1200);
};
