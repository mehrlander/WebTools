// Drive the app-wide paste from a view that is NOT the Stage, which is the
// whole claim: before 2026-08-18 this gesture did nothing anywhere but the
// Stage, and the bench had to have been visited first for it to do anything
// there. Dispatches a real ClipboardEvent carrying two flavors (a tab grid as
// text/plain, the same range as text/html), the shape a spreadsheet copy puts
// on the clipboard, so the shot shows both halves at once: the .tsv staged and
// opened as a table, and the .html left on the offer bar.
//
//   npm run shot -- pages/show-repo/show-repo.html --script tools/render/scenarios/paste-anywhere.mjs --wait 4000

export default async function (page) {
  // Land on the Map, a view with no intake of its own and no bench mounted.
  await page.evaluate(() => window.__shell?.goMap?.());
  await page.waitForTimeout(600);

  await page.evaluate(() => {
    const TSV = ['\tJUL\tAUG\tSEPT',
                 'AA\tSalaries\t $186,927 \t $186,927 ',
                 'BA\tSocial Security (OASI)\t $9,448 \t $9,448 '].join('\n');
    const dt = new DataTransfer();
    dt.setData('text/plain', TSV);
    dt.setData('text/html', '<table><tr><td>Salaries</td><td>186,927</td></tr></table>');
    document.body.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dt, bubbles: true, cancelable: true,
    }));
  });
  await page.waitForTimeout(2500);

  // Report what the gesture actually did, so the run is readable without the
  // pixels: the view it routed to, what landed, and what stayed on the bar.
  const state = await page.evaluate(() => {
    const s = window.Alpine?.store('browser') || {};
    return {
      view: window.__shell?.view,
      staged: (s.stage || []).map(it => it.name || it.path),
      offers: (s.stageOffers || []).map(o => o.name),
      focusCleared: s.stageFocus === '',
    };
  });
  console.log('paste-anywhere:', JSON.stringify(state));
}
