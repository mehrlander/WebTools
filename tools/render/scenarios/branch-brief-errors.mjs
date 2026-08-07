// The branch page's failure states, which used to be one line of raw exception
// text. Each is driven through the real load() path, not by setting the fields.
//
//   npm run shot -- pages/branch.html --hash 'gh=mehrlander/web-tools@main&base=main' \
//     --script tools/render/scenarios/branch-brief-errors.mjs
//
// MODE=404|401|403|offline|nokit picks one; the default renders all five
// stacked, which is the view worth looking at when the copy changes.
const MODES = ['404', '401', '403', 'offline', 'nokit'];

export default async function (page) {
  const want = process.env.MODE ? [process.env.MODE] : MODES;

  await page.waitForFunction(() => {
    const el = document.getElementById('mount');
    return el && window.Alpine && window.Alpine.$data(el);
  }, { timeout: 20000 });

  const out = await page.evaluate(async (modes) => {
    const host = document.getElementById('mount');
    const kit = window.BranchBrief;
    const seen = [];

    for (const mode of modes) {
      // A fresh mount per mode: the page renders one brief, and the point is
      // to see the panels side by side rather than one at a time.
      const el = document.createElement('div');
      el.setAttribute('x-data', 'branchBrief(window.__branchTarget || { repo: "mehrlander/web-tools", branch: "claude/example", base: "main" })');
      host.parentNode.insertBefore(el, host.nextSibling);
      window.Alpine.initTree(el);
      const d = window.Alpine.$data(el);
      // init() fires its own load() against the real kit. Let that settle
      // first, or it resolves after the staged one and overwrites every panel
      // with whatever the live network did.
      while (d.loading) await new Promise(r => setTimeout(r, 50));

      if (mode === 'nokit') {
        window.BranchBrief = undefined;
      } else {
        window.BranchBrief = {
          ...kit,
          fetchBrief: async () => {
            if (mode === 'offline') throw new TypeError('Failed to fetch');
            throw Object.assign(new Error('GitHub Error ' + mode + ' (Rate Rem: 59)'), { status: +mode });
          },
        };
      }
      await d.load();
      window.BranchBrief = kit;
      seen.push({ mode, error: d.error, hint: d.errorHint, raw: d.errorRaw });
    }
    host.remove();
    return seen;
  }, want);

  console.log('ASSERT ' + JSON.stringify(out, null, 1));
  await page.waitForTimeout(300);
}
