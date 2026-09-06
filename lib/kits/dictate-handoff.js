// kits/dictate-handoff.js — carry a draft from a composer on a page to the
// dictation page.
//
// The annotator's composer (kits/annotate.js) and pages/dictate.html are the
// same voice buffer at two sizes, and until now there was no way from the small
// one to the large one. That gap is not cosmetic. The composer floats over the
// thing being described, which is exactly where you want to be while SAYING
// something and exactly where you cannot be while deciding what to do with it:
// a 360px card has no room for a target, a repository list, or the words
// themselves at a length worth reading back. The full page has all three.
//
// So the expand is one gesture with one job: keep the words, change the room.
//
// IT CARRIES ASSEMBLED TEXT, NOT A NOTE. The composer knows what its draft is
// aimed at (a page, an element and its selector, a section and its heading) and
// the dictation page does not and should not: teaching it the annotator's target
// model would be a second implementation of something kits/annotate.js already
// owns. So the sender resolves its own address into a line of text and hands
// over a string. The reader is a text buffer and stays one.
//
// That also makes the result EDITABLE at the far end, which matters more here
// than it would for a structured payload. The whole reason to move rooms is to
// see the words; a context line the reader cannot delete would be furniture in
// the middle of their own draft.
//
// SAME ORIGIN THROUGHOUT, which is what keeps this small. Every page carrying
// the annotator is served from the hub's Pages origin, tossed pages included
// (toss-render stamps __fabHosted and the framed page's own fab declines to
// mount), and pages/dictate.html is on that origin too. So one localStorage key
// carries the draft across the navigation, exactly as kits/stage-handoff.js
// carries a paste to the app.
//
// IT EXPIRES, for the reason that one does: a handoff that never arrived is not
// a queue. A draft abandoned mid-navigation must not surface days later in the
// middle of a different thought, so a stale payload is dropped on read.
//
// AND IT IS TAKEN, NOT READ. take() clears the key before returning, so a
// reload of the dictation page does not seed the buffer a second time on top of
// whatever has been said since. The far end's own localStorage draft is what
// survives a reload; this key is a one-shot.
//
//   dictateHandoff.put(text)   -> bool, did it fit
//   dictateHandoff.take()      -> { text, at, sentAt } | null
(() => {
  const KEY = 'wt:dictate-handoff';
  // Long enough for a slow navigation and a cold tab, short enough that nothing
  // arrives from a thought you have stopped having. Matched to stage-handoff's
  // for no reason beyond consistency: neither number was measured, and if one
  // moves for a real reason the other need not follow.
  const TTL_MS = 10 * 60 * 1000;
  // A spoken draft is words, not bytes. 200K is far past any dictation session
  // and far under what localStorage refuses, so the cap exists to name a
  // failure rather than to bind a real one.
  const MAX = 200 * 1024;

  const put = (text, at) => {
    const t = String(text == null ? '' : text);
    if (!t.trim()) return false;
    const payload = JSON.stringify({ text: t, at: String(at || ''), sentAt: Date.now() });
    if (payload.length > MAX) return false;
    try { localStorage.setItem(KEY, payload); return true; } catch { return false; }
  };

  const take = () => {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch { return null; }
    if (!raw) return null;
    try { localStorage.removeItem(KEY); } catch {}
    let o = null;
    try { o = JSON.parse(raw); } catch { return null; }
    if (!o || typeof o.text !== 'string' || !o.text.trim()) return null;
    if (!(o.sentAt > 0) || Date.now() - o.sentAt > TTL_MS) return null;
    return { text: o.text, at: o.at || '', sentAt: o.sentAt };
  };

  window.dictateHandoff = { KEY, TTL_MS, MAX, put, take };
})();
