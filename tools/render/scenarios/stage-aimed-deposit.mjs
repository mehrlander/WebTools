// Shoot the aimed-deposit flow the branch page's add-file plus opens: the
// stage arrives with dest= preset, a paste stages one local file (named by
// what it is), and the destination field carries the branch, so the only
// thing left is the send.
//
//   npm run shot -- pages/show-repo/show-repo.html \
//     --query "view=stage&dest=mehrlander%2Fweb-tools%40claude%2Fbranch%3Adump" \
//     --script tools/render/scenarios/stage-aimed-deposit.mjs
export default async (page) => {
  await page.waitForSelector('[x-data*="stager"]', { timeout: 15000 });
  // Stub the clipboard read the Paste button makes, so the shot exercises the
  // real intake path (io.paste → onDropped) without a real clipboard.
  await page.evaluate(async () => {
    if (!window.io?.paste) await window.gh.load('kits/io.js');
    window.io.paste = async () => '<!doctype html>\n<html>\n<body>\n<h1>Dictation prototype</h1>\n</body>\n</html>\n';
  });
  await page.click('button[title^="Paste the clipboard"]');
  await page.waitForTimeout(600);
};
