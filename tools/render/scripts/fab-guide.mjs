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
// STATE=gh     the github mark's link menu
// STATE=pick   the repo/path picker, open inside this repo
// STATE=repos  the same picker at its root level: every repo the token sees
// STATE=older  the arrows stepped back to the branch's merged PR
// STATE=nopr   a branch with no PR, showing the standing info instead
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

  await page.evaluate(([branches, state, prBody]) => {
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
    window.GithubLinks = { rows: (repo, o) => {
      const at = o.ref && o.ref !== o.defaultRef ? '/' + o.ref : '';
      const u = p => 'https://github.com/' + repo + p;
      return [
        { key: 'home', label: 'Repository', icon: 'ph-house', url: u('') },
        { key: 'prs', label: 'Pull requests', icon: 'ph-git-pull-request', url: u('/pulls') },
        { key: 'issues', label: 'Issues', icon: 'ph-record', url: u('/issues') },
        { key: 'branches', label: 'Branches', icon: 'ph-git-branch', url: u('/branches') },
        { key: 'commits', label: 'Commits', icon: 'ph-git-commit', url: u('/commits' + at) },
        { key: 'actions', label: 'Actions', icon: 'ph-play-circle', url: u('/actions') },
      ];
    } };
    d.defaultBranch = 'main';
    d.pageBranches = branches;
    d.pageBranchesLoaded = true;
    d.showAllBranches = true;
    d.open = true;
    d.activeTab = 'render';
    // The branch's full PR history, which the survey's open-PR list cannot
    // hold: #332 merged, #333 open, both on the same branch.
    if (state !== 'nopr') d.prHistory = [
      { number: 333, title: "Put the ref box in show-repo's header; make the fab's render tab a guide",
        body: prBody, draft: true, state: 'open' },
      { number: 332, title: 'Say which ref show-repo is running from, in the header',
        body: 'The first pass: a chip and a panel. Superseded by #333.', state: 'merged' },
    ];
    if (state !== 'nopr') d._prsFor = d.ref;
    d.guideIdx = state === 'older' ? 1 : 0;
    // The standing info the no-PR pane shows, normally one REST call away.
    d.ver = { ref: d.ref, sha: 'dca998b', tipUrl: 'https://github.com/x', pr: '332',
              prTitle: 'Say which ref show-repo is running from', prUrl: 'https://github.com/y',
              since: 3, ago: '2h ago' };
    d.verLoaded = true;
    if (state === 'menu') d.refMenu = true;
    if (state === 'gh') d.ghMenu = true;
    if (state === 'pick' || state === 'repos') {
      // The tree normally comes from git/trees over the viewer's token; seed it
      // so the shot is about the panel rather than about the fetch.
      const p = d._picker();
      p._loaded = true;
      p.tree = [{ name: d.repo + ' @ ' + d.ref, kind: 'repo', repo: d.repo, ref: d.ref,
        children: [
          { name: 'dist', kind: 'folder', children: [{ name: 'web-tools.js', kind: 'file' }] },
          { name: 'docs', kind: 'folder', children: [
            { name: 'show-repo.md', kind: 'file' }, { name: 'SURFACING.md', kind: 'file' }] },
          { name: 'lib', kind: 'folder', children: [{ name: 'gh-api.js', kind: 'file' }] },
          { name: 'pages', kind: 'folder', children: [
            { name: 'branch.html', kind: 'file' }, { name: 'toss-render.html', kind: 'file' }] },
          { name: 'README.md', kind: 'file' },
        ] },
        { name: 'mehrlander/home', kind: 'repo', repo: 'mehrlander/home', ref: '', children: null },
        { name: 'mehrlander/web-tools-private', kind: 'repo', repo: 'mehrlander/web-tools-private', ref: '', children: null }];
      p.scope = state === 'repos' ? [] : [p.tree[0]];
      p.open = true;
    }
    return d.renderPrBody();
  }, [BRANCHES, STATE, BODY]);

  await page.waitForTimeout(900);
};
