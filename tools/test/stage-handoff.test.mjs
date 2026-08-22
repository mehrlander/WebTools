// stage-handoff.test.mjs — the carrier that lets a paste taken on one page
// arrive on the Stage in another.
//
// The kit is small and its whole job is a boundary, so what is worth holding is
// the boundary's rules rather than its mechanics:
//
//   IT CARRIES FLAVORS, NOT STAGE ITEMS. What a pasted thing becomes is the
//   intake's decision and the intake lives with the app; the sender only reads
//   the clipboard. So a round trip has to hand back something takeFlavors can
//   eat, blobs included, and the blob has to survive as bytes.
//
//   IT EXPIRES. A paste abandoned mid-navigation must not surface days later.
//
//   IT CLEARS ON READ, whatever the outcome. A payload nothing will accept is
//   not going to start working on the next boot, so it goes rather than being
//   handed to every future load.
//
//   IT FAILS WITH A SENTENCE. Every caller is a menu row with nowhere else to
//   report, so an over-cap paste and a refusing store both have to throw
//   something worth showing rather than a bare storage error.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadKit } from './bootstrap.mjs';

// A window with just the storage the kit reaches for. Kept as a plain object
// map rather than jsdom's real localStorage so a test can make it throw.
function makeWin({ failWrite = false } = {}) {
  const data = new Map();
  const w = {
    localStorage: {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => {
        if (failWrite) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
        data.set(k, String(v));
      },
      removeItem: (k) => { data.delete(k); },
    },
    _data: data,
  };
  loadKit('stage-handoff', { window: w });
  return w;
}

const textFlavor = (text, type = 'text/plain') => ({ kind: 'text', type, text, size: text.length });

test('a text flavor makes the round trip unchanged', async () => {
  const w = makeWin();
  assert.equal(await w.StageHandoff.put([textFlavor('mehrlander/home:README.md')]), 1);
  const out = w.StageHandoff.drain();
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'text');
  assert.equal(out[0].text, 'mehrlander/home:README.md');
  assert.equal(out[0].type, 'text/plain');
});

test('a blob flavor survives as bytes, which is what the intake needs', async () => {
  const w = makeWin();
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]);
  await w.StageHandoff.put([{ kind: 'blob', type: 'image/png', size: bytes.length,
                              blob: new Blob([bytes], { type: 'image/png' }) }]);
  const out = w.StageHandoff.drain();
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'blob');
  assert.equal(out[0].type, 'image/png');
  const back = new Uint8Array(await out[0].blob.arrayBuffer());
  assert.deepEqual([...back], [...bytes],
    'a paste that arrives with different bytes is worse than one that does not arrive');
});

test('every flavor rides, not only the primary', async () => {
  const w = makeWin();
  await w.StageHandoff.put([textFlavor('<b>x</b>', 'text/html'), textFlavor('x')]);
  const out = w.StageHandoff.drain();
  assert.equal(out.length, 2, 'the offer bar is drawn from the flavors a paste ALSO carried');
  assert.equal(out[0].type, 'text/html');
});

test('a flavor carrying neither text nor blob is dropped rather than parked', async () => {
  const w = makeWin();
  assert.equal(await w.StageHandoff.put([{ kind: 'text', type: 'text/plain' }]), 0);
  assert.equal(w.StageHandoff.pending(), false, 'nothing to carry means nothing to park');
});

test('the drain clears, so a paste arrives once', async () => {
  const w = makeWin();
  await w.StageHandoff.put([textFlavor('once')]);
  assert.equal(w.StageHandoff.pending(), true);
  assert.equal(w.StageHandoff.drain().length, 1);
  assert.equal(w.StageHandoff.pending(), false);
  assert.equal(w.StageHandoff.drain().length, 0);
});

test('a stale payload is dropped, not delivered late', async () => {
  const w = makeWin();
  await w.StageHandoff.put([textFlavor('yesterday')]);
  // Age it in place: the kit stamps `at`, so rewriting the stamp is the honest
  // way to test the rule without a clock the script is not allowed to move.
  const o = JSON.parse(w._data.get(w.StageHandoff.KEY));
  o.at = Date.now() - w.StageHandoff.TTL_MS - 1000;
  w._data.set(w.StageHandoff.KEY, JSON.stringify(o));
  assert.equal(w.StageHandoff.drain().length, 0);
  assert.equal(w.StageHandoff.pending(), false, 'an expired payload is cleared too');
});

test('an unreadable payload is dropped rather than handed to every future boot', () => {
  const w = makeWin();
  w._data.set('wt:stage-handoff', '{not json');
  assert.deepEqual(w.StageHandoff.drain(), []);
  assert.equal(w.StageHandoff.pending(), false);
});

test('an unstamped payload is not trusted', () => {
  const w = makeWin();
  w._data.set('wt:stage-handoff', JSON.stringify({ items: [{ kind: 'text', text: 'x' }] }));
  assert.deepEqual(w.StageHandoff.drain(), [],
    'with no stamp there is no way to tell a fresh paste from an ancient one');
});

test('an over-cap paste throws a sentence naming the size', async () => {
  const w = makeWin();
  const big = 'x'.repeat(w.StageHandoff.MAX + 1024);
  await assert.rejects(() => w.StageHandoff.put([textFlavor(big)]), /too large to carry/);
  assert.equal(w.StageHandoff.pending(), false, 'a refused paste must not half-land');
});

test('a store that refuses throws a sentence too, rather than a bare quota error', async () => {
  const w = makeWin({ failWrite: true });
  await assert.rejects(() => w.StageHandoff.put([textFlavor('x')]),
    /Could not park the paste \(QuotaExceededError\)/);
});

test('a store that cannot even be read is silence, not a crash', () => {
  const w = makeWin();
  w.localStorage.getItem = () => { throw new Error('blocked'); };
  assert.deepEqual(w.StageHandoff.drain(), []);
  assert.equal(w.StageHandoff.pending(), false);
});
