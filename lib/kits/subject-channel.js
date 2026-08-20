// kits/subject-channel.js — telling the FAB sidebar what you are looking at.
//
// The sidebar already answers "which version of this am I looking at": its
// Render tab names a repo, a ref and a path, roots its path picker there, aims
// its github menu at it, and its ref bar lists the branches carrying a
// different version of that file, one tap to render at any of them. It learns
// all of that from ONE channel, `window.__tossSubject` plus a `toss-subject`
// event, which toss-render stamps per render and the fab adopts.
//
// Nothing about that channel is toss-specific except its name. Any surface
// showing one file at a time can say so on it, and the sidebar follows the
// reader with no coupling in either direction beyond a global and an event.
// The file deck said it first; the stage's reader says it too, which is why
// the machinery is a kit rather than one surface's private code.
//
//   const chan = subjectChannel.open({ bridge: true, keep: ['__deckNavigate'] })
//   chan.announce({ repo, ref, path, route: 'deck' })   // per file
//   chan.set('__deckNavigate', fn)                      // a managed handle
//   chan.openDrawer()                                   // the door, on 'render'
//   chan.release()                                      // on close, once
//
//   bridge   default false. Bridge the sidebar's ANSWER (`__compareRef` plus
//            `web-tools:compare-ref`) down from the shell into this window.
//            Only a surface whose cards read that global needs it; a surface
//            that owns its own comparison, as the stage does, does not.
//   keep     extra globals this surface will overwrite, snapshotted and put
//            back with the subject. `__tossSubject` and `__tossFrame` are
//            always managed.
//
// WHICH WINDOW IS LISTENING is the part that is easy to get wrong, and the
// deck's first version got it wrong. Inside a toss the surface runs in the
// FRAME, and the frame's own fab declined to mount (toss-render stamps
// __fabHosted); the fab that is listening is the SHELL's, one window up. So an
// announcement written only to `window` reached nobody, and the toss link is
// exactly how branch work gets looked at before it merges.
//
// An address-mode toss (#gh=) is same-origin, so the frame can reach the
// parent; a payload toss (#gz=) is opaque and the access throws, which is the
// honest end of it. The host list is therefore every window that might hold a
// fab, this one first.
//
// The frame is nulled beside the subject. A toss subject lives in an iframe and
// the fab reaches into it for Inspect and for the take actions; a slide is in
// THIS document, so there is no frame to hand over and saying so is what keeps
// those features from reaching for one. Every managed global is saved and put
// back on release, since show-repo can itself be running inside a toss.
//
// THE SNAPSHOT IS TAKEN AT open(), not lazily on first write, and that is the
// one thing this kit fixes rather than merely moves. The deck installs its
// navigate handle before its first announcement, so a channel that remembered
// each window the first time it wrote to it would save the deck's own handle as
// the thing to restore. Ordering stopped being a correctness question the
// moment `open()` reads every managed global up front: the host set cannot grow
// afterwards, since it turns on `__fabHosted`, which toss-render stamps before
// the page boots.
//
// No dependencies. It rides in the pre-build; a page on a gh.load chain names
// it before whatever surface uses it.
(() => {
  const ALWAYS = ['__tossSubject', '__tossFrame'];

  const hosts = () => {
    const out = [window];
    try {
      if (window.__fabHosted && window.parent && window.parent !== window
          && window.parent.document) out.push(window.parent);
    } catch { /* opaque origin: a #gz= toss, and nothing to reach */ }
    return out;
  };

  function open(o = {}) {
    const managed = ALWAYS.concat(Array.isArray(o.keep) ? o.keep : []);
    const windows = hosts();
    let held = windows.map((w) => {
      const saved = {};
      for (const k of managed) saved[k] = w[k] || null;
      return { w, saved };
    });

    // ── The answer coming back ────────────────────────────────────────────
    //
    // The sidebar owns which version and what it is compared against, so the
    // choice travels the other way on its own channel, read by the cards
    // themselves. In one window that is the whole mechanism and nothing here
    // is needed. This exists for the framed case, the same asymmetry the host
    // list handles above: the fab dispatches on a window the cards are not in,
    // and this surface is the only thing that knows both.
    //
    // One direction only, shell to frame, so there is no loop to guard against
    // beyond the fab never listening for this event.
    const bridged = [];
    if (o.bridge) {
      for (const w of windows) {
        if (w === window) continue;
        const on = (e) => {
          window.__compareRef = e.detail || null;
          window.dispatchEvent(new window.CustomEvent('web-tools:compare-ref', { detail: e.detail || null }));
        };
        w.addEventListener('web-tools:compare-ref', on);
        bridged.push({ w, on });
      }
    }

    const announce = (subject) => {
      for (const w of windows) {
        w.__tossSubject = subject;
        w.__tossFrame = null;
        w.dispatchEvent(new w.CustomEvent('toss-subject'));
      }
    };

    // A managed handle, written to every host and put back on release. It does
    // not announce: a handle is something the sidebar reaches FOR, not
    // something the reader moved to.
    const set = (name, value) => { for (const w of windows) w[name] = value; };

    const release = () => {
      for (const b of bridged.splice(0)) b.w.removeEventListener('web-tools:compare-ref', b.on);
      if (o.bridge) window.__compareRef = null;
      for (const h of held) {
        for (const k of managed) h.w[k] = h.saved[k];
        h.w.dispatchEvent(new h.w.CustomEvent('toss-subject'));
      }
      held = [];                                 // releasing twice is a no-op
    };

    // The way into the sidebar from a surface covering it. See the fab's
    // listener for why a header offers one at all; from inside a toss this has
    // to reach the shell, so it goes to the last host rather than to `window`.
    const openDrawer = (tab) => {
      const w = windows[windows.length - 1];
      w.dispatchEvent(new w.CustomEvent('web-tools:open-drawer', { detail: { tab: tab || 'render' } }));
    };

    return { announce, set, release, openDrawer, hosts: () => windows.slice() };
  }

  window.subjectChannel = { open, hosts };
})();
