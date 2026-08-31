// screenshot.mjs scenario: measure horizontal overflow, which a viewport shot
// cannot show (the house style's "Show pixels" boundary). Reports scrollWidth against
// clientWidth in both views and inside the doc container.
export default async function (page) {
  await page.waitForSelector('[x-ref="doc"] div');
  const read = () => page.evaluate(() => {
    const d = document.documentElement, doc = document.querySelector('[x-ref="doc"]');
    return { docEl: [d.scrollWidth, d.clientWidth], box: [doc.scrollWidth, doc.clientWidth] };
  });
  console.log('SOURCE overflow', JSON.stringify(await read()));
  await page.click('button:has-text("Read")');
  await page.waitForTimeout(600);
  console.log('READ   overflow', JSON.stringify(await read()));
}
