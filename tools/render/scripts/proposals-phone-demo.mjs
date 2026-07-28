// Shoot the Proposals list at phone width with the real four records, split
// into summary / why / caution. Desktop shots hid the problem this exists to
// fix: at 1280px a paragraph looks like a paragraph, at 390px it is a wall.
//
//   npm run shot -- pages/show-repo/show-repo.html --script tools/render/scripts/proposals-phone-demo.mjs --width 390 --height 844
export default async (page) => {
  await page.evaluate(() => {
    const REG = 'mehrlander/web-tools-private';
    const rec = (id, repo, value, summary, why, caution) => JSON.stringify({
      id, kind: 'set-json-field', repo, path: '.web-tools.json', field: 'scope', value,
      summary, why, caution, by: 'claude-code', authored: '2026-07-23',
      session: 'https://claude.ai/code/session_01XjvMeMaNZ3SZ6kTrLbJd49' });
    const SHARED = 'A repo’s scope is the one-paragraph statement of what it holds and why it exists. show-repo’s Map view puts it on the repo’s card, so the estate reads as a set of purposes rather than a list of names; a repo without one shows a blank card. Four repos never got one, because the sessions that would have written them could not reach those repos. Drafted 2026-07-23 from the notes in home/repos.';
    const files = {
      [REG]: {
        'proposals/pending/scope-chat-histories.json': rec('scope-chat-histories', 'mehrlander/chat-histories',
          'The chat archive: raw conversations plus the catalogs, arcs, and indexes that navigate them, all keyed by chat URL (GUIDE.md).',
          'Describe chat-histories as the keyed chat archive.', SHARED + ' Marked confident for this repo, since a chat archive is unambiguous.'),
        'proposals/pending/scope-fn-data.json': rec('scope-fn-data', 'mehrlander/fn-data',
          'Fiscal-note data: OFM fiscal-note pulls kept as a standalone source for the budget and pension work to draw on.',
          'Describe fn-data as the standalone fiscal-note source.', SHARED,
          'the thinnest of the four drafts, written from a short note rather than from the repo’s contents. Check it actually describes what is in there.'),
        'proposals/pending/scope-wa-bills.json': rec('scope-wa-bills', 'mehrlander/wa-bills',
          'Washington State legislation as structured data and its tooling: bill corpora across many biennia plus the subprojects that analyze bill structure.',
          'Describe wa-bills as the WA legislation corpus and tooling.', SHARED,
          'confirm the repo’s visibility. The draft says downstream analysis references this corpus, which reads differently in public.'),
      },
      'mehrlander/chat-histories': { '.web-tools.json': '{\n  "icon": "ph-chats",\n  "estate": true\n}\n' },
      'mehrlander/fn-data': { '.web-tools.json': '{\n  "icon": "ph-chart-line-up",\n  "estate": true\n}\n' },
      'mehrlander/wa-bills': { '.web-tools.json': '{\n  "icon": "ph-scales",\n  "estate": true\n}\n' },
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
