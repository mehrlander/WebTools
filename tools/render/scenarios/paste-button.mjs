// The header's Paste button, which is the phone's whole app-wide intake: iOS
// Safari raises no paste event unless an editable is focused, so the window
// listener that serves the desktop is worth nothing there.
//
// Drives it from a view that is NOT the Stage, with window.io stubbed, since
// the sandbox has no clipboard and what is under test is the button's routing
// rather than the platform's clipboard. The real read is kits/io.js's, and its
// iOS path (the textarea, and reading its value rather than asking execCommand
// whether it worked) can only be measured on a device.
//
//   npm run shot -- app/index.html --script tools/render/scenarios/paste-button.mjs --width 430

export default async function (page) {
  const out = await page.evaluate(async () => {
    const shell = window.__shell;
    shell.goMap();
    await new Promise(r => setTimeout(r, 300));
    Alpine.store('browser').stage = [];

    // A spreadsheet copy: the cells, the same range as an HTML table.
    const TSV = 'code\tjul\nAA\t186927\nBA\t9448';
    window.io = {
      pasteItems: async () => [
        { kind: 'text', type: 'text/plain', text: TSV, size: TSV.length },
        { kind: 'text', type: 'text/html', text: '<table><tr><td>AA</td></tr></table>', size: 36 },
      ],
    };

    const btn = [...document.querySelectorAll('header button')]
      .find(b => b.title === 'Paste the clipboard onto the Stage');
    if (!btn) return { error: 'no paste button in the header' };
    btn.click();
    await new Promise(r => setTimeout(r, 900));

    const s = Alpine.store('browser');
    return {
      buttonFound: true,
      view: shell.view,
      staged: (s.stage || []).map(it => it.name),
      offers: (s.stageOffers || []).map(o => o.name),
      focusCleared: s.stageFocus === '',
    };
  });
  console.log('\n--- the header paste button ---\n  ' + JSON.stringify(out) + '\n');
}
