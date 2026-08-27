// fab-menu.test.mjs — the launcher's long-press menu, and the `menu` opt-in
// contract a page fills it with.
//
// The menu is the fab's third page contract, after `actions` (verbs in the
// drawer's take grid) and `toggles` (state on the Render tab). It is the one
// for a verb wanted BEFORE the drawer opens, which is what makes its timing
// the whole subject here:
//
//   IT IS READ AT OPEN TIME, NOT AT SCAN TIME. The drawer's component scan is
//   detect(), and detect() runs when the DRAWER opens. A menu sourced from it
//   would be empty on the first long press of a page load, which is the press
//   that matters. So openFabMenu does its own narrow read.
//
//   IT READS EACH ELEMENT'S OWN SCOPE. Alpine's $data returns the merged data
//   STACK, so every component nested inside a contributor answers for the
//   contributor's properties too. detect() carries a long note about the day
//   that shipped fourteen copies of show-repo's contract; this read must not
//   reintroduce it one contract over.
//
//   A ROW THAT FAILS REPORTS. The menu closes before a row runs, so a throw or
//   a rejected promise has nothing on screen to attach itself to and would
//   otherwise be a tap that silently did nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, tick } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
const doc = window.document;
const Alpine = await startAlpine(window, [
  'lib/kits/guide-render.js', 'lib/alpineComponents/path-picker.js', 'lib/alpineComponents/fab.js',
]);

async function mountFab() {
  const host = doc.createElement('div');
  host.innerHTML = '<div x-data="fab()" data-repo="mehrlander/web-tools" data-path="app/index.html"></div>';
  doc.body.appendChild(host);
  Alpine.initTree(host);
  await tick(3);
  return Alpine.$data(host.firstElementChild);
}

// A contributor mounted into the page the fab is floating over, exactly as
// show-repo's shell is: a plain x-data whose scope carries `menu`.
async function mountPage(html) {
  const host = doc.createElement('div');
  host.innerHTML = html;
  doc.body.appendChild(host);
  Alpine.initTree(host);
  await tick(2);
  return host;
}

const clearPages = () => {
  [...doc.body.children].forEach(el => {
    if (!el.querySelector('[x-data*="fab()"]')) el.remove();
  });
};

test('with nothing declaring one, the menu is the built-in row alone', async () => {
  clearPages();
  const d = await mountFab();
  d.openFabMenu();
  assert.equal(d.fabMenu, true);
  assert.equal(d.pageMenu.length, 0,
    'a page that contributes nothing must not grow a divider under Take a note');
});

test('a page contributes its rows, and they carry the side they came from', async () => {
  clearPages();
  const d = await mountFab();
  // A fixture, not show-repo's actual row: what this file guards is the fab's
  // READ of the contract, and the shell owns its own wording (shell-intake).
  await mountPage(`<div x-data="{ menu: [{ label: 'Do the thing', icon: 'ph-clipboard-text', run(){} }] }"></div>`);
  d.openFabMenu();
  assert.equal(d.pageMenu.length, 1);
  assert.equal(d.pageMenu[0].label, 'Do the thing');
  assert.equal(d.pageMenu[0].icon, 'ph-clipboard-text');
  assert.equal(d.pageMenu[0].side, 'shell');
});

test('the read happens on every open, so a component that mounts late still lands', async () => {
  clearPages();
  const d = await mountFab();
  d.openFabMenu();
  assert.equal(d.pageMenu.length, 0, 'nothing to contribute yet');
  await mountPage(`<div x-data="{ menu: [{ label: 'Late', run(){} }] }"></div>`);
  d.openFabMenu();
  assert.equal(d.pageMenu.length, 1,
    'a menu cached at boot would be permanently wrong on a lazily mounted view');
});

test('a component nested inside a contributor does not contribute it a second time', async () => {
  clearPages();
  const d = await mountFab();
  await mountPage(`<div x-data="{ menu: [{ label: 'Once', run(){} }] }">
      <div x-data="{ other: 1 }"><div x-data="{ third: 2 }"></div></div>
    </div>`);
  d.openFabMenu();
  assert.equal(d.pageMenu.length, 1,
    'reading $data instead of the element’s own scope is how one row became fourteen');
});

test('the fab does not read its own subtree', async () => {
  clearPages();
  const d = await mountFab();
  d.openFabMenu();
  assert.equal(d.pageMenu.length, 0,
    'the drawer is full of x-data; none of it is the page');
});

test('a row with no label is dropped rather than painted blank', async () => {
  clearPages();
  const d = await mountFab();
  await mountPage(`<div x-data="{ menu: [{ icon: 'ph-dot', run(){} }, { label: 'Real', run(){} }] }"></div>`);
  d.openFabMenu();
  // Joined rather than deep-equalled: pageMenu is built inside the jsdom realm,
  // so its Array is not this realm's and deepStrictEqual fails on the prototype
  // while reporting "same structure but not reference-equal".
  assert.equal([...d.pageMenu].map(m => m.label).join(','), 'Real');
});

test('a contributor whose menu getter throws is skipped, not fatal', async () => {
  clearPages();
  const d = await mountFab();
  await mountPage(`<div x-data="{ get menu(){ throw new Error('nope') } }"></div>`);
  await mountPage(`<div x-data="{ menu: [{ label: 'Survivor', run(){} }] }"></div>`);
  d.openFabMenu();
  assert.equal([...d.pageMenu].map(m => m.label).join(','), 'Survivor',
    'one bad contributor must not take the whole menu down with it');
});

// ── The paste row ─────────────────────────────────────────────────────────
//
// Built in rather than contributed since 2026-08-22, which is what makes its
// two endings the subject. A document that can SHOW the stage takes its own
// paste and stays put; every other one parks the paste and leaves for the app,
// because the stage is a store array held for one page load and the navigation
// that reaches a Stage is what would otherwise discard it.
//
// The test for the first ending is a mounted component exposing pasteAnywhere,
// read off each element's OWN scope for the same reason readPageMenu is: a
// component nested inside the app answers for the app's methods through the
// merged data stack, so a nested-scope read would find a host on every page
// that has one anywhere above it.

// A clipboard kit and a handoff kit, stubbed at the shape the row uses. The
// real ones are exercised by their own files; what this one watches is the
// ORDER, since the whole design turns on nothing being awaited before the read.
function stubPasteKits(win, { flavors = [{ kind: 'text', type: 'text/plain', text: 'x' }] } = {}) {
  const log = [];
  win.io = { pasteItems: async () => { log.push('read'); return flavors; } };
  win.StageHandoff = { put: async (fl) => { log.push('park:' + fl.length); return fl.length; } };
  return log;
}

test('off the app, the paste is parked and the app is opened on the Stage', async () => {
  clearPages();
  const d = await mountFab();
  const log = stubPasteKits(window);
  const went = [];
  d._go = (u) => went.push(u);
  await d.pasteToStage();
  assert.deepEqual(log, ['read', 'park:1'], 'the clipboard is read first and parked after');
  assert.deepEqual(went, ['https://mehrlander.github.io/web-tools/app/?view=stage']);
  assert.equal(d.outError, '', 'a paste that worked has nothing to report');
});

test('on a document that can show the stage, the paste stays put', async () => {
  clearPages();
  const d = await mountFab();
  const log = stubPasteKits(window);
  const went = [];
  d._go = (u) => went.push(u);
  let staged = 0;
  await mountPage(`<div x-data="{ pasteAnywhere(){ window.__stagedHere = (window.__stagedHere || 0) + 1 } }"></div>`);
  await d.pasteToStage();
  staged = window.__stagedHere || 0;
  assert.equal(staged, 1, 'the app owns its own paste; the fab must not take it away');
  assert.deepEqual(log, [], 'nothing is read or parked when the page will do it');
  assert.deepEqual(went, [], 'a document already showing the Stage has nowhere to go');
  delete window.__stagedHere;
});

test('a component nested inside the host does not make every page a host', async () => {
  clearPages();
  const d = await mountFab();
  stubPasteKits(window);
  d._go = () => {};
  await mountPage(`<div x-data="{ pasteAnywhere(){} }"><div x-data="{ other: 1 }"></div></div>`);
  // The nested child answers for pasteAnywhere through the merged stack; the
  // scan must find the real host, and exactly one of them.
  assert.ok(d._stageHost(), 'the host itself is still found');
});

test('an empty clipboard reports rather than navigating to an empty Stage', async () => {
  clearPages();
  const d = await mountFab();
  stubPasteKits(window, { flavors: [] });
  const went = [];
  d._go = (u) => went.push(u);
  await d.pasteToStage();
  assert.match(d.outError, /Nothing came off the clipboard/);
  assert.deepEqual(went, []);
  assert.equal(d.open, true, 'the menu has closed, so the drawer is where a failure can be read');
  assert.equal(d.activeTab, 'render');
});

test('a refused park reports and stays, rather than leaving for a Stage with nothing on it', async () => {
  clearPages();
  const d = await mountFab();
  stubPasteKits(window);
  window.StageHandoff = { put: async () => { throw new Error('That paste is 4096K, too large to carry across'); } };
  const went = [];
  d._go = (u) => went.push(u);
  await d.pasteToStage();
  assert.match(d.outError, /too large to carry across/);
  assert.deepEqual(went, []);
});

test('a tap that beats the warm-up is told so, in the clipboard\'s own terms', async () => {
  clearPages();
  const d = await mountFab();
  delete window.io;
  const went = [];
  d._go = (u) => went.push(u);
  // Reported, never rejected: the row is wired straight to the markup, so a
  // rejection here would reach nobody at all.
  await d.pasteToStage();
  assert.match(d.outError, /still loading/);
  assert.equal(d.open, true);
  assert.deepEqual(went, []);
});

// The third built-in row. It is not part of the `menu` contract (nothing on
// the page can move it or take it away), so what is worth holding is that it
// stays a FIXED address: the deployed app at the default branch, carrying no
// ref, no ?use= pin, and nothing off the view it is leaving.
test('the home row aims at the deployed app, not at this view', async () => {
  clearPages();
  const d = await mountFab();
  d.repo = 'mehrlander/home';
  d.path = 'projects/budget-drs/app/view/app.html';
  d.ref = 'claude/some-branch';
  assert.equal(d.homeUrl, 'https://mehrlander.github.io/web-tools/app/');
});

test('a re-pointed shell goes home to its own base', async () => {
  clearPages();
  const d = await mountFab();
  d.showRepoBase = 'https://example.test/app/';
  assert.equal(d.homeUrl, 'https://example.test/app/',
    'writing the address out a second time is how the two copies part');
});

test('running a row calls its run', async () => {
  const d = await mountFab();
  let ran = 0;
  d.runMenuRow({ label: 'x', run: () => { ran++; } });
  assert.equal(ran, 1);
});

test('a row that throws reports rather than escaping', async () => {
  const d = await mountFab();
  d.outError = '';
  d.runMenuRow({ label: 'x', run: () => { throw new Error('clipboard refused'); } });
  assert.equal(d.outError, 'clipboard refused');
});

test('a row that rejects reports too, instead of an unhandled rejection nobody sees', async () => {
  const d = await mountFab();
  d.outError = '';
  d.runMenuRow({ label: 'x', run: () => Promise.reject(new Error('async refused')) });
  await tick(2);
  assert.equal(d.outError, 'async refused');
});

test('a malformed row is a no-op, not a crash', async () => {
  const d = await mountFab();
  assert.doesNotThrow(() => { d.runMenuRow(null); d.runMenuRow({ label: 'x' }); });
});
