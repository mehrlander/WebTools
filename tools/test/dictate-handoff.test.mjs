// The composer-to-page carrier, and the text the annotator assembles for it.
//
// Two things matter and neither is that a string moved. First, take() is
// ONE-SHOT and expires: a draft abandoned mid-navigation must not seed the
// dictation page days later in the middle of a different thought, and a reload
// must not seed it a second time on top of whatever has been said since.
// Second, the address LEADS the assembled text, because a prompt aimed at a
// coding session is read from the top and where-to-look is the part nobody
// would type by hand.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/dictate-handoff.js'), 'utf8');

// A localStorage stand-in, so the kit's own try/catch paths are exercised
// rather than mocked away.
function load({ now = () => Date.now(), throwOnSet = false } = {}) {
  const store = new Map();
  const window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { if (throwOnSet) throw new Error('quota'); store.set(k, String(v)); },
      removeItem: (k) => store.delete(k),
    },
    Date: { now },
  };
  new Function('window', 'localStorage', 'Date', src)(window, window.localStorage, window.Date);
  return { H: window.dictateHandoff, store };
}

test('a draft goes over and comes back with its origin', () => {
  const { H } = load();
  assert.equal(H.put('say something', 'pages/foo.html'), true);
  const got = H.take();
  assert.equal(got.text, 'say something');
  assert.equal(got.at, 'pages/foo.html');
});

test('take is one-shot, so a reload does not seed the buffer twice', () => {
  const { H } = load();
  H.put('once');
  assert.equal(H.take().text, 'once');
  assert.equal(H.take(), null, 'the second read must find nothing');
});

test('an empty or blank draft is not a handoff', () => {
  const { H } = load();
  assert.equal(H.put(''), false);
  assert.equal(H.put('   \n  '), false);
  assert.equal(H.take(), null);
});

test('a stale payload is dropped rather than delivered late', () => {
  let t = 1_000_000;
  const { H } = load({ now: () => t });
  H.put('old thought');
  t += H.TTL_MS + 1;
  assert.equal(H.take(), null);
});

test('a payload just inside the window still arrives', () => {
  let t = 1_000_000;
  const { H } = load({ now: () => t });
  H.put('recent thought');
  t += H.TTL_MS - 1;
  assert.equal(H.take().text, 'recent thought');
});

test('an oversize draft is refused, so the caller can say so', () => {
  const { H } = load();
  assert.equal(H.put('x'.repeat(H.MAX + 1)), false);
});

test('a refused write reports false rather than throwing into the caller', () => {
  const { H } = load({ throwOnSet: true });
  assert.equal(H.put('anything'), false);
});

test('garbage under the key is dropped, not thrown', () => {
  const { H, store } = load();
  store.set(H.KEY, 'not json');
  assert.equal(H.take(), null);
  store.set(H.KEY, JSON.stringify({ text: 'no clock' }));
  assert.equal(H.take(), null, 'a payload with no sentAt cannot be aged, so it cannot be trusted');
});
