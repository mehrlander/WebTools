// Shoot the rename a pasted file now has: a paste stages one local item under
// the name sniffed from its first characters, and the row's pencil turns that
// name into an input with the stem selected, which is the whole of the fix for
// a sniff that guessed wrong.
//
//   npm run shot -- app/index.html --query "view=stage" \
//     --script tools/render/scenarios/stage-rename-local.mjs --width 390
export default async (page) => {
  await page.waitForSelector('[x-data*="stager"]', { timeout: 15000 });
  // Same clipboard stub the aimed-deposit scenario uses: the real intake path
  // (io.paste → onDropped) with no real clipboard behind it. The text is
  // markdown, which the sniffer reads as `.md`; the rename is what makes a
  // wrong reading correctable, so the shot renames anyway.
  await page.evaluate(async () => {
    if (!window.io?.paste) await window.gh.load('kits/io.js');
    window.io.paste = async () => '# Notes from the call\n\nThe stage is where this lands.\n';
  });
  await page.click('button[title^="Paste the clipboard"]');
  await page.waitForTimeout(600);
  await page.click('button[title^="Rename"]');
  await page.waitForTimeout(400);
};
