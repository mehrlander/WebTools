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
import { makeShell } from './show-repo-shell.mjs';

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
