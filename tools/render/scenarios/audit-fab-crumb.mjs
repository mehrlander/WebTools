// A FAB TAP THAT NEVER FINISHED IS NAMED ON THE NEXT LOAD.
//
//   npm run shot -- pages/audit-render.html --width 430 --touch \
//     --script tools/render/scenarios/audit-fab-crumb.mjs
//
// Safari's "A problem repeatedly occurred" is the web process dying, so no
// handler on the page runs and the health readout stays green about a tab that
// is gone. The fab writes each stage of a tap to localStorage before entering
// it (alpineComponents/fab.js, _crumb) and drops the trail when the tap
// completes; the page reads a leftover key on boot and reports it.
//
// A real crash cannot be provoked headless, so this simulates one: write the
// key exactly as _crumb writes it, reload, and assert the readout names the
// stage. Then tap the fab for real and assert a completed tap leaves no key,
// which is the half that stops the instrument crying wolf on every load.

export default async function (page) {
  await page.waitForSelector('[x-ref="doc"] span', { timeout: 20000 });
  await page.waitForTimeout(600);

  // 1. A tap that died inside ensureBrief.
  await page.evaluate(() => localStorage.setItem('fab:step', 'ensureBrief @' + Date.now()));
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[x-ref="doc"] span', { timeout: 20000 });
  await page.waitForTimeout(600);

  const after = await page.evaluate(() => {
    const box = document.getElementById('audit-faults');
    return { text: box?.textContent || '', tone: box?.getAttribute('data-tone'),
             left: localStorage.getItem('fab:step') };
  });
  if (!/previous fab tap never finished: ensureBrief/.test(after.text))
    throw new Error(`the crumb was not reported: ${JSON.stringify(after)}`);
  if (after.tone !== 'error') throw new Error(`reported but not in red: ${after.tone}`);
  if (after.left) throw new Error('the crumb was read but not cleared, so it will report forever');

  // 2. The trail form: a sequence of stages with timings, which is what the
  //    filed report carries. The single-string form above is the older shape,
  //    still read because a device may be carrying one written before it.
  await page.evaluate(() => localStorage.setItem('fab:step', JSON.stringify({
    start: Date.now() - 3000, at: Date.now(),
    steps: [{ stage: 'detect', ms: 2, heap: 40 }, { stage: 'paint', ms: 2900, heap: 380 }],
  })));
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[x-ref="doc"] span', { timeout: 20000 });
  await page.waitForTimeout(800);
  const trail = await page.evaluate(() => ({
    crumb: window.__auditCrumb,
    text: document.getElementById('audit-faults')?.textContent || '',
  }));
  if (!/never finished: paint/.test(trail.text))
    throw new Error(`the trail's last stage is not on screen: ${trail.text}`);
  if (trail.crumb?.steps?.length !== 2)
    throw new Error('the trail did not reach the report');
  if (trail.crumb.steps[1].heap !== 380)
    throw new Error('the trail lost its heap readings, which is the half a timing cannot give');

  // 3. A tap that completes leaves nothing behind. AFTER the synthetic trails
  //    above, deliberately: a late-settling promise (loadVersion, loadGuide,
  //    ensureBrief) appends its own mark to whatever trail is in storage when
  //    it lands, so a real tap running underneath a synthetic one writes into
  //    it. That is the behaviour, not a flaw in it: the trail belongs to the
  //    storage key, not to a call.
  // The fab is loaded after the page's own chain, so it appears later than the
  // document does; wait for the launcher rather than for a fixed delay.
  await page.waitForSelector('[aria-label="Web-tools panel"]', { timeout: 20000 });
  // force: true skips Playwright's stability wait, which never settles on this
  // launcher: it carries transition-all and a hover class swap, so the actions
  // check keeps finding it mid-transition and times out. The click itself is a
  // real one at the element's own point; only the waiting is skipped.
  await page.click('[aria-label="Web-tools panel"]', { force: true });
  // The trail is now dropped on a timer rather than at the second frame, so
  // the async three have a window to land in it. Wait past that.
  await page.waitForTimeout(3200);
  const left = await page.evaluate(() => localStorage.getItem('fab:step'));
  if (left) throw new Error(`a completed tap left a crumb: ${left}`);

  // 5. The three stages past the component's own work are reached and named,
  //    since that is where the device's trail stops and one shared name would
  //    tell us nothing about which of them it stopped in.
  const reached = await page.evaluate(async () => {
    const seen = [];
    const d = Alpine.$data(document.querySelector('[x-data*="fab"]') || document.body);
    const orig = d._crumb.bind(d);
    d._crumb = (stage) => { seen.push(stage); orig(stage); };
    // The drawer body is built on the FIRST open only (x-if on `opened`), and
    // this driver has already opened it once, so the build has to be undone to
    // watch it happen. That build is where the device loses the process, so it
    // is the part worth walking.
    d.close();
    d.opened = false;
    await new Promise(r => setTimeout(r, 200));
    d.toggle();
    await new Promise(r => setTimeout(r, 1500));
    return seen;
  });
  // d:rb-guide and d:rb-take are NOT asserted, and their absence here is
  // itself a finding rather than a gap. They sit inside <template x-if="path">,
  // and the harness loads the page with no repo path, so that whole subtree is
  // never built. On a device opened through a #gh= toss it is, which makes it
  // the largest piece of the drawer this driver cannot reach and the device's
  // trail can.
  for (const want of ['paint', 'frame1', 'frame3', 'd:end', 'd:body', 'd:render-head', 'd:inspect',
                      'd:traffic', 'd:render-body', 'd:rb-console'])
    if (!reached.includes(want)) throw new Error(`the trail never reached ${want}: ${reached.join(',')}`);
  if (!reached.some(s => /^dom:\d+$/.test(s)))
    throw new Error(`no dom count in the trail: ${reached.join(',')}`);

  console.log('stages past the component:', reached.join(' → '));
  console.log('crumb reported:', after.text.split('\n')[0]);
  console.log('the trail reaches the report with its timings and heap');
  console.log('completed tap left no crumb');
}
