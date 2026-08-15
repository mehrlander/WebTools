// Shoot a pasted image opening in the stage preview. The stage used to refuse
// every local binary by name ("Staged for copy, not preview"), including the
// image formats the viewer has a mode for, so a pasted screenshot could be
// deposited but never looked at.
//
//   npm run shot -- pages/show-repo/show-repo.html --query "view=stage" \
//     --script tools/render/scenarios/stage-image-preview.mjs --width 390
//
// The bytes go in through onDropped rather than through a synthetic paste
// event: what is under test is the preview, and the intake path either side of
// it is already covered by tools/test/stage.test.mjs.
export default async (page) => {
  await page.waitForSelector('[x-data*="stager"]', { timeout: 15000 });
  await page.evaluate(async () => {
    // A 64x64 PNG drawn on a canvas, so the shot has something with edges in
    // it rather than a 1x1 the layout cannot show.
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#1d4ed8'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#fbbf24'; g.fillRect(8, 8, 48, 24);
    g.fillStyle = '#f8fafc'; g.fillRect(8, 40, 48, 16);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const el = document.querySelector('[x-data*="stager"]');
    const data = window.Alpine.$data(el);
    data.onDropped({ file: {}, name: 'pasted-range.png', size: bytes.length, type: 'image/png', bytes, buf: bytes.buffer });
    await data.view(data.localItems[0]);
  });
  await page.waitForTimeout(1200);
};
