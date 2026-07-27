// fab-subject-actions.test.mjs — the drawer collects page actions from BOTH
// sides of a toss, attributes each, and invokes a subject-side one correctly.
//
// This is the third time this area has been reasoned about rather than
// measured, so the gate gets a test that fails if it comes back: collecting
// shell-side only made the drawer name the subject in its header and then offer
// the renderer's buttons underneath it, unmarked, and it is what kept
// toss-render's own actions un-previewable.
//
// The cross-window parts (clipboard focus, navigation, realm-crossing throws)
// are real-browser facts; jsdom can only pin the shape. tools/test/
// subject-actions.mjs proves them against Chromium at depth 2.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, tick } from './bootstrap.mjs';

const { window } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="shellcontrib"></div>
    <div id="shellhost"></div>
    <iframe id="frame"></iframe>
  </body></html>`,
});

// A toss the fab can adopt, stamped before the mount the way toss-render does.
window.__tossSubject = { repo: 'mehrlander/web-tools', ref: 'some-branch', path: 'pages/subject.html' };

const Alpine = await startAlpine(window, ['lib/alpineComponents/fab.js']);
const doc = window.document;

// Two contributors with the SAME bare label, which is the case attribution
// exists for: in a real nested toss both sides say "Link".
Alpine.data('shellThing', () => ({
  description: 'the renderer',
  actions: [{ label: 'Link', group: 'Copy', desc: 'Shell link.', run: () => 'shell ran' }],
}));

let subjectRuns = 0;
Alpine.data('subjectThing', () => ({
  description: 'the page being viewed',
  actions: [
    { label: 'Link', group: 'Copy', desc: 'Subject link.', run: () => { subjectRuns++; return 'subject ran'; } },
    { label: 'Out', group: 'Open', desc: 'Bust out.', run: () => ({ nav: 'https://example.test/out' }) },
    { label: 'Boom', desc: 'Throws.', run: () => { throw new Error('subject exploded'); } },
  ],
}));

// The subject document, reached the way detect() reaches it: through
// window.__tossFrame. A real jsdom iframe gives a real contentWindow /
// contentDocument pair, which is the same door address mode opens.
const frame = doc.getElementById('frame');
const subjectDoc = frame.contentDocument;
subjectDoc.body.innerHTML = '<div x-data="subjectThing" id="subj"></div>';
frame.contentWindow.Alpine = Alpine;
let focusCalls = 0;
frame.contentWindow.focus = () => { focusCalls++; };
window.__tossFrame = frame;
Alpine.initTree(subjectDoc.body);

// The shell's own contributor, mounted after registration the same way (a
// component in the initial HTML would init before Alpine.data ran).
doc.getElementById('shellcontrib').innerHTML = '<div x-data="shellThing"></div>';
Alpine.initTree(doc.getElementById('shellcontrib'));

doc.getElementById('shellhost').innerHTML = '<div x-data="fab()" data-path="pages/toss-render.html"></div>';
Alpine.initTree(doc.getElementById('shellhost'));
await tick(3);
const fab = Alpine.$data(doc.getElementById('shellhost').firstElementChild);
fab.detect();

test('adopted the toss, so both sides are in scope', () => {
  assert.equal(fab.viaToss, true);
  assert.equal(fab.subjectReached, true);
});

test('actions are collected from the subject, not only the shell', () => {
  const subj = fab.groups.find(g => g.key === 'page:subjectThing');
  const shell = fab.groups.find(g => g.key === 'shell:shellThing');
  assert.ok(subj, 'subject group scanned');
  assert.ok(shell, 'shell group scanned');
  assert.equal(subj.actions.length, 3, 'subject actions collected (the gate)');
  assert.equal(shell.actions.length, 1, 'shell actions still collected');
});

test('every action says which side it came from', () => {
  const byLabel = l => fab.pageActions.filter(a => a.label === l);
  const links = byLabel('Link');
  assert.equal(links.length, 2, 'both same-named actions survive; neither swaps the other out');
  // Array.from, not .map: these arrays are minted in the jsdom realm and
  // deepStrictEqual compares prototypes.
  assert.deepEqual(Array.from(links, a => a.side).sort(), ['shell', 'subject']);
  assert.ok(links.every(a => a.from));
});

test('attribution names the two windows differently inside a toss', () => {
  const subj = fab.pageActions.find(a => a.side === 'subject');
  const shell = fab.pageActions.find(a => a.side === 'shell');
  assert.match(fab.actionOrigin(subj), /page you are viewing/);
  assert.match(fab.actionOrigin(shell), /this renderer/);
  assert.notEqual(fab.actionOrigin(subj), fab.actionOrigin(shell));
});

test('outside a toss the wording stays plain', () => {
  const wasToss = fab.viaToss;
  fab.viaToss = false;
  assert.match(fab.actionOrigin({ from: 'thing', side: 'shell' }), /Contributed by this page \(thing\)/);
  fab.viaToss = wasToss;
});

test('the grid carries side through, so the template can mark the odd one out', () => {
  const copy = fab.takeGrid.find(g => g.kind === 'Copy');
  const contributed = copy.items.filter(i => i.kind === 'page');
  assert.equal(contributed.length, 2);
  assert.deepEqual(Array.from(contributed, i => i.side).sort(), ['shell', 'subject']);
  assert.match(contributed.find(i => i.side === 'shell').desc, /this renderer/);
});

test('running a subject action focuses its window first', async () => {
  const before = focusCalls;
  const a = fab.takeGrid.find(g => g.kind === 'Copy').items.find(i => i.side === 'subject');
  await fab.runAction(a);
  assert.equal(focusCalls, before + 1, 'frame focused before invoking (clipboard needs it)');
  assert.equal(subjectRuns, 1, 'the subject closure actually ran');
  assert.equal(fab.outMsg, 'subject ran');
  assert.equal(fab.outError, '');
});

test('running a shell action does not touch the frame', async () => {
  const before = focusCalls;
  const a = fab.takeGrid.find(g => g.kind === 'Copy').items.find(i => i.side === 'shell');
  await fab.runAction(a);
  assert.equal(focusCalls, before, 'no focus steal for an action already in this window');
  assert.equal(fab.outMsg, 'shell ran');
});

test('a subject throw is reported as the subject\'s, not the drawer\'s', async () => {
  const a = fab.takeGrid.flatMap(g => g.items).find(i => i.label === 'Boom');
  await fab.runAction(a);
  assert.match(fab.outError, /^In subjectThing: /);
  assert.match(fab.outError, /subject exploded/);
});

test('a { nav } return is not flashed as a message', async () => {
  // The navigation itself is a real-browser fact (jsdom has no navigation);
  // what is pinned here is that the FAB recognises the intent instead of
  // treating the object as feedback, which is what let show-repo's bust-out
  // stop navigating its own frame.
  fab.outMsg = ''; fab.outError = '';
  const a = fab.takeGrid.flatMap(g => g.items).find(i => i.label === 'Out');
  assert.ok(a, 'the nav action reached the grid');
  await fab.runAction(a);
  assert.equal(fab.outMsg, '', 'nav intent consumed, not shown as text');
});
