// Shoot the first mutation kind: a delete-issue card beside an ordinary
// set-json-field, so the two read as one channel rather than two. What the shot
// is for is the difference the card has to carry: a file proposal shows the
// bytes it will write, and a mutation has none, so it shows the object it will
// destroy and says the deletion cannot be undone.
//
// The GraphQL stub is the point of this scenario. The real read needs the
// viewer's token, and the delete needs admin on the repo, so neither belongs in
// a screenshot; the stub answers ProposalIssue and never reaches the mutation,
// since nothing here applies anything.
//
//   npm run shot -- app/index.html --script tools/render/scenarios/proposals-mutation-demo.mjs
export default async (page) => {
  await page.evaluate(() => {
    const REG = 'mehrlander/web-tools-private';
    const files = {
      [REG]: {
        'proposals/pending/delete-issue-498.json': JSON.stringify({
          id: 'delete-issue-498', kind: 'delete-issue',
          repo: 'mehrlander/web-tools', issue: 498, expectComments: 5,
          summary: 'Delete the scratch issue the link-defanging probes ran in.',
          caution: 'Six files now cite issue #498 as the evidence for the 150-character rule. Deleting it breaks those citations, and GitHub keeps no tombstone.',
          by: 'claude-code', authored: '2026-08-25',
          session: 'https://claude.ai/code/session_01QbUsehoYKZzgoZ9jRwJAPW',
          why: 'A scratch issue opened to hold write-path probe rows. Its measurements are transcribed into docs/github/mcp.md, so the issue itself is no longer the record. GitHub REST cannot delete an issue at all; only GraphQL can, and a sandbox session cannot POST GraphQL, which is why this arrives as a proposal rather than as a done thing.' }),
        'proposals/pending/scope-demo.json': JSON.stringify({
          id: 'scope-demo', kind: 'set-json-field', repo: 'mehrlander/fn-data',
          path: '.web-tools.json', field: 'scope',
          value: 'Fiscal-note data: OFM pulls kept as a standalone source.',
          by: 'claude-code', authored: '2026-07-23',
          why: 'WHAT: adds a scope line to this repo. WHERE IT SHOWS: the Map view puts each repo scope on its card.' }),
      },
      'mehrlander/fn-data': { '.web-tools.json': '{\n  "icon": "ph-chart-line-up",\n  "estate": true\n}\n' },
    };
    const issue = {
      id: 'I_kwDOstub', title: 'scratch: MCP write-path link-defanging probes (delete when done)',
      state: 'CLOSED', url: 'https://github.com/mehrlander/web-tools/issues/498',
      comments: { totalCount: 5 },
    };
    const Real = window.GH;
    window.TOKEN = 'stub-token-for-the-shot';
    window.GH = class extends Real {
      async graphql(query) {
        // Only the read is answered. A shot that could reach the mutation would
        // be a shot that could delete something.
        if (query.includes('ProposalIssue')) return { repository: { issue } };
        throw new Error('the demo stub does not run mutations');
      }
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
