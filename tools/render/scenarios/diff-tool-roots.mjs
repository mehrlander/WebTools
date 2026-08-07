// The browse panel's root list, with a stubbed repo listing standing in for the
// token's /user/repos. The reported problem was that only web-tools appeared,
// which was a consequence of pathPicker fetching every root's tree up front:
// the roots list had to stay tiny. It no longer does, so this shot proves a long
// list renders and costs no tree calls to show.
export default async function (page) {
  await page.waitForFunction(() => window.Alpine && document.body._x_dataStack, null, { timeout: 15000 });
  await page.evaluate(() => {
    // Stub the listing, not the component: gh.repos() needs a real token and the
    // sandbox has none. Everything below it is the shipped path.
    window.gh.repos = async () => ([
      'mehrlander/web-tools', 'mehrlander/home', 'mehrlander/chat-histories',
      'mehrlander/web-tools-private', 'mehrlander/wa-bills', 'mehrlander/budget-drs',
    ].map(full_name => ({ full_name })));
    const app = Alpine.$data(document.body);
    app._repoList = null;
    app.recentRepos = ['mehrlander/home'];
    app.slots.A.src = 'gh';
    app.tab = 'sources';
  });
  await page.waitForTimeout(400);

  const input = await page.$('section input[placeholder*="or @ to browse"]');
  await input.click();
  await input.type('@');
  await page.waitForTimeout(1200);

  const state = await page.evaluate(() => {
    const p = document.getElementById('grab-A').__pathPicker;
    return {
      open: !!p.open,
      roots: p.tree.map(n => n.name),
      allUnloaded: p.tree.every(n => n.children === null),
      error: p.error,
    };
  });
  console.log('ROOTS ' + JSON.stringify(state));
  if (state.roots.length < 6) throw new Error('expected the full listing, got ' + state.roots.length);
  if (state.roots[0] !== 'mehrlander/home') throw new Error('a recently-read repo should sort first');
  if (!state.allUnloaded) throw new Error('showing the list should not have loaded any tree');
}
