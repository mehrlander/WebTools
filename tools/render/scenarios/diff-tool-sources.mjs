// pages/diff-tool.html on the Sources tab with the normalization strip open and
// two prose drafts loaded: the state that shows the input model and the
// normalize stage, which the Diff shot does not reach.
export default async function (page) {
  const A = 'The agency requests funding for two positions. '
    + 'The positions would support the new reporting requirement. '
    + 'Costs are ongoing.';
  const B = 'The agency requests funding for three positions. '
    + 'The positions would support the new reporting requirement enacted in 2025. '
    + 'Costs are ongoing and grow in the second year.';

  await page.waitForFunction(() => window.Alpine && document.body._x_dataStack, null, { timeout: 15000 });
  await page.evaluate(({ A, B }) => {
    const app = Alpine.$data(document.body);
    app.slots.A.name = 'request-2025.txt';
    app.slots.B.name = 'request-2027.txt';
    app.slots.A.content = A;
    app.slots.B.content = B;
    app.applyPreset('prose');
    app.normOpen = true;
    app.tab = 'sources';
  }, { A, B });
  await page.waitForTimeout(500);
}
