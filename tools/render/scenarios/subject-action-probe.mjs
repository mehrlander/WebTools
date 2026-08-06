// Probe: can the shell INVOKE a toss subject's action closure, or only reach it?
//
// detect() already reaches the subject's components (see nest-probe.mjs); the
// open question is what happens when a closure that belongs to the frame's
// window is called from a click in the top document. Three things decide it:
//
//   1. Transient activation. navigator.clipboard.writeText needs it. The spec
//      propagates activation to same-origin descendant frames, so this should
//      work in a #gh= toss and cannot in a #gz= one. Measured, not assumed.
//   2. document.hasFocus() in the frame. io.copy branches on it, and a click in
//      the top document does not focus the child, so an io.copy-based action
//      would register its "click to copy" listener on the wrong document.
//   3. Which window `location.href = ...` navigates. show-repo's bust-out
//      action is exactly that shape.
//
// The click has to land on the FAB launcher, not anywhere. toss-render's frame
// covers the viewport, so a click at an arbitrary point lands INSIDE the
// subject, which grants the subject its own activation and measures nothing.
// The launcher is fixed at z-[55] over the frame and belongs to the shell, so
// it is the only honest stand-in for the drawer tap being modelled. A listener
// installed in the frame first confirms the click did not reach it.
//
//   npm run shot -- pages/toss-render.html \
//     --hash 'gh=mehrlander/web-tools@main:pages/toss-render.html#gh=mehrlander/web-tools@main:pages/word-select.html' \
//     --script tools/render/scenarios/subject-action-probe.mjs
export default async function (page) {
  await page.waitForTimeout(4000);

  const origin = new URL(page.url()).origin;
  try {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  } catch (e) {
    console.log('PERMISSIONS ' + String(e).slice(0, 120));
  }

  // Tripwire in the subject, and a baseline before any click anywhere.
  const baseline = await page.evaluate(() => {
    const f = document.getElementById('frame');
    const w = f && f.contentWindow, d = f && f.contentDocument;
    if (!w || !d) return { reached: false };
    w.__probeClicked = false;
    d.addEventListener('click', () => { w.__probeClicked = true; }, true);
    return {
      reached: true,
      topActivationBefore: !!navigator.userActivation?.isActive,
      subjectActivationBefore: !!w.navigator.userActivation?.isActive,
    };
  });
  if (!baseline.reached) { console.log('PROBE {"reached": false}'); return; }

  // The click being modelled: a real one, on the shell's launcher.
  await page.click('[aria-label="Web-tools panel"]');

  const out = await page.evaluate(async () => {
    const r = {};
    const f1 = document.getElementById('frame');
    const w1 = f1.contentWindow, d1 = f1.contentDocument;

    // Did the click reach the subject? If it did, everything below is void.
    r.clickLeakedIntoSubject = !!w1.__probeClicked;

    r.topActivation = !!navigator.userActivation?.isActive;
    r.subjectActivation = !!w1.navigator.userActivation?.isActive;
    r.topHasFocus = document.hasFocus();
    r.subjectHasFocus = d1.hasFocus();   // io.copy branches on this

    try {
      await w1.navigator.clipboard.writeText('subject-window-write');
      r.subjectClipboard = 'resolved';
    } catch (e) {
      r.subjectClipboard = 'rejected: ' + (e?.name || '') + ' ' + (e?.message || String(e)).slice(0, 80);
    }
    try {
      r.clipboardReadBack = await navigator.clipboard.readText();
    } catch (e) {
      r.clipboardReadBack = 'unreadable';
    }

    // The real thing: invoke the subject's own tossRender action closure.
    const el = [...d1.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').startsWith('tossRender'));
    if (el && w1.Alpine) {
      try {
        const acts = w1.Alpine.$data(el).actions || [];
        r.subjectActions = acts.map(a => ({ label: a.label, group: a.group }));
        if (acts[0]) {
          r.subjectRunResult = String(await acts[0].run());
          r.clipboardAfterRun = await navigator.clipboard.readText().catch(() => 'unreadable');
        }
      } catch (e) {
        r.subjectRunError = (e?.name || '') + ' ' + (e?.message || String(e)).slice(0, 80);
        r.errorIsInstanceofTopError = e instanceof Error;
        r.errorIsInstanceofSubjectError = e instanceof w1.Error;
      }
    }

    // The cheap alternative to extending the action contract: focus the frame
    // first, then invoke. Fixes the clipboard case if focus is the only thing
    // wrong, at the cost of taking focus off the drawer the reader is using.
    try {
      w1.focus();
      await new Promise(res => setTimeout(res, 100));
      r.subjectHasFocusAfterFocusCall = d1.hasFocus();
      await w1.navigator.clipboard.writeText('after-focus-call');
      r.subjectClipboardAfterFocusCall = 'resolved';
      r.clipboardReadBackAfterFocusCall = await navigator.clipboard.readText().catch(() => 'unreadable');
    } catch (e) {
      r.subjectClipboardAfterFocusCall = 'rejected: ' + (e?.name || '') + ' ' + (e?.message || String(e)).slice(0, 60);
    }

    // Navigation: whose address bar moves. Done last, it replaces the frame.
    const topBefore = location.href, frameBefore = f1.contentWindow.location.href;
    try { w1.location.href = 'https://example.invalid/bust-out'; }
    catch (e) { r.navThrew = String(e).slice(0, 80); }
    await new Promise(res => setTimeout(res, 500));
    r.topUrlChanged = location.href !== topBefore;
    try { r.frameUrlChanged = f1.contentWindow.location.href !== frameBefore; }
    catch (e) { r.frameUrlChanged = 'cross-origin after nav (so: it navigated)'; }
    return r;
  });

  console.log('PROBE ' + JSON.stringify({ ...baseline, ...out }, null, 2));
}
