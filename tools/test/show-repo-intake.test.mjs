// show-repo's app-wide intake gestures: the window drop (PR #443) and the
// window paste beside it. Both shipped as shell code with their coverage in
// stage.test.mjs, which holds the FOLD (what an arriving thing becomes) and
// says nothing about the GESTURE (which events are taken, which are declined,
// and where the view goes afterwards). That split is the whole design, so this
// file tests the half the intake tests deliberately do not reach.
//
// The shell is not a lib module, so it runs through makeShell. `win` is the
// stub the shell's own listeners register on, which is what makes the handlers
// callable here: wireAppDrop/wireAppPaste hand them to window.addEventListener
// and nothing else holds a reference.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeShell, page } from './show-repo-shell.mjs';

// A shell with its window listeners captured by type, plus a StageIntake stand-in
// recording what it was asked to do. The intake's real behavior is stage.test.mjs's
// subject; what matters here is that the gesture calls it at all, and with what.
function wired({ view = 'estate', added = [{ name: 'one.md' }] } = {}) {
  const handlers = {};
  const win = { addEventListener: (type, fn) => { (handlers[type] ??= []).push(fn); } };
  const { shell } = makeShell({ browserStore: { repo: '' }, win });
  const calls = [];
  win.StageIntake = {
    takePaste: async (cd, opts) => { calls.push({ kind: 'takePaste', cd, opts }); return { added, offers: [] }; },
    takeDrop: async (dt) => { calls.push({ kind: 'takeDrop', dt }); return added; },
    focus: (it) => { calls.push({ kind: 'focus', it }); },
  };
  shell.view = view;
  shell.syncUrl = () => {};
  shell.wireAppDrop();
  shell.wireAppPaste();
  const fire = async (type, e) => { for (const fn of handlers[type] || []) await fn(e); };
  return { shell, handlers, calls, fire, win };
}

// A ClipboardEvent stand-in: jsdom's carries no clipboardData, and what is under
// test is the routing, not the platform's construction of the event.
const evt = (target = { tagName: 'DIV' }, cd = { types: ['text/plain'] }) => {
  const e = { clipboardData: cd, target, defaultPrevented: false };
  e.preventDefault = () => { e.defaultPrevented = true; };
  return e;
};

test('the shell registers one paste listener, and it is the only one', () => {
  const { handlers } = wired();
  assert.equal(handlers.paste?.length, 1,
    'two readers of one clipboard is how a flavor gets taken out from under the offer bar');
});

test('a paste off the Stage stages, routes, and opens the one thing that landed', async () => {
  const { shell, calls, fire } = wired({ view: 'map' });
  const e = evt();
  await fire('paste', e);
  assert.equal(e.defaultPrevented, true, 'the app took the paste, so the document must not also handle it');
  assert.equal(calls.filter(c => c.kind === 'takePaste').length, 1);
  assert.equal(shell.view, 'stage', 'a paste on another view is a navigation too');
  assert.ok(calls.some(c => c.kind === 'focus'), 'one item opens on itself');
});

test('a batch lands and stays listed', async () => {
  const { shell, calls, fire } = wired({ view: 'map', added: [{ name: 'a.md' }, { name: 'b.md' }] });
  await fire('paste', evt());
  assert.equal(shell.view, 'stage');
  assert.equal(calls.some(c => c.kind === 'focus'), false,
    'a modal over a set nobody has seen listed is the wrong first look at it');
});

test('a paste that stages nothing does not yank the view', async () => {
  const { shell, fire } = wired({ view: 'map', added: [] });
  await fire('paste', evt());
  assert.equal(shell.view, 'map');
});

test('on the Stage a paste stages in place: no route, no auto-open', async () => {
  const { shell, calls, fire } = wired({ view: 'stage' });
  await fire('paste', evt());
  assert.equal(calls.filter(c => c.kind === 'takePaste').length, 1, 'it is still taken');
  assert.equal(shell.view, 'stage');
  assert.equal(calls.some(c => c.kind === 'focus'), false, 'you are already looking at the bench');
});

test('a paste into a form field keeps its native paste', async () => {
  for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' },
                        { tagName: 'DIV', isContentEditable: true }]) {
    const { shell, fire } = wired({ view: 'map' });
    const e = evt(target);
    await fire('paste', e);
    assert.equal(e.defaultPrevented, false, `${target.tagName} lost its own paste`);
    assert.equal(shell.view, 'map', 'and typing into a field is not a navigation');
  }
});

test('off the Stage a field paste is left entirely alone, offers included', async () => {
  const { calls, fire } = wired({ view: 'map' });
  await fire('paste', evt({ tagName: 'INPUT' }));
  assert.equal(calls.length, 0,
    'recording an offer onto a bar that is off screen tells the reader nothing');
});

test('on the Stage a field paste still offers what the field cannot hold', async () => {
  const { calls, fire } = wired({ view: 'stage' });
  await fire('paste', evt({ tagName: 'INPUT' }));
  const c = calls.find(x => x.kind === 'takePaste');
  assert.ok(c, 'the clipboard is read on the way past');
  assert.equal(c.opts.editable, true, 'and the intake is told the target was a field');
});

test('a paste with no clipboardData is declined rather than thrown on', async () => {
  const { calls, fire } = wired({ view: 'map' });
  await fire('paste', evt({ tagName: 'DIV' }, null));
  assert.equal(calls.length, 0);
});

// ---- the drop, which shipped in PR #443 with no shell test of its own ----

const dragEvt = (types = ['Files'], target = { tagName: 'DIV' }) => {
  const e = { dataTransfer: { types, items: [], files: [] }, target, relatedTarget: null, defaultPrevented: false };
  e.preventDefault = () => { e.defaultPrevented = true; };
  return e;
};

test('a drag of files raises the cue and makes the window a drop target', async () => {
  const { shell, fire } = wired();
  await fire('dragenter', dragEvt());
  assert.equal(shell._appDrag, 1, 'the cue is up');
  const over = dragEvt();
  await fire('dragover', over);
  assert.equal(over.defaultPrevented, true,
    'without a prevented dragover there is no drop event at all');
});

test('a drag carrying nothing worth staging never raises the cue', async () => {
  const { shell, fire } = wired();
  await fire('dragenter', dragEvt(['application/x-moz-file-promise']));
  assert.equal(shell._appDrag, 0);
});

test('a drag over a form field keeps its native drop', async () => {
  const { shell, fire } = wired();
  await fire('dragenter', dragEvt(['Files'], { tagName: 'INPUT' }));
  assert.equal(shell._appDrag, 0, 'dropping a path into the destination box is a real thing to do');
});

test('leaving the window clears the counter rather than decrementing it', async () => {
  const { shell, fire } = wired();
  await fire('dragenter', dragEvt());
  await fire('dragenter', dragEvt());
  assert.equal(shell._appDrag, 2, 'nested enters count');
  await fire('dragleave', { relatedTarget: {} });
  assert.equal(shell._appDrag, 1);
  await fire('dragleave', { relatedTarget: null });
  assert.equal(shell._appDrag, 0,
    'an unbalanced enter/leave pair must not leave the cue standing');
});

test('a drop the Stage view already handled is not staged twice', async () => {
  const { calls, fire } = wired({ view: 'stage' });
  const e = dragEvt();
  e.preventDefault();          // the Stage view's own root, on the way up
  await fire('drop', e);
  assert.equal(calls.length, 0, 'defaultPrevented is the tell');
});

test('a drop anywhere else stages, routes, and opens the one file', async () => {
  const { shell, calls, fire } = wired({ view: 'map' });
  await fire('drop', dragEvt());
  assert.ok(calls.some(c => c.kind === 'takeDrop'));
  assert.equal(shell.view, 'stage');
  assert.ok(calls.some(c => c.kind === 'focus'));
});

// ---- the tap-driven paste, which is the phone's whole intake ----
//
// wireAppPaste's window listener is worth nothing on iOS (Safari raises no
// paste event without a focused editable), so a tap is the only route there,
// and its REPORTING is the part worth pinning: what it says when it takes
// nothing has to distinguish "there was nothing to take" from "the read
// failed", because the first is the ordinary case and the second is a bug.

function withClipboard(result, { view = 'map' } = {}) {
  const { shell, toasts, win } = makeShell({ browserStore: { repo: '' }, win: { addEventListener: () => {} } });
  const focused = [];
  win.StageIntake = {
    takeClipboard: async () => {
      if (result instanceof Error) throw result;
      return { added: result, offers: [] };
    },
    focus: (it) => focused.push(it),
  };
  shell.view = view;
  shell.syncUrl = () => {};
  return { shell, toasts, focused };
}

test('an empty clipboard is reported as information, not as an error', async () => {
  const { shell, toasts } = withClipboard([]);
  await shell.pasteAnywhere();
  assert.equal(toasts.length, 1);
  assert.notEqual(toasts[0].cls, 'alert-error',
    'tapping Paste before copying anything is the ordinary case, and red reads as a broken button');
  assert.equal(toasts[0].cls, 'alert-info');
  assert.equal(shell.view, 'map', 'and taking nothing is not a navigation');
});

test('the empty message says what happened, not why', async () => {
  const { toasts, shell } = withClipboard([]);
  await shell.pasteAnywhere();
  assert.match(toasts[0].msg, /clipboard/i);
  // io.pasteItems() returns an empty list both for an empty clipboard and for a
  // read the platform refused without throwing, and from here the two are
  // indistinguishable. So the wording must not claim the clipboard was empty.
  assert.doesNotMatch(toasts[0].msg, /is empty/i);
});

test('a read that throws is still an error, and keeps the red', async () => {
  const { shell, toasts } = withClipboard(new Error('the clipboard kit is not loaded yet'));
  await shell.pasteAnywhere();
  assert.equal(toasts[0].cls, 'alert-error',
    'a failure that a fix could remove is exactly what the error colour is for');
  assert.match(toasts[0].msg, /not loaded/);
});

test('a paste that lands routes to the Stage and opens the one item', async () => {
  const { shell, focused } = withClipboard([{ name: 'one.csv' }]);
  await shell.pasteAnywhere();
  assert.equal(shell.view, 'stage');
  assert.equal(focused.length, 1);
});

test('a second tap while the first is still reading is dropped', async () => {
  const { shell } = withClipboard([{ name: 'one.csv' }]);
  const a = shell.pasteAnywhere();
  const b = shell.pasteAnywhere();
  await Promise.all([a, b]);
  assert.equal(shell.view, 'stage');
});

// ---- the FAB's paste, from this side ----
//
// The app filled the launcher's menu with its own paste through the `menu`
// contract from 2026-08-19 to 2026-08-22, and then the row was promoted into
// the fab so it would appear on every page rather than only on the one already
// showing a Stage. Two obligations moved here with it, and both fail silently
// if dropped:
//
//   THE METHOD IS THE DECLARATION. The fab finds a document that can show the
//   Stage by scanning for a mounted component exposing pasteAnywhere. Rename
//   it and every paste on this app silently starts parking itself and
//   navigating to a page it is already on.
//
//   THE FAR END OF THE HANDOFF IS HERE. A paste taken anywhere else arrives as
//   parked flavors, and nothing else on this page reads them.

test('the shell no longer contributes a menu row', () => {
  const { shell } = makeShell({ browserStore: { repo: '' } });
  assert.equal(shell.menu, undefined,
    'the paste is built into the fab now; a contributed copy would show twice');
});

test('pasteAnywhere survives as the fab handle, since it is what the scan looks for', async () => {
  const { shell } = withClipboard([{ name: 'one.csv' }]);
  assert.equal(typeof shell.pasteAnywhere, 'function');
  await shell.pasteAnywhere();
  assert.equal(shell.view, 'stage', 'one implementation, and the fab is one of its triggers');
});

test('the long press is still the only chrome route: no second button in the markup', () => {
  // The header carried one for a day and it came out (2026-08-19), leaving the
  // menu row as the phone's only intake. Asserted because the failure mode is
  // silent in both directions: a re-added button nobody decided on, or the
  // handle the fab reaches for quietly renamed.
  assert.equal(/<button @click="pasteAnywhere\(\)"/.test(page), false,
    'a paste button in the chrome is a decision, not something to drift back in');
  assert.match(page, /async pasteAnywhere\(\)/,
    'and the call the fab scans for must still be here');
});

// ---- the parked paste arriving ----

// A shell with the handoff kit stubbed at the shape drainStageHandoff uses,
// plus the intake's flavor fold. What the kit itself does with storage, TTL and
// blobs is stage-handoff.test.mjs's subject.
function withParked(flavors, { added = [{ name: 'one.md' }], view = 'landing' } = {}) {
  const { shell, toasts, win } = makeShell({ browserStore: { repo: '' }, win: { addEventListener: () => {} } });
  const focused = [];
  const calls = [];
  win.StageHandoff = { drain: () => flavors };
  win.StageIntake = {
    takeFlavors: async (fl) => { calls.push(fl); return { added, offers: [] }; },
    focus: (it) => focused.push(it),
  };
  shell.view = view;
  shell.syncUrl = () => {};
  return { shell, toasts, focused, calls, win };
}

test('a parked paste is folded in and the Stage is opened on it', async () => {
  const { shell, focused, calls } = withParked([{ kind: 'text', type: 'text/plain', text: 'x' }]);
  await shell.drainStageHandoff();
  assert.equal(calls.length, 1, 'the flavors reach the intake, which is what decides what they become');
  assert.equal(shell.view, 'stage');
  assert.equal(focused.length, 1, 'one arrival opens on itself, the same as a paste taken here');
});

test('nothing parked is silence: no toast, no navigation', async () => {
  const { shell, toasts, calls } = withParked([]);
  await shell.drainStageHandoff();
  assert.deepEqual(calls, []);
  assert.equal(shell.view, 'landing', 'every ordinary boot runs this and must not be moved by it');
  assert.equal(toasts.length, 0);
});

test('a batch arrives listed rather than opening one of itself', async () => {
  const { shell, focused } = withParked([{ kind: 'text', type: 'text/plain', text: 'x' }],
                                        { added: [{ name: 'a.md' }, { name: 'b.md' }] });
  await shell.drainStageHandoff();
  assert.equal(shell.view, 'stage');
  assert.equal(focused.length, 0);
});

test('a fold that throws reports rather than taking the boot down with it', async () => {
  const { shell, toasts, win } = withParked([{ kind: 'text', type: 'text/plain', text: 'x' }]);
  win.StageIntake.takeFlavors = async () => { throw new Error('bad payload'); };
  await shell.drainStageHandoff();
  assert.equal(shell.view, 'landing', 'a failed arrival must not strand the boot on an empty Stage');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].cls, 'alert-error');
});
