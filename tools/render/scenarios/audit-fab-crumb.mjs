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

  // 2. A tap that completes leaves nothing behind.
  // The fab is loaded after the page's own chain, so it appears later than the
  // document does; wait for the launcher rather than for a fixed delay.
  await page.waitForSelector('[aria-label="Web-tools panel"]', { timeout: 20000 });
  // force: true skips Playwright's stability wait, which never settles on this
  // launcher: it carries transition-all and a hover class swap, so the actions
  // check keeps finding it mid-transition and times out. The click itself is a
  // real one at the element's own point; only the waiting is skipped.
  await page.click('[aria-label="Web-tools panel"]', { force: true });
  await page.waitForTimeout(1500);
  const left = await page.evaluate(() => localStorage.getItem('fab:step'));
  if (left) throw new Error(`a completed tap left a crumb: ${left}`);

  // 3. The trail form: a sequence of stages with timings, which is what the
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

  console.log('crumb reported:', after.text.split('\n')[0]);
  console.log('the trail reaches the report with its timings and heap');
  console.log('completed tap left no crumb');
}
