// The Traffic tab inside a toss. The claim under test is the one the caveat
// line makes: where the subject frame is readable the bands describe the TOSSED
// PAGE, not the toss-render shell around it, and the shell's cost is named
// separately rather than folded in.
//
//   npm run shot -- pages/toss-render.html --script tools/render/scripts/fab-traffic-toss.mjs
//
// It also fails loudly rather than screenshotting a lie: if the subject's own
// resources are missing from the band, or the numbers come back identical to
// the shell's, the run throws.

export default async (page) => {
  await page.waitForFunction(() => window.Alpine && window.__tossNavigate, null, { timeout: 15000 });
  // @main for the same reason fab-toss.mjs uses it: the local resolver serves
  // every ref from the working tree, and its jsDelivr matcher cannot parse a
  // slashed branch name.
  await page.evaluate(() => window.__tossNavigate('mehrlander/web-tools@main:pages/index.html'));
  await page.waitForTimeout(3500);   // the subject's own gh.load chain

  const el = await page.evaluate(async () => {
    const d = window.Alpine.$data(document.querySelector('[x-data^="fab"]'));
    d.open = true;
    d.activeTab = 'traffic';
    await d.refreshTraffic();
    const shell = window.Traffic.readBoot();
    const frame = window.__tossFrame;
    const subjectRows = frame && frame.contentWindow
      ? frame.contentWindow.performance.getEntriesByType('resource').length : -1;
    return {
      viaToss: d.viaToss,
      subject: d.trafSubject,
      bandCount: d.trafBoot ? d.trafBoot.count : 0,
      bandWire: d.trafBoot ? d.trafBoot.wire : 0,
      shellCount: shell.count,
      shellWire: shell.wire,
      namedShellWire: d.trafShellWire,
      subjectRows,
    };
  });

  if (!el.viaToss) throw new Error('the shell fab never adopted the toss subject');
  if (!el.subject) throw new Error('subject frame was not readable, so the bands are still the shell (caveat path)');
  if (el.bandCount === el.shellCount) {
    throw new Error(`bands did not switch to the subject: both report ${el.bandCount} resources`);
  }
  if (el.bandCount !== el.subjectRows) {
    throw new Error(`band count ${el.bandCount} does not match the subject frame's ${el.subjectRows} resources`);
  }
  if (el.namedShellWire !== el.shellWire) {
    throw new Error('the shell figure named beside the caveat is not the shell figure');
  }
  await page.waitForTimeout(500);   // let the drawer finish its 300ms open
  console.log(`toss ok: bands = subject (${el.bandCount} resources, ${el.bandWire} B); `
    + `shell named separately (${el.shellCount} resources, ${el.shellWire} B)`);
};
