// gh-api.test.mjs — unit tests for GH.recentFiles(): the batched-parallel
// walk that feeds show-repo's sidebar Recent panel. gh-api.js is a plain ES
// module whose window-only paths (console capture, jsDelivr bootstrap) are
// guarded, so Node imports it directly; req() is stubbed with canned data.
import test from 'node:test';
import assert from 'node:assert/strict';

const { default: GH } = await import('../../lib/gh-api.js');

// A fake commit history: commit i (newest first) touches the given files.
// Dates descend with i so per-file dates are distinguishable.
const makeGh = (filesPerCommit, opts = {}) => {
  const gh = new GH({ repo: 'o/r' });
  const calls = { list: 0, details: [], maxInFlight: 0 };
  let inFlight = 0;
  gh.req = async (path) => {
    if (path.startsWith('commits?')) {
      calls.list++;
      return filesPerCommit.map((_, i) => ({
        sha: 's' + i,
        commit: { author: { date: `2026-01-${String(30 - i).padStart(2, '0')}` } },
      }));
    }
    const i = Number(path.replace('commits/s', ''));
    calls.details.push(i);
    inFlight++;
    calls.maxInFlight = Math.max(calls.maxInFlight, inFlight);
    await new Promise(r => setTimeout(r, 5));
    inFlight--;
    if (opts.fail?.includes(i)) throw new Error('detail ' + i + ' failed');
    return { files: filesPerCommit[i].map(f => ({ filename: f })) };
  };
  return { gh, calls };
};

test('collects n distinct paths newest-first with per-commit dates', async () => {
  const { gh } = makeGh([['a', 'b'], ['b', 'c'], ['d'], ['e']]);
  const out = await gh.recentFiles(3);
  assert.deepEqual(out.map(f => f.path), ['a', 'b', 'c']);
  // 'b' keeps the date of the newest commit that touched it (commit 0).
  assert.deepEqual(out.map(f => f.date), ['2026-01-30', '2026-01-30', '2026-01-29']);
  assert.deepEqual(out.map(f => f.sha), ['s0', 's0', 's1']);
});

test('fetches details in parallel batches, not serially', async () => {
  const commits = Array.from({ length: 12 }, (_, i) => ['f' + i]);
  const { gh, calls } = makeGh(commits);
  await gh.recentFiles(8);
  assert.ok(calls.maxInFlight > 1, `expected concurrent detail fetches, saw max ${calls.maxInFlight}`);
});

test('stops fetching once n paths are found', async () => {
  // First batch of 6 commits already yields 8 distinct files.
  const commits = Array.from({ length: 16 }, (_, i) => ['x' + i, 'y' + i]);
  const { gh, calls } = makeGh(commits);
  const out = await gh.recentFiles(8);
  assert.equal(out.length, 8);
  assert.ok(calls.details.length <= 6, `expected one batch of detail calls, saw ${calls.details.length}`);
});

test('a failed detail fetch is skipped, not fatal', async () => {
  const { gh } = makeGh([['a'], ['b'], ['c']], { fail: [1] });
  const out = await gh.recentFiles(3);
  assert.deepEqual(out.map(f => f.path), ['a', 'c']);
});

test('returns fewer than n when commits run out', async () => {
  const { gh } = makeGh([['a'], ['a']]);
  const out = await gh.recentFiles(5);
  assert.deepEqual(out.map(f => f.path), ['a']);
});

test('load() keeps an in-flight census on the class for the boot guard', async () => {
  // gh-boot's load-race guard reads GH._loading / GH._loadQuietAt to tell a
  // chain still in flight from a page that loads nothing, so the counter has
  // to rise while a load is pending, pool across instances, and stamp the
  // quiet time on completion, success and failure alike.
  const gh = new GH({ repo: 'o/r' });
  let release;
  gh.get = () => new Promise(r => { release = () => r({ text: 'void 0' }); });
  const before = GH._loading || 0;
  const p = gh.load('slow.js');
  await new Promise(r => setTimeout(r, 5));
  assert.equal(GH._loading, before + 1, 'in flight while the fetch is pending');
  release();
  await p;
  assert.equal(GH._loading, before, 'settles back on completion');
  assert.ok(Date.now() - GH._loadQuietAt < 1000, 'quiet time stamped at completion');

  const failing = new GH({ repo: 'o/r' });
  failing.get = async () => { throw new Error('404'); };
  await assert.rejects(() => failing.load('gone.js'));
  assert.equal(GH._loading, before, 'a failed load never leaks the counter');
});
