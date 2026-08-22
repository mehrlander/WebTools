// ── stage-handoff: one paste, two documents ────────────────────────────────
//
// The stage is `Alpine.store('browser').stage`, a plain array held for the life
// of one page load, and the bench that renders it mounts only inside the Web
// Tools app. Every other page carrying the fab (a toss, a standalone tool page,
// another repo's page rendered through the renderer) has that array too, since
// the Alpine bundle declares the store everywhere, and has nothing that will
// ever show it. So a paste taken off the app would land in a real array nobody
// reads, and the navigation to the app that ought to follow is the very thing
// that discards it. THE FIELD IS UNIVERSAL AND THE APP AROUND IT IS NOT, which
// is the whole reason this file exists.
//
// Same origin throughout is what keeps it small. Every page carrying the fab is
// served from the hub's Pages origin, tossed pages included, because the fab
// that takes the paste is always the TOP document's: toss-render stamps
// __fabHosted and the framed subject's own fab declines to mount. So one
// localStorage key carries the paste across the navigation, and the app drains
// it at boot.
//
// IT CARRIES CLIPBOARD FLAVORS, NOT STAGE ITEMS, and that is a deliberate
// division rather than a convenience. What a pasted thing becomes (its name,
// its extension, whether those lines are addresses or prose) is decided by
// alpineComponents/stage.js's intake, which is 233K and belongs to the app.
// Making the sending page decide would mean fetching all of it on a long press
// for a paste that may never happen. So the sender does the one thing only it
// can do, reading the clipboard through kits/io.js at 8K, and the decisions
// stay in the one place that already owns them, taken once on arrival.
//
// IT EXPIRES, because a handoff that never arrived is not a queue. A paste
// abandoned mid-navigation must not surface on the app days later with nothing
// to say where it came from, so a stale payload is dropped on read rather than
// delivered late.
(function () {
  const KEY = 'wt:stage-handoff';
  // Long enough to survive a slow navigation and a reload, short enough that
  // nothing arrives from a session you have stopped thinking about.
  const TTL_MS = 10 * 60 * 1000;
  // A ceiling on the SERIALIZED payload, checked before the write so the
  // failure names the size rather than surfacing as the browser's own quota
  // error. Blobs are base64 in this string, so a 3M cap is roughly a 2.2M
  // paste, which is a large screenshot and past what a link could ever carry.
  const MAX = 3 * 1024 * 1024;

  // Chunked, because `String.fromCharCode(...bytes)` on a screenshot-sized
  // array is an argument list long enough to overflow the stack.
  const toB64 = (bytes) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(bin);
  };
  const fromB64 = (s) => {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  // A flavor as kits/io.js hands it over: { kind: 'text', type, text } or
  // { kind: 'blob', type, size, blob }. A blob has to be read to bytes before
  // it can be serialized, which is why put() is async while drain() is not.
  const pack = async (fl) => {
    if (!fl || !fl.type) return null;
    if (fl.kind === 'blob' && fl.blob) {
      const buf = await fl.blob.arrayBuffer();
      return { kind: 'blob', type: fl.type, size: fl.size || buf.byteLength,
               b64: toB64(new Uint8Array(buf)) };
    }
    if (typeof fl.text === 'string') return { kind: 'text', type: fl.type, text: fl.text };
    return null;
  };

  window.StageHandoff = {
    KEY, TTL_MS, MAX,

    // Park the flavors for the app to pick up. Throws with a sentence worth
    // showing: every caller is a menu row with nowhere else to report.
    async put(flavors) {
      const items = (await Promise.all((flavors || []).map(pack))).filter(Boolean);
      if (!items.length) return 0;
      const payload = JSON.stringify({ at: Date.now(), items });
      if (payload.length > MAX) {
        throw new Error('That paste is ' + Math.round(payload.length / 1024) +
          'K, too large to carry across; open the Stage and paste there');
      }
      try {
        window.localStorage.setItem(KEY, payload);
      } catch (e) {
        throw new Error('Could not park the paste (' + (e && e.name || 'storage error') + ')');
      }
      return items.length;
    },

    // Read once and clear, whatever the outcome. A payload that cannot be
    // parsed or has aged out is dropped rather than returned, and dropped
    // rather than left behind, since a payload nothing will accept is not
    // going to start working on the next boot.
    drain() {
      let raw = null;
      try {
        raw = window.localStorage.getItem(KEY);
        if (raw) window.localStorage.removeItem(KEY);
      } catch (e) { return []; }
      if (!raw) return [];
      let o = null;
      try { o = JSON.parse(raw); } catch (e) { return []; }
      if (!o || !Array.isArray(o.items) || !(o.at > 0)) return [];
      if (Date.now() - o.at > TTL_MS) return [];
      return o.items.map(it => it.kind === 'blob' && it.b64
        ? { kind: 'blob', type: it.type, size: it.size,
            blob: new Blob([fromB64(it.b64)], { type: it.type }) }
        : (typeof it.text === 'string'
            ? { kind: 'text', type: it.type || 'text/plain', text: it.text }
            : null)).filter(Boolean);
    },

    // Whether anything is parked, without taking it. For a caller that wants to
    // decide before committing to the read; the drain is still the only thing
    // that judges freshness.
    pending() {
      try { return !!window.localStorage.getItem(KEY); } catch (e) { return false; }
    },
  };
})();
