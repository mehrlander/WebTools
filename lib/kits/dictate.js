// kits/dictate.js — voice input as a plain text buffer: start the engine, speak,
// and read `text` back. A factory over callbacks, with no opinion about where
// the words are going.
//
// Ported from the prototype dropped at dump/2026-08-08-paste.html and extracted
// from kits/annotate.js on 2026-08-09, where it was written as a factory with no
// reference to the annotator precisely so this would be a move rather than a
// rewrite. Four ideas from the prototype are the whole value, and none is about
// speech recognition itself:
//
//   SPOKEN PUNCTUATION IS TEXT, TYPED PUNCTUATION IS PUNCTUATION. Engines
//   guess badly at where a comma goes, so a recognized '.' is rewritten to
//   the word " period" and real marks arrive only from the punctuation row.
//   The guess is removed rather than corrected.
//
//   THE STOP-MARK-RESTART CYCLE. Nothing can be injected into a live
//   recognition stream, so a tapped mark parks itself, stops the engine, and
//   the end handler writes it and starts again.
//
//   CONTINUATION CASING. After a comma or semicolon the next utterance is
//   the same sentence, so its leading capital is lowered. This is what makes
//   stitched fragments read as prose.
//
//   THE KEYBOARD NEVER OPENS. Committed text lands in a plain element, not a
//   focused input, so on a phone the compose surface costs no viewport. That
//   rule belongs to the caller's UI; what this kit owes it is a buffer that
//   never needs an input to be edited.
//
// The prototype carried a fifth idea, a contenteditable with live Range
// bookkeeping, that this deliberately drops: the buffer is a flat string, so an
// insertion point is a cursor into text and the interim can render in its own
// element instead of inside the document being edited.
//
//   Dictate.available(win?)   -> bool, is there a recognizer in that window
//   Dictate.create(opts)      -> a handle (below)
//
// opts: { win, onText, onInterim, onState, onError }. Every field is optional.
// `win` is the window holding the recognizer, or a function returning it, and
// defaults to this one: the annotator passes an accessor because its target
// window is a frame's and can change between calls. The callbacks default to
// no-ops, so a caller that only polls `text` need pass nothing.
//
// The handle:
//   .text        get/set the buffer
//   .listening   is the engine running
//   .available() is there a recognizer to start
//   .start() .stop() .toggle()
//   .punct(p)    write a real mark ('¶' for a paragraph break)
//   .flush()     commit the running hypothesis, return the whole buffer
//   .backWord()  delete the last word, or the mark clinging to it
//
// Load-time side effect is registration only (window.Dictate). No DOM, no
// Alpine, no fetch.
(() => {
  if (window.Dictate) return;

  // Recognized punctuation becomes its spoken name; the caller's mark row is
  // the only source of real marks.
  const SPOKEN = { '.': ' period', ',': ' comma', '?': ' question mark',
                   '!': ' exclamation point', ':': ' colon', ';': ' semicolon' };

  const create = (opts = {}) => {
    const noop = () => {};
    const { onText = noop, onInterim = noop, onState = noop, onError = noop } = opts;
    // A window, an accessor for one, or nothing.
    const W = () => {
      const w = typeof opts.win === 'function' ? opts.win() : opts.win;
      return w || window;
    };
    const SR = () => { const w = W(); return w.SpeechRecognition || w.webkitSpeechRecognition; };
    let rec = null, pending = null, continuation = false, text = '';
    // The engine's running hypothesis for the segment it is still hearing.
    // Held here, not just painted, so it can be committed on demand.
    let interim = '';

    const normalize = (t) => {
      let s = String(t).replace(/[.,?!:;]/g, (c) => SPOKEN[c]).replace(/\s+/g, ' ').trim();
      if (continuation && /^[A-Z][a-z]/.test(s)) s = s[0].toLowerCase() + s.slice(1);
      return s;
    };
    const append = (s) => {
      if (!s) return;
      const last = text.slice(-1);
      text += (last && !/\s/.test(last) ? ' ' : '') + s;
      onText(text);
    };

    const api = {
      get listening() { return !!rec; },
      get text() { return text; },
      set text(v) { text = String(v || ''); onText(text); },
      available: () => !!SR(),

      start() {
        if (rec) return;
        const Ctor = SR();
        if (!Ctor) return onError('Dictation is not available in this browser');
        const r = new Ctor();
        r.continuous = true;
        r.interimResults = true;
        r.lang = (W().navigator && W().navigator.language) || 'en-US';
        r.onresult = (ev) => {
          let live = '';
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const t = normalize(ev.results[i][0].transcript);
            if (ev.results[i].isFinal) { append(t); continuation = false; }
            else live += t;
          }
          interim = live;
          onInterim(interim);
        };
        r.onerror = (ev) => {
          // 'no-speech' and 'aborted' are ordinary ends, not failures worth
          // shouting about mid-dictation.
          if (ev.error && ev.error !== 'no-speech' && ev.error !== 'aborted') {
            onError('Dictation: ' + ev.error);
          }
        };
        r.onend = () => {
          rec = null;
          interim = '';
          onInterim('');
          if (pending) { const p = pending; pending = null; mark(p); setTimeout(() => api.start(), 0); }
          else onState();
        };
        try { rec = r; r.start(); onState(); }
        catch (e) { rec = null; onError('Dictation could not start'); }
      },

      stop() { if (rec) { try { rec.stop(); } catch { rec = null; } } },
      toggle() { rec ? api.stop() : api.start(); },

      // A mark tapped while listening rides the restart; tapped while idle it
      // is just an append, so the row stays useful after a pause.
      punct(p) {
        if (rec) { pending = p; api.stop(); } else mark(p);
      },

      // Commit the running hypothesis as if it had been finalized, and hand
      // back the whole buffer.
      //
      // Interim results are the engine's best guess at the segment it is still
      // hearing, and it revises them as more audio arrives: a word already
      // shown in grey can change before the segment is marked final, because
      // later context re-decodes earlier audio. Finalization happens at a
      // pause, and once a result is final the API never revises it again.
      //
      // So the grey text is a real transcription, just a revisable one, and
      // saving a note while it is on screen used to drop it: the buffer only
      // held finalized text. Committing the guess is right, because the reader
      // has READ it. They are accepting what they can see, and the alternative
      // was losing a sentence to a pause they did not know they owed the
      // recognizer. What is lost is only the refinement the engine might still
      // have made, and the marks it would have guessed there are removed by
      // this kit anyway.
      flush() {
        if (interim) { const t = interim; interim = ''; onInterim(''); append(t); }
        return text;
      },

      // Delete the last word, or the punctuation clinging to it, WITHOUT
      // stopping the engine: a misheard word is the common case, and having to
      // stop, fix, and restart to drop one is what makes voice input feel
      // worse than typing. A trailing mark goes first, so two taps undo
      // "word." rather than one tap eating both.
      backWord() {
        let t = text.replace(/[ \t]+$/, '');
        if (/[.,;:!?]$/.test(t)) t = t.slice(0, -1);
        else if (/\n\n$/.test(t)) t = t.replace(/\n+$/, '');
        else t = t.replace(/[^\s]+$/, '').replace(/[ \t]+$/, '');
        text = t;
        continuation = /[,;:]\s*$/.test(text);
        onText(text);
      },
    };

    function mark(p) {
      if (p === '¶') { text = text.replace(/\s*$/, '') + '\n\n'; continuation = false; onText(text); return; }
      text = text.replace(/\s*$/, '') + p + ' ';
      continuation = /[,;:]/.test(p);
      onText(text);
    }
    return api;
  };

  const available = (w) => {
    const win = (typeof w === 'function' ? w() : w) || window;
    return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
  };

  window.Dictate = { create, available, _SPOKEN: SPOKEN };
})();
