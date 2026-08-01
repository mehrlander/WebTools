// Drive show-repo's header ref switch to a seeded, token-free state, so the
// control renders headlessly. Its branch list normally comes from a GraphQL
// survey over the viewer's token, which the sandbox has neither of; this stubs
// window.GH so load() resolves against a fixed list. What the shot proves is
// the rendering and the states, not the fetch.
//
//   npm run shot -- pages/show-repo/show-repo.html --script tools/render/scripts/ref-switch.mjs
//
// STATE=closed  the collapsed control alone (the default row, nothing open)
// STATE=open    the panel, with the seeded branch list        (the default)
//
// The RIDING state is not a STATE here, because it is not something to fake:
// add `--ref <branch>` and the shot's own address carries ?use=, which is the
// real read. Faking it from this script cannot work anyway, since the script
// runs after the component has mounted and the chip's binding has already been
// evaluated.
//
//   npm run shot -- pages/show-repo/show-repo.html --ref claude/some-branch \
//     --script tools/render/scripts/ref-switch.mjs

const BRANCHES = [
  { name: 'claude/show-repo-branch-nav-xzttnt', date: '2026-08-01T14:00:00Z', ago: '2h', subject: 'The header ref switch', fileOid: 'x1' },
  { name: 'claude/project-pages-docs-udzi51', date: '2026-07-31T22:00:00Z', ago: '18h', subject: 'Projects as first-class', fileOid: 'x2' },
  { name: 'main', date: '2026-07-31T20:00:00Z', ago: '20h', subject: 'Merge pull request #331', fileOid: 'd0' },
  { name: 'claude/portable-dispatcher-execution-n48vvd', date: '2026-07-30T09:00:00Z', ago: '2d', subject: 'Make the dispatcher loud', fileOid: 'd0' },
  { name: 'claude/github-markdown-components-rrlkun', date: '2026-07-28T11:00:00Z', ago: '4d', subject: 'Markdown components', fileOid: 'd0' },
  { name: 'claude/branch-page-lifespan-9k2xd', date: '2026-07-24T16:00:00Z', ago: '8d', subject: 'Branch lifespan', fileOid: 'x3' },
];

const STATE = process.env.STATE || 'open';

export default async (page) => {
  await page.waitForFunction(() => window.__shell && window.Alpine, null, { timeout: 15000 });

  await page.evaluate((branches) => {
    window.GH = class {
      constructor(opts) { this.repo = opts.repo; }
      async branchesForPath() { return { defaultBranch: 'main', defaultOid: 'd0', branches }; }
    };
  }, BRANCHES);

  // The mount is the only refSwitch on the page.
  const el = await page.$('[x-data^="refSwitch"]');
  const data = await el.evaluateHandle((node) => window.Alpine.$data(node));

  if (STATE !== 'closed') {
    await data.evaluate((d) => d.toggle());
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(400);
};
