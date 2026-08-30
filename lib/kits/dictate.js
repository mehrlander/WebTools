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
// A THIRD thing arrived on 2026-08-09: a selection the browser does not own,
// so a phone's callout bubble never lands over the text and the composer can
// operate on a range of its own (replace it by speaking, recase it from the
// pad). The model is here; the gestures belong to each surface. See "The
// range" below.
//
// Two things arrived after the extraction, both in the same handler and both
// about what a PAUSE means, which is the only structural signal speech gives:
//
//   THE PAUSE PERIOD. A pause writes a real '.' at the end of the buffer and
//   it stays, so the sentences punctuate themselves as they are spoken rather
//   than one period arriving at the very end. A backspace takes it back where
//   the pause was not an ending, and takes the capital with it.
//
//   THE STITCH, which is what a wrong pause period costs to undo. A pause
//   mid-sentence writes a full stop and the engine capitalizes after it, so
//   the repair is two edits at one seam. `stitch()` takes a CARET dropped in
//   the gap and makes them one. See "The seam" below.
//
//   THE PAUSE RECORD. How long each silence ran is kept beside the segment
//   that followed it, so `paragraphs(ms)` can propose breaks mechanically.
//   The engine already knows where the pauses were; this stops throwing that
//   away, which is the cheap half of a problem a model would otherwise guess
//   at.
//
//   THE ENGINE IS KEPT ALIVE, which arrived on 2026-08-23 and is the reason
//   long-form dictation was not possible before it. `continuous` is a request
//   and WebKit ends a recognition at its own silence timeout regardless, so a
//   reader who paused to think came back to a microphone that had switched
//   itself off without saying so. The kit now holds the reader's INTENT apart
//   from the engine's state and relaunches an end nobody asked for, capped by
//   a dry budget so a muted device cannot become a hot loop. See "Keeping the
//   engine alive" below; `keepAlive: false` opts out.
//
//   Dictate.available(win?)   -> bool, is there a recognizer in that window
//   Dictate.create(opts)      -> a handle (below)
//
// opts: { win, onText, onInterim, onState, onError, now, keepAlive, lang, fix }.
// Every field is optional. `win` is the window holding the recognizer, or a
// function returning it, and defaults to this one: the annotator passes an
// accessor because its target window is a frame's and can change between
// calls. The callbacks default to no-ops, so a caller that only polls `text`
// need pass nothing. `now` is the clock, injectable so a test can drive the
// pause record without waiting out real silences. `keepAlive` defaults to
// true and `relaunchMs` to 120. `lang` overrides the window's own language.
// `fix` is a per-segment rewrite, for a caller carrying a correction list.
//
// The handle:
//   .text          get/set the buffer
//   .listening     does the reader want to be heard (survives a relaunch)
//   .live          is an engine up this instant
//   .relaunches    how many times the kit has restarted one
//   .available()   is there a recognizer to start
//   .start() .stop() .toggle()
//   .punct(p)      write a real mark ('¶' for a paragraph break)
//   .flush()       commit the running hypothesis, return the whole buffer
//   .backWord()    delete the last word, or the mark clinging to it
//   .segments      [{text, start, gap}] per finalized segment
//   .paragraphs(ms) the buffer with breaks proposed at the long pauses
//   .range .hasSelection            the selection, {start,end} into the buffer
//   .select(a,b) .selectWordAt(i) .caretAt(i) .clearRange() .moveEdge(w,i)
//   .insert(s) .recase('upper'|'lower'|'title')
//   .stitch() .canStitch    join the sentence at the caret to the one before
//   .unend() .canUnend      take back the full stop the pause just wrote
//   .armCapital(on) .capitalArmed   capitalize the next segment to land
//   .type(s) .erase()             a keyboard's character-at-a-time pair
//   .undo() .redo() .canUndo .canRedo   one step per mutation, caret included
//
// And two statics for the surfaces that show it:
//   Dictate.paint(host, {text, interim, range, armed, handles, arrows})
//   Dictate.pins(layer, {first, last, armed, reach, arrows, clip})
//                                        just the edge pins, over any DOM
//                                                        render into an element
//   Dictate.offsetAt(host, node, off)                    a DOM point as an offset
//   Dictate.SUPPRESS                                     CSS refusing native selection
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
    // Armed by the reader, spent by the next segment that lands: the one
    // capital the recognizer will not guess, because a proper noun sounds
    // exactly like the common word it shares its letters with.
    let capital = false;
    // The engine's running hypothesis for the segment it is still hearing.
    // Held here, not just painted, so it can be committed on demand.
    let interim = '';

    // ── Keeping the engine alive ────────────────────────────────────
    // `continuous` is a request, not a promise. WebKit ends a recognition at
    // its own silence timeout whatever the flag says, so a reader who paused
    // to think came back to a microphone that had switched itself off with
    // nothing said about it: the words simply stopped arriving. Every surface
    // here paints a mic reading "Recording. Tap to stop.", and until now that
    // sentence was false.
    //
    // So INTENT is held apart from the engine's state. `wanted` is what the
    // reader asked for, set by start() and cleared by stop(); `rec` is whether
    // an engine happens to be running this second. An end nobody asked for
    // relaunches. A tapped mark already rode a relaunch of its own (see
    // `punct` below), and this is the same move for the case with no mark in
    // it, which is every ordinary pause.
    //
    // `listening` reports the INTENT, not the engine, so the mic does not
    // blink off in the 120ms gap between an end and its relaunch. That gap is
    // real and is visible through `live` for anything that wants to show it.
    //
    // THE DRY CAP is what stops this being a hot loop. A microphone that is
    // muted, seized by another app, or pointed at a silent room ends at once
    // and forever, so a relaunch that hears nothing at all counts against a
    // budget and the kit gives up when it runs out. Any result resets the
    // count, since an engine returning words is plainly working. A permission
    // refusal is not a silence and never relaunches.
    const keepAlive = opts.keepAlive !== false;
    // Long enough for WebKit to release the device before it is asked for
    // again. Injectable so a test can drive a dozen relaunches without
    // spending two seconds of wall clock on the waiting.
    const RELAUNCH_MS = opts.relaunchMs == null ? 120 : opts.relaunchMs;
    const DRY_MAX = 12;
    let wanted = false;        // the reader's intent, the answer `listening` gives
    let dry = 0;               // relaunches in a row that heard nothing
    let relaunches = 0;        // for a surface reporting on itself

    // ── The pause period ──────────────────────────────────────────────────
    // Every pause writes a real '.' at the end of the buffer, and it STAYS.
    // The reader sees sentences punctuate themselves as they speak, which is
    // what a phone's own dictation does and what this was asked for.
    //
    // It briefly did the opposite, taking the period back when speech resumed
    // on the theory that the pause might have been mid-sentence. Two things
    // retired that (2026-08-09, from use). The buffer it produced carried a
    // single period at the very end and none in between, because each new
    // segment removed the last one: the periods never accumulated, so the
    // draft read as one run-on. And the theory double-counts, because the
    // engine has ALREADY filtered short hesitations: `isFinal` fires at its
    // own end-of-segment detection, and a hesitation too brief to be a
    // sentence break is usually too brief to finalize, so it never reaches
    // here to be judged. The finalization is the pause detector.
    //
    // THE PERIOD AND THE CAPITAL STAY ONE DECISION, which is what the earlier
    // pass got right and this keeps. The period stands, so the engine's
    // capital stands with it and nothing is lowered. Take the period away and
    // the sentence is continuing again, so `backWord()` turns the continuation
    // flag on and the next utterance comes down to lower case. One backspace
    // undoes a pause the reader did not mean as an ending, and undoes it in
    // both respects.
    //
    // The period is MATERIALIZED, written into the buffer rather than derived
    // at read time, so `.text` is the truth for every caller and nothing has
    // to know to punctuate before saving.
    //
    // There is no flag tracking which periods this wrote. There was one while
    // the period could be taken back, and once it stays there is nothing left
    // to distinguish: a period at the end of the buffer behaves the same
    // whether a pause or a thumb put it there, and both `mark()` and
    // `backWord()` treat it that way on purpose. Deleting the flag deleted
    // three of its five call sites outright.
    const endSentence = () => {
      // Not after a mark the reader tapped, and not after a paragraph break:
      // both are deliberate acts this must not second-guess.
      if (!text || /[.,;:!?]\s*$/.test(text) || /\n\s*$/.test(text)) return;
      text += '.';
    };

    // ── The range: a selection the browser does not own ───────────────────
    // `{start, end}` into the buffer, collapsed (start === end) for a caret,
    // null for "no position", which means the end and is the resting state.
    //
    // WHY NOT THE BROWSER'S. The read surface is not an input, and on a phone
    // a native selection inside one drags the whole callout apparatus in with
    // it: the copy/look-up bubble lands over the text being read, and the
    // handles want a drag whose finger then hides the thing being aimed at.
    // Suppressing native selection and keeping the offsets here costs this
    // model and buys a selection the composer can operate on its own terms,
    // including a pad that turns into casing keys while one is live.
    //
    // Every mutation below routes through spliceIn, so "replace the selection"
    // is not a special case anyone has to remember: dictation, a tapped mark,
    // and a paste all land the same way.
    let range = null;

    const clamp = (i) => Math.max(0, Math.min(text.length, i | 0));
    // A placement anywhere but the very end invalidates the pause record: the
    // offsets in it describe a buffer that is about to shift underneath them,
    // and paragraphs() would place a break by an offset that had moved.
    const setRange = (a, b) => {
      lastKind = '';           // a placement ends a typing run
      const s = clamp(Math.min(a, b)), e = clamp(Math.max(a, b));
      range = (s === e && s >= text.length) ? null : { start: s, end: e };
      if (range && range.end < text.length) { segs = []; lastFinalAt = 0; resumedAt = 0; }
      onText(text);
    };

    // Insert at the range, replacing whatever it covers, and return where the
    // new text landed. `tight` skips the joining space, for punctuation.
    const spliceIn = (s, tight) => {
      const r = range || { start: text.length, end: text.length };
      const before = text.slice(0, r.start), after = text.slice(r.end);
      const sep = (!tight && before && !/\s$/.test(before) && !/^\s/.test(s)) ? ' ' : '';
      // AND A SEPARATOR ON THE FAR SIDE, which only a mid-buffer insertion can
      // need: at the end there is nothing to run into, which is why the join
      // was one-sided for as long as speaking meant appending. Once a caret
      // could be placed, speaking into one glued the phrase to the word after
      // it ("…here |then carried on" came back "…here and kept goingthen
      // carried on"). Replacing a selection is usually already spaced on that
      // side, so the test is the text rather than the case.
      // A CLINGING MARK IS NOT A WORD. What follows the caret is often the
      // punctuation of the sentence being repaired, and it belongs against the
      // word before it: inserting into "one|. two." must not give "one and a
      // half . two.". Closing brackets and quotes cling the same way.
      const tail = (!tight && after && !/^[\s.,;:!?)\]}'"’”]/.test(after) && !/\s$/.test(s)) ? ' ' : '';
      const ins = sep + s + tail;
      text = before + ins + after;
      // The span covers what was WRITTEN, not the space that joined it on:
      // commitFinal keeps a replacement selected so it can be said again, and
      // a selection reaching over a separator would grow by one on each try.
      const at = { start: r.start + sep.length, end: r.start + sep.length + s.length };
      // Collapse to a caret after what was written, so speaking on continues
      // from there rather than jumping back to the end. Past the trailing
      // separator, so the next phrase does not add a second one.
      const caret = r.start + ins.length;
      range = caret >= text.length ? null : { start: caret, end: caret };
      return at;
    };

    // The word under an offset, for the long press. Whitespace gives a
    // collapsed range, which is how a caret gets placed without a second
    // gesture: press where there are no letters and you get an insertion
    // point instead of a selection.
    const wordAt = (i) => {
      const at = clamp(i);
      const isW = (c) => !!c && /\S/.test(c);
      // Land on whitespace, or past the end, and there is no word to take:
      // the press gives a caret instead. That is the rule rather than
      // "nearest word" because it is the one a reader can aim at, and it is
      // what makes a caret reachable without inventing a second gesture.
      if (!isW(text[at])) return { start: at, end: at };
      let s = at, e = at;
      while (s > 0 && isW(text[s - 1])) s--;
      while (e < text.length && isW(text[e])) e++;
      return { start: s, end: e };
    };

    // ── The seam: where a pause invented a sentence break ─────────────────
    // A run of terminal marks, the whitespace after it, and the word that
    // follows. `{start, end}` covers the marks and the gap, so `end` is where
    // that next word begins.
    //
    // WHY IT IS A LOOKUP AND NOT A SELECTION. The pause period is right often
    // enough to keep (see above) and wrong often enough to need taking back,
    // and taking it back is TWO edits: the mark goes, and the capital the
    // engine wrote after it comes down. Selecting the word to recase it, then
    // reaching for the delete key twice, is four gestures for one correction a
    // reader makes constantly. So the seam is addressed by a CARET, which is
    // the cheapest thing a thumb can place: tap the gap, and everything the
    // repair needs is already named.
    //
    // The caret counts as in the seam anywhere from the first mark to the
    // first letter after the gap, which is the region a finger can actually
    // aim at. Two or three offsets, and all of them mean the same thing.
    const TERM = /[.!?]/;
    const seamAt = (i) => {
      const at = clamp(i);
      // From at, walk back over the whitespace to reach the marks. A caret
      // sitting ON the following word's first letter arrives here too, which
      // is why the walk runs before the test rather than after it.
      let e = at;
      while (e > 0 && /\s/.test(text[e - 1])) e--;
      // Not after the marks, then: the caret may sit BEFORE them, at the end
      // of the sentence it is about to un-end. Walk forward instead.
      if (!TERM.test(text[e - 1] || '')) {
        if (!TERM.test(text[at] || '')) return null;
        e = at;
        while (TERM.test(text[e] || '')) e++;
      }
      let s = e;
      while (s > 0 && TERM.test(text[s - 1])) s--;
      // A mark with no word in front of it is not a sentence ending, so there
      // is nothing to stitch it to.
      if (!s || !/\S/.test(text[s - 1])) return null;
      let g = e;
      while (g < text.length && /\s/.test(text[g])) g++;
      // Both halves are required: no gap means the join is already tight and
      // dropping the mark would run two words together; no following text
      // means the mark ends the buffer and there is nothing to join to.
      if (g === e || g >= text.length) return null;
      // And the caret has to be IN it. Everything above only found the
      // nearest seam; this is what keeps a caret four words away from
      // reaching one.
      if (at < s || at > g) return null;
      return { start: s, end: g };
    };

    // THE SEAM THAT IS NOT THERE YET. `seamAt` needs two sentences and joins
    // them; this is the state one keystroke earlier, where the pause has
    // written a full stop at the end of the buffer and the reader is about to
    // say the rest of the sentence it just closed. Nothing follows it, so
    // there is nothing to join to and `seamAt` correctly declines.
    //
    // Only at the end, and only a sentence mark. A comma was the reader's or
    // a spoken one, and un-ending it would mean nothing; `endSentence` writes
    // only the full stop, so only the full stop is a guess worth taking back.
    const unendable = () =>
      !(range && range.start !== range.end)
      && (!range || range.end >= text.length)
      && /[.!?]\s*$/.test(text);

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

    // ── History: what UNDO undoes ─────────────────────────────────────────
    // A stack of whole snapshots, {text, range}, taken before each mutation
    // that writes to the buffer. Whole snapshots rather than diffs because the
    // buffer is a note, not a document: a dictated one runs to a few hundred
    // characters, fifty of them cost nothing to hold, and a diff would have to
    // be inverted correctly under every mutation here to be worth its cleverness.
    //
    // A step is a MUTATION, so it is per dictated phrase, per tapped mark, per
    // delete, per casing change, and per handover from an editor. Caret and
    // selection moves are not steps: undo is about the words, and a stack that
    // also replayed every tap would spend its depth on gestures the reader can
    // simply make again. The caret rides ALONG, though, restored with the text
    // it belonged to, since landing an undo without knowing where you are is
    // half an undo.
    const HISTORY = 50;
    const past = [], future = [];
    const snapshot = () => ({ text, range: range ? { ...range } : null });
    // A RUN OF TYPING IS ONE STEP. Every other mutation here arrives whole (a
    // phrase, a mark, a word deleted), but a keyboard arrives one character at
    // a time, and a stack that recorded each would spend fifty steps on one
    // sentence and undo it letter by letter. Consecutive records of the same
    // kind coalesce; anything else, including moving the caret, ends the run,
    // so typing here, moving, and typing there are two steps.
    let lastKind = '';
    const record = (kind = '') => {
      if (kind && kind === lastKind) return;
      lastKind = kind;
      past.push(snapshot());
      if (past.length > HISTORY) past.shift();
      // A new edit forks the timeline: what was undone is no longer reachable,
      // which is the one rule every undo stack shares.
      future.length = 0;
    };
    // The pause record describes offsets in a buffer that is being replaced, so
    // it goes, the same as it does through the text setter.
    const restore = (s) => {
      lastKind = '';
      text = s.text;
      range = s.range;
      segs = []; lastFinalAt = 0; resumedAt = 0;
      onText(text);
    };

    // A SEGMENT, on its way in. The spoken marks are demoted, the caller's
    // corrections run, and then the continuation casing settles the capital.
    //
    // `opts.fix` is the hook and the order around it is the point. It runs
    // AFTER the mark demotion, so a correction sees the words rather than a
    // stray period, and BEFORE the casing, so replacing the first word of a
    // continuation still comes down to lower case. It exists because the
    // recognizer on a phone is the same one Siri uses and it will not learn a
    // technical vocabulary: no amount of speaking clearly turns "JS deliver"
    // into "jsDelivr". A substitution list is the only lever a page has, and
    // this is the one place a segment can be reached before it lands.
    const normalize = (t) => {
      let s = String(t).replace(/[.,?!:;]/g, (c) => SPOKEN[c]).replace(/\s+/g, ' ').trim();
      if (opts.fix) s = String(opts.fix(s) ?? s);
      if (continuation && /^[A-Z][a-z]/.test(s)) s = s[0].toLowerCase() + s.slice(1);
      // APPLIED HERE AND SPENT AT THE COMMIT, which is not a tidiness point.
      // An interim is revised, so the same hypothesis passes through this
      // function several times; a flag cleared on first sight would raise the
      // capital and then drop it again on the next revision, in front of the
      // reader. Applying without clearing shows the capital on the grey text
      // the whole way, and `commitFinal` is what spends it. Last, so it beats
      // the continuation rule above: an explicit ask outranks an inference.
      if (capital && s) s = s[0].toUpperCase() + s.slice(1);
      return s;
    };
    // A finalized segment: recorded, appended, and given its period. The record holds where it landed so the buffer can be checked
    // against it later; an edit through the text setter drops the record
    // rather than letting the offsets quietly go wrong.
    const commitFinal = (s) => {
      if (!s) return;
      capital = false;
      record();
      // At the end is the ordinary case and the only one the pause record can
      // describe. A caret placed mid-buffer means the reader is repairing
      // something, so the words go THERE, the record is dropped rather than
      // left lying about offsets, and no period is appended to a far end the
      // reader is not looking at.
      const atEnd = !range || range.end >= text.length;
      const hadSel = !!(range && range.start !== range.end);
      const gap = (lastFinalAt && resumedAt) ? resumedAt - lastFinalAt : 0;
      const at = spliceIn(s);
      // A REPLACEMENT keeps the selection, over the words that replaced the
      // old ones. Two reasons, and the second is the better one. It shows what
      // just happened, which is hard to see otherwise in a paragraph that
      // shifted. And it makes the repair a LOOP: say it again and the
      // recognizer's second attempt replaces its first, as many times as it
      // takes, which is exactly what a mis-heard word needs. Tap ✕, or tap the
      // text, to step out of the loop and carry on.
      if (hadSel) range = { start: at.start, end: at.end };
      if (atEnd) { segs.push({ text: s, start: at.start, gap }); endSentence(); }
      else { segs = []; }
      lastFinalAt = now();
      resumedAt = 0;
      onText(text);
    };

    const api = {
      // INTENT, not the engine. A relaunch leaves `rec` null for about a tenth
      // of a second and a mic painted from that would blink at every pause,
      // which is the one thing a recording indicator must not do.
      get listening() { return wanted; },
      // The engine itself, for a surface that wants to say "reconnecting".
      get live() { return !!rec; },
      get relaunches() { return relaunches; },
      get text() { return text; },
      // The caller has taken the buffer over (an editor, a reset), so both
      // derived things go: the period is not ours to reclaim, and the segment
      // offsets no longer describe this text.
      set text(v) {
        if (String(v || '') === text) { range = null; onText(text); return; }
        record();
        text = String(v || '');
        range = null;
        segs = []; lastFinalAt = 0; resumedAt = 0;
        onText(text);
      },
      available: () => !!SR(),

      // ── The range, for a surface painting and operating a selection ──────
      get range() { return range ? { ...range } : null; },
      get hasSelection() { return !!range && range.start !== range.end; },
      select(a, b) { setRange(a, b); },
      selectWordAt(i) { const w = wordAt(i); setRange(w.start, w.end); return { ...w }; },
      caretAt(i) { setRange(i, i); },
      clearRange() { range = null; onText(text); },
      // Move one edge of a live selection and keep the other, which is the
      // whole of the tap-to-arm gesture: the surface says which end is armed
      // and where it goes, and the ordering sorts itself out.
      moveEdge(which, i) {
        if (!range) return;
        const other = which === 'start' ? range.end : range.start;
        setRange(other, i);
      },
      // Step the armed edge one character. The tap places it roughly and this
      // settles it, which is the pair a thumb needs: aiming at a character
      // boundary is the one thing a finger cannot do.
      //
      // The armed edge never crosses the other one. It could, and setRange
      // would sort the result correctly, but then "start" would name the right
      // edge and the next arrow would run the wrong way: the label the surface
      // is holding would have quietly changed meaning. Clamping one character
      // short keeps the selection alive and the labels true.
      nudge(which, delta) {
        if (!range || range.start === range.end) return;
        const other = which === 'start' ? range.end : range.start;
        const at = (which === 'start' ? range.start : range.end) + delta;
        setRange(other, which === 'start' ? Math.min(at, other - 1) : Math.max(at, other + 1));
      },
      insert(s) { record(); spliceIn(s); onText(text); },
      // ── The keyboard's two ops ────────────────────────────────────────────
      // A KEY IS NOT A PHRASE. insert() joins what it writes to the words
      // before it, which is right for a dictated phrase and wrong for a letter:
      // typing "h" then "i" through it spells "h i". These write tight, at the
      // caret, replacing the selection like every other mutation here.
      //
      // They exist because a device with a keyboard should not have to ask for
      // one. The composer's read surface is a display rather than an input, so
      // it takes no keystrokes of its own; the annotator listens for them and
      // routes them here, which costs this kit two methods and buys typing in
      // the mode that was voice-only.
      type(s) { record('type'); spliceIn(String(s), true); onText(text); },
      // One CHARACTER, where backWord takes a word: a keyboard's backspace
      // means what it means everywhere. A live selection is what it takes
      // first, same as the word key.
      erase() {
        record('erase');
        if (range && range.start !== range.end) { spliceIn('', true); onText(text); return; }
        const i = range ? range.start : text.length;
        if (!i) return;
        text = text.slice(0, i - 1) + text.slice(i);
        range = (i - 1 >= text.length) ? null : { start: i - 1, end: i - 1 };
        onText(text);
      },
      // Casing, the pad's other job. Applied to the selection only: with no
      // selection there is no subject, and guessing one (the last word? the
      // sentence?) would be a different feature wearing this one's button.
      recase(mode) {
        if (!range || range.start === range.end) return false;
        record();
        const s = text.slice(range.start, range.end);
        const out = mode === 'upper' ? s.toUpperCase()
          : mode === 'lower' ? s.toLowerCase()
          : s.replace(/^(\s*)(\S)/, (m, w, c) => w + c.toUpperCase());
        const r = range;
        text = text.slice(0, r.start) + out + text.slice(r.end);
        range = { start: r.start, end: r.start + out.length };
        onText(text);
        return true;
      },

      // ── The stitch ────────────────────────────────────────────────────
      // Undo a sentence break the pause invented, in ONE act: the full stop
      // goes and the capital after it comes down. They are one decision here
      // for the same reason they are one in `backWord()`, and this is the case
      // that reason was written for.
      //
      // Caret only. With a selection live the pad is showing casing keys and
      // the reader is aiming at a word; the whole point of this is that it
      // needs no selection, so answering to one would be a second gesture
      // wearing the same button.
      //
      // The join is a single space whatever the gap held, a paragraph break
      // included: the reader put a caret in it and asked for one sentence.
      get canStitch() {
        return !(range && range.start !== range.end)
          && !!seamAt(range ? range.start : text.length);
      },
      stitch() {
        if (range && range.start !== range.end) return false;
        const seam = seamAt(range ? range.start : text.length);
        if (!seam) return false;
        record();
        const after = text.slice(seam.end);
        // The same test `normalize()` uses for a continuation, and it carries
        // the same honest limit: "Two" comes down and so would a name, while
        // "I" and an acronym stand, since neither is a capital followed by a
        // lower-case letter. Undo is one tap, which is what makes guessing
        // here cheaper than asking.
        const head = /^[A-Z][a-z]/.test(after) ? after[0].toLowerCase() + after.slice(1) : after;
        text = text.slice(0, seam.start) + ' ' + head;
        const at = seam.start + 1;
        range = at >= text.length ? null : { start: at, end: at };
        // The offsets in the pause record describe the buffer this replaced.
        segs = []; lastFinalAt = 0; resumedAt = 0;
        // The sentence is running again, so an utterance landing here is a
        // continuation and its capital comes down too.
        continuation = true;
        onText(text);
        return true;
      },

      // ── Un-ending, and the capital ────────────────────────────────────
      // The stitch's two neighbours, and the three are one idea seen at three
      // moments: the sentence break the pause invented is not the one the
      // reader meant. `stitch()` repairs it after the next sentence has
      // started, `unend()` before it has, and `armCapital()` runs the other
      // way, putting a capital where nothing would have inferred one.
      //
      // Kept apart from `backWord()` on purpose, even though a backspace on a
      // buffer ending "word." does the same thing today. The backspace's
      // contract is "take off one visible unit," so on a buffer ending in a
      // word it eats the word; a key that means "keep going" must be inert
      // when there is nothing to un-end rather than destructive.
      get canUnend() { return unendable(); },
      unend() {
        if (!unendable()) return false;
        record();
        text = text.replace(/[.!?]\s*$/, '');
        // A caret was at the end by the test above, and the end is the null
        // range, which is what the rest of this file reads as "append here".
        range = null;
        continuation = true;
        onText(text);
        return true;
      },

      // ARM, DO NOT APPLY. There is no word yet: the reader is saying that the
      // next one is a name, an initialism, or the start of a sentence the kit
      // has no way to see coming. It is one-shot, spent by the next segment
      // that commits, because "the next word" is what was asked for and a
      // sticky capital would have to be turned off by hand.
      //
      // With a selection live this is the wrong verb and the page should reach
      // for `recase('title')` instead: that word already exists and can simply
      // be changed.
      get capitalArmed() { return capital; },
      armCapital(on = true) { capital = !!on; return capital; },

      // ── Undo / redo ───────────────────────────────────────────────────
      // Both return whether they did anything, so a surface can paint its keys
      // from the answer rather than from a guess. A mutation forks the
      // timeline: everything undone is dropped, which is the rule every undo
      // stack shares and the one a reader relies on without being told.
      get canUndo() { return past.length > 0; },
      get canRedo() { return future.length > 0; },
      undo() {
        if (!past.length) return false;
        future.push(snapshot());
        restore(past.pop());
        return true;
      },
      redo() {
        if (!future.length) return false;
        past.push(snapshot());
        restore(future.pop());
        return true;
      },

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

      // The reader asking to be heard. Sets the intent, then launches; every
      // relaunch after this one goes through `launch` alone, so a reader's
      // start and the engine's own restart are never confused for each other.
      start() {
        if (wanted && rec) return;
        if (!SR()) return onError('Dictation is not available in this browser');
        wanted = true;
        dry = 0;
        launch();
      },

      stop() {
        // The intent goes FIRST, so the end handler this triggers reads a
        // reader who has stopped and does not relaunch behind them.
        const was = wanted;
        wanted = false;
        // An arming waiting on a word that is now not coming.
        capital = false;
        if (rec) { try { rec.stop(); } catch { rec = null; onState(); } }
        else if (was) onState();
      },
      toggle() { wanted ? api.stop() : api.start(); },

      // A mark tapped while an engine is up rides its relaunch; tapped in the
      // gap between two, or while idle, it is just an append, so the row stays
      // useful whatever the engine happens to be doing.
      punct(p) {
        if (rec) { pending = p; try { rec.stop(); } catch { rec = null; } } else mark(p);
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
        record();
        // A live selection IS what the tap deletes: nothing else would be a
        // sensible reading of a delete key while something is selected.
        if (range && range.start !== range.end) {
          spliceIn('', true);
          continuation = /[,;:]\s*$/.test(text.slice(0, (range || { start: text.length }).start));
          onText(text);
          return;
        }
        // ONE RULE, wherever the caret sits: the buffer either side of it, and
        // one visible unit taken off the head. A caret mid-buffer takes the
        // word before IT rather than the last word of the buffer, which is
        // somewhere else entirely, and the mid-buffer path used to be a
        // separate three lines that left the seam wrong: it stripped the space
        // before the word AND the word, so "the quick brown| fox" came back as
        // "the quick  fox" with two spaces in it (reported 2026-08-14).
        const i = range ? range.start : text.length;
        const head = text.slice(0, i), tail = text.slice(i);
        const atEnd = !tail;
        let cut = head, unended = false;
        // WHITESPACE IS ITS OWN STEP when it stands between the caret and
        // something else. A reader whose caret sits after a space is most
        // often trimming, and taking the space plus the word before it is one
        // tap doing two things, which is what this key had been doing.
        //
        // At the very END it is absorbed instead, and that is the one place
        // the rule bends. The buffer routinely ends "…word. " because a mark
        // writes its own trailing space, and a tap that removed only that
        // would move the caret four pixels and look like a dead key. An
        // invisible step is worse than a compound one.
        if (!atEnd && /\s$/.test(head)) {
          cut = head.replace(/\s+$/, '');
        } else {
          const h = atEnd ? head.replace(/[ \t]+$/, '') : head;
          // A trailing mark goes first, whoever wrote it. That used to skip the
          // pause's own period on the reasoning that it was not the reader's to
          // delete; now that the period STAYS, removing it is the correction the
          // button is reached for most, so it is the first thing a tap takes.
          if (/[.,;:!?]$/.test(h)) { unended = /[.!?]$/.test(h); cut = h.slice(0, -1); }
          else if (/\n\n$/.test(h)) cut = h.replace(/\n+$/, '');
          else {
            cut = h.replace(/[^\s]+$/, '');
            // And the space that separated the word goes with it, so nothing
            // dangles where the word was. Only where the tail can absorb the
            // join, though: with a tail that does not start with whitespace,
            // trimming here would glue two words that were never joined.
            if (atEnd || /^\s/.test(tail)) cut = cut.replace(/[ \t]+$/, '');
          }
        }
        text = cut + tail;
        // A caret at the very end IS the null range, which is what the rest of
        // this file reads as "append here".
        range = atEnd ? null : { start: cut.length, end: cut.length };
        // Removing a full stop UN-ENDS the sentence, so the next utterance is
        // a continuation and its capital comes down. The period and the
        // capital are one decision in this direction too: taking one back
        // takes the other with it. Read off the HEAD, since that is where the
        // next words land whether or not the caret is at the end.
        continuation = unended || /[,;:]\s*$/.test(cut);
        onText(text);
      },
    };

    // Bring an engine up. Every path here has already decided that one should
    // be running: the reader's start, and the end handler's relaunch.
    function launch() {
      if (rec) return;
      const Ctor = SR();
      if (!Ctor) { wanted = false; return onError('Dictation is not available in this browser'); }
      const r = new Ctor();
      r.continuous = true;
      r.interimResults = true;
      r.lang = opts.lang || (W().navigator && W().navigator.language) || 'en-US';
      r.onresult = (ev) => {
        // Words arriving is proof the device is working, whatever it says
        // next, so the dry budget is refilled here rather than on a final:
        // a hypothesis alone already settles the question the budget asks.
        dry = 0;
        // The first words heard after a pause close it. Stamped before the
        // segment is processed, since this event IS the resumption.
        if (lastFinalAt && !resumedAt) resumedAt = now();
        let live = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = normalize(ev.results[i][0].transcript);
          // Normalize and commit one at a time: normalize() reads the
          // continuation flag that committing clears, so batching would
          // lower a capital that the first segment's full stop restored.
          if (ev.results[i].isFinal) { commitFinal(t); continuation = false; }
          // AND A SEPARATOR BETWEEN HYPOTHESES. normalize() trims each segment,
          // because the join belongs in one place and that place is spliceIn:
          // engines disagree about whether a continuation carries a leading
          // space, so the buffer decides rather than the device. But an engine
          // that returns SEVERAL non-final results in one event was having them
          // concatenated raw, and the trim it had just done was what removed
          // the space between them ("the point ofthis page"). It looked like a
          // rendering glitch because it healed itself: the words separated the
          // moment they finalized, where spliceIn does put the space in.
          //
          // Only ever visible on an engine that splits an utterance mid-flight.
          // One that returns a single growing hypothesis, which is what the
          // iPhone appeared to do, never reaches this line twice in an event
          // and so never showed it.
          else live += (live ? ' ' : '') + t;
        }
        interim = live;
        onInterim(interim);
      };
      r.onerror = (ev) => {
        // 'no-speech' and 'aborted' are ordinary ends, not failures worth
        // shouting about mid-dictation.
        const e = ev.error;
        if (!e || e === 'no-speech' || e === 'aborted') return;
        // A REFUSAL IS NOT A SILENCE. Relaunching into a denied microphone
        // asks the reader to refuse again, once every tenth of a second, and
        // on a phone the prompt is a sheet over the page they are trying to
        // read. The intent is dropped so the end handler leaves it alone.
        if (e === 'not-allowed' || e === 'service-not-allowed') wanted = false;
        onError('Dictation: ' + e);
      };
      r.onend = () => {
        rec = null;
        interim = '';
        onInterim('');
        if (pending) {
          const q = pending; pending = null; mark(q);
          if (wanted) { setTimeout(() => launch(), 0); return; }
          return onState();
        }
        if (!wanted) return onState();
        // The reader has not stopped, so this end is the device's own silence
        // timeout and the session continues through it.
        if (!keepAlive) { wanted = false; return onState(); }
        if (++dry > DRY_MAX) {
          wanted = false;
          onError('Dictation stopped: nothing was heard');
          return onState();
        }
        relaunches++;
        setTimeout(() => { if (wanted) launch(); }, RELAUNCH_MS);
      };
      try { rec = r; r.start(); onState(); }
      catch (e) { rec = null; wanted = false; onError('Dictation could not start'); onState(); }
    }

    function mark(p) {
      record();
      // A tapped mark is a deliberate act, so the pause clock restarts here
      // rather than at the last thing said: the seconds spent reaching for the
      // row are not a rhetorical silence and must not propose a paragraph.
      if (lastFinalAt) { lastFinalAt = now(); resumedAt = 0; }
      // A paragraph break FOLLOWS a finished sentence, so the period the pause
      // wrote stays and the break goes after it. Getting this backwards puts a
      // break after an unpunctuated clause.
      // At a range, a mark simply lands there, tight: the replace-the-trailing
      // -mark rule below is about the END of the buffer and means nothing in
      // the middle of a sentence being repaired.
      if (range) { spliceIn(p === '¶' ? '\n\n' : p, true); continuation = false; onText(text); return; }
      if (p === '¶') { text = text.replace(/\s*$/, '') + '\n\n'; continuation = false; onText(text); return; }
      // Every other mark REPLACES the one already sitting there, whoever wrote
      // it: tapping ',' straight after the pause's '.' means the comma was
      // meant, not '..,'. A mistaken tap is the same gesture and gets the same
      // answer, which is why this reads the text rather than a flag.
      text = text.replace(/\s*$/, '').replace(/[.,;:!?]$/, '') + p + ' ';
      continuation = /[,;:]/.test(p);
      onText(text);
    }
    return api;
  };

  const available = (w) => {
    const win = (typeof w === 'function' ? w() : w) || window;
    return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
  };

  // ── Painting the buffer, selection and all ────────────────────────────────
  // One painter for both surfaces. The annotator builds its UI imperatively
  // and the stage builds it in Alpine, and if each rendered its own selection
  // they would diverge on the first edge case; the offsets are the kit's, so
  // the spans that show them are too. Each surface hands over a host element
  // the painter owns entirely.
  //
  // The parts are marked with data-d, which is also the hit-test's map: an
  // offset is found by walking the host's text nodes in order, so the painter
  // and the reader agree by construction rather than by a second convention.
  // The HANDLES carry no text, so they never shift an offset by sitting in it.
  const PART = 'data-d';

  // The caret PULSES, and that needs a stylesheet rather than an inline style:
  // a keyframe cannot be written into a style attribute. It is injected into
  // whatever document the surface lives in, once, since the kit paints into
  // arbitrary documents (a tossed page, any page the annotator rides) and
  // cannot assume the host has anything of ours in it.
  //
  // Pulsing rather than the hard on/off blink a native caret does: this caret
  // is not the system's, and a square bar switching off looks like a rendering
  // fault where a fade reads as a cursor waiting. Reduced motion gets a steady
  // bar, which loses nothing: the caret's job is to say WHERE, and the pulse
  // only says it is live.
  const ensureCaretStyle = (doc) => {
    if (!doc || !doc.head || doc.getElementById('dictate-style')) return;
    const st = doc.createElement('style');
    st.id = 'dictate-style';
    // The annotator marks its own furniture with this so its text index skips
    // it. Harmless anywhere else, and it keeps a shared document tidy.
    st.setAttribute('data-annotate-ui', '');
    st.textContent = `
      @keyframes dictate-caret { 0%, 100% { opacity: 1 } 50% { opacity: .2 } }
      @media (prefers-reduced-motion: no-preference) {
        [${PART}="caret"] { animation: dictate-caret 1.1s ease-in-out infinite; }
      }`;
    doc.head.appendChild(st);
  };

  // ── The edge pins, shared ────────────────────────────────────────────────
  // Lifted out of paint() on 2026-08-30 so a second surface could have them.
  // paint() owns a plain-text buffer and rebuilds its host from a string; the
  // audit render (pages/audit-render.html) marks boundaries over RENDERED
  // markdown and cannot hand its DOM over. What the two want is identical and
  // is this: two pins, one per edge, measured from client rects.
  //
  // `first` and `last` are the edges' client rects, a selection's first and
  // last or one collapsed range at each boundary. `clip` is the box an edge
  // must still sit inside to be worth drawing. Everything below is as it was,
  // comments included: the treatment is settled and this is a move, not a
  // rewrite. Returns the set of edges drawn, which is what the caller's own
  // sweep needs.
  const paintPins = (layer, o = {}) => {
    const doc = layer.ownerDocument;
    const mk = (kind, s, css) => {
      const n = doc.createElement('span');
      n.setAttribute(PART, kind);
      if (css) n.setAttribute('style', css);
      if (s) n.textContent = s;
      return n;
    };
    const kept = new Set();
    for (const stale of [...layer.childNodes]) {
      const k = stale.getAttribute && stale.getAttribute(PART);
      if (k === 'nudge') stale.remove();
    }
    const first = o.first, last = o.last, clip = o.clip || null;
      if (!layer.style.position) layer.style.position = 'relative';
    const lb = layer.getBoundingClientRect ? layer.getBoundingClientRect() : { left: 0, top: 0 };
    const D = 13, BAR = 1.5, PAD = D + 4;
    // ARMING PUTS THE BALL ON A STALK, for a caller that asks (`reach`, in
    // pixels; off by default, so the composer and the stage are unchanged).
    //
    // It exists for the thumb. A pin can be dragged directly, and the ball
    // resting one diameter off the line puts the finger on the words either
    // side of the edge it is placing, which is the whole objection that made
    // these surfaces tap-first. Pushing the ball further out on arming moves
    // the grip clear of the text without moving the mark: the stem still
    // ends exactly on the line, so what the pin POINTS at is unchanged and
    // only where you hold it moves.
    //
    // Only the armed pin reaches. Both reaching at once would be two stalks
    // for one live edge, and the unarmed pin's job is to mark, not to be
    // held.
    const REACH = Math.max(0, Number(o.reach) || 0);
    const put = (edge, x, top, h) => {
      const below = edge === 'end';
      const out = o.armed === edge ? REACH : 0;
      const up = below ? 0 : out, down = below ? out : 0;
      kept.add(edge);
      let box = layer.querySelector('[data-edge="' + edge + '"]');
      if (!box) {
        box = mk('handle-' + edge, '');
        box.setAttribute('data-edge', edge);
        box.appendChild(doc.createElement('span'));
        box.appendChild(doc.createElement('span'));
        layer.appendChild(box);
      }
      box.setAttribute('style',
        'position:absolute;width:32px;cursor:pointer;z-index:3;'
        + 'left:' + Math.round(x - 16) + 'px;top:' + Math.round(top - PAD - up) + 'px;'
        + 'height:' + Math.round(h + PAD * 2 + out) + 'px;');
      const paint = o.armed === edge ? 'background:#dc2626;' : 'background:#2563eb;';
      // The stem covers the line and then the reach, so the bar and the
      // stalk are one element: a separate stalk would meet the bar at a seam
      // that has to be kept invisible across every zoom level.
      const bar = box.firstElementChild;
      bar.setAttribute('style', 'position:absolute;pointer-events:none;border-radius:1px;'
        + 'left:' + ((32 - BAR) / 2) + 'px;top:' + PAD + 'px;width:' + BAR + 'px;'
        + 'height:' + Math.round(h + out) + 'px;' + paint);
      const dot = box.lastElementChild;
      // Above on the left, below on the right, each touching its own stem.
      // The split is what tells the two apart at a glance, and a caller that
      // DRAGS its pins answers the thumb-clearance question in the gesture
      // rather than by moving the marks (pages/dictate.html, its pin drag).
      //
      // ARMED IS A RING, NOT A GLOW. A halo around the ball said "active" by
      // making it bigger, which is the one thing a marker sitting in the
      // text should not do: it grew into the line above it and read as a
      // blob. An inset ring says the same thing at exactly the same
      // diameter, and a red circle with a light centre is the shape every
      // record button already uses for "this one is live". The stalk does
      // not reopen that: it moves the ball OUT of the text rather than
      // growing it in place, which was the objection.
      //
      // THE REACH IS A TRANSFORM AND THE POSITION IS NOT, which is the whole
      // reason it can be animated. `top` changes on every frame of a drag,
      // so a transition on it would make the pin trail the finger; the
      // transform changes only when the edge is armed or put down. One
      // property animates, the other tracks, and neither interferes.
      // The static top is where the ball sits UNREACHED, and the transform
      // is the reach, so the transition runs from one to the other. The box
      // above already shifted by `up` to keep the raised ball inside the hit
      // area, which is why the start pin adds it back here: without that the
      // reach would be counted twice and the ball would leave its own box.
      const dy = below ? PAD + Math.round(h) : PAD - D + up;
      dot.setAttribute('style', 'position:absolute;pointer-events:none;border-radius:50%;'
        + 'left:' + ((32 - D) / 2) + 'px;top:' + dy + 'px;'
        + 'width:' + D + 'px;height:' + D + 'px;'
        + 'transform:translateY(' + (below ? down : -up) + 'px);'
        + (REACH ? 'transition:transform .16s cubic-bezier(.2,.8,.3,1);' : '')
        + (o.armed === edge ? 'background:#fff;box-shadow:inset 0 0 0 4px #dc2626;' : paint));
    };
    const off = (r) => ({ l: r.left - lb.left, t: r.top - lb.top, b: r.bottom - lb.top, r: r.right - lb.left });
    // A PIN WHOSE LINE IS SCROLLED OUT OF VIEW IS NOT PAINTED. The layer is
    // deliberately outside the scroll box and deliberately does not clip, so
    // a ball can hang in the whitespace above the first line; the cost is
    // that an edge scrolled far out of view puts its pin over the toolbar,
    // pointing at nothing. Select-all on a buffer taller than the box makes
    // that the normal case rather than the odd one. The test is the LINE
    // against the box, not the pin, so a pin hanging above the first visible
    // line still shows, which is the case the overlay exists for.
    const shows = (r) => !clip || !r || (r.bottom > clip.top && r.top < clip.bottom);
    if (first && shows(first)) { const f = off(first); put('start', f.l, f.t, first.height); }
    else if (!first) put('start', 0, 0, 0);
    if (last && shows(last)) { const l = off(last); put('end', l.r, l.t, last.height); }
    else if (!last) put('end', 0, 0, 0);

    // The arrows RIDE THE ARMED PIN rather than standing in for the save
    // button. Two things follow: the control is where the eye already is,
    // beside the edge being moved, and save stays live, so a reader who is
    // done adjusting can ship without disarming first.
    // The arrow cluster is OPT-OUT, because one of the two surfaces has
    // something better. Where a cursor pad exists (the annotator's card), an
    // armed pin is dragged with the same gesture that moves the caret, and a
    // pair of arrows chasing the pin around is furniture for a job already
    // done. The stage has no pad, so it keeps them.
    if (o.armed && o.arrows !== false) {
      const r = o.armed === 'start' ? first : last;
      // The cluster goes where its pin went, including nowhere: arrows
      // hovering under an edge that is scrolled out of view would step a
      // boundary the reader cannot see.
      if (shows(r)) {
        // Zeros without layout, the same way the handles degrade: the
        // cluster still exists so the armed state is readable and the
        // targets are there, it simply has nowhere to be yet.
        const g = r ? off(r) : { l: 0, r: 0, b: 0 };
        const x = o.armed === 'start' ? g.l : g.r;
        // Clear of the line, and clear of its own ball where that hangs
        // below: the cluster must not land on the thing it adjusts.
        const y = g.b + (o.armed === 'end' ? D + 10 : 8);
        // Centred on the pin, but kept inside the layer: a selection that
        // starts at the left margin put a third of the cluster off the panel,
        // and the key that went missing there was the left arrow, the one
        // such a selection most needs.
        const W = 128, lw = lb.width || layer.clientWidth || 0;
        let cx = Math.round(x - W / 2);
        if (lw) cx = Math.max(0, Math.min(cx, Math.round(lw - W)));
        else cx = Math.max(0, cx);
        const cluster = mk('nudge', '',
          'position:absolute;z-index:4;display:flex;gap:4px;'
          + 'left:' + cx + 'px;top:' + Math.round(y) + 'px;');
        // A drawn chevron rather than a glyph. '‹' and '›' arrive at
        // whatever weight the system font has, which here was a heavy filled
        // wedge; an inline path is 1.5px of stroke and nothing else, which is
        // the weight the backspace key already sits at. No icon font either,
        // so the kit stays loadable by a page that has none.
        const path = (pts) => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" '
          + 'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" '
          + 'stroke-linejoin="round" style="pointer-events:none"><polyline points="'
          + pts + '"/></svg>';
        const key = (attr, val, pts, tint) => {
          const b = doc.createElement('button');
          b.setAttribute(attr, val);
          b.setAttribute('type', 'button');
          b.setAttribute('style', 'width:40px;height:40px;border-radius:9px;cursor:pointer;'
            + 'display:flex;align-items:center;justify-content:center;padding:0;'
            + 'border:1px solid ' + tint[0] + ';background:#fff;color:' + tint[1] + ';'
            + 'box-shadow:0 1px 3px rgba(0,0,0,.10);');
          b.innerHTML = path(pts);
          cluster.appendChild(b);
        };
        const RED = ['#fecaca', '#dc2626'], GREEN = ['#a7f3d0', '#059669'];
        key('data-nudge', '-1', '15 5 8 12 15 19', RED);
        // Confirm sits BETWEEN the arrows, which is where a thumb already is
        // after nudging. Tapping the pinhead again disarms too, but that is a
        // reach back into the text for something the cluster can answer in
        // place; a check is also the plainer word for "that is where I want
        // it". Green rather than red: it ends the adjustment, it does not
        // continue it.
        key('data-disarm', '1', '4 12 10 18 20 6', GREEN);
        key('data-nudge', '1', '9 5 16 12 9 19', RED);
        layer.appendChild(cluster);
      }
    }
    // WHATEVER WAS NOT DRAWN THIS PASS GOES. Clearing the selection, scrolling
    // an edge out of view, and turning the pins off for a mouse all land here,
    // which is why the sweep sits after the whole section rather than at the
    // top of it: the top is where the pins USED to be removed, and they are
    // kept now so they can animate.
    for (const gone of [...layer.childNodes]) {
      const e = gone.getAttribute && gone.getAttribute('data-edge');
      if (e && !kept.has(e)) gone.remove();
    }
    return kept;
  };

  const paint = (host, o = {}) => {
    const doc = host.ownerDocument;
    const text = o.text || '', interim = o.interim || '';
    const r = o.range;
    const mk = (kind, s, css) => {
      const n = doc.createElement('span');
      n.setAttribute(PART, kind);
      if (css) n.setAttribute('style', css);
      if (s) n.textContent = s;
      return n;
    };
    host.textContent = '';
    host.__range = r || null;
    let sel = null;

    // THE HYPOTHESIS RENDERS AT THE INSERTION POINT, not at the end of the
    // buffer. It was appended after everything, which is right only when the
    // caret is already there: place a caret mid-buffer and speak, and the
    // words appeared at the bottom, then jumped up to the caret when the
    // segment finalized. The result was correct and looked broken on the way,
    // which is worse than a slow correct answer, because the reader stops
    // trusting the caret they just placed.
    //
    // Painted BEFORE the caret, which is where the committed text will land:
    // spliceIn writes at the range and leaves the caret after what it wrote,
    // so the provisional layout matches the settled one exactly and nothing
    // moves when the segment finalizes.
    const dim = o.interimCss || 'color:#a1a1aa;font-style:italic;';
    const hypothesis = () => {
      if (!interim) return [];
      // The leading space is cosmetic (the engine owns real spacing), so it
      // follows whatever text precedes the insertion point rather than the
      // buffer as a whole.
      const head = r ? text.slice(0, r.start) : text;
      const parts = [mk('interim', (/\S$/.test(head) ? ' ' : '') + interim, dim)];
      // A TENTATIVE FULL STOP, on the hypothesis rather than in the buffer.
      // The engine writes the real one when the segment finalizes, which is
      // after the pause, so until then the sentence on screen trailed off
      // unpunctuated and the period appeared to arrive late. It is painted in
      // the hypothesis's own muted italic, so it reads as provisional exactly
      // like the words in front of it, and it is not in `.text`: nothing has
      // been committed and a save still commits the words, not this.
      if (!/[.,;:!?]\s*$/.test(interim)) parts.push(mk('interim-stop', '.', dim));
      return parts;
    };
    const put = (nodes) => { for (const n of nodes) host.appendChild(n); };
    const caret = () => {
      ensureCaretStyle(doc);
      return mk('caret', '', o.caretCss
        || 'display:inline;border-left:2px solid #dc2626;margin:0 -1px;');
    };

    if (!r) {
      host.appendChild(mk('text', text));
      put(hypothesis());
      // `endCaret` paints the insertion point a null range implies. The kit
      // treats a caret at the very end as no range at all, which is the right
      // MODEL (there is nothing to place it before) and the wrong picture: a
      // surface that shows a caret everywhere except at the end appears to
      // lose it exactly when a reader drags one there. Opt-in, so the stage's
      // bar keeps the barer render it has.
      if (o.endCaret) host.appendChild(caret());
    } else if (r.start === r.end) {
      host.appendChild(mk('text', text.slice(0, r.start)));
      put(hypothesis());
      host.appendChild(caret());
      host.appendChild(mk('text', text.slice(r.start)));
    } else {
      host.appendChild(mk('text', text.slice(0, r.start)));
      host.appendChild(mk('sel', text.slice(r.start, r.end), o.selCss
        || 'background:#bfdbfe;border-radius:2px;'));
      // After the selection, which is what speaking will replace: the words
      // arrive where the replacement will sit.
      put(hypothesis());
      host.appendChild(mk('text', text.slice(r.end)));
      sel = host.childNodes[1];
    }
    // The handles are painted into an OVERLAY, not into the scrolling text
    // box. Two reasons, and the second is why they are not simply children
    // here. Out of the flow, so arriving at a selection moves no text. And out
    // of the SCROLL BOX, because it clips at its padding edge: a ball above the
    // first line was cut in half, and the fix is to let it sit in the white
    // space beside the box rather than to pad the box out and push the text
    // down for a marker that is not there most of the time.
    //
    // Coordinates are measured against the overlay, so the caller decides how
    // far out the handles may reach by choosing which ancestor to hand over.
    // Without one they fall back to the host and clip as before.
    // The scroll box: the host's parent, the same assumption hitsText makes,
    // true because a painted span shrink-wraps and the box is what holds it.
    // Two things need it, the handle clip below and the scroll further down.
    const box = host.parentNode;
    const layer = o.overlay || host;
    // NUDGE ARROWS GO EVERY PASS; PINS ARE KEPT AND RESTYLED. A pin that is
    // rebuilt cannot animate, since a fresh element has no previous value to
    // transition from, and the reach below is meant to ease out rather than
    // appear. Keeping the node also means a listener a caller attached to it
    // survives. Every property is rewritten on each pass, so a reused node
    // carries nothing over but its identity.
    // The pins are OPT-OUT, the same way the arrow cluster below is, and for a
    // symmetric reason: they exist because a FINGER dragging a selection edge
    // covers the words it is aiming at, which is why this surface arms an edge
    // by tapping rather than by dragging. A pointer has no such problem, and a
    // reader who is dragging and shift-clicking never touches one, so the card
    // asks for them off once it has seen a mouse or a keyboard. The selection
    // itself is still painted; what goes is the furniture for operating it.
    // The pins, and the sweep of what this pass did not draw, both live in
    // paintPins now: a second surface wanted them and this one had them.
    if (sel && o.handles !== false) {
      const rects = sel.getClientRects ? sel.getClientRects() : [];
      paintPins(layer, { first: rects[0], last: rects[rects.length - 1],
                         armed: o.armed, reach: o.reach, arrows: o.arrows,
                         clip: box && box.getBoundingClientRect ? box.getBoundingClientRect() : null });
    } else {
      for (const gone of [...layer.childNodes]) {
        const e = gone.getAttribute && gone.getAttribute('data-edge');
        if (e) gone.remove();
      }
    }

    // KEEP THE NEWEST LINE IN VIEW (the box is resolved at the top). A
    // dictation surface fills from the top and
    // then keeps going, so without this the box shows the opening sentence
    // while the reader is four sentences further on: the words being spoken
    // are the ones off screen, which is the opposite of what a scroll box is
    // for. The surface is the host's parent, the same assumption hitsText
    // makes, and both are true because a painted span shrink-wraps and the
    // scrolling box is what holds it.
    //
    // Only ON GROWTH, which is the whole guard. Painting also happens on the
    // box's own scroll event (the handles have to be repositioned), so an
    // unconditional scroll-to-bottom would snap the reader back the instant
    // they scrolled up and there would be no way to read what came before.
    // Comparing the length means a scroll paints without moving anything.
    // A live range holds it too: a selection is the one state where the
    // interesting text is where the reader put it, not at the end.
    const grew = text.length > (host.__len || 0);
    host.__len = text.length;
    if (grew && !r && box && box.scrollHeight > box.clientHeight) {
      box.scrollTop = box.scrollHeight;
    }
    return host;
  };

  // A DOM position (the node and offset a browser's caret-from-point returns)
  // as an offset into the buffer. Pure, so the arithmetic is testable without
  // a layout engine; the surface supplies the node from
  // caretRangeFromPoint / caretPositionFromPoint, which jsdom does not have.
  // A point inside the interim clamps to the end of the committed text, since
  // there is nothing there to place a caret in yet.
  const offsetAt = (host, node, nodeOffset) => {
    let n = node;
    while (n && n.parentNode && n.parentNode !== host) n = n.parentNode;
    // A handle is checked FIRST and by its own edge, not by position: the
    // handles are appended after everything else now that they are out of the
    // flow, so a walk would hit the interim's early return before reaching
    // them and report the wrong offset.
    const edge = n && n.getAttribute && n.getAttribute('data-edge');
    if (edge) {
      const r = host.__range;
      return r ? (edge === 'start' ? r.start : r.end) : 0;
    }
    let total = 0;
    for (const part of host.childNodes) {
      const kind = part.getAttribute && part.getAttribute(PART);
      if ((kind || '').startsWith('handle')) continue;
      // The hypothesis contributes NO offsets, and since it now paints at the
      // insertion point it can sit between two runs of committed text. Two
      // things follow, and the second is new: a point inside it clamps to
      // where it will land (there is nothing there to place a caret in yet),
      // and a point AFTER it must not be shifted by characters the buffer does
      // not contain. Returning on sight, which was right while it was always
      // last, would now report the caret's offset for every tap below it.
      if (kind === 'interim' || kind === 'interim-stop') {
        if (part === n) return total;
        continue;
      }
      const len = part.textContent ? part.textContent.length : 0;
      if (part === n) {
        if (kind === 'caret') return total;
        return total + Math.max(0, Math.min(len, nodeOffset | 0));
      }
      total += len;
    }
    return total;
  };

  // Did the point land ON the painted text, or on the blank canvas around it?
  //
  // caretRangeFromPoint cannot answer this: it returns the NEAREST position
  // and so reports a hit for a tap an inch below the last line, which is
  // exactly the tap that means something else. Only the painted parts' own
  // rects can say, and both surfaces need the same answer, so the test lives
  // here beside the painter that made them. Handles and the arrow cluster are
  // not text and are excluded, but they never reach this: their own delegated
  // listeners take the tap first.
  // THE LEADING COUNTS AS TEXT. An inline span's client rects are the FONT
  // box, not the line box, so a generous line-height leaves a gap between
  // consecutive rects: at 17px text on 26px lines that is 6px of dead band
  // between every pair of lines, and a tap landing there read as a miss and
  // sent the caret to the end. Each rect is inflated to the line height, which
  // closes the gap exactly rather than by a guessed tolerance. Measured in a
  // real browser, where the probe reported hit:false for a point plainly on
  // the words; jsdom returns no rects at all and cannot see it.
  const HIT = { text: 1, sel: 1, interim: 1, 'interim-stop': 1 };
  const hitsText = (host, x, y) => {
    if (!host || !host.childNodes) return false;
    const w = host.ownerDocument && host.ownerDocument.defaultView;
    const lead = (w && w.getComputedStyle)
      ? parseFloat(w.getComputedStyle(host).lineHeight) || 0 : 0;
    for (const part of host.childNodes) {
      if (!HIT[part.getAttribute && part.getAttribute(PART)]) continue;
      const rects = part.getClientRects ? part.getClientRects() : [];
      for (const r of rects) {
        if (x < r.left || x > r.right) continue;
        const pad = lead > r.height ? (lead - r.height) / 2 : 0;
        if (y >= r.top - pad && y <= r.bottom + pad) return true;
      }
    }
    return false;
  };

  // The CSS a read surface needs so the browser stops offering its own
  // selection: no highlight to fight with, and on iOS no callout bubble
  // landing over the text. Handed out rather than written down twice.
  //
  // TWO WARNINGS ABOUT USING IT INLINE, both learned the hard way and both
  // reasons kits/annotate.js puts the same declarations in a STYLESHEET
  // instead. `-webkit-touch-callout` is absent from the CSSOM's property
  // list, so it survives only as authored attribute text and any later
  // `.style.foo =` on that element re-serializes the attribute and silently
  // drops it. And an element is not a surface: locking the painted text while
  // the scroll box around it stays selectable leaves every press in the
  // padding, and in the blank canvas past the last line, raising the callout
  // over the words. Reported from a phone against pages/dictate.html on
  // 2026-08-24, which had this string inline on the host and nothing else.
  //
  // touch-action belongs with them and is not here, because it is not about
  // selection: it does NOT inherit, so a surface whose double tap means
  // something needs `manipulation` on the painted parts too or the phone
  // reads the second tap as a request to zoom.
  const SUPPRESS = 'user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;';

  window.Dictate = { create, available, paint, pins: paintPins, offsetAt, hitsText, SUPPRESS, _SPOKEN: SPOKEN };
})();
