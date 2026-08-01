// Drive the fab's Render tab to a seeded, token-free state so the guide pane
// renders headlessly: the branch survey and the PR body normally come from the
// viewer's token, which the sandbox has neither of. Seeds `pageBranches` (rows
// and their PRs are plain data; every getter above them is pure) and stands the
// page in a preview by adopting a toss subject, which is how a real preview
// reaches the drawer.
//
//   npm run shot -- pages/show-repo/show-repo.html --script tools/render/scripts/fab-guide.mjs
//
// STATE=guide  the guide pane, PR body rendered            (the default)
// STATE=menu   the ref bar's dropdown, open over the guide
// STATE=nopr   a branch with no open PR
//
// marked is a CDN asset, and the sandbox resolves CDN requests from
// node_modules or refuses them, so this stubs a minimal parser: enough markdown
// for the shot to be about the pane, not about the parser.

const BODY = `Promotes the fab's ref readout into show-repo's header, where it can be seen without opening anything.

**Look:** [show-repo at this ref](https://github.com/mehrlander/web-tools/blob/claude/show-repo-branch-nav-xzttnt/pages/show-repo/show-repo.html)

**Changed:**
- [lib/alpineComponents/ref-switch.js](https://github.com/mehrlander/web-tools/blob/claude/show-repo-branch-nav-xzttnt/lib/alpineComponents/ref-switch.js) the control itself
- [pages/show-repo/show-repo.html](https://github.com/mehrlander/web-tools/blob/claude/show-repo-branch-nav-xzttnt/pages/show-repo/show-repo.html) one mount in the header
- [docs/show-repo.md](https://github.com/mehrlander/web-tools/blob/claude/show-repo-branch-nav-xzttnt/docs/show-repo.md) a section for it

**Notes:** the switch pins the ref on both halves of the address, since ?use= alone would leave the shell at the deployed version.`;

const BRANCHES = [
  { name: 'claude/show-repo-branch-nav-xzttnt', date: '2026-08-01T14:00:00Z', ago: '2h',
    subject: 'Put the box itself in the header', status: 'differs',
    div: { ahead: 2, behind: 0 }, session: 'https://claude.ai/code/session_x',
    pr: { number: 333, draft: true, title: 'Put the ref box itself in the header, not behind a tap', body: BODY } },
  { name: 'claude/project-pages-docs-udzi51', date: '2026-07-31T22:00:00Z', ago: '18h',
    subject: 'Projects as first-class', status: 'differs', div: { ahead: 5, behind: 1 },
    pr: { number: 331, draft: false, title: 'Projects as first-class', body: '' } },
  { name: 'main', date: '2026-07-31T20:00:00Z', ago: '20h', subject: 'Merge pull request #332',
    status: 'baseline' },
  { name: 'claude/branch-page-lifespan-9k2xd', date: '2026-07-24T16:00:00Z', ago: '8d',
    subject: 'Branch lifespan', status: 'differs', div: { ahead: 1, behind: 40, merged: true } },
];

const STATE = process.env.STATE || 'guide';

export default async (page) => {
  await page.waitForFunction(() => window.Alpine && document.querySelector('[x-data^="fab"]'),
    null, { timeout: 15000 });

  await page.evaluate(([branches, state]) => {
    // A minimal markdown parser: paragraphs, bold, bullet lists, links.
    window.marked = { parse(md) {
      const inline = (s) => s
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      const out = [];
      let list = null;
      for (const line of md.split('\n')) {
        if (/^- /.test(line)) { (list ||= []).push('<li>' + inline(line.slice(2)) + '</li>'); continue; }
        if (list) { out.push('<ul>' + list.join('') + '</ul>'); list = null; }
        if (line.trim()) out.push('<p>' + inline(line) + '</p>');
      }
      if (list) out.push('<ul>' + list.join('') + '</ul>');
      return out.join('');
    } };

    const el = document.querySelector('[x-data^="fab"]');
    const d = window.Alpine.$data(el);
    // Stand in a preview: the ref bar keys on the adopted subject's ref.
    d.viaToss = true;
    d.repo = 'mehrlander/web-tools';
    d.path = 'pages/show-repo/show-repo.html';
    d.ref = state === 'nopr' ? 'claude/branch-page-lifespan-9k2xd'
                             : 'claude/show-repo-branch-nav-xzttnt';
    d.defaultBranch = 'main';
    d.pageBranches = branches;
    d.pageBranchesLoaded = true;
    d.showAllBranches = true;
    d.open = true;
    d.activeTab = 'render';
    if (state === 'menu') d.refMenu = true;
    return d.renderPrBody();
  }, [BRANCHES, STATE]);

  await page.waitForTimeout(900);
};
