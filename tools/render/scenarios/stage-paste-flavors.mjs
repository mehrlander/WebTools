// Shoot the offer bar after a spreadsheet paste. One copy out of Excel puts
// the cells (tab-separated text), the same cells as an HTML table, and a
// picture of the range on the clipboard at once; the stage used to read one
// and return. The bar lists what it did not take.
//
//   npm run shot -- pages/show-repo/show-repo.html --query "view=stage" \
//     --script tools/render/scenarios/stage-paste-flavors.mjs --width 390
//
// The event is synthesized rather than driven through a real clipboard: the
// sandbox has no clipboard, and what is under test is the reading of a
// DataTransfer, not the platform's construction of one.
export default async (page) => {
  await page.waitForSelector('[x-data*="stager"]', { timeout: 15000 });
  await page.evaluate(async () => {
    const tsv = [
      '\tJUL\tAUG\tSEPT\tOCT',
      'AA\tSalaries\t $186,927 \t $186,927 \t $186,927 ',
      'BA\tSocial Security (OASI)\t $9,448 \t $9,448 \t $9,448 ',
      'BB\tRetirement\t $14,407 \t $14,407 \t $14,407 ',
    ].join('\n');
    const html = '<table><tr><th>JUL</th><th>AUG</th></tr>'
      + '<tr><td>Salaries</td><td>186,927</td></tr></table>';
    const c = document.createElement('canvas');
    c.width = 96; c.height = 48;
    const g = c.getContext('2d');
    g.fillStyle = '#f8fafc'; g.fillRect(0, 0, 96, 48);
    g.fillStyle = '#fbbf24'; g.fillRect(0, 0, 96, 12);
    g.fillStyle = '#1d4ed8'; g.fillRect(4, 18, 88, 6); g.fillRect(4, 30, 88, 6);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const file = new File([blob], 'image.png', { type: 'image/png' });

    const el = document.querySelector('[x-data*="stager"]');
    const data = window.Alpine.$data(el);
    data._onPaste({
      target: document.body,
      preventDefault() {},
      clipboardData: {
        types: ['text/plain', 'text/html', 'Files'],
        files: [file],
        getData: (t) => (t === 'text/plain' ? tsv : t === 'text/html' ? html : ''),
      },
    });
  });
  await page.waitForTimeout(900);
};
