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
    'the tapped mark replaces the provisional one rather than doubling it');
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
    'the break keeps the period the first pause earned, and the second earns its own');
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
  assert.equal(d.text, 'the settled part', 'the buffer holds only what was finalized');
  assert.ok(!d.text.endsWith('.'),
    'and its provisional period was taken back the moment more words arrived');
  assert.ok(seen.includes('and the part still being heard'),
    'the hypothesis was painted, which is what makes committing it honest');

  assert.equal(d.flush(), 'the settled part and the part still being heard.',
    'flush commits the guess the reader can see, finished');
  assert.equal(d.flush(), 'the settled part and the part still being heard.',
    'and is idempotent: a second flush has nothing left to commit');
  assert.equal(seen.at(-1), '', 'and the paint is cleared, so nothing renders twice');
  d.stop();
});

test('the delete button drops one word, or the mark clinging to it', () => {
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'the quick brown fox', final: true }]);
  assert.equal(d.text, 'the quick brown fox.');
  d.backWord();
  assert.equal(d.text, 'the quick brown',
    'one tap takes the word: the provisional period is not something to delete');

  // A trailing mark goes first, so two taps undo "word." rather than one tap
  // eating both: the mark was its own deliberate act.
  d.punct('.');
  assert.match(d.text, /brown\. $/);
  d.backWord();
  assert.equal(d.text, 'the quick brown');
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

// ── The provisional period ────────────────────────────────────────────────
// The rule the four above only touch in passing: a pause finishes a sentence,
// and the next words undo that rather than landing after it.

test('the period a pause earns is taken back when speech resumes', () => {
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'the first thought', final: true }]);
  assert.equal(d.text, 'the first thought.', 'a pause finished the sentence');

  // An interim is words arriving, so the period is no longer the end.
  FakeSR.last.say([{ t: 'and then', final: false }]);
  assert.equal(d.text, 'the first thought',
    'the period is gone before the reader can see it beside the new words');

  FakeSR.last.say([{ t: 'and then a second', final: true }]);
  assert.equal(d.text, 'the first thought and then a second.',
    'the words landed in front of it and it came back at the new pause');
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

  assert.equal(d.text, 'one two three.', 'the buffer is untouched by the record');
  assert.equal(d.paragraphs(1500), 'one two\n\nthree.',
    'the long pause becomes a break; the short one does not');
  assert.equal(d.paragraphs(5000), 'one two three.', 'no pause clears a high bar');
  assert.equal(d.text, 'one two three.', 'and it is a proposal: nothing was written');
  d.stop();
});

test('paragraphs() declines rather than guessing when the buffer has moved', () => {
  const d = engine();
  d.start();
  clock.t = 1000;
  FakeSR.last.say([{ t: 'one', final: true }]);
  clock.t = 4000; FakeSR.last.say([{ t: 'tw', final: false }]);
  clock.t = 4100; FakeSR.last.say([{ t: 'two', final: true }]);
  assert.equal(d.paragraphs(1500), 'one\n\ntwo.');

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
test('resuming takes back the capital as well as the period', () => {
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'if we could get punctuation', final: true }]);
  assert.equal(d.text, 'if we could get punctuation.');

  // The engine hears a new sentence and capitalizes accordingly. It is wrong
  // for the same reason the period is: the reader kept talking.
  FakeSR.last.say([{ t: 'And I guess that is working', final: true }]);
  assert.equal(d.text, 'if we could get punctuation and I guess that is working.',
    'one boundary, one decision: both the stop and the capital came back off');
  d.stop();
});

test('the correction survives an engine that finalizes with no interim first', () => {
  // The path that made this a bug rather than a near miss. normalize() reads
  // the continuation flag, so if the period is only dropped inside the commit
  // the capital has already been decided against a stale flag.
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'the first part', final: true }]);
  FakeSR.last.say([{ t: 'Then the rest', final: true }]);   // final, no interim ahead of it
  assert.equal(d.text, 'the first part then the rest.');
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

test('what lowering cannot know: a proper noun after a pause', () => {
  // The guard is /^[A-Z][a-z]/, which spares "I", "OK", and "NASA" but not
  // "Tuesday". Asserted so the limit is recorded rather than rediscovered: the
  // capital is wrong every time the sentence really is continuing and wrong
  // occasionally here, and the residual is a name the editor fixes.
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'we met', final: true }]);
  FakeSR.last.say([{ t: 'Tuesday at noon', final: true }]);
  assert.equal(d.text, 'we met tuesday at noon.', 'a known cost, not an oversight');

  d.text = '';
  FakeSR.last.say([{ t: 'she said', final: true }]);
  FakeSR.last.say([{ t: 'I agree', final: true }]);
  assert.equal(d.text, 'she said I agree.', 'but a bare "I" is never lowered');
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
