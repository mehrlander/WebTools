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
function makeGH({ failPuts = 0, lsRows = [{ name: 'todo.json', sha: 'cursha' }] } = {}) {
  const puts = [];
  const reads = [];   // every sha refetch: the opts it was made with
  let failed = 0;
  function GH() {}
  GH.FRESH = { cache: 'no-store' };
  GH.prototype.req = async function (p, opts) {
    if (opts && opts.method === 'DELETE') { puts.push({ path: p, body: JSON.parse(opts.body), method: 'DELETE' }); return {}; }
    if (!opts || !opts.body) { reads.push({ path: p, opts }); return { sha: 'cursha' }; }
    const body = JSON.parse(opts.body);
    puts.push({ path: p, body });
    if (failed < failPuts) { failed++; const e = new Error('conflict'); e.status = 409; throw e; }
    return { content: { sha: 'newsha' } };
  };
  GH.prototype.get = async function (p, opts) { reads.push({ path: p, opts, kind: 'file' }); return { sha: 'cursha' }; };
  // The recovery prefers the parent directory's listing, which carries every
  // entry's sha and none of their bytes; `lsRows` lets a test withhold the row
  // and prove the fall-back to the file read still works.
  GH.prototype.ls = async function (p, opts) {
    reads.push({ path: p, opts, kind: 'dir' });
    if (lsRows === null) throw Object.assign(new Error('not a directory'), { status: 415 });
    return lsRows;
  };
  const window = { GH };
  new Function('window', src)(window);
  return { gh: new GH(), puts, reads };
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
  // Six rather than four since 2026-08-16: the layer under the HTTP cache is
  // GitHub's own read-after-write lag, where the recovery re-read can be
  // answered by a replica that has not seen the commit, and two seconds of
  // patience was not enough to outlast it.
  assert.equal(puts.length, 6, 'gives up after PUT_TRIES attempts');
});

// The sha is 40 characters and the file can be 370 KB. Measured 2026-08-17 off
// the activity crawl's own call log: one refresh read state/activity.json eleven
// times for 7.2 MB, five of those reads being this recovery buying one fact with
// a whole file.
test('the conflict recovery buys the sha from a listing, not the file', async () => {
  const { gh, puts, reads } = makeGH({ failPuts: 1, lsRows: [{ name: 'activity.json', sha: 'listsha' }] });
  await gh.save('state/activity.json', { a: 1 });
  assert.deepEqual(reads.map(r => [r.kind, r.path]), [['dir', 'state']]);
  assert.equal(puts[1].body.sha, 'listsha', 'the retry carries the sha the listing named');
});

test('no listing, or no row in it, and the file read still answers', async () => {
  // A path at the repo root has no directory to list, and a listing that does
  // not name the file is not an answer either.
  const { gh, reads } = makeGH({ failPuts: 1, lsRows: null });
  await gh.save('state/activity.json', { a: 1 });
  assert.deepEqual(reads.map(r => r.kind), ['dir', 'file']);
  const { gh: gh2, reads: r2 } = makeGH({ failPuts: 1 });
  await gh2.save('root.json', { a: 1 });
  assert.deepEqual(r2.map(r => r.kind), ['file'], 'no slash, no listing to try');
});

// An explicit sha is for a caller that knows what it wrote (lib/kits/
// last-write.js): it skips the guess a read would make, which is the only thing
// that helps when the API's own read is behind its own write.
test('an explicit sha rides the first PUT, with no read at all', async () => {
  const { gh, puts, reads } = makeGH();
  await gh.save('state/activity.json', { a: 1 }, 'msg', { sha: 'mine' });
  assert.equal(puts[0].body.sha, 'mine');
  assert.equal(reads.length, 0);
});

// The recovery's re-read must not come from the HTTP cache, which is where this
// whole loop went inert. GitHub caches an API read in the browser for a minute,
// so a refetch on the default fetch cache mode is handed back the same sha that
// was just rejected, and four attempts converge on nothing. Measured
// 2026-08-13 on a show-repo to-do check-off; see GH.FRESH in gh-api.js.
test('the conflict refetch reads past the HTTP cache', async () => {
  const { gh, reads } = makeGH({ failPuts: 1 });
  await gh.save('lists/todo.json', { items: [] });
  assert.equal(reads.length, 1, 'the conflict refetched the sha');
  assert.equal(reads[0].opts?.cache, 'no-store',
    'a refetch through the cache re-reads the sha it was rejected for');
  assert.equal(reads[0].kind, 'dir', 'and it buys the sha from the listing');
});

// del() reads the sha with no retry behind it, so a cached read is fatal rather
// than merely slow: deleting a file written in the last minute would fail on a
// sha the browser never re-requested.
test('del reads its sha past the HTTP cache', async () => {
  const { gh, reads } = makeGH();
  gh.ref = 'main';
  await gh.del('surfaces/x.json', 'drop it');
  assert.equal(reads.length, 1);
  assert.equal(reads[0].opts?.cache, 'no-store');
});

// The sha a successful write hands back is the one copy of it that no cache can
// stale, which is why callers hold their GH rather than minting one per save.
test('a successful write leaves the new sha on the instance for the next one', async () => {
  const { gh, puts, reads } = makeGH();
  await gh.save('lists/todo.json', { items: [1] });
  await gh.save('lists/todo.json', { items: [1, 2] });
  assert.equal(puts.length, 2, 'no conflict, so no retry');
  assert.equal(reads.length, 0, 'and no read at all: the write supplied the sha');
  assert.equal(puts[1].body.sha, 'newsha', 'the second write carries the first write\'s sha');
});
