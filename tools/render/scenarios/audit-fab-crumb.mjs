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
  await page.click('[aria-label="Web-tools panel"]');
  await page.waitForTimeout(1500);
  const left = await page.evaluate(() => localStorage.getItem('fab:step'));
  if (left) throw new Error(`a completed tap left a crumb: ${left}`);

  console.log('crumb reported:', after.text.split('\n')[0]);
  console.log('completed tap left no crumb');
}
