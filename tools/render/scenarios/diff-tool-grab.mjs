// The Sources tab with both slots in GitHub mode, so the @-grab row and the
// loader row's joined controls are both on screen.
export default async function (page) {
  await page.waitForFunction(() => window.Alpine && document.body._x_dataStack, null, { timeout: 15000 });
  await page.evaluate(() => {
    const app = Alpine.$data(document.body);
    app.slots.A.src = 'gh';
    app.slots.B.src = 'gh';
    app.slots.A.value = 'mehrlander/web-tools@main:lib/kits/text-diff.js';
    app.recentRepos = ['mehrlander/web-tools', 'mehrlander/home'];
    app.tab = 'sources';
  });
  await page.waitForTimeout(600);
}
