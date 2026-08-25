// Keeping the estate's age readings honest on a page that never reloads.
//
// Every cache-backed pane warms itself on ARRIVAL, and arrival means a
// navigation inside a running app. A phone does not navigate: Safari keeps the
// page and restores it, so the boot ran once, whenever the tab was opened, and
// each pane has been rendering the copy it read then ever since. That is what
// an age pill reading "as of 1d" over a stale list is reporting, and it is the
// worst reading the estate can show, since the control it offers re-crawls a
// cache the mounted view will not re-read.
//
// Two halves, and neither works without the other:
//
//   the RETURN is an arrival     a long hide, or a bfcache restore, runs the
//                                same throttled crawls a fresh arrival would
//   a COMMIT is announced        the pane re-reads on the *-refreshed event,
//                                so a crawl that saves a new cache in silence
//                                has changed nothing anybody can see

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeShell } from './show-repo-shell.mjs';

// A shell with the two crawls replaced by counters. Both are the throttled,
// unforced entry points the arrival paths call, so what is under test is the
// decision to call them and what is said afterwards, never the crawls.
function stubbed({ view = 'sessions', committed = true } = {}) {
  const h = makeShell();
  const calls = { sessions: 0, activity: 0 };
  h.shell.view = view;
  h.shell.hasToken = () => true;
  h.shell.refreshSessionsCache = async () => { calls.sessions++; return { committed }; };
  h.shell.refreshActivityCache = async () => { calls.activity++; return { committed, doc: null }; };
  return { ...h, calls };
}

const named = (h, name) => h.events.filter(e => e.type === name).length;

test('a sessions crawl that commits tells the pane to re-read', async () => {
  const h = stubbed();
  await h.shell.warmSessionsCache();
  assert.equal(h.calls.sessions, 1);
  assert.equal(named(h, 'web-tools:sessions-refreshed'), 1);
});

test('a sessions crawl that changes nothing stays quiet', async () => {
  const h = stubbed({ committed: false });
  await h.shell.warmSessionsCache();
  assert.equal(h.calls.sessions, 1);
  assert.equal(named(h, 'web-tools:sessions-refreshed'), 0);
});

// The failure this closes: a crawl that threw left the announcement unmade and
// the rejection unhandled, which is a warning in the console and a pane that
// never hears back.
test('a sessions crawl that throws is reported, not rethrown', async () => {
  const h = stubbed();
  h.shell.refreshSessionsCache = async () => { throw new Error('409'); };
  await h.shell.warmSessionsCache();
  assert.equal(named(h, 'web-tools:sessions-refreshed'), 0);
});

test('the warm covers what the pane on screen actually reads', async () => {
  for (const [view, want] of [['sessions', { sessions: 1, activity: 0 }],
                              ['activity', { sessions: 0, activity: 1 }],
                              ['state',    { sessions: 1, activity: 1 }],
                              ['chats',    { sessions: 0, activity: 0 }]]) {
    const h = stubbed({ view });
    h.shell.warmEstateCaches();
    await new Promise(r => setImmediate(r));
    assert.deepEqual(h.calls, want, view);
  }
});

test('a signed-out shell warms nothing', async () => {
  const h = stubbed({ view: 'state' });
  h.shell.hasToken = () => false;
  h.shell.warmEstateCaches();
  await new Promise(r => setImmediate(r));
  assert.deepEqual(h.calls, { sessions: 0, activity: 0 });
});

test('a tab flick is not an arrival', async () => {
  const h = stubbed();
  h.shell.wireRevisit();
  h.doc.hidden = true;
  h.fire('document', 'visibilitychange');
  h.doc.hidden = false;
  h.fire('document', 'visibilitychange');
  await new Promise(r => setImmediate(r));
  assert.equal(h.calls.sessions, 0);
});

test('a long hide is', async () => {
  const h = stubbed();
  h.shell.wireRevisit();
  h.doc.hidden = true;
  h.fire('document', 'visibilitychange');
  // Backdate the hide past the threshold rather than waiting it out.
  h.shell._hiddenAt -= h.shell.REVISIT_MS + 1000;
  h.doc.hidden = false;
  h.fire('document', 'visibilitychange');
  await new Promise(r => setImmediate(r));
  assert.equal(h.calls.sessions, 1);
});

// The case the whole handler exists for. `persisted` means the page came back
// with no boot at all, so there is nothing else that could have warmed it, and
// a hide this shell never saw must not be read as a hide of zero length.
test('a bfcache restore always warms', async () => {
  const h = stubbed();
  h.shell.wireRevisit();
  h.fire('window', 'pageshow', { persisted: true });
  await new Promise(r => setImmediate(r));
  assert.equal(h.calls.sessions, 1);
});

test('an ordinary load does not', async () => {
  const h = stubbed();
  h.shell.wireRevisit();
  h.fire('window', 'pageshow', { persisted: false });
  await new Promise(r => setImmediate(r));
  assert.equal(h.calls.sessions, 0);
});

// Arriving visible with no recorded hide is a resume the shell did not see, so
// the away time is unknown rather than zero, and unknown warms.
test('becoming visible with no recorded hide warms', async () => {
  const h = stubbed();
  h.shell.wireRevisit();
  h.doc.hidden = false;
  h.fire('document', 'visibilitychange');
  await new Promise(r => setImmediate(r));
  assert.equal(h.calls.sessions, 1);
});
