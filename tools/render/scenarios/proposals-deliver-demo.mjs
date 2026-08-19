// Shoot the two delivery buttons beside the staleness guard: one put-file whose target
// moved after it was written (so the card warns and the button reads Apply
// anyway), one ordinary set-json-field beside it. Stubbed registry, since the
// real channel needs the viewer's token.
//
//   npm run shot -- app/index.html --script tools/render/scenarios/proposals-deliver-demo.mjs
export default async (page) => {
  await page.evaluate(() => {
    const REG = 'mehrlander/web-tools-private';
    const files = {
      [REG]: {
        'proposals/pending/note-put.json': JSON.stringify({
          id: 'note-put', kind: 'put-file', repo: 'mehrlander/wa-bills', path: 'docs/NOTES.md',
          content: '# Notes\n\nRewritten by the proposing session.\n',
          expectSha: 'sha-at-authoring-time', deliver: 'pr',
          by: 'claude-code', authored: '2026-07-26',
          session: 'https://claude.ai/code/session_01XjvMeMaNZ3SZ6kTrLbJd49',
          why: 'WHAT: replaces docs/NOTES.md in wa-bills with a rewritten version. WHY: the file had drifted out of date. APPLYING: overwrites the whole file.' }),
        'proposals/pending/scope-fn.json': JSON.stringify({
          id: 'scope-fn', kind: 'set-json-field', repo: 'mehrlander/fn-data', path: '.web-tools.json',
          field: 'scope', value: 'Fiscal-note data: OFM pulls kept as a standalone source.', deliver: 'commit',
          by: 'claude-code', authored: '2026-07-23',
          session: 'https://claude.ai/code/session_01XjvMeMaNZ3SZ6kTrLbJd49',
          why: 'WHAT: adds a scope line to this repo. WHERE IT SHOWS: the Map view puts each repo scope on its card.' }),
      },
      'mehrlander/wa-bills': { 'docs/NOTES.md': '# Notes\n\nEdited by someone else after the proposal was written.\n' },
      'mehrlander/fn-data': { '.web-tools.json': '{\n  "icon": "ph-chart-line-up",\n  "estate": true\n}\n' },
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
        return { text, sha: 'sha-live-' + text.length };
      }
    };
    const app = window.__shell;
    app.hasToken = () => true;
    app.loadProposalCount().then(() => app.goProposals());
  });
  await page.waitForTimeout(1400);
};
