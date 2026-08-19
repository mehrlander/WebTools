// kits/subject-channel.js — telling the FAB sidebar what is on screen.
//
// The channel itself is a global plus an event (`window.__tossSubject`,
// `toss-subject`), which toss-render stamps per render and the fab adopts. The
// kit is what makes any in-document surface able to speak on it and give it
// back: which windows are listening, what is saved before the first write, and
// what is put back on the way out.
//
// Two consumers exercise it end to end and neither is repeated here.
// file-deck covers the FRAMED case (inside a toss the surface runs in the
// frame and the listening fab is the shell's) and the answer bridged back down
// from it; stage covers announcing per position and the handle a surface
// installs to be re-addressed rather than navigated away from. What is held
// here is the kit's OWN contract, the part a consumer test would only reach by
// accident: what a snapshot is taken of, and when.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/subject-channel.js'), 'utf8'))();

const reset = () => {
  window.__tossSubject = null; window.__tossFrame = null;
  window.__compareRef = null; window.__deckNavigate = null;
};

test('a surface says what it is showing, and the page gets its own back', () => {
  reset();
  // show-repo can itself be running inside a toss, so the globals are borrowed
  // rather than owned: what was there is what has to be there afterwards.
  const held = { repo: 'me/tools', ref: 'main', path: 'pages/app.html' };
  const frame = { name: 'the toss frame' };
  window.__tossSubject = held;
  window.__tossFrame = frame;

  const heard = [];
  const on = () => heard.push(window.__tossSubject?.path ?? null);
  window.addEventListener('toss-subject', on);

  const chan = window.subjectChannel.open();
  chan.announce({ repo: 'me/a', path: 'lib/x.js', route: 'stage' });
  assert.equal(window.__tossSubject.path, 'lib/x.js');
  assert.equal(window.__tossFrame, null,
    'a slide is in THIS document, so there is no frame to reach into');
  assert.deepEqual(heard, ['lib/x.js'], 'announced, not only stamped');

  chan.release();
  assert.equal(window.__tossSubject, held);
  assert.equal(window.__tossFrame, frame);
  assert.deepEqual(heard, ['lib/x.js', 'pages/app.html'], 'and the put-back is announced too');
  window.removeEventListener('toss-subject', on);
  reset();
});

// THE ORDERING TRAP, and the reason the snapshot is taken at open(). A surface
// installs its handle before its first announcement, so a channel that
// remembered each window the first time it wrote to one would save the
// surface's OWN handle as the thing to restore, and leaving would hand the page
// back a handle pointing into a surface that no longer exists.
test('the snapshot is of what was there before, whatever order the writes come in', () => {
  reset();
  const pageHandle = () => 'the page\'s own';
  window.__deckNavigate = pageHandle;

  const chan = window.subjectChannel.open({ keep: ['__deckNavigate'] });
  chan.set('__deckNavigate', () => 'the surface\'s');
  chan.announce({ repo: 'me/a', path: 'lib/x.js' });
  assert.equal(window.__deckNavigate(), 'the surface\'s');

  chan.release();
  assert.equal(window.__deckNavigate, pageHandle,
    'restored to what the page had, not to what the surface installed');
  reset();
});

test('a global not named in keep is left alone in both directions', () => {
  reset();
  const chan = window.subjectChannel.open();
  chan.set('__deckNavigate', () => 'installed anyway');
  chan.announce({ repo: 'me/a', path: 'lib/x.js' });
  chan.release();
  assert.equal(typeof window.__deckNavigate, 'function',
    'set writes what it is told; only keep decides what release takes back');
  reset();
});

// A surface can be dismissed four ways (✕, Escape, Back, a parent cascading),
// and a caller that also tears down on its own path will land here twice.
test('releasing twice is a no-op rather than a second restore', () => {
  reset();
  const held = { repo: 'me/tools', path: 'pages/app.html' };
  window.__tossSubject = held;
  const chan = window.subjectChannel.open();
  chan.announce({ repo: 'me/a', path: 'lib/x.js' });
  chan.release();
  window.__tossSubject = { repo: 'me/b', path: 'later.md' };
  chan.release();
  assert.equal(window.__tossSubject.path, 'later.md',
    'a stale snapshot must not reach forward over whatever came next');
  reset();
});

// The answer channel is what the sidebar's compare bar publishes back, read by
// the CARDS. A surface that owns its own comparison reads no such global, and
// bridging for it would put a control in the drawer that changes nothing.
test('the answer bridge is opt-in, and takes the choice with it when it goes', () => {
  reset();
  const quiet = window.subjectChannel.open();
  window.__compareRef = { base: 'main' };
  quiet.release();
  assert.deepEqual(window.__compareRef, { base: 'main' },
    'a channel that never bridged does not clear a global it never wrote');

  reset();
  const bridged = window.subjectChannel.open({ bridge: true });
  window.__compareRef = { base: 'main' };
  bridged.release();
  assert.equal(window.__compareRef, null, 'one that did, does');
  reset();
});

test('the door opens the drawer on the tab that names the file', () => {
  reset();
  const chan = window.subjectChannel.open();
  let asked = null;
  const on = (e) => { asked = e.detail && e.detail.tab; };
  window.addEventListener('web-tools:open-drawer', on);
  chan.openDrawer();
  assert.equal(asked, 'render');
  chan.openDrawer('inspect');
  assert.equal(asked, 'inspect', 'and takes another when a caller has one in mind');
  window.removeEventListener('web-tools:open-drawer', on);
  chan.release();
  reset();
});

// Outside a toss there is one window and the parent IS this window, so the
// announcement must not be made twice. Inside one, file-deck's own cases cover
// the reach upward.
test('an unframed page is one host, not two', () => {
  reset();
  const heard = [];
  const on = () => heard.push(1);
  window.addEventListener('toss-subject', on);
  const chan = window.subjectChannel.open();
  chan.announce({ repo: 'me/a', path: 'lib/x.js' });
  assert.equal(heard.length, 1);
  window.removeEventListener('toss-subject', on);
  chan.release();
  reset();
});
