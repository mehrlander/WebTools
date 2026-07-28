// Shoot the Proposals view with a stubbed registry, since the real channel
// needs the viewer's token and two private repos. Everything below is fixture:
// the component, its resolve-against-the-target step, and the confirm gate are
// the page's own code.
//
//   npm run shot -- pages/show-repo/show-repo.html --script tools/render/scripts/proposals-demo.mjs
export default async (page) => {
  await page.evaluate(() => {
    const REG = 'mehrlander/web-tools-private';
    const rec = (id, repo, field, value, why) => JSON.stringify({
      id, kind: 'set-json-field', repo, path: '.web-tools.json', field, value, why });
    const files = {
      [REG]: {
        'proposals/pending/scope-wa-bills.json': rec('scope-wa-bills', 'mehrlander/wa-bills', 'scope',
          'Washington State legislation as structured data and its tooling: bill corpora across many biennia, plus the subprojects that extract, normalize, and analyze bill structure.',
          'the Map grades this repo with a blank scope; drafted from home/repos notes'),
        'proposals/pending/scope-fn-data.json': rec('scope-fn-data', 'mehrlander/fn-data', 'scope',
          'Fiscal-note data: OFM pulls kept as a standalone source for the budget and pension work to draw on.',
          'same gap, thinnest of the four drafts, confirm the contents'),
      },
      'mehrlander/wa-bills': { '.web-tools.json': '{\n  "icon": "ph-scales",\n  "estate": true,\n  "group": "data"\n}\n' },
      'mehrlander/fn-data': { '.web-tools.json': '{\n  "icon": "ph-chart-line-up",\n  "estate": true,\n  "scope": "Fiscal-note pulls."\n}\n' },
    };
    const Real = window.GH;
    window.TOKEN = 'stub-token-for-the-shot';
    window.GH = class extends Real {
      async ls(dir) {
        const bag = files[this.repo];
        if (!bag) return Real.prototype.ls.call(this, dir);
        const names = Object.keys(bag).filter(p => p.startsWith(dir + '/')).map(p => p.slice(dir.length + 1));
        if (!names.length) { const e = new Error('Not Found'); e.status = 404; throw e; }
        return names.map(name => ({ name, type: 'file' }));
      }
      async get(p) {
        const text = files[this.repo]?.[p];
        if (text === undefined) { const e = new Error('Not Found'); e.status = 404; throw e; }
        return { text };
      }
    };
    const app = document.body.__x?.$data || window.__shell;
    app.hasToken = () => true;
    app.loadProposalCount().then(() => app.goProposals());
  });
  await page.waitForTimeout(1200);
  // Arm the confirm on the first row, so the shot shows the gate rather than
  // implying a one-tap write.
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data="proposals()"]')][0];
    const d = window.Alpine.$data(el);
    d.confirming = d.items[0]?.id;
  });
  await page.waitForTimeout(400);
};
