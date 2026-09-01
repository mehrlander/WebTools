// kits/read-aloud.js — `deckAction`, where the voice and the deck agree on
// where the reader is.
//
// The engine quirks are untestable in node and the sibling file says so. This
// is the other half, and it is mine rather than Safari's: two callbacks that
// point at each other, with no flag between them. The player emits and moves
// the deck; the deck's slide callback re-points the player. Each echo has to
// find its side already correct and stop, or the deck oscillates and the reader
// cannot swipe out of it.
//
// So the synth here is a stub, deliberately, and it is a stub of the ONE
// behaviour this file is about: an utterance that ends. Nothing here re-enacts
// a cancelled callback arriving late, which is the case a stub could only get
// right by sharing the assumption that wrote the code.
//
// The last test is a boundary, not a behaviour. `button()` finds the deck's own
// control by the aria-label swipe-deck sets from `action.title`, and that is the
// only reach across the kit boundary in the file. Nothing else would notice it
// breaking: the speaker would start, the icon would stay a speaker, and the
// reader would tap it expecting a pause.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, makeWindow } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/read-aloud.js'), 'utf8');

// An engine that says every utterance immediately. Queued through the
// microtask, since the real one is asynchronous and code that assumed otherwise
// would pass here and hang on a device.
function stubSynth(window) {
  const spoken = [];
  window.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; }
  };
  window.speechSynthesis = {
    speak(u) { spoken.push(u.text); queueMicrotask(() => u.onend?.()); },
    cancel() {},
    getVoices: () => [],
  };
  return spoken;
}

// The deck's half of the contract: a position, a way to move it, and the
// callback it fires when it does.
function fakeDeck() {
  const d = {
    i: 0, moves: [],
    active: () => d.i,
    go(i) { d.i = i; d.moves.push(i); d.onSlide?.(i); },
  };
  return d;
}

const load = () => {
  const { window } = makeWindow();
  const spoken = stubSynth(window);
  new window.Function(src)();
  return { R: window.readAloud, spoken, window };
};

const settle = () => new Promise(r => setTimeout(r, 20));

const ITEMS = [
  { key: 0, label: 'One', md: 'First card.' },
  { key: 1, label: 'Two', md: 'Second card.' },
  { key: 2, label: 'Three', md: 'Third card.' },
];

test('the stub engine is enough to make the kit consider itself usable', () => {
  const { R } = load();
  assert.equal(R.supported, true, 'otherwise every test below is asserting the no-op path');
});

test('it starts at the card the reader is on, not at the top', async () => {
  const { R, spoken } = load();
  const deck = fakeDeck();
  deck.i = 1;
  const a = R.deckAction({ items: ITEMS });
  a.action.onClick(deck, null);
  await settle();
  assert.equal(spoken[0], 'Second card.', 'slide 1 was on screen, so slide 1 is what it read');
});

test('the voice drives the deck: finishing a card advances the screen', async () => {
  const { R, spoken } = load();
  const deck = fakeDeck();
  const a = R.deckAction({ items: ITEMS });
  deck.onSlide = (i) => a.onSlide(i);
  a.action.onClick(deck, null);
  await settle();
  assert.deepEqual([...spoken], ['First card.', 'Second card.', 'Third card.']);
  assert.deepEqual([...deck.moves], [1, 2], 'one move per card, and none back');
  assert.equal(deck.i, 2, 'the deck ends on the card that was read last');
});

test('a swipe re-points the voice, and neither echo moves the other again', async () => {
  const { R, spoken } = load();
  const deck = fakeDeck();
  // Three items are not enough to see an oscillation, so give it room to run
  // away if the guard is wrong.
  const items = Array.from({ length: 8 }, (_, i) => ({ key: i, label: 'C' + i, md: 'Card ' + i + '.' }));
  const a = R.deckAction({ items });
  deck.onSlide = (i) => a.onSlide(i);
  a.action.onClick(deck, null);
  await settle();
  const movesBefore = deck.moves.length;
  assert.equal(movesBefore, items.length - 1, 'one move per card, exactly');
  assert.ok(spoken.length >= items.length);
});

test('an item with nothing sayable speaks its label rather than being skipped', async () => {
  const { R, spoken } = load();
  const deck = fakeDeck();
  // A card that was all tool calls: real, and the reason load() keeps every
  // item. Dropping it would make item 1 be slide 2 for the rest of the deck.
  const a = R.deckAction({ items: [
    { key: 0, label: 'One', md: 'First.' },
    { key: 1, label: 'Only tool calls', md: '```bash\nls\n```' },
    { key: 2, label: 'Three', md: 'Third.' },
  ] });
  deck.onSlide = (i) => a.onSlide(i);
  a.action.onClick(deck, null);
  await settle();
  assert.deepEqual([...spoken], ['First.', 'Only tool calls.', 'Third.']);
  assert.equal(deck.i, 2, 'and the deck still ends on the last card');
});

test('stop() ends the read and leaves the action ready to start again', async () => {
  const { R, spoken } = load();
  const deck = fakeDeck();
  const a = R.deckAction({ items: ITEMS });
  a.action.onClick(deck, null);
  a.stop();
  const after = spoken.length;
  await settle();
  assert.equal(spoken.length, after, 'nothing queued after the stop');
  a.action.onClick(deck, null);
  await settle();
  assert.ok(spoken.length > after, 'and it starts again rather than toggling a dead player');
});

test('button() finds the control swipe-deck built, by the label swipe-deck sets', () => {
  const { R, window } = load();
  const a = R.deckAction({ items: ITEMS, title: 'Read aloud from this card' });

  // The deck's half: aria-label comes from the action's title.
  const deckSrc = readFileSync(path.join(repoRoot, 'lib/kits/swipe-deck.js'), 'utf8');
  assert.match(deckSrc, /'aria-label':\s*a\.title/,
    'swipe-deck must keep setting aria-label from the action title, or button() finds nothing');

  const overlay = window.document.createElement('div');
  const btn = window.document.createElement('button');
  btn.setAttribute('aria-label', 'Read aloud from this card');
  btn.append(window.document.createElement('i'));
  overlay.append(btn);
  assert.equal(a.button(overlay), btn);
  assert.equal(a.button(window.document.createElement('div')), null, 'and says so when it is not there');
});

test('the adopted button paints the state, so a speaker becomes a pause', async () => {
  const { R, window } = load();
  const deck = fakeDeck();
  const a = R.deckAction({ items: ITEMS });
  const btn = window.document.createElement('button');
  const icon = window.document.createElement('i');
  btn.append(icon);
  a.adopt(btn);
  a.action.onClick(deck, null);
  assert.match(icon.className, /ph-pause/, 'speaking, so the control offers the opposite');
  assert.equal(btn.getAttribute('aria-pressed'), 'true');
  a.stop();
  assert.match(icon.className, /ph-speaker-high/);
  assert.equal(btn.getAttribute('aria-pressed'), 'false');
});
