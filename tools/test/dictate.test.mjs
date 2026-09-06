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

test('a phrase spoken into a mid-buffer caret is separated on BOTH sides', () => {
  // The join was one-sided for as long as speaking meant appending: at the end
  // there is nothing to run into. Once a caret could be placed, the phrase
  // glued itself to the word after it. Reported from the stitch work, 2026-08-15.
  const d = withText('I paused here then carried on');
  d.caretAt(14);                          // between "here " and "then"
  d.insert('and kept going');
  assert.equal(d.text, 'I paused here and kept going then carried on');
  assert.deepEqual(d.range, { start: 29, end: 29 },
    'and the caret lands past the separator, so the next phrase adds no second one');
  d.insert('quite a way');
  assert.equal(d.text, 'I paused here and kept going quite a way then carried on');

  // Punctuation clings leftward, so it takes no separator of its own.
  const p = withText('one. two.');
  p.caretAt(3);
  p.insert('and a half');
  assert.equal(p.text, 'one and a half. two.');

  // Replacing a selection is usually already spaced on that side.
  const s = withText('the quick brown fox');
  s.select(4, 9);
  s.insert('slow');
  assert.equal(s.text, 'the slow brown fox');
});

// ── The stitch ──────────────────────────────────────────────────────────────
// The correction a pause period costs most often: the reader stopped to think,
// the engine read the silence as an ending, and the sentence came back broken
// in two with a capital in the middle of it. A caret in the gap is the whole
// gesture.

test('a caret in the gap joins the sentence and brings the capital down', () => {
  const d = withText('so I went to the store. and then I came back');
  d.caretAt(23);                          // the space after the full stop
  assert.equal(d.canStitch, true);
  assert.equal(d.stitch(), true);
  assert.equal(d.text, 'so I went to the store and then I came back');
  assert.deepEqual(d.range, { start: 23, end: 23 }, 'the caret stays at the seam it closed');

  const e = withText('so I went to the store. And then I came back');
  e.caretAt(23);
  e.stitch();
  assert.equal(e.text, 'so I went to the store and then I came back',
    'the capital the engine wrote after the pause comes down with the mark');
});

test('the whole gap is one target, since a thumb cannot aim at one offset', () => {
  // Before the mark, after it, inside the whitespace, and on the first letter
  // of the next word all mean the same thing to the reader.
  for (const at of [22, 23, 24]) {
    const d = withText('so I went to the store. And then I came back');
    d.caretAt(at);
    assert.equal(d.canStitch, true, 'offset ' + at + ' is in the gap');
    d.stitch();
    assert.equal(d.text, 'so I went to the store and then I came back');
  }
  const wide = withText('one sentence.   Two sentences');
  wide.caretAt(15);                       // in the middle of a three-space gap
  wide.stitch();
  assert.equal(wide.text, 'one sentence two sentences',
    'whatever the gap held, the join is one space');
});

test('the stitch declines where there is no sentence break anywhere', () => {
  // Narrowed on 2026-09-06 to what STILL declines. A caret away from the seam
  // and a buffer ending in a pause period both used to be refusals; both are
  // now readings of their own, covered in "reaching back" below.
  const tight = withText('nasa.gov is a site');
  tight.caretAt(5);
  assert.equal(tight.canStitch, false, 'no gap means the join is already tight');
  assert.equal(tight.stitch(), false);

  const bare = withText('. A stray mark');
  bare.caretAt(1);
  assert.equal(bare.canStitch, false, 'a mark with no sentence in front of it is not an ending');
  assert.equal(bare.stitch(), false);

  const none = withText('nothing to undo here');
  assert.equal(none.canStitch, false);
  assert.equal(none.stitch(), false);
});

// ── Walking back through the breaks ─────────────────────────────────────────
// The stitch reached backwards by itself for a few hours on 2026-09-06 and no
// ordering of its targets could be right: during dictation the buffer almost
// always ends in a full stop the pause just wrote, so "the most recent break"
// is that one, and whether the reader wants it gone or wants to keep it and
// repair an earlier one is a fact about what they are about to say, not one the
// buffer holds. So the reach became its own key, which changes nothing and
// shows the target.

test('with no caret placed the stitch takes the newest break', () => {
  const d = withText('one thing. Two things. Three things happened');
  assert.equal(d.range, null, 'the resting state, which is where dictation leaves it');
  assert.equal(d.stitchAim, 'back');
  assert.equal(d.stitch(), true);
  assert.equal(d.text, 'one thing. Two things three things happened');
  assert.equal(d.range, null, 'and the caret is not moved, since none was placed');
});

test('a trailing full stop is not a break, because the backspace already takes it', () => {
  // The stitch answered for one for a single commit, and that reading is what
  // made its target ambiguous: during dictation the buffer almost always ends
  // in the mark the pause just wrote, so the trailing case shadowed every older
  // one. A break needs words after it.
  const one = withText('so I went to the store.');
  assert.equal(one.stitchAim, '', 'nothing follows the mark, so nothing to join');
  assert.equal(one.stitch(), false);

  // And the backspace does the job, continuation included, which is what makes
  // dropping the reading free rather than a loss.
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'so I went to the store', final: true }]);
  assert.equal(d.text, 'so I went to the store.');
  d.backWord();
  assert.equal(d.text, 'so I went to the store');
  FakeSR.last.say([{ t: 'And then I came back', final: true }]);
  assert.equal(d.text, 'so I went to the store and then I came back.',
    'the capital comes down, so the sentence really did run on');
  d.stop();
});

test('jumping back walks to the previous break, and again walks past it', () => {
  const d = withText('one thing. Two things. Three things happened');
  assert.equal(d.canJumpBack, true);
  assert.equal(d.jumpBack(), true);
  assert.deepEqual(d.range, { start: 23, end: 23 }, 'on the front of "Three"');
  assert.equal(d.stitchAim, 'caret', 'and the stitch is now aimed');

  d.jumpBack();
  assert.deepEqual(d.range, { start: 11, end: 11 }, 'on the front of "Two"');
  assert.equal(d.canJumpBack, false, 'and there is nothing older to reach');
});

test('the walk changes nothing until the stitch is tapped', () => {
  const d = withText('one thing. Two things. Three things happened');
  // The setter itself records one step, so the claim is that the two jumps add
  // none: one undo has to reach past them to the buffer being set.
  d.jumpBack(); d.jumpBack();
  assert.equal(d.text, 'one thing. Two things. Three things happened');
  d.undo();
  assert.equal(d.text, '', 'one undo reaches the empty buffer, so no jump left a step of its own');
  assert.equal(d.canUndo, false);
});

test('a jumped caret is handed back to the end, so dictation keeps appending', () => {
  const d = withText('one thing. Two things. Three things happened');
  d.jumpBack();
  d.stitch();
  assert.equal(d.text, 'one thing. Two things three things happened');
  assert.equal(d.range, null,
    'the caret was on loan for the repair; leaving it mid-buffer would land the next sentence inside this one');

  d.start();
  FakeSR.last.say([{ t: 'and more', final: true }]);
  assert.match(d.text, /three things happened and more\.$/, 'the words land at the end');
  d.stop();
});

test('a caret the reader placed is theirs, and stays on the join', () => {
  const d = withText('one thing. Two things. Three things happened');
  d.caretAt(23);                          // the same seam, placed by hand
  d.stitch();
  assert.equal(d.text, 'one thing. Two things three things happened');
  assert.deepEqual(d.range, { start: 22, end: 22 }, 'the caret stays where the work is');
});

test('placing a caret elsewhere ends the loan', () => {
  const d = withText('one thing. Two things. Three things happened');
  d.jumpBack();                           // borrowed
  d.caretAt(11);                          // and handed back by the reader's own move
  d.stitch();
  assert.equal(d.text, 'one thing two things. Three things happened');
  assert.deepEqual(d.range, { start: 10, end: 10 }, 'so this caret stays put');
});

test('the trailing full stop survives, because the stitch never wanted it', () => {
  // The case that sent the first reach back to the drawing board: with a full
  // stop ending the buffer, one tap used to take THAT back, which is wrong
  // whenever the reader meant to keep it and repair the break before it.
  const d = withText('one thing. Two things.');
  assert.equal(d.stitchAim, 'back');
  d.stitch();
  assert.equal(d.text, 'one thing two things.', 'the older break went, the trailing mark stayed');

  // And the walk reaches the same one, for a reader who wants to see it first.
  const e = withText('one thing. Two things.');
  e.jumpBack();
  assert.equal(e.stitchAim, 'caret');
  e.stitch();
  assert.equal(e.text, 'one thing two things.');
});

test('jumping declines with nothing behind, and with a selection live', () => {
  assert.equal(withText('no breaks at all').canJumpBack, false);
  assert.equal(withText('no breaks at all').jumpBack(), false);

  const one = withText('one thing. Two things');
  one.jumpBack();
  assert.equal(one.canJumpBack, false, 'the only break is the one we are on');

  const sel = withText('one thing. Two things');
  sel.select(0, 3);
  assert.equal(sel.canJumpBack, false, 'a selection means the reader is aiming at a word');
  assert.equal(sel.jumpBack(), false);
});

test('a live selection is not a stitch: the pad is showing casing keys then', () => {
  const d = withText('so I went to the store. And then I came back');
  d.select(24, 27);                       // "And"
  assert.equal(d.canStitch, false);
  assert.equal(d.stitch(), false);
  assert.equal(d.text, 'so I went to the store. And then I came back');
});

test('the stitch is one undo step, and it un-ends the sentence for what comes next', () => {
  const d = withText('I paused here. Then carried on');
  d.caretAt(14);
  d.stitch();
  assert.equal(d.text, 'I paused here then carried on');
  assert.equal(d.canUndo, true);
  d.undo();
  assert.equal(d.text, 'I paused here. Then carried on', 'one tap puts the break back');

  const e = withText('I paused here. Then carried on');
  e.caretAt(14);
  e.stitch();
  e.start();
  FakeSR.last.say([{ t: 'And kept going', final: true }]);
  assert.match(e.text, /and kept going/,
    'the sentence is running again, so the next utterance is a continuation');
  assert.doesNotMatch(e.text, /And kept going/);
});

test('a word that is not a plain capital keeps its case, the way normalize() leaves it', () => {
  const acronym = withText('we filed it. NASA had the rest');
  acronym.caretAt(13);
  acronym.stitch();
  assert.equal(acronym.text, 'we filed it NASA had the rest');

  const me = withText('she asked. I said yes');
  me.caretAt(10);
  me.stitch();
  assert.equal(me.text, 'she asked I said yes');
});

test('a paragraph break is a gap too, so the caret closes it the same way', () => {
  const d = withText('first thought.\n\nSecond thought');
  d.caretAt(14);
  assert.equal(d.canStitch, true);
  d.stitch();
  assert.equal(d.text, 'first thought second thought');
});

// ── Un-ending, and the capital ──────────────────────────────────────────────
// The stitch one keystroke earlier: the pause has written its full stop and
// the reader has not said the next words yet, so there is no seam to find.

test('un-ending takes back the pause\'s full stop and the sentence runs on', () => {
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'so I went to the store', final: true }]);
  assert.equal(d.text, 'so I went to the store.');
  assert.equal(d.canUnend, true);
  // Still its own verb, and still what the desk's Control tap calls. The pad
  // reaches it through the backspace instead, which does the same thing on a
  // buffer ending in a mark; the stitch deliberately does not, since answering
  // for a trailing mark is what made its target ambiguous.
  assert.equal(d.canStitch, false, 'nothing follows the mark, so there is no break');
  assert.equal(d.unend(), true);
  assert.equal(d.text, 'so I went to the store');

  FakeSR.last.say([{ t: 'And then I came back', final: true }]);
  assert.equal(d.text, 'so I went to the store and then I came back.',
    'the capital comes down, the way it does after a stitch');
  d.stop();
});

test('un-ending declines where there is nothing to take back', () => {
  assert.equal(withText('no mark here').canUnend, false);
  assert.equal(withText('no mark here').unend(), false);
  assert.equal(withText('a comma, then').canUnend, false,
    'only the full stop is the pause\'s guess; a comma was meant');

  const mid = withText('one. two.');
  mid.caretAt(4);
  assert.equal(mid.canUnend, false, 'the caret is not at the end, so this is stitch territory');

  const sel = withText('one two.');
  sel.select(0, 3);
  assert.equal(sel.canUnend, false, 'a live selection means the reader is aiming at a word');
});

test('un-ending is one undo step', () => {
  const d = withText('done.');
  d.unend();
  assert.equal(d.text, 'done');
  d.undo();
  assert.equal(d.text, 'done.');
});

test('an armed capital rides every revision of the interim and is spent once', () => {
  const seen = [];
  const d = engine({ onInterim: (t) => seen.push(t) });
  d.start();
  d.armCapital();
  assert.equal(d.capitalArmed, true);

  FakeSR.last.say([{ t: 'dexie' }]);
  FakeSR.last.say([{ t: 'dexie is' }]);
  assert.deepEqual(seen.slice(-2), ['Dexie', 'Dexie is'],
    'the capital holds across revisions rather than flickering off');

  FakeSR.last.say([{ t: 'dexie is the store', final: true }]);
  assert.equal(d.text, 'Dexie is the store.');
  assert.equal(d.capitalArmed, false, 'one shot: the segment that landed spent it');

  FakeSR.last.say([{ t: 'and it works', final: true }]);
  assert.equal(d.text, 'Dexie is the store. and it works.',
    'the next segment is left alone');
  d.stop();
});

test('an armed capital beats the continuation rule, which would have lowered it', () => {
  // A comma left at the end is what a continuation IS here, and backWord is
  // the shortest honest way into that state: it reads the flag off the buffer.
  const d = withText('we shipped it, so');
  d.backWord();
  d.start();
  FakeSR.last.say([{ t: 'Dexie held the rest', final: true }]);
  assert.match(d.text, /it, dexie held/, 'a continuation lowers a plain capital');
  d.stop();

  const e = withText('we shipped it, so');
  e.backWord();
  e.start();
  e.armCapital();
  FakeSR.last.say([{ t: 'Dexie held the rest', final: true }]);
  assert.match(e.text, /it, Dexie held/, 'unless the reader asked for the capital');
  e.stop();
});

test('stopping drops an arming whose word is not coming', () => {
  const d = engine();
  d.start();
  d.armCapital();
  d.stop();
  assert.equal(d.capitalArmed, false);
  assert.equal(d.armCapital(false), false, 'and it can be disarmed by hand');
});

test('delete takes the selection when there is one, and the word before a caret otherwise', () => {
  const d = withText('the quick brown fox');
  d.select(4, 10);                       // "quick "
  d.backWord();
  assert.equal(d.text, 'the brown fox');

  d.caretAt(9);                          // after "brown"
  d.backWord();
  assert.equal(d.text, 'the fox', 'the word before the caret, not the last word of the buffer');
  assert.deepEqual(d.range, { start: 3, end: 3 },
    'and the space that separated it goes with it, rather than doubling up at the seam');
});

test('a space behind the caret is its own step, except at the very end', () => {
  // The key was taking a space AND the word before it in one tap, which is
  // one tap doing two things and left a seam behind either way: mid-buffer it
  // produced a double space (reported 2026-08-14). A reader whose caret sits
  // after a space is most often trimming, and trimming is cheap to repeat.
  const d = withText('the quick brown fox');
  d.caretAt(10);                         // between the space and "brown"
  d.backWord();
  assert.equal(d.text, 'the quickbrown fox', 'the space, and only the space');
  assert.deepEqual(d.range, { start: 9, end: 9 });
  d.backWord();
  assert.equal(d.text, 'the brown fox', 'the next tap takes the word');

  const e = withText('one two three');
  e.caretAt(7);                          // after "two", the tail a space away
  e.backWord();
  assert.equal(e.text, 'one three', 'one space at the seam, not two and not none');

  // A tail that does NOT start with whitespace keeps the space in front of the
  // deleted word, or the two words either side of the caret would be glued.
  const g = withText('one twothree');
  g.caretAt(7);
  g.backWord();
  assert.equal(g.text, 'one three');

  // AT THE END the space is absorbed, because a mark writes its own trailing
  // one and a tap that removed only that would look like a dead key.
  const f = withText('a note. ');
  f.backWord();
  assert.equal(f.text, 'a note', 'the invisible space and the mark, in one visible step');
  f.backWord();
  assert.equal(f.text, 'a', 'then the word, with its separating space');
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

// `reach` puts the ARMED ball on a stalk so a thumb dragging it clears the
// text. Two things have to hold, and jsdom can check both from the style
// strings even with no layout: only the armed pin reaches, and the option is
// off unless asked for, since the composer and the stage share this painter
// and neither wants it.
test('reach extends the armed pin only, and only when asked for', () => {
  const h = host();
  const stem = (el) => el.firstElementChild.getAttribute('style');
  const ball = (el) => el.lastElementChild.getAttribute('style');
  const pins = () => ({
    start: h.querySelector('[data-edge="start"]'),
    end: h.querySelector('[data-edge="end"]'),
  });

  D.paint(h, { text: 'the quick fox', range: { start: 4, end: 9 }, armed: 'end' });
  const plain = pins();
  assert.match(stem(plain.end), /height:0px/, 'no reach by default, so the stem is the line');
  assert.match(ball(plain.end), /translateY\(0px\)/, 'and the ball sits on it');
  assert.doesNotMatch(ball(plain.end), /transition/, 'with nothing to animate');

  D.paint(h, { text: 'the quick fox', range: { start: 4, end: 9 }, armed: 'end', reach: 18 });
  const out = pins();
  assert.match(stem(out.end), /height:18px/, 'the armed stem carries the reach');
  assert.match(ball(out.end), /translateY\(18px\)/, 'and the ball rides out to the end of it');
  assert.match(stem(out.start), /height:0px/, 'the unarmed pin does not reach');
  assert.match(ball(out.start), /translateY\(0px\)/, 'nor does its ball move');

  // The mark itself must not move: the stem still starts on the line, so what
  // the pin POINTS at is the same and only where you hold it changed.
  assert.match(stem(out.end), /top:17px/, 'the stem still begins on the line');
  assert.match(out.end.getAttribute('style'), /height:52px/, 'the hit box grew with it');

  // THE REACH IS A TRANSFORM SO IT CAN BE ANIMATED, and position is not, so a
  // drag is not made to trail the finger by the same transition.
  assert.match(ball(out.end), /transition:transform/, 'the ball eases out');
  assert.doesNotMatch(out.end.getAttribute('style'), /transition/, 'the hit box does not');
});

// SEVERAL HYPOTHESES IN ONE EVENT need a separator putting back. normalize()
// trims each segment on the way in, because the join belongs in one place and
// that place is spliceIn: engines disagree about whether a continuation carries
// a leading space. But the interim accumulator concatenated them raw, so the
// trim it had just done was what glued them, and the reader watched a word
// arrive stuck to the one before it and then separate when it finalized.
test('interim segments arriving together are joined, not concatenated', () => {
  const seen = [];
  const d = engine({ onInterim: (t) => seen.push(t) });
  d.start();
  FakeSR.last.say([{ t: 'the point of' }, { t: ' this page' }]);
  assert.equal(seen.at(-1), 'the point of this page');
  d.stop();
});

// The pins are KEPT across paints, because a rebuilt element has no previous
// value to transition from. Identity is the gate: a caller may have attached a
// listener to the node, and the reach cannot ease out of a node that is new.
test('a pin survives a repaint, and goes when it is no longer drawn', () => {
  // AN OVERLAY IS THE PRECONDITION, and it is not a detail: paint() clears the
  // host to redraw the text, so a pin living in the host cannot survive by
  // construction. Only a caller that hands over a separate overlay gets kept
  // nodes, which is the same caller that wanted the pins unclipped.
  const h = host();
  const overlay = h.ownerDocument.createElement('div');
  const draw = (o) => D.paint(h, { text: 'the quick fox', overlay, ...o });

  draw({ range: { start: 4, end: 9 } });
  const was = overlay.querySelector('[data-edge="start"]');
  was.__mark = 1;
  draw({ range: { start: 4, end: 9 }, armed: 'start', reach: 18 });
  assert.equal(overlay.querySelector('[data-edge="start"]').__mark, 1,
    'the same node was restyled, so the reach has something to ease out of');

  draw({ range: { start: 4, end: 4 } });
  assert.equal(overlay.querySelector('[data-edge]'), null,
    'a collapsed range leaves no pins behind');
  draw({ range: { start: 4, end: 9 }, handles: false });
  assert.equal(overlay.querySelector('[data-edge]'), null,
    'nor does turning them off for a mouse');
});

test('the caret is a plain inline, so it cannot break the word it sits inside', () => {
  // A caret between two characters splits the word into two spans, and an
  // ATOMIC inline (inline-block, which this was) is a line-break opportunity
  // on both sides: a word at the wrap point broke where the caret was, so
  // "extraordinarily" became "extra" and "ordinarily" on two lines the moment
  // a caret landed in it. A non-atomic inline is not a break opportunity, and
  // a border on an empty one draws the same 2px bar at the font's own content
  // height, which also drops the 1.05em-plus-vertical-align guess it used.
  //
  // The wrap itself needs a line box, so it is swept in a real browser by
  // tools/render/scenarios/annotate-caret-wrap.mjs (560 caret positions, 82
  // of them breaking before this, 0 after). What is held here is the property
  // that makes it true.
  const h = host();
  D.paint(h, { text: 'extraordinarily', range: { start: 5, end: 5 } });
  const css = h.querySelector('[data-d="caret"]').getAttribute('style');
  assert.match(css, /display:\s*inline\s*;/, 'inline, and not inline-block');
  assert.doesNotMatch(css, /inline-block/);
  assert.match(css, /border-left:\s*2px/, 'the bar is a border, since an empty inline has no width');
});

test('handles and the caret carry no text, so they never shift an offset', () => {
  const h = host();
  D.paint(h, { text: 'the quick fox', range: { start: 4, end: 9 } });
  assert.equal([...h.childNodes].map(n => n.textContent).join(''), 'the quick fox',
    'the painted text is the buffer exactly, furniture and all');
});

test('the interim paints at the insertion point, not at the end of the buffer', () => {
  // It used to append after everything, which is right only when the caret is
  // already there. Place a caret mid-buffer and speak, and the words appeared
  // at the bottom and then jumped up when the segment finalized: the right
  // answer, arrived at in a way that looks broken, which costs the reader
  // their trust in the caret they just placed.
  const h = host();
  D.paint(h, { text: 'the quick fox', interim: 'brown', range: { start: 4, end: 4 } });
  assert.deepEqual(parts(h),
    [['text', 'the '], ['interim', 'brown'], ['interim-stop', '.'], ['caret', ''], ['text', 'quick fox']],
    'head, hypothesis, caret, tail: exactly where the committed words will land');

  // No leading space here, because the head already ends in one. The space is
  // cosmetic and follows the text before the insertion point rather than the
  // buffer as a whole.
  D.paint(h, { text: 'the quick fox', interim: 'brown', range: { start: 3, end: 3 } });
  assert.equal(h.childNodes[1].textContent, ' brown', 'and it appears when the head ends in a letter');

  // A selection is what speaking replaces, so the hypothesis paints where the
  // replacement will sit.
  D.paint(h, { text: 'the quick fox', interim: 'lazy', range: { start: 4, end: 9 } });
  assert.deepEqual(parts(h).map(p => p[0]).filter(k => !k.startsWith('handle')),
    ['text', 'sel', 'interim', 'interim-stop', 'text']);

  // Offsets are the point of the marking: the hypothesis is not in the buffer,
  // so it must shift nothing after it. Returning on sight was right while it
  // was always last; now it would report the caret's offset for every tap in
  // the tail below it.
  D.paint(h, { text: 'the quick fox', interim: 'brown', range: { start: 4, end: 4 } });
  const tail = h.childNodes[4];
  assert.equal(D.offsetAt(h, tail.firstChild, 2), 6, 'a tap in the tail counts committed text only');
  assert.equal(D.offsetAt(h, h.childNodes[1].firstChild, 3), 4,
    'and a tap inside the hypothesis clamps to where it will land');
});

test('the interim paints last with no caret, and is marked so a tap cannot land in it', () => {
  const h = host();
  D.paint(h, { text: 'settled', interim: 'still being heard' });
  // A TENTATIVE full stop rides the hypothesis, in the hypothesis's own muted
  // italic. The real one is written when the segment finalizes, which is after
  // the pause, so without this the sentence trails off unpunctuated and the
  // period looks like it arrives late.
  assert.deepEqual(parts(h),
    [['text', 'settled'], ['interim', ' still being heard'], ['interim-stop', '.']]);
  // It is a PAINT, not a commit: nothing was added to the buffer.
  D.paint(h, { text: 'settled', interim: 'a question mark?' });
  assert.deepEqual(parts(h).map(p => p[0]), ['text', 'interim'],
    'and it stands down when the hypothesis already ends in a mark');
  D.paint(h, { text: 'settled', interim: 'still being heard' });
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
  const cluster = h.querySelector('[data-d="nudge"]');
  assert.deepEqual([...cluster.children].map(b =>
    b.getAttribute('data-nudge') || 'confirm:' + b.getAttribute('data-disarm')),
    ['-1', 'confirm:1', '1'], 'confirm sits between the arrows, where the thumb already is');
  assert.match(cluster.children[0].innerHTML, /stroke-width="1.5"/);
  assert.ok(!/font-weight:\s*700/.test(cluster.children[0].getAttribute('style')));
});

// ── hitsText: the other half of the hit test, and the one caret-from-point
// cannot answer ───────────────────────────────────────────────────────────
// A browser's caret-from-point returns the NEAREST position, so it reports a
// hit for a tap an inch below the last line. Only the painted parts' own
// rects say whether the point was on text at all. jsdom has no layout, so the
// rects are supplied here; what is under test is which parts are asked and
// how the box is compared, not the geometry engine.

const rect = (n, box) => { n.getClientRects = () => (box ? [box] : []); };
const BOX = { left: 10, right: 90, top: 10, bottom: 30 };

test('a point on the text hits, a point on the blank canvas does not', () => {
  const h = host();
  D.paint(h, { text: 'the quick fox' });
  rect(h.childNodes[0], BOX);
  assert.equal(D.hitsText(h, 50, 20), true, 'inside');
  assert.equal(D.hitsText(h, 50, 80), false, 'below the last line, where a caret-from-point would still answer');
  assert.equal(D.hitsText(h, 200, 20), false, 'off the right end of the line');
  assert.equal(D.hitsText(h, 10, 10), true, 'the edge counts, since a rect is inclusive of it');
});

test('the selection and the hypothesis are text; the furniture is not', () => {
  const h = host();
  D.paint(h, { text: 'the quick fox', interim: 'and more', range: { start: 4, end: 9 } });
  const by = {};
  for (const n of h.childNodes) by[n.getAttribute('data-d')] = n;
  for (const k of Object.keys(by)) rect(by[k], null);

  rect(by.sel, BOX);
  assert.equal(D.hitsText(h, 50, 20), true, 'a tap on the selection is a tap on text');
  rect(by.sel, null);

  rect(by.interim, BOX);
  assert.equal(D.hitsText(h, 50, 20), true, 'so is one on the hypothesis');
  rect(by.interim, null);

  rect(by['interim-stop'], BOX);
  assert.equal(D.hitsText(h, 50, 20), true, 'and on its tentative full stop');
  rect(by['interim-stop'], null);

  // A handle is furniture. It never reaches here (the layer's own delegated
  // listener takes the tap first), but if it did, arming is not placing.
  rect(by['handle-start'], BOX);
  assert.equal(D.hitsText(h, 50, 20), false, 'a pin is not text');
});

test('an empty buffer is all canvas, so every tap in it means the end', () => {
  const h = host();
  D.paint(h, { text: '' });
  assert.equal(D.hitsText(h, 50, 20), false);
  assert.equal(D.hitsText(null, 50, 20), false, 'and a surface that has not painted yet does not throw');
});

test('the caret at the end IS the append state, which is what a canvas tap asks for', () => {
  const d = withText('the quick fox');
  d.select(4, 9);
  assert.equal(d.hasSelection, true);
  d.caretAt(d.text.length);
  assert.equal(d.range, null, 'no range, so the next words go on the end');
  assert.equal(d.hasSelection, false);
  assert.equal(d.text, 'the quick fox', 'and nothing was written to get there');
});

test('the newest line is scrolled into view as the buffer grows', () => {
  // A dictation surface fills from the top and keeps going, so without this
  // the box shows the opening sentence while the reader is four sentences on.
  // jsdom reports no layout, so the box is a stub: what is under test is WHEN
  // the painter reaches for it, which is the whole of the logic.
  const h = host();
  const box = { scrollHeight: 400, clientHeight: 100, scrollTop: 0,
                appendChild() {}, childNodes: [] };
  Object.defineProperty(h, 'parentNode', { value: box });

  D.paint(h, { text: 'one' });
  assert.equal(box.scrollTop, 400, 'the first words scroll it down');

  box.scrollTop = 0;
  D.paint(h, { text: 'one' });
  assert.equal(box.scrollTop, 0,
    'a repaint with no new text leaves it alone, or the box could never be scrolled up');

  D.paint(h, { text: 'one two' });
  assert.equal(box.scrollTop, 400, 'growth brings it back');

  box.scrollTop = 0;
  D.paint(h, { text: 'one two three', range: { start: 0, end: 3 } });
  assert.equal(box.scrollTop, 0,
    'a live selection holds it: the interesting text is where the reader put it');
});

test('a box with nothing to scroll is left alone', () => {
  const h = host();
  const box = { scrollHeight: 40, clientHeight: 100, scrollTop: 0,
                appendChild() {}, childNodes: [] };
  Object.defineProperty(h, 'parentNode', { value: box });
  D.paint(h, { text: 'short' });
  assert.equal(box.scrollTop, 0);
});

test('the leading between two lines is text, not a gap to fall through', () => {
  // An inline span's client rects are the FONT box, not the line box, so at
  // 17px text on 26px lines there is 6px of dead band between every pair of
  // lines. A tap there used to read as a miss and send the caret to the end.
  const h = host();
  h.setAttribute('style', 'line-height:26px;');
  D.paint(h, { text: 'two lines of it' });
  const part = h.childNodes[0];
  // Two font boxes 20px tall on 26px lines: 100-120 and 126-146, with the
  // dead band at 120-126.
  part.getClientRects = () => [
    { left: 10, right: 90, top: 100, bottom: 120, height: 20 },
    { left: 10, right: 60, top: 126, bottom: 146, height: 20 },
  ];
  assert.equal(D.hitsText(h, 50, 110), true, 'on the first line');
  assert.equal(D.hitsText(h, 50, 123), true, 'in the leading between them');
  assert.equal(D.hitsText(h, 50, 136), true, 'on the second line');
  assert.equal(D.hitsText(h, 50, 160), false, 'below the last line is still canvas');
  assert.equal(D.hitsText(h, 50, 86), false, 'and above the first is too');
  assert.equal(D.hitsText(h, 75, 136), false,
    'the inflation is vertical only: past the end of a short line is canvas');
});

test('a pin whose line is scrolled out of view is not painted, nor its arrows', () => {
  // The layer is outside the scroll box and does not clip, which is what lets
  // a ball hang in the whitespace above the first line. The cost is that an
  // edge scrolled far out of view lands its pin over the toolbar, pointing at
  // nothing, and select-all on a buffer taller than the box makes that the
  // normal case rather than the odd one. The test is the LINE against the box.
  //
  // The rects are supplied on the prototype rather than on one node, because
  // the painter builds the selection span and measures it inside the same
  // call: a stub attached after the fact is wiped by the next paint.
  const h = host();
  const box = { getBoundingClientRect: () => ({ top: 100, bottom: 200, left: 0, right: 300 }),
                scrollHeight: 0, clientHeight: 0 };
  Object.defineProperty(h, 'parentNode', { value: box });
  const layer = host();
  layer.getBoundingClientRect = () => ({ left: 0, top: 0 });

  const line = (top) => ({ left: 10, right: 90, top, bottom: top + 20, height: 20 });
  const El = window.Element.prototype;
  const real = El.getClientRects;
  const run = (rects, armed) => {
    El.getClientRects = function () {
      return this.getAttribute && this.getAttribute('data-d') === 'sel' ? rects : [];
    };
    try {
      D.paint(h, { text: 'the quick fox', range: { start: 4, end: 9 }, armed, overlay: layer });
    } finally { El.getClientRects = real; }
    return {
      pins: [...layer.querySelectorAll('[data-edge]')].map(n => n.getAttribute('data-edge')),
      arrows: !!layer.querySelector('[data-d="nudge"]'),
    };
  };

  assert.deepEqual(run([line(120)]).pins, ['start', 'end'],
    'a selection inside the box shows both edges');

  // Two lines: the first above the box (scrolled out), the last inside it.
  const split = run([line(20), line(120)], 'start');
  assert.deepEqual(split.pins, ['end'], 'the pin on the out-of-view line is dropped');
  assert.equal(split.arrows, false,
    'and its arrows with it: they would step a boundary the reader cannot see');

  const other = run([line(120), line(400)], 'start');
  assert.deepEqual(other.pins, ['start'], 'it cuts the other way too, below the box');
  assert.equal(other.arrows, true, 'the armed edge is in view, so its arrows are');
});

test('the caret pulses, which needs a stylesheet rather than a style attribute', () => {
  // A keyframe cannot be written into a style attribute, and the kit paints
  // into arbitrary documents, so the rule is injected once into whichever
  // document the surface lives in. Reduced motion gets a steady bar: the
  // caret's job is to say WHERE, and the pulse only says it is live.
  const doc = window.document;
  const old = doc.getElementById('dictate-style');
  if (old) old.remove();

  const h = host();
  D.paint(h, { text: 'the quick fox' });
  assert.equal(doc.getElementById('dictate-style'), null,
    'nothing is injected until a caret is actually painted');

  D.paint(h, { text: 'the quick fox', range: { start: 4, end: 4 } });
  const st = doc.getElementById('dictate-style');
  assert.ok(st, 'the caret brought its stylesheet');
  assert.match(st.textContent, /@keyframes dictate-caret/);
  assert.match(st.textContent, /\[data-d="caret"\]/, 'aimed at the painted part, not at a class');
  assert.match(st.textContent, /prefers-reduced-motion: no-preference/);
  assert.equal(st.getAttribute('data-annotate-ui'), '',
    'and marked as furniture, so the annotator’s text index skips it');

  D.paint(h, { text: 'the quick fox', range: { start: 6, end: 6 } });
  assert.equal(doc.querySelectorAll('#dictate-style').length, 1, 'injected once, not per paint');
});

test('endCaret paints the insertion point a null range implies', () => {
  // A caret at the very end IS a null range in this kit, which is the right
  // model and the wrong picture: a surface showing a caret everywhere except
  // at the end appears to lose it exactly when a reader drags one there.
  const h = host();
  D.paint(h, { text: 'the quick fox' });
  assert.deepEqual(parts(h).map(p => p[0]), ['text'], 'off by default: the stage keeps its barer render');

  D.paint(h, { text: 'the quick fox', endCaret: true });
  assert.deepEqual(parts(h).map(p => p[0]), ['text', 'caret']);
  assert.equal(D.offsetAt(h, h.childNodes[0].firstChild, 13), 13,
    'and it shifts no offsets, since it carries no text');

  // After the hypothesis, which is where the committed words will leave it.
  D.paint(h, { text: 'the quick fox', interim: 'jumps', endCaret: true });
  assert.deepEqual(parts(h).map(p => p[0]), ['text', 'interim', 'interim-stop', 'caret']);

  // A real range still owns the caret: the flag adds one where there is none,
  // it does not add a second.
  D.paint(h, { text: 'the quick fox', range: { start: 4, end: 4 }, endCaret: true });
  assert.equal(parts(h).filter(p => p[0] === 'caret').length, 1);
});

test('the arrow cluster is opt-out, for a surface that has a pad instead', () => {
  // Two surfaces paint through this, and only one of them grew a cursor pad.
  // Where a pad exists an armed pin is dragged with the same gesture that moves
  // the caret, so arrows chasing the pin are furniture for a job already done;
  // the stage has no pad and keeps them.
  const h = host();
  D.paint(h, { text: 'the quick fox', range: { start: 4, end: 9 }, armed: 'end' });
  assert.ok(h.querySelector('[data-d="nudge"]'), 'on by default');

  D.paint(h, { text: 'the quick fox', range: { start: 4, end: 9 }, armed: 'end', arrows: false });
  assert.equal(h.querySelector('[data-d="nudge"]'), null, 'and gone when asked');
  // The pin itself stays, armed: the state is still readable, it just has no
  // buttons of its own.
  assert.equal(h.querySelectorAll('[data-edge]').length, 2, 'both handles still painted');
});

test('undo steps by mutation, and the caret rides with it', () => {
  // The unit is the MUTATION, which is the unit a mistake arrives in: a
  // recognizer mishears a whole phrase, and the delete key takes words one at
  // a time. Snapshots are whole (text plus range) because the buffer is a
  // note, not a document, and a diff would have to be inverted correctly under
  // every mutation here to be worth its cleverness.
  const d = engine();
  assert.equal(d.canUndo, false, 'nothing written, nothing to take back');
  assert.equal(d.canRedo, false);

  d.start();
  FakeSR.last.say([{ t: 'the first phrase', final: true }]);
  FakeSR.last.say([{ t: 'and the second', final: true }]);
  d.punct('.');
  const full = d.text;
  assert.match(full, /the first phrase\. and the second\./);
  assert.equal(d.canUndo, true);

  assert.equal(d.undo(), true, 'the mark');
  assert.equal(d.canRedo, true);
  assert.equal(d.undo(), true, 'the second phrase');
  assert.equal(d.text, 'the first phrase.');
  assert.equal(d.undo(), true, 'the first');
  assert.equal(d.text, '');
  assert.equal(d.undo(), false, 'and the stack is honest about being empty');

  assert.equal(d.redo(), true);
  assert.equal(d.text, 'the first phrase.');
  d.redo(); d.redo();
  assert.equal(d.text, full, 'redo walks back up the same steps');
  assert.equal(d.canRedo, false);

  // The caret rides along, since landing an undo without knowing where you are
  // is half an undo.
  d.caretAt(4);
  d.punct(',');
  assert.equal(d.text.slice(0, 5), 'the ,', 'the mark landed at the caret');
  d.undo();
  assert.equal(d.text, full);
  assert.deepEqual(d.range, { start: 4, end: 4 }, 'and the caret came back with it');

  // A new mutation forks the timeline: what was undone is gone, which is the
  // one rule every undo stack shares.
  d.insert('fresh');
  assert.equal(d.canRedo, false);
});

test('a caret move is not an undo step, and a no-op assignment is not either', () => {
  // Undo is about the words. A stack that also replayed every tap would spend
  // its depth on gestures the reader can simply make again.
  const d = engine();
  d.insert('one two three');
  const after = d.canUndo;
  assert.equal(after, true);
  d.caretAt(3);
  d.select(0, 3);
  d.clearRange();
  d.undo();
  assert.equal(d.text, '', 'one step back is the insert, not the three selections');

  // The annotator hands the buffer back on the way out of the keyboard, and an
  // untouched note comes back byte-identical: recording that would make the
  // first undo do nothing visible, which reads as a broken key.
  const e = engine();
  e.text = 'kept';
  e.text = 'kept';
  e.text = 'kept';
  assert.equal(e.undo(), true, 'the one assignment that changed something');
  assert.equal(e.text, '');
  assert.equal(e.canUndo, false, 'and the two that changed nothing recorded nothing');
});

// ── Keeping the engine alive ──────────────────────────────────────────────
// The rule these hold: an end the READER did not ask for is the device's own
// silence timeout, not the end of the session. Everything here drives the
// stub's `onend` directly, which is what a WebKit silence timeout looks like
// from inside the kit: an end with no stop() behind it.

// A relaunch is scheduled on a timer, so a test has to let the loop turn. The
// wait is the kit's own gap plus a little, and the loop below is what a real
// pause looks like: end, wait, and a fresh engine is up.
// `relaunchMs: 0` is what keeps a dozen relaunches from costing two seconds
// of wall clock; the delay itself is the kit's business, not a rule to hold.
const fast = (opts = {}) => engine({ relaunchMs: 0, ...opts });
const tick = () => new Promise(r => setTimeout(r, 5));

test('an end nobody asked for relaunches, and the mic does not blink', async () => {
  // The whole point. Before this the reader paused to think, WebKit ended the
  // recognition at its own silence timeout, and the words stopped arriving
  // with nothing said about it.
  const states = [];
  const d = fast({ onState: () => states.push({ listening: d.listening, live: d.live }) });
  d.start();
  const first = FakeSR.last;
  FakeSR.last.say([{ t: 'the opening sentence', final: true }]);

  first.onend();                       // the device gives up on the silence
  assert.equal(d.listening, true, 'the reader never stopped, so the session has not');
  assert.equal(d.live, false, 'and the engine really is down for the moment');

  await tick();
  assert.notEqual(FakeSR.last, first, 'a fresh engine came up behind it');
  assert.equal(d.live, true);
  assert.equal(d.relaunches, 1);

  FakeSR.last.say([{ t: 'and the one after the pause', final: true }]);
  assert.equal(d.text, 'the opening sentence. and the one after the pause.',
    'both sides of the pause are in one buffer (the stub does not capitalize)');

  assert.ok(states.every(s => s.listening),
    'no state the surface was told about painted the mic as off');
  d.stop();
});

test('stop() ends it for good: the relaunch reads intent, not the engine', async () => {
  const d = fast();
  d.start();
  const only = FakeSR.last;
  d.stop();
  assert.equal(d.listening, false);
  await tick();
  assert.equal(FakeSR.last, only, 'nothing came up behind the reader');
  assert.equal(d.live, false);
});

test('the dry budget gives up on a device that never hears anything', async () => {
  // A microphone that is muted, seized by another app, or pointed at a silent
  // room ends at once and forever. Without a cap this is a hot loop.
  const errs = [];
  const d = fast({ onError: (m) => errs.push(m) });
  d.start();
  for (let i = 0; i < 20 && d.listening; i++) {
    FakeSR.last.onend();
    await tick();
  }
  assert.equal(d.listening, false, 'the kit stopped asking');
  assert.match(errs.join(' '), /nothing was heard/, 'and said why rather than going quiet');
  assert.ok(d.relaunches <= 13, 'the budget bounded it: ' + d.relaunches);
});

test('any result refills the budget, since an engine returning words is working', async () => {
  const d = fast();
  d.start();
  // Ten dry ends, then a hypothesis, then ten more. Without the refill the
  // second run would exhaust a budget the first had already spent.
  for (let i = 0; i < 10; i++) { FakeSR.last.onend(); await tick(); }
  assert.equal(d.listening, true);
  FakeSR.last.say([{ t: 'still here' }]);
  for (let i = 0; i < 10; i++) { FakeSR.last.onend(); await tick(); }
  assert.equal(d.listening, true, 'the interim alone settled the question the budget asks');
  d.stop();
});

test('a permission refusal is not a silence: it never relaunches', async () => {
  // Relaunching into a denied microphone asks the reader to refuse again ten
  // times a second, and on a phone each refusal is a sheet over the page.
  const errs = [];
  const d = fast({ onError: (m) => errs.push(m) });
  d.start();
  const only = FakeSR.last;
  only.onerror({ error: 'not-allowed' });
  only.onend();
  await tick();
  assert.equal(d.listening, false);
  assert.equal(FakeSR.last, only, 'no second prompt');
  assert.match(errs.join(' '), /not-allowed/);
});

test('keepAlive: false keeps the old behavior exactly', async () => {
  const d = fast({ keepAlive: false });
  d.start();
  const only = FakeSR.last;
  only.onend();
  await tick();
  assert.equal(d.listening, false, 'an end is the end');
  assert.equal(FakeSR.last, only);
});

test('a tapped mark still rides its own relaunch, with keep-alive on', async () => {
  // punct() parks the mark, stops the engine, and the end handler writes it
  // and comes back up. That path predates keep-alive and must not now do it
  // twice, nor spend a dry credit on an end the kit itself asked for.
  const d = fast();
  d.start();
  FakeSR.last.say([{ t: 'a clause', final: true }]);
  d.punct(',');
  assert.match(d.text, /a clause, $/, 'the mark replaced the pause period');
  await tick();
  assert.equal(d.live, true, 'and the engine came back');
  assert.equal(d.relaunches, 0, 'the mark path is not counted as a silence relaunch');
  FakeSR.last.say([{ t: 'Carrying on', final: true }]);
  assert.match(d.text, /a clause, carrying on\.$/, 'and the continuation casing survived it');
  d.stop();
});

test('starting twice is one engine, and toggle reads the intent', async () => {
  const d = fast();
  d.start();
  const first = FakeSR.last;
  d.start();
  assert.equal(FakeSR.last, first, 'no second engine on the same microphone');
  d.toggle();
  assert.equal(d.listening, false);
  d.toggle();
  assert.equal(d.listening, true);
  d.stop();
});

test('un-ending does not reach back across a paragraph break', () => {
  // `endSentence` refuses to write a full stop after a paragraph mark, so a
  // buffer ending "line.\n\n" holds a pause period the reader then deliberately
  // broke after. Taking the mark back would take their paragraph with it.
  //
  // Latent while `unend` was bound to a tapped Control key and nothing else;
  // the pads reached the stitch instead. Offering it on the pad made the case
  // ordinary, and the stage's own pad test is what caught it.
  const d = withText('a line.\n\n');
  assert.equal(d.canUnend, false);
  assert.equal(d.canStitch, false, 'and the pad does not offer it either');
  assert.equal(d.unend(), false);
  assert.equal(d.text, 'a line.\n\n');

  const spaces = withText('a line.   ');
  assert.equal(spaces.canUnend, true, 'trailing spaces are not a break');
  spaces.unend();
  assert.equal(spaces.text, 'a line');
});
