// What the header's Paste button says when the clipboard has nothing on it.
//
// The whole point of the picture: this used to be the error colour, which on a
// phone read as "this button is broken" rather than "there was nothing to
// take" (reported 2026-08-19). io.pasteItems is stubbed empty, which is the
// same value it returns for a genuinely empty clipboard and for a read the
// platform refused without throwing; the two are indistinguishable from here,
// so the wording says what happened rather than guessing why.
//
//   npm run shot -- app/index.html --script tools/render/scenarios/paste-empty-toast.mjs --width 430 --touch

export default async function (page) {
  const out = await page.evaluate(async () => {
    window.io = { pasteItems: async () => [] };
    const btn = [...document.querySelectorAll('header button')]
      .find(b => b.title === 'Paste the clipboard onto the Stage');
    if (!btn) return { error: 'no paste button in the header' };
    btn.click();
    await new Promise(r => setTimeout(r, 600));
    const t = [...(Alpine.store('toasts') || [])];
    return {
      toasts: t.map(x => ({ icon: x.icon, msg: x.msg, cls: x.cls })),
      // The regression this guards: nothing on this path may paint alert-error.
      anyError: t.some(x => x.cls === 'alert-error'),
      view: window.__shell.view,
    };
  });
  console.log('\n--- an empty clipboard ---\n  ' + JSON.stringify(out) + '\n');
}
