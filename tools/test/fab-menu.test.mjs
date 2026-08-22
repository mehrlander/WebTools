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
  // READ of the contract, and the shell owns its own wording (show-repo-intake).
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

// The second built-in row. It is not part of the `menu` contract (nothing on
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
