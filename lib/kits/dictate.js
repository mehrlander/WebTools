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
//   The guess is removed rather than corrected. The one exception is the
//   sentence-ending period, which this kit writes itself (below): the engine
//   cannot say where a comma goes, but a pause is a full stop often enough
//   that making the reader tap for it every time was the wrong default.
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
// Two things arrived after the extraction, both in the same handler and both
// about what a PAUSE means, which is the only structural signal speech gives:
//
//   THE PROVISIONAL PERIOD. A pause writes a real '.' at the end of the
//   buffer, and the next words take it back and land in front of it. So a
//   dictated paragraph is punctuated without a tap, and a reader who stops
//   talking has a finished sentence rather than a fragment.
//
//   THE PAUSE RECORD. How long each silence ran is kept beside the segment
//   that followed it, so `paragraphs(ms)` can propose breaks mechanically.
//   The engine already knows where the pauses were; this stops throwing that
//   away, which is the cheap half of a problem a model would otherwise guess
//   at.
//
//   Dictate.available(win?)   -> bool, is there a recognizer in that window
//   Dictate.create(opts)      -> a handle (below)
//
// opts: { win, onText, onInterim, onState, onError, now }. Every field is
// optional. `win` is the window holding the recognizer, or a function
// returning it, and defaults to this one: the annotator passes an accessor
// because its target window is a frame's and can change between calls. The
// callbacks default to no-ops, so a caller that only polls `text` need pass
// nothing. `now` is the clock, injectable so a test can drive the pause record
// without waiting out real silences.
//
// The handle:
//   .text          get/set the buffer
//   .listening     is the engine running
//   .available()   is there a recognizer to start
//   .start() .stop() .toggle()
//   .punct(p)      write a real mark ('¶' for a paragraph break)
//   .flush()       commit the running hypothesis, return the whole buffer
//   .backWord()    delete the last word, or the mark clinging to it
//   .segments      [{text, start, gap}] per finalized segment
//   .paragraphs(ms) the buffer with breaks proposed at the long pauses
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
    const now = opts.now || (() => Date.now());
    let rec = null, pending = null, continuation = false, text = '';
    // The engine's running hypothesis for the segment it is still hearing.
    // Held here, not just painted, so it can be committed on demand.
    let interim = '';

    // ── The provisional period ────────────────────────────────────────────
    // Every pause earns a real '.' at the end of the buffer, taken back the
    // moment more speech arrives. The alternative is what this replaces:
    // reaching for the punctuation row after every sentence, which is the one
    // thing a voice-first composer should not require a tap for.
    //
    // It is MATERIALIZED, written into the buffer rather than derived at read
    // time, so `.text` is the truth for every caller and nothing has to know
    // to add a period before saving. The cost is that the three places that
    // write to the buffer must take it back first, which is why `mark()`,
    // `backWord()` and the interim path each begin by dropping it.
    //
    // No timer. `isFinal` fires at the engine's own end-of-segment detection,
    // which is a better silence signal than a second guess layered over it,
    // and it costs nothing to subscribe to something already happening.
    // THE PERIOD AND THE CAPITAL ARE ONE DECISION. Taking the period back is
    // only half the correction: the engine capitalized the next word on the
    // strength of the same boundary it thought it had found, so a buffer that
    // reads "get punctuation And I guess" is wrong twice over, once for the
    // missing stop and once for the capital that implies one. Either the
    // sentence ended or it did not. So dropping the period turns the
    // continuation flag back on, and normalize() lowers the capital.
    //
    // Callers that write their own punctuation (mark, backWord) set the flag
    // themselves afterwards and override this, which is right: a mark the
    // reader tapped is not a guess to be walked back.
    //
    // Field report 2026-08-09, and it is the reason this is one function
    // rather than two lines at each call site.
    let provisional = false;
    const dropProvisional = () => {
      if (!provisional) return;
      provisional = false;
      text = text.replace(/\.$/, '');
      continuation = true;
    };
    // Not after a mark the reader tapped, and not after a paragraph break:
    // both are deliberate acts this must not second-guess.
    const addProvisional = () => {
      if (provisional || !text || /[.,;:!?]\s*$/.test(text) || /\n\s*$/.test(text)) return;
      text += '.';
      provisional = true;
    };

    // ── Pause capture ─────────────────────────────────────────────────────
    // Where the silences were, recorded as the segments land, so structure can
    // be proposed later without a model: a long gap is a paragraph boundary.
    //
    // The measure is the silence BEFORE a segment (`lastFinalAt` to the first
    // result carrying its words), not the interval between finalizations,
    // which would fold in how long the second segment took to say. It still
    // under-reports: an engine declares a result final some hundreds of ms
    // after speech actually stops, so a measured gap is the true silence minus
    // that latency. Which is why `paragraphs()` takes a threshold rather than
    // hiding one, and why the default below is a starting point to measure
    // against a device rather than a finding.
    let segs = [];            // { text, start, gap } per final segment
    let lastFinalAt = 0;      // when the previous final landed
    let resumedAt = 0;        // when words were first heard again after it

    const normalize = (t) => {
      let s = String(t).replace(/[.,?!:;]/g, (c) => SPOKEN[c]).replace(/\s+/g, ' ').trim();
      if (continuation && /^[A-Z][a-z]/.test(s)) s = s[0].toLowerCase() + s.slice(1);
      return s;
    };
    // A finalized segment: recorded, appended, and given its provisional
    // period. The record holds where it landed so the buffer can be checked
    // against it later; an edit through the text setter drops the record
    // rather than letting the offsets quietly go wrong.
    const commitFinal = (s) => {
      if (!s) return;
      dropProvisional();
      const last = text.slice(-1);
      const sep = (last && !/\s/.test(last) ? ' ' : '');
      segs.push({ text: s, start: text.length + sep.length,
                  gap: (lastFinalAt && resumedAt) ? resumedAt - lastFinalAt : 0 });
      text += sep + s;
      lastFinalAt = now();
      resumedAt = 0;
      addProvisional();
      onText(text);
    };

    const api = {
      get listening() { return !!rec; },
      get text() { return text; },
      // The caller has taken the buffer over (an editor, a reset), so both
      // derived things go: the provisional period is not ours to reclaim, and
      // the segment offsets no longer describe this text.
      set text(v) {
        text = String(v || '');
        provisional = false;
        segs = []; lastFinalAt = 0; resumedAt = 0;
        onText(text);
      },
      available: () => !!SR(),

      // The recorded silences, for a caller proposing structure.
      get segments() { return segs.map(s => ({ ...s })); },

      // The buffer with a paragraph break wherever the pause before a segment
      // ran past `gapMs`. A PROPOSAL: it returns a string and changes nothing,
      // because inserting breaks into someone's dictation on a guess is the
      // kind of help that has to be reviewable.
      //
      // Returns the buffer untouched when it cannot vouch for the record,
      // which is the honest answer after an edit rather than a break placed
      // by an offset that has since moved.
      paragraphs(gapMs = 1500) {
        if (!segs.length) return text;
        for (const s of segs)
          if (text.slice(s.start, s.start + s.text.length) !== s.text) return text;
        let out = '', at = 0;
        for (const s of segs) {
          if (s.gap < gapMs || !s.start) continue;
          if (/\n\s*$/.test(text.slice(0, s.start))) continue;   // already broken
          out += text.slice(at, s.start).replace(/\s+$/, '') + '\n\n';
          at = s.start;
        }
        return out + text.slice(at);
      },

      start() {
        if (rec) return;
        const Ctor = SR();
        if (!Ctor) return onError('Dictation is not available in this browser');
        const r = new Ctor();
        r.continuous = true;
        r.interimResults = true;
        r.lang = (W().navigator && W().navigator.language) || 'en-US';
        r.onresult = (ev) => {
          // The first words heard after a pause close it. Stamped before the
          // segment is processed, since this event IS the resumption.
          if (lastFinalAt && !resumedAt) resumedAt = now();
          // And this event is also the proof that the last pause was not an
          // ending, so the period comes back off HERE, before the loop, rather
          // than inside commitFinal where it used to be. normalize() reads the
          // continuation flag that dropping the period sets, and an engine
          // that delivers a final with no interim ahead of it would otherwise
          // normalize the capital before anything had lowered the flag. That
          // was the bug: the period vanished and the capital stayed.
          if (provisional) { dropProvisional(); onText(text); }
          let live = '';
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const t = normalize(ev.results[i][0].transcript);
            // Normalize and commit one at a time: normalize() reads the
            // continuation flag that committing clears, so batching would
            // lower a capital that the first segment's full stop restored.
            if (ev.results[i].isFinal) { commitFinal(t); continuation = false; }
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

      // A deliberate stop ENDS the sentence. The period stops being
      // provisional, so picking the thread up later starts a new sentence with
      // its capital intact rather than being stitched onto the old one: a
      // reader who put the microphone down and came back did not pause
      // mid-thought. Not when the stop is the mark cycle's own, which is
      // mid-sentence by construction and identified by the parked mark.
      stop() {
        if (!pending) provisional = false;
        if (rec) { try { rec.stop(); } catch { rec = null; } }
      },
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
        if (interim) { const t = interim; interim = ''; onInterim(''); commitFinal(t); }
        return text;
      },

      // Delete the last word, or the punctuation clinging to it, WITHOUT
      // stopping the engine: a misheard word is the common case, and having to
      // stop, fix, and restart to drop one is what makes voice input feel
      // worse than typing. A trailing mark goes first, so two taps undo
      // "word." rather than one tap eating both.
      backWord() {
        // The provisional period is not something the reader typed, so it is
        // not something a tap should spend itself deleting: drop it silently
        // and let the tap reach the word behind it.
        dropProvisional();
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
      // A paragraph break FOLLOWS a finished sentence, so the period a pause
      // earned stays and simply stops being provisional. Every other mark is
      // a replacement for it, so it goes. Getting this backwards puts a break
      // after an unpunctuated clause, which is the one thing the provisional
      // period exists to prevent.
      if (p === '¶') provisional = false;
      else dropProvisional();
      // A tapped mark is a deliberate act, so the pause clock restarts here
      // rather than at the last thing said: the seconds spent reaching for the
      // row are not a rhetorical silence and must not propose a paragraph.
      if (lastFinalAt) { lastFinalAt = now(); resumedAt = 0; }
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
