// fab-notes.test.mjs — the drawer's fourth tab: the annotator's review surface,
// moved out of a modal of its own and into the sidebar.
//
// The seam is the whole subject. kits/annotate.js owns the notes, the anchoring
// and the on-page card; this tab owns reading and editing the set. They are
// joined by two window events and nothing else, which is what lets the kit run
// on a page with no drawer and the drawer render notes taken in a subject frame
// it does not own.
//
// Three things are worth pinning, and each has already been a bug shape
// somewhere in this repo:
//
//   THE TAB IS A VIEW, NOT A SECOND STORE. annItems must hold the kit's own
//   objects. A copy would drift the moment a note is edited on the page, and
//   an x-for keyed by id over fresh objects would rebuild every card, which is
//   how an in-place editor loses the keystroke being typed.
//
//   IT RE-READS ON ANNOUNCEMENT, NOT ON POLL. A note added by selecting text
//   has to appear here with no tab reopened.
//
//   OPENING IS NOT ENABLING. Looking at the tab must not arm a selection
//   listener or put a card on someone's page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, tick, loadKit } from './bootstrap.mjs';

const { window } = makeWindow({
  html: `<!doctype html><html><body>
    <article id="art"><p id="p1">The quick brown fox jumps over the lazy dog.</p></article>
  </body></html>`,
});
const doc = window.document;

// The kit registers window.Annotate as a side effect; the component reads it
// through the same global a page's gh.load chain would leave behind.
loadKit('annotate.js', { window });
const Alpine = await startAlpine(window, [
  'lib/kits/guide-render.js', 'lib/alpineComponents/path-picker.js', 'lib/alpineComponents/fab.js',
]);
const A = window.Annotate;

async function mountFab() {
  const host = doc.createElement('div');
  host.innerHTML = '<div x-data="fab()" data-repo="mehrlander/web-tools" data-path="pages/annotate.html"></div>';
  doc.body.appendChild(host);
  Alpine.initTree(host);
  await tick(3);
  return Alpine.$data(host.firstElementChild);
}

const quote = (exact) => ({ type: 'text', quote: { exact, prefix: '', suffix: '' },
                            selector: '#p1', span: { start: 4, end: 4 + exact.length } });

test('the tab reads the live set, and reads the kit’s own objects', async () => {
  const d = await mountFab();
  A.enable({ doc, subject: { title: 'docs/sample.md', url: 'https://example.test/s' } });
  A.clear();

  const one = A.add(quote('quick'), 'tighten this');
  await tick();
  assert.equal(d.annItems.length, 1, 'the add announced itself; nothing polled');
  // Alpine wraps reactive state in a Proxy, so identity is checked through the
  // raw handle. The claim is what matters: the tab holds the kit's item, not a
  // snapshot of it. A snapshot drifts the moment a note is edited on the page,
  // and rebuilds the card being typed into.
  assert.equal(Alpine.raw(d.annItems[0]), one,
    'the same object, not a copy: a copy drifts and forces a card rebuild');
  assert.equal(d.annOn, true);
  assert.equal(d.annSubject, 'docs/sample.md', 'the head names what is being annotated');

  // The row's two derived strings, which the template binds.
  assert.equal(d.annHead(one), '“quick”');
  assert.equal(d.annAddr(one), '#p1 [4-9]', 'the DOM address, through the kit’s own formatter');

  A.add({ type: 'element', selector: '#art', excerpt: 'The quick brown fox' }, 'promote');
  await tick();
  assert.equal(d.annItems.length, 2);
  assert.match(d.annHead(d.annItems[1]), /^⌖ /, 'a unit target reads as a unit');
});

test('editing writes through to the kit, and selection is shared both ways', async () => {
  const d = await mountFab();
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  const it = A.add(quote('brown'), 'first');
  await tick();

  d.annEdit(it.id, 'first, rewritten in the drawer');
  assert.equal(A.items[0].note, 'first, rewritten in the drawer', 'the kit is the store');
  assert.ok(A.items[0].editedAt, 'and dates the edit');

  // Selecting from the drawer selects in the kit, which is what paints the
  // highlight on the page.
  d.annSelect(it.id);
  await tick();
  assert.equal(A.selected.id, it.id);
  assert.equal(d.annSel, it.id, 'and comes back through the announcement');

  // Tapping the selected row again lets go. A focus does not, since the tap
  // that opens a keyboard is not a request to deselect.
  d.annSelect(it.id);
  await tick();
  assert.equal(A.selected, null);
  d.annSelect(it.id, false);
  await tick();
  assert.equal(A.selected.id, it.id);
  d.annSelect(it.id, false);
  await tick();
  assert.equal(A.selected.id, it.id, 'a focus never toggles off');

  d.annRemove(it.id);
  await tick();
  assert.equal(d.annItems.length, 0);
});

test('the format tabs render exactly what Copy puts on the clipboard', async () => {
  const d = await mountFab();
  A.enable({ doc, subject: { title: 'docs/sample.md', url: 'https://example.test/s' } });
  A.clear();
  A.add(quote('quick'), 'tighten');
  await tick();

  assert.equal(d.annOut, '', 'nothing is serialized while the Notes tab is showing');

  d.annSetTab('md');
  assert.equal(d.annOut, A.toMarkdown(), 'the same string copy() would hand over');
  assert.ok(d.annOut.includes('Path: `#p1 [4-9]`'));

  d.annSetTab('json');
  assert.equal(d.annOut, JSON.stringify(A.toJSON(), null, 2));

  // An edit made while a format tab is open refreshes it, so the pane never
  // shows a serialization of a set that has moved on.
  A.update(A.items[0].id, 'tightened');
  await tick();
  assert.ok(d.annOut.includes('tightened'));
});

test('opening the tab is not enabling the annotator, and turning it off keeps the set', async () => {
  const d = await mountFab();
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  A.add(quote('lazy'), 'kept');
  await tick();

  d.annStop();
  assert.equal(d.annOn, false, 'the card is gone and the selection listener is disarmed');
  assert.equal(d.annSubject, 'Not annotating', 'and it stops naming a document nobody is marking');
  // The notes are not the annotator. Dropping them on an Off tap would make the
  // button destructive, which is not what a mode switch should be.
  assert.equal(d.annItems.length, 1, 'the set survives the toggle');

  await d.annOpen();
  assert.equal(d.annOn, false, 'and merely looking at the tab arms nothing and marks no page');
  A.clear();
});

test('the kit’s Review request opens this tab, and claims it', async () => {
  const d = await mountFab();
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  d.open = false;
  d.activeTab = 'render';

  A.review();
  await tick();
  assert.equal(d.open, true, 'the drawer opens');
  assert.equal(d.activeTab, 'notes');
  // Claimed, so the kit does not fall back to saying there is nowhere to look.
  assert.ok(!/No drawer/.test(A._state.status.textContent || ''));
  A.disable();
});
