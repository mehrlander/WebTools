// dictate.test.mjs — the voice buffer's composition rules.
//
// The four ideas ported from the prototype at dump/2026-08-08-paste.html are
// TEXT rules, not speech ones, so they test without a microphone: a stub
// SpeechRecognition lets the test play the part of the engine and assert what
// lands in the buffer. That is the whole reason the engine is a kit and not a
// closure inside the annotator, and these tests moved here with it on
// 2026-08-09 (from annotate.test.mjs, where they had to stand up a jsdom
// document and enable an annotator to reach the engine at all).
//
// What is NOT here: that the annotator wires this kit up correctly, and that
// it degrades to no microphone when the kit is absent. Both are seam facts
// and stay in annotate.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, loadKit } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
loadKit('dictate.js', { window });
const D = window.Dictate;

// Feed results the way the API does: a list of {t, final}.
class FakeSR {
  constructor() { FakeSR.last = this; this.started = 0; }
  start() { this.started++; }
  stop() { this.onend && this.onend(); }
  say(parts) {
    const results = parts.map(p => Object.assign([{ transcript: p.t }], { isFinal: !!p.final }));
    results.resultIndex = 0;
    this.onresult({ resultIndex: 0, results });
  }
}

// A handle over a window carrying the stub, and over a fake clock. The kit
// takes both rather than reaching for globals: the window is what lets the
// annotator point it at a frame, and the clock is what lets a pause be three
// seconds long without the test waiting three seconds. `clock.t` is the
// current instant; tests advance it by assignment.
const clock = { t: 1000 };
const engine = (opts = {}) => {
  const win = { SpeechRecognition: FakeSR, navigator: { language: 'en-US' } };
  return D.create({ win, now: () => clock.t, ...opts });
};

test('available() reads the window it was given, not the ambient one', () => {
  assert.equal(D.available({ SpeechRecognition: FakeSR }), true);
  assert.equal(D.available({ webkitSpeechRecognition: FakeSR }), true,
    'the prefixed name counts: it is the one Safari ships');
  assert.equal(D.available({}), false);
  assert.equal(D.available(() => ({ SpeechRecognition: FakeSR })), true,
    'an accessor is accepted, since the target window can change between calls');
  assert.equal(engine({ win: {} }).available(), false);
});

test('the callbacks are optional: a caller that only polls text passes nothing', () => {
  const d = D.create({ win: { SpeechRecognition: FakeSR } });
  d.start();
  FakeSR.last.say([{ t: 'no listeners here', final: true }]);
  assert.equal(d.text, 'no listeners here.');
  d.punct('.');
  assert.match(d.text, /here\. $/);
  d.stop();
});

test('spoken punctuation becomes words, tapped marks become punctuation', async () => {
  const d = engine();
  d.start();
  // The engine hears a sentence WITH punctuation: it must not survive as one.
  FakeSR.last.say([{ t: 'the rule is simple.', final: true }]);
  assert.equal(d.text, 'the rule is simple period.',
    'a recognized period is spoken text; the trailing one is the pause\'s, not the engine\'s');

  // A tapped mark rides the stop-restart cycle: parked, engine stopped, then
  // written by the end handler, which also restarts it.
  d.punct('.');
  assert.match(d.text, /simple period\. $/,
    'the tapped mark replaces the pause\'s rather than doubling it');
  await new Promise(r => setTimeout(r, 5));
  assert.ok(FakeSR.last.started > 0, 'the engine is restarted after the mark');
  d.stop();
});

test('a comma continues the sentence, so the next capital is lowered', () => {
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'first part', final: true }]);
  d.punct(',');                       // continuation on
  FakeSR.last.say([{ t: 'Then more', final: true }]);
  assert.equal(d.text, 'first part, then more.',
    'stitched utterances read as one sentence, not as two');

  // A full stop ends it, so the next capital stands.
  d.punct('.');
  FakeSR.last.say([{ t: 'New sentence', final: true }]);
  assert.match(d.text, /\. New sentence\.$/);
  d.stop();
});

test('a paragraph mark breaks the line and spacing never doubles', () => {
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'one', final: true }]);
  d.punct('¶');
  FakeSR.last.say([{ t: 'two', final: true }]);
  assert.equal(d.text, 'one.\n\ntwo.',
    'the break follows the period rather than replacing it, and the second lands too');
  d.stop();
});

test('saving takes the interim with it', () => {
  // The engine finalizes at a pause, so a reader who taps save mid-phrase has
  // words on screen that the buffer does not hold. Dropping them was the field
  // report (2026-08-09): the last sentence spoken vanished on save.
  const seen = [];
  const d = engine({ onInterim: (t) => seen.push(t) });
  d.start();
  FakeSR.last.say([{ t: 'the settled part', final: true }]);
  FakeSR.last.say([{ t: 'and the part still being heard', final: false }]);
  assert.equal(d.text, 'the settled part.',
    'the buffer holds what was finalized, with the period the pause wrote');
  assert.ok(seen.includes('and the part still being heard'),
    'the hypothesis was painted, which is what makes committing it honest');

  assert.equal(d.flush(), 'the settled part. and the part still being heard.',
    'flush commits the guess the reader can see, finished');
  assert.equal(d.flush(), 'the settled part. and the part still being heard.',
    'and is idempotent: a second flush has nothing left to commit');
  assert.equal(seen.at(-1), '', 'and the paint is cleared, so nothing renders twice');
  d.stop();
});

test('the delete button drops one word, or the mark clinging to it', () => {
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'the quick brown fox', final: true }]);
  assert.equal(d.text, 'the quick brown fox.');
  // The trailing mark goes first, whoever wrote it. Now that the pause's
  // period STAYS, removing it is the correction this button is reached for
  // most, so a tap takes it before it takes a word.
  d.backWord();
  assert.equal(d.text, 'the quick brown fox');
  d.backWord();
  assert.equal(d.text, 'the quick brown', 'and the next tap takes the word');
  d.backWord();
  assert.equal(d.text, 'the quick', 'no trailing space is left behind: append re-spaces');

  // Deleting back past a comma restores the continuation state, so the next
  // utterance is not lowercased on the strength of punctuation that is gone.
  d.text = 'first,';
  d.backWord();
  FakeSR.last.say([{ t: 'Then more', final: true }]);
  assert.match(d.text, /Then more\.$/, 'the capital stands once the comma is gone');
  d.stop();
});

test('starting without a recognizer reports rather than throws', () => {
  const errs = [];
  const d = D.create({ win: {}, onError: (m) => errs.push(m) });
  d.start();
  assert.equal(d.listening, false);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /not available/);
});

// ── The pause period ──────────────────────────────────────────────────────
// The rule the tests above only touch in passing: a pause finishes a sentence,
// the period stays, and a backspace is how the reader says it should not have.

test('the period a pause writes STAYS, so the periods accumulate as you speak', () => {
  // The reversal of 2026-08-09, from use. Taking it back on resume meant the
  // buffer carried one period at the very end and none in between, because
  // each new segment removed the last one.
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'the first thought', final: true }]);
  assert.equal(d.text, 'the first thought.', 'a pause finished the sentence');

  FakeSR.last.say([{ t: 'and then', final: false }]);
  assert.equal(d.text, 'the first thought.',
    'and an interim arriving does not unsay it: the reader keeps the stop');

  FakeSR.last.say([{ t: 'A second one', final: true }]);
  assert.equal(d.text, 'the first thought. A second one.',
    'two sentences, each punctuated where it ended');

  FakeSR.last.say([{ t: 'And a third', final: true }]);
  assert.equal(d.text, 'the first thought. A second one. And a third.');
  d.stop();
});

test('a backspace un-ends a pause that was not an ending, capital included', () => {
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'the quick brown fox', final: true }]);
  assert.equal(d.text, 'the quick brown fox.');

  // The pause was mid-thought. One tap says so.
  d.backWord();
  assert.equal(d.text, 'the quick brown fox');
  FakeSR.last.say([{ t: 'Jumps over the dog', final: true }]);
  assert.equal(d.text, 'the quick brown fox jumps over the dog.',
    'the capital came down with the period: one decision, both directions');
  d.stop();
});

test('it does not double a mark the reader tapped, or interrupt a paragraph', () => {
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'a question', final: true }]);
  d.punct('?');
  assert.match(d.text, /a question\? $/, 'the tapped mark replaced the provisional period');

  // Nothing to add after a real mark, so a further pause writes nothing.
  FakeSR.last.say([{ t: 'next', final: true }]);
  assert.equal(d.text, 'a question? next.');
  d.stop();
});

test('an editor taking the buffer over owns its punctuation', () => {
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'dictated', final: true }]);
  assert.equal(d.text, 'dictated.');
  d.text = 'typed by hand';
  assert.equal(d.text, 'typed by hand', 'no period is added to what was typed');
  d.backWord();
  assert.equal(d.text, 'typed by', 'and the stale provisional flag does not eat a character');
  d.stop();
});

// ── The pause record ──────────────────────────────────────────────────────
// What a model would otherwise be asked to guess at. The gap measured is the
// silence BEFORE a segment, so the record answers "how long was it quiet
// before this was said" rather than "how far apart were these two events".

test('each segment records the silence that preceded it', () => {
  const d = engine();
  d.start();
  clock.t = 1000;
  FakeSR.last.say([{ t: 'first', final: true }]);          // lands at 1000

  clock.t = 1400;                                          // 400ms of quiet
  FakeSR.last.say([{ t: 'sec', final: false }]);           // words resume
  clock.t = 2000;                                          // then 600ms saying it
  FakeSR.last.say([{ t: 'second', final: true }]);

  clock.t = 5000;                                          // 3000ms of quiet
  FakeSR.last.say([{ t: 'thi', final: false }]);
  clock.t = 5200;
  FakeSR.last.say([{ t: 'third', final: true }]);

  const gaps = d.segments.map(s => s.gap);
  assert.deepEqual(gaps, [0, 400, 3000],
    'the gap is resumption minus finalization, not the interval between finals');
  d.stop();
});

test('paragraphs() proposes a break at the long pauses and changes nothing', () => {
  const d = engine();
  d.start();
  clock.t = 1000;
  FakeSR.last.say([{ t: 'one', final: true }]);
  clock.t = 1300; FakeSR.last.say([{ t: 'tw', final: false }]);
  clock.t = 1500; FakeSR.last.say([{ t: 'two', final: true }]);       // 300ms gap
  clock.t = 4000; FakeSR.last.say([{ t: 'th', final: false }]);
  clock.t = 4200; FakeSR.last.say([{ t: 'three', final: true }]);     // 2500ms gap

  assert.equal(d.text, 'one. two. three.', 'the buffer is untouched by the record');
  assert.equal(d.paragraphs(1500), 'one. two.\n\nthree.',
    'the long pause becomes a break; the short one stays a sentence boundary');
  assert.equal(d.paragraphs(5000), 'one. two. three.', 'no pause clears a high bar');
  assert.equal(d.text, 'one. two. three.', 'and it is a proposal: nothing was written');
  d.stop();
});

test('paragraphs() declines rather than guessing when the buffer has moved', () => {
  const d = engine();
  d.start();
  clock.t = 1000;
  FakeSR.last.say([{ t: 'one', final: true }]);
  clock.t = 4000; FakeSR.last.say([{ t: 'tw', final: false }]);
  clock.t = 4100; FakeSR.last.say([{ t: 'two', final: true }]);
  assert.equal(d.paragraphs(1500), 'one.\n\ntwo.');

  // An edit through the setter clears the record, since the offsets it holds
  // no longer describe this text. Returning the text unchanged is the honest
  // answer; placing a break by a stale offset is not.
  d.text = 'one two rewritten';
  assert.deepEqual(d.segments, []);
  assert.equal(d.paragraphs(1500), 'one two rewritten');
  d.stop();
});

test('a tapped mark restarts the pause clock, so reaching for the row is not a pause', () => {
  const d = engine();
  d.start();
  clock.t = 1000;
  FakeSR.last.say([{ t: 'a thought', final: true }]);
  clock.t = 3000;
  d.punct(',');                       // two seconds spent finding the comma
  clock.t = 3100;
  FakeSR.last.say([{ t: 'con', final: false }]);
  clock.t = 3300;
  FakeSR.last.say([{ t: 'continued', final: true }]);
  assert.equal(d.segments.at(-1).gap, 100,
    'measured from the mark, not from the last thing said');
  assert.equal(d.paragraphs(1500), 'a thought, continued.',
    'so no paragraph is proposed where the reader was only tapping');
  d.stop();
});

// The field report of 2026-08-09, in full. Dictated on a phone, the buffer
// read "...if we could get punctuation And I guess that is working I would
// turn them to the topic of trees and plants A tree is a nice thing to
// behold." Every boundary lost its period and kept its capital, which is the
// worst of both readings: no stop, and a capital asserting there was one.
test('the field report of 2026-08-09, read back', () => {
  // The buffer that started this: "...if we could get punctuation And I guess
  // that is working I would turn them to the topic of trees and plants A tree
  // is a nice thing to behold." Every boundary had lost its period and kept
  // its capital, which is the worst of the two readings available. Keeping the
  // period settles it the other way, and the capital is then correct.
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'if we could get punctuation', final: true }]);
  FakeSR.last.say([{ t: 'And I guess that is working', final: true }]);
  FakeSR.last.say([{ t: 'A tree is a nice thing to behold', final: true }]);
  assert.equal(d.text,
    'if we could get punctuation. And I guess that is working. A tree is a nice thing to behold.',
    'a stop at every boundary and a capital after each, agreeing');
  d.stop();
});

test('a tapped mark is not a guess, so the capital after it stands', () => {
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'a finished thought', final: true }]);
  d.punct('.');                       // the reader said so
  FakeSR.last.say([{ t: 'New sentence', final: true }]);
  assert.match(d.text, /\. New sentence\.$/,
    'a period the reader tapped ends the sentence, so the next capital is theirs');

  // And a comma still continues, which is the same rule from the other side.
  d.punct(',');
  FakeSR.last.say([{ t: 'Trailing on', final: true }]);
  assert.match(d.text, /, trailing on\.$/);
  d.stop();
});

test('a name after a pause survives, since nothing is lowered there any more', () => {
  // Keeping the period retired most of the proper-noun problem with it: after
  // a pause the sentence has ended, so the capital is right and normalize()
  // has no reason to touch it. Lowering now happens only where the reader
  // SAID the sentence continues, by tapping a comma or backspacing the stop.
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'we met', final: true }]);
  FakeSR.last.say([{ t: 'Tuesday at noon', final: true }]);
  assert.equal(d.text, 'we met. Tuesday at noon.', 'the name keeps its capital');

  // The residual, and it is now a path the reader chose rather than a default.
  d.backWord();                                  // un-end "noon."
  d.text = 'we met';
  FakeSR.last.say([{ t: 'X', final: true }]);    // reset continuation
  d.text = 'we met';
  d.punct(',');
  FakeSR.last.say([{ t: 'Tuesday at noon', final: true }]);
  assert.equal(d.text, 'we met, tuesday at noon.',
    'after a tapped comma a name still comes down: the known cost, now opt-in');
  d.stop();
});

test('putting the microphone down ends the sentence; the mark cycle does not', async () => {
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'a finished thought', final: true }]);
  d.stop();                                     // deliberate
  assert.equal(d.text, 'a finished thought.', 'the period stays');

  d.start();
  FakeSR.last.say([{ t: 'Later, a new one', final: true }]);
  assert.match(d.text, /thought\. Later/,
    'and it is no longer provisional, so the capital after it stands');

  // The stop the punctuation row performs internally is mid-sentence, so it
  // must not settle anything: the mark replaces the provisional period and
  // what follows is still the same sentence.
  d.text = '';
  d.start();
  FakeSR.last.say([{ t: 'before the mark', final: true }]);
  d.punct(',');
  await new Promise(r => setTimeout(r, 5));
  FakeSR.last.say([{ t: 'After the mark', final: true }]);
  assert.equal(d.text, 'before the mark, after the mark.',
    'the comma continued it, exactly as a tapped comma should');
  d.stop();
});

// ── The range: a selection the browser does not own ───────────────────────
// The offsets are the kit's, so every rule about them is testable without a
// layout engine. What is NOT here: the gestures. A long press and a tap map a
// POINT to a node, which needs caretRangeFromPoint and a real box model;
// offsetAt below takes the node the browser hands back, so the arithmetic on
// this side of that call is pinned and the surface owns only the call itself.

const withText = (t) => { const d = engine(); d.text = t; return d; };

test('a long press selects the word under it, and whitespace gives a caret', () => {
  const d = withText('the quick brown fox');
  assert.deepEqual(d.selectWordAt(6), { start: 4, end: 9 }, 'inside "quick"');
  assert.deepEqual(d.range, { start: 4, end: 9 });
  assert.equal(d.hasSelection, true);

  // Between two words there is nothing to select, so the press places an
  // insertion point instead. One gesture, two useful outcomes.
  d.selectWordAt(3);
  assert.deepEqual(d.range, { start: 3, end: 3 });
  assert.equal(d.hasSelection, false);
});

test('tap-to-arm moves one edge and keeps the other, in either direction', () => {
  const d = withText('the quick brown fox');
  d.select(4, 9);                       // "quick"
  d.moveEdge('end', 15);                // extend the tail
  assert.deepEqual(d.range, { start: 4, end: 15 }, '"quick brown"');
  d.moveEdge('start', 0);
  assert.deepEqual(d.range, { start: 0, end: 15 });
  // Dragging the head past the tail is not an error; the edges just swap.
  d.moveEdge('start', 19);
  assert.deepEqual(d.range, { start: 15, end: 19 });
});

test('speaking into a selection replaces it, and the caret follows the words in', () => {
  const d = withText('the quick brown fox');
  d.select(4, 9);
  d.start();
  FakeSR.last.say([{ t: 'slow', final: true }]);
  assert.equal(d.text, 'the slow brown fox', 'the selection is what the words landed on');
  // The replacement KEEPS the selection, over the new words. It shows what
  // just happened in a paragraph that shifted, and it makes the repair a
  // loop: say it again and the second attempt replaces the first.
  assert.deepEqual(d.range, { start: 4, end: 8 }, 'the new words are what is selected now');
  assert.equal(d.text.slice(4, 8), 'slow');

  FakeSR.last.say([{ t: 'lazy', final: true }]);
  assert.equal(d.text, 'the lazy brown fox', 'so a second attempt replaces the first, not the fox');
  assert.deepEqual(d.range, { start: 4, end: 8 });

  // And a CARET insert still collapses after the words: there was no selection
  // to inherit, and carrying on is the only sensible next move.
  d.caretAt(3);
  FakeSR.last.say([{ t: 'very', final: true }]);
  assert.equal(d.text, 'the very lazy brown fox');
  assert.deepEqual(d.range, { start: 8, end: 8 });

  // And no period: the reader is repairing the middle of a sentence, so a
  // full stop bolted to a far end they are not looking at would be noise.
  assert.ok(!d.text.endsWith('.'));
  d.stop();
});

test('a caret mid-buffer is where the words go, and the pause record stands down', () => {
  const d = engine();
  d.start();
  clock.t = 1000; FakeSR.last.say([{ t: 'one', final: true }]);
  clock.t = 4000; FakeSR.last.say([{ t: 'tw', final: false }]);
  clock.t = 4100; FakeSR.last.say([{ t: 'two', final: true }]);
  assert.ok(d.segments.length, 'a record exists to lose');

  d.caretAt(3);                          // just after "one"
  assert.deepEqual(d.segments, [],
    'placing a caret mid-buffer drops the record rather than letting its offsets rot');
  FakeSR.last.say([{ t: 'and a half', final: true }]);
  assert.equal(d.text, 'one and a half. two.');
  assert.equal(d.paragraphs(1500), 'one and a half. two.', 'and paragraphs() declines, honestly');
  d.stop();
});

test('the pad becomes casing keys, and they act on the selection alone', () => {
  const d = withText('the quick brown fox');
  assert.equal(d.recase('upper'), false, 'nothing selected, nothing to case');
  d.select(4, 9);
  d.recase('upper');
  assert.equal(d.text, 'the QUICK brown fox');
  assert.deepEqual(d.range, { start: 4, end: 9 }, 'the selection survives, so it can be cased again');
  d.recase('lower');
  assert.equal(d.text, 'the quick brown fox');
  d.recase('title');
  assert.equal(d.text, 'the Quick brown fox');
});

test('delete takes the selection when there is one, and the word before a caret otherwise', () => {
  const d = withText('the quick brown fox');
  d.select(4, 10);                       // "quick "
  d.backWord();
  assert.equal(d.text, 'the brown fox');

  d.caretAt(9);                          // after "brown"
  d.backWord();
  assert.equal(d.text, 'the  fox', 'the word before the caret, not the last word of the buffer');
  assert.deepEqual(d.range, { start: 4, end: 4 });
});

test('a mark lands at the caret rather than at the far end', () => {
  const d = withText('one two');
  d.caretAt(3);
  d.punct(',');
  assert.equal(d.text, 'one, two');
  d.caretAt(0);
  d.punct('¶');
  assert.equal(d.text, '\n\none, two');
});

test('setting the text clears the range: the offsets described another buffer', () => {
  const d = withText('the quick brown fox');
  d.select(4, 9);
  d.text = 'something else entirely';
  assert.equal(d.range, null);
  assert.equal(d.hasSelection, false);
});

// ── The painter, and the half of the hit test that is arithmetic ──────────
// One painter for both surfaces, because two would diverge on the first edge
// case and the offsets are the kit's already. offsetAt is the pure half of
// the hit test: the surface calls caretRangeFromPoint (no layout engine here)
// and hands back a node, and everything after that is counting.

const host = () => window.document.createElement('div');
const parts = (h) => [...h.childNodes].map(n => [n.getAttribute('data-d'), n.textContent]);

test('the painter renders text, caret and selection as marked parts', () => {
  const h = host();
  D.paint(h, { text: 'the quick fox' });
  assert.deepEqual(parts(h), [['text', 'the quick fox']]);

  D.paint(h, { text: 'the quick fox', range: { start: 4, end: 4 } });
  assert.deepEqual(parts(h), [['text', 'the '], ['caret', ''], ['text', 'quick fox']]);

  // The handles come LAST and out of the flow: inline they were part of the
  // line, so arriving at a selection shoved the text sideways.
  D.paint(h, { text: 'the quick fox', range: { start: 4, end: 9 } });
  assert.deepEqual(parts(h),
    [['text', 'the '], ['sel', 'quick'], ['text', ' fox'], ['handle-start', ''], ['handle-end', '']]);
  const hs = h.querySelector('[data-edge="start"]');
  assert.match(hs.getAttribute('style'), /position:absolute/, 'so the text never moves for them');
});

test('handles and the caret carry no text, so they never shift an offset', () => {
  const h = host();
  D.paint(h, { text: 'the quick fox', range: { start: 4, end: 9 } });
  assert.equal([...h.childNodes].map(n => n.textContent).join(''), 'the quick fox',
    'the painted text is the buffer exactly, furniture and all');
});

test('the interim paints last and is marked, so a tap in it cannot place a caret', () => {
  const h = host();
  D.paint(h, { text: 'settled', interim: 'still being heard' });
  assert.deepEqual(parts(h), [['text', 'settled'], ['interim', ' still being heard']]);
  // A point inside the hypothesis clamps to the end of what is committed.
  assert.equal(D.offsetAt(h, h.childNodes[1].firstChild || h.childNodes[1], 4), 7);
});

test('offsetAt counts the parts before the one that was hit', () => {
  const h = host();
  D.paint(h, { text: 'the quick fox', range: { start: 4, end: 9 } });
  const [t0, sel, t1, hs, he] = h.childNodes;
  assert.equal(D.offsetAt(h, t0.firstChild, 2), 2, 'inside the head');
  assert.equal(D.offsetAt(h, sel.firstChild, 3), 7, 'inside the selection, past the head');
  assert.equal(D.offsetAt(h, t1.firstChild, 1), 10, 'inside the tail, past both');
  // A handle is a target for arming, not a place: it reports its own edge,
  // and it is answered BEFORE the walk, since out of the flow it now sits
  // after the interim's early return.
  assert.equal(D.offsetAt(h, hs, 0), 4);
  assert.equal(D.offsetAt(h, he, 0), 9);
  // A node nested inside a part still resolves, since the walk climbs to the
  // part first: that is what a browser hands back on a wrapped render.
  assert.equal(D.offsetAt(h, sel, 0), 4);

  D.paint(h, { text: 'the quick fox', interim: 'and more', range: { start: 4, end: 9 } });
  assert.equal(D.offsetAt(h, h.querySelector('[data-edge="end"]'), 0), 9,
    'still its own edge with a hypothesis painted between it and the text');
});

test('the suppression CSS is handed out rather than written down twice', () => {
  assert.match(D.SUPPRESS, /user-select:\s*none/);
  assert.match(D.SUPPRESS, /-webkit-touch-callout:\s*none/,
    'the iOS callout is the whole reason this exists');
});

test('the arrows step the armed edge and never let it cross the other', () => {
  const d = withText('the quick brown fox');
  d.select(4, 9);                        // "quick"
  d.nudge('end', 1);
  assert.deepEqual(d.range, { start: 4, end: 10 });
  d.nudge('start', -1);
  assert.deepEqual(d.range, { start: 3, end: 10 });

  // Run the head at the tail: it stops one character short rather than
  // crossing. Crossing would have setRange sort the result, and then "start"
  // would name the RIGHT edge and the next arrow would run backwards.
  for (let i = 0; i < 20; i++) d.nudge('start', 1);
  assert.deepEqual(d.range, { start: 9, end: 10 }, 'one character wide, still a selection');
  assert.equal(d.hasSelection, true);

  for (let i = 0; i < 20; i++) d.nudge('end', -1);
  assert.deepEqual(d.range, { start: 9, end: 10 }, 'and the tail is held off the head too');

  // And the buffer's own ends hold.
  d.select(0, 4);
  d.nudge('start', -5);
  assert.equal(d.range.start, 0);
  d.select(15, 19);
  d.nudge('end', 5);
  assert.equal(d.range.end, 19);
});

test('a handle is a stem with a ball, not a loose dot', () => {
  const h = host();
  D.paint(h, { text: 'the quick fox', range: { start: 4, end: 9 }, armed: 'start' });
  const start = h.querySelector('[data-edge="start"]');
  assert.equal(start.childNodes.length, 2, 'the stem and the ball');
  const [bar, dot] = start.childNodes;
  assert.match(dot.getAttribute('style'), /border-radius:50%/);
  // Armed is an INSET ring at the same diameter, not a halo around a bigger
  // ball: a marker sitting in the text must not grow to say it is active.
  assert.match(dot.getAttribute('style'), /box-shadow:inset/, 'armed, so it is ringed');
  assert.match(dot.getAttribute('style'), /width:13px/);
  const other = h.querySelector('[data-edge="end"]').childNodes[1];
  assert.match(other.getAttribute('style'), /width:13px/, 'and the unarmed one is the same size');
  assert.ok(!/border-radius:50%/.test(bar.getAttribute('style')), 'the stem is a bar');
  // Neither is a tap target of its own: the box around them is, so the whole
  // handle is one 32px-wide thing to hit rather than two small ones.
  assert.match(bar.getAttribute('style'), /pointer-events:none/);
  assert.match(dot.getAttribute('style'), /pointer-events:none/);

  assert.ok(!/box-shadow/.test(other.getAttribute('style')), 'the other edge is not armed');

  // The arrows ride the armed pin, and their chevrons are drawn rather than
  // typed: a glyph arrives at whatever weight the system font has.
  const arrows = [...h.querySelectorAll('[data-nudge]')];
  assert.deepEqual(arrows.map(b => b.getAttribute('data-nudge')), ['-1', '1']);
  assert.match(arrows[0].innerHTML, /stroke-width="1.5"/);
  assert.ok(!/font-weight:\s*700/.test(arrows[0].getAttribute('style')));
});
