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

// A handle over a window carrying the stub. The kit takes the window (or an
// accessor for one) rather than reaching for a global, which is what lets the
// annotator point it at a frame.
const engine = (opts = {}) => {
  const win = { SpeechRecognition: FakeSR, navigator: { language: 'en-US' } };
  return D.create({ win, ...opts });
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
  assert.equal(d.text, 'no listeners here');
  d.punct('.');
  assert.match(d.text, /here\. $/);
  d.stop();
});

test('spoken punctuation becomes words, tapped marks become punctuation', async () => {
  const d = engine();
  d.start();
  // The engine hears a sentence WITH punctuation: it must not survive as one.
  FakeSR.last.say([{ t: 'the rule is simple.', final: true }]);
  assert.equal(d.text, 'the rule is simple period',
    'a recognized period is spoken text, since the engine guesses badly at marks');

  // A tapped mark rides the stop-restart cycle: parked, engine stopped, then
  // written by the end handler, which also restarts it.
  d.punct('.');
  assert.match(d.text, /simple period\. $/, 'the tapped mark is the real punctuation');
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
  assert.equal(d.text, 'first part, then more',
    'stitched utterances read as one sentence, not as two');

  // A full stop ends it, so the next capital stands.
  d.punct('.');
  FakeSR.last.say([{ t: 'New sentence', final: true }]);
  assert.match(d.text, /\. New sentence$/);
  d.stop();
});

test('a paragraph mark breaks the line and spacing never doubles', () => {
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'one', final: true }]);
  d.punct('¶');
  FakeSR.last.say([{ t: 'two', final: true }]);
  assert.equal(d.text, 'one\n\ntwo');
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
  assert.ok(seen.includes('and the part still being heard'),
    'the hypothesis was painted, which is what makes committing it honest');

  assert.equal(d.flush(), 'the settled part and the part still being heard',
    'flush commits the guess the reader can see');
  assert.equal(d.flush(), 'the settled part and the part still being heard',
    'and is idempotent: a second flush has nothing left to commit');
  assert.equal(seen.at(-1), '', 'and the paint is cleared, so nothing renders twice');
  d.stop();
});

test('the delete button drops one word, or the mark clinging to it', () => {
  const d = engine();
  d.start();
  FakeSR.last.say([{ t: 'the quick brown fox', final: true }]);
  d.backWord();
  assert.equal(d.text, 'the quick brown', 'one word, not the whole utterance');

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
  assert.match(d.text, /Then more$/, 'the capital stands once the comma is gone');
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
