// gh-store.js — the Contents-API savers on GH.prototype. save() writes text
// (UTF-8), saveBytes() writes raw bytes; both base64 the content into the PUT.
// These run the IIFE against a minimal GH stub that records the PUT body, then
// decode that body to prove the encoding round-trips (UTF-8 for text, byte-exact
// for binary) and that write conflicts (409) recover by refetching the SHA and
// retrying, with a bounded number of attempts against a branch that keeps
// taking other commits.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/gh-store.js'), 'utf8');
const b64ToBytes = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

// A GH whose req() records each PUT; `failPuts` makes the first N PUTs throw a
// conflict (a stale SHA, or the branch advancing mid-commit) so the retry path
// is exercised, after which get() supplies the current SHA.
function makeGH({ failPuts = 0 } = {}) {
  const puts = [];
  let failed = 0;
  function GH() {}
  GH.prototype.req = async function (p, opts) {
    const body = JSON.parse(opts.body);
    puts.push({ path: p, body });
    if (failed < failPuts) { failed++; const e = new Error('conflict'); e.status = 409; throw e; }
    return { content: { sha: 'newsha' } };
  };
  GH.prototype.get = async function () { return { sha: 'cursha' }; };
  const window = { GH };
  new Function('window', src)(window);
  return { gh: new GH(), puts };
}

test('saveBytes writes byte-exact content', async () => {
  const { gh, puts } = makeGH();
  const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]);
  await gh.saveBytes('bin/a.bin', bytes, 'add a.bin');
  assert.equal(puts.length, 1);
  assert.equal(puts[0].path, 'contents/bin/a.bin');
  assert.equal(puts[0].body.message, 'add a.bin');
  assert.deepEqual([...b64ToBytes(puts[0].body.content)], [...bytes]);
});

test('saveBytes accepts an ArrayBuffer too', async () => {
  const { gh, puts } = makeGH();
  await gh.saveBytes('x', new Uint8Array([1, 2, 3]).buffer);
  assert.deepEqual([...b64ToBytes(puts[0].body.content)], [1, 2, 3]);
});

test('save writes UTF-8 text', async () => {
  const { gh, puts } = makeGH();
  await gh.save('n.txt', 'héllo · 世界');
  const text = new TextDecoder().decode(b64ToBytes(puts[0].body.content));
  assert.equal(text, 'héllo · 世界');
});

test('save serializes a non-string value as pretty JSON', async () => {
  const { gh, puts } = makeGH();
  await gh.save('c.json', { a: 1 });
  assert.equal(new TextDecoder().decode(b64ToBytes(puts[0].body.content)), '{\n  "a": 1\n}');
});

test('a 409 recovers by refetching the SHA and retrying', async () => {
  const { gh, puts } = makeGH({ failPuts: 1 });
  await gh.saveBytes('p', new Uint8Array([7]));
  assert.equal(puts.length, 2, 'one failed PUT, one retry');
  assert.equal(puts[1].body.sha, 'cursha', 'retry carries the refetched SHA');
});

test('the instance ref rides the PUT as branch; empty ref stays default', async () => {
  const { gh, puts } = makeGH();
  gh.ref = 'claude/feature-x';
  await gh.save('dump/drop.md', 'hi', 'drop');
  assert.equal(puts[0].body.branch, 'claude/feature-x',
    'a GH pointed at a branch writes to that branch, matching what it reads');
  const { gh: gh2, puts: puts2 } = makeGH();
  await gh2.save('dump/drop.md', 'hi');
  assert.equal(puts2[0].body.branch, undefined, 'no ref, no branch param');
});

test('repeated conflicts keep retrying, backing off, until one lands', async () => {
  // The registry branch takes a commit on every session Stop, so losing the
  // race twice in a row is a normal afternoon, not an error worth surfacing.
  const { gh, puts } = makeGH({ failPuts: 3 });
  await gh.saveBytes('p', new Uint8Array([7]));
  assert.equal(puts.length, 4, 'three failed PUTs, then success');
});

test('a branch that never stops conflicting gets a bounded number of attempts', async () => {
  const { gh, puts } = makeGH({ failPuts: 99 });
  await assert.rejects(() => gh.saveBytes('p', new Uint8Array([7])), /conflict/);
  assert.equal(puts.length, 4, 'gives up after PUT_TRIES attempts');
});
