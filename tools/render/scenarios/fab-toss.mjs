// Scenario: toss-render address mode with the fab's toss integration.
// Tosses pages/index.html (which mounts its own fab) through __tossNavigate,
// proves the singleton guard suppressed the inner fab, then opens the shell
// fab's Render tab over a canned branchesForPath so the branch scan renders
// deterministically (differs / same / no-file rows) for the screenshot.
export default async (page) => {
  // @main, not the working branch: the local resolver serves every ref from
  // the working tree anyway, and its jsDelivr matcher can't parse a slashed
  // ref, which would strand the inner page's lib chain.
  await page.evaluate(() => window.__tossNavigate(
    'mehrlander/web-tools@main:pages/index.html'));
  // Let the inner page's gh.load chain settle.
  await page.waitForTimeout(3000);

  // Singleton guard: the tossed page mounts x-data="fab()" but must not
  // render it (the shell's fab owns the viewport).
  const inner = page.frames().find(f => f !== page.mainFrame());
  if (!inner) throw new Error('no toss iframe found');
  const guard = await inner.evaluate(() => ({
    hosted: !!window.__fabHosted,
    fabLoaded: (window.__loadedScripts || []).some(s => s.path === 'alpineComponents/fab.js' && s.status === 'ok'),
    fabButtons: document.querySelectorAll('[aria-label="Web-tools panel"]').length,
  }));
  if (!guard.hosted) throw new Error('inner page missing __fabHosted stamp');
  if (!guard.fabLoaded) throw new Error('inner fab.js never loaded — guard not actually exercised');
  if (guard.fabButtons !== 0) throw new Error('inner fab mounted despite the guard');
  console.log('guard ok: inner fab.js loaded, __fabHosted set, 0 inner fab buttons');

  // Canned scan, so the render tab shows every row state without network.
  await page.evaluate(() => {
    window.GH.prototype.branchesForPath = async () => ({
      defaultBranch: 'main', defaultOid: 'A',
      branches: [
        { name: 'claude/fab-render-toss-render-ua6p3p', date: '2026-07-18T15:00:00Z', ago: '1h ago', sha: 'b1', subject: '', fileOid: 'B' },
        { name: 'claude/catalog-regroup-x1y2z3', date: '2026-07-18T09:00:00Z', ago: '7h ago', sha: 'b2', subject: '', fileOid: 'C' },
        { name: 'main', date: '2026-07-16T10:00:00Z', ago: '2d ago', sha: 'm', subject: '', fileOid: 'A' },
        { name: 'claude/lib-only-work-q9r8s7', date: '2026-07-12T10:00:00Z', ago: '6d ago', sha: 'b3', subject: '', fileOid: 'A' },
        { name: 'scratch/pre-catalog', date: '2026-05-20T10:00:00Z', ago: '1mo ago', sha: 'b4', subject: '', fileOid: null },
      ],
    });
  });

  // Open the shell fab's drawer and its Render tab.
  await page.click('[aria-label="Web-tools panel"]');
  await page.waitForTimeout(400);
  await page.click('header button:has-text("Render")');
  await page.waitForTimeout(800);
};
