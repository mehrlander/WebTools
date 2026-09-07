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
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeWindow, startAlpine, tick } from './bootstrap.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
const doc = window.document;
const Alpine = await startAlpine(window, [
  // The declaration pair rides along because the launcher menu asks what the
  // page declared, and a stub would let the fab agree with a shape the kits do
  // not actually write. src-doc first: md-doc declares through it. Loading them
  // costs nothing, since declare and declaredIn touch no marked, which md-doc
  // only reads inside the parsing paths.
  'lib/kits/src-doc.js', 'lib/kits/md-doc.js',
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

// Wait for an x-show binding to settle, bounded. Alpine applies effects on its
// own schedule and a test that counts flushes is measuring the scheduler.
const shown = async (get) => {
  for (let i = 0; i < 20 && (!get() || get().style.display === 'none'); i++) await tick(1);
  return get();
};

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
    'a page that contributes nothing must not grow a divider under the aim rows');
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

// ── Raising the menu spends the gesture that raised it ───────────────────────
//
// Both routes to the menu sit on the launcher, and the launcher's other job is
// the drawer. A right-click still delivers pointerdown and pointerup around the
// contextmenu event, so the menu opened and the pointerup behind it read an
// ordinary tap: `fabMenu = false; toggle()`, which closed the menu it had just
// raised and left the drawer open instead. The long press already set a flag
// for exactly this; only the right-click did not.

test('a right-click raises the menu and does not also toggle the drawer', async () => {
  const d = await mountFab();
  d.open = false;
  d.onDown({ clientX: 0, clientY: 0, pointerId: 1, currentTarget: { setPointerCapture(){} } });
  d.onContextMenu();
  assert.equal(d.fabMenu, true, 'the menu is up');
  d.onUp({});
  assert.equal(d.fabMenu, true, 'and the pointerup behind it must not close it');
  assert.equal(d.open, false, 'nor open the drawer under it');
});

test('the press it consumed does not eat the NEXT ordinary tap', async () => {
  // The flag is per gesture. onDown clears it, so a contextmenu whose pointerup
  // never arrives (a platform that swallows it) cannot leave the launcher inert.
  const d = await mountFab();
  d.onDown({ clientX: 0, clientY: 0, pointerId: 1, currentTarget: { setPointerCapture(){} } });
  d.onContextMenu();
  // no onUp: the gesture is abandoned
  d.onDown({ clientX: 0, clientY: 0, pointerId: 2, currentTarget: { setPointerCapture(){} } });
  assert.equal(d._lpFired, false, 'a fresh press starts unspent');
  d._clearLongPress();
  d.onUp({});
  assert.equal(d.open, true, 'so the next tap still opens the drawer');
});

// ── The aim rows ───────────────────────────────────────────────────────────
//
// The menu had one note destination and the card had four aims, so three of
// them were two taps further in. Since 2026-09-03 the four aims are icon
// buttons sharing one "Note" row rather than four full-width rows, so their
// labels moved from a visible span to aria-label; rowLabels reads both, and
// these tests check the one aim that is conditional, since the other three
// are unconditional buttons and a template test would only be re-reading the
// template.

const rowLabels = (host) => [
  ...[...host.querySelectorAll('button span')].map(e => e.textContent.trim()),
  ...[...host.querySelectorAll('button[aria-label]')].map(e => e.getAttribute('aria-label')),
].filter(Boolean);

// A declared markdown render, made the way kits/md-doc.js makes one, so the
// fab is reading a real declaration rather than a shape a stub agreed to.
function declareMarkdown() {
  const box = doc.createElement('div');
  doc.body.appendChild(box);
  window.mdDoc.declare(box, {
    addr: { repo: 'mehrlander/web-tools', ref: 'main', path: 'docs/APP.md' },
    sections: [{ index: 0, depth: 1, title: 'The Web Tools app', slug: 'the-web-tools-app' }],
    source: '# The Web Tools app\n',
  });
  return box;
}

test('with nothing declared, the aim rows are the three that work anywhere', async () => {
  clearPages();
  const d = await mountFab();
  d.openFabMenu();
  await tick(2);
  assert.equal(d.annKind, null, 'nothing declared, so no kind');
  const labels = rowLabels(d.$root);
  assert.ok(labels.includes('Note the page'));
  assert.ok(labels.includes('Note an element'));
  assert.ok(labels.includes('Note a region'));
  assert.ok(!labels.some(l => l.startsWith('Note a markdown')),
    'an aim that cannot hit anything must not be offered');
});

test('a declared render puts its own name on the row', async () => {
  clearPages();
  const box = declareMarkdown();
  const d = await mountFab();
  d.openFabMenu();
  await tick(2);
  assert.equal(d.annKind.kind, 'markdown');
  // The label is the registry's, not this file's: docs/routes-kinds.csv owns
  // aim_label and kits/md-doc.js carries it onto the declaration.
  assert.equal(d.annKind.aimLabel, 'Markdown section');
  assert.ok(rowLabels(d.$root).includes('Note a markdown section'));

  // AND ITS OWN GLYPH, for the same reason and from the same row. This file
  // wrote out ph-text-align-left until 2026-09-06, so the next kind to declare
  // would have arrived wearing markdown's icon under its own name.
  assert.equal(d.annKind.aimIcon, 'ph-file-md');
  const btn = [...d.$root.querySelectorAll('button')]
    .find(b => (b.getAttribute('aria-label') || '') === 'Note a markdown section');
  assert.ok(btn, 'the declared aim has a button');
  assert.match(btn.querySelector('i').className, /\bph-file-md\b/,
    'the row draws the glyph the kind declared');
  assert.doesNotMatch(btn.querySelector('i').className, /text-align-left/);
  box.remove();
});

// ── The row raises the card, and it is the only thing that puts it down ─────
//
// The card had a collapsed state that read as putting it away and was not: it
// stayed, smaller, still over the page. Nothing anywhere called disable(), so a
// card raised by a long press could not be put down by one. With the collapsed
// state gone (2026-09-06) this row owns both halves.

test('the hide row appears only where there is a card, and puts it away', async () => {
  clearPages();
  const calls = [];
  let live = false;
  window.Annotate = {
    get enabled() { return live; },
    enable() { live = true; calls.push('enable'); },
    disable() { live = false; calls.push('disable'); },
    notePage() { calls.push('page'); },
  };
  const d = await mountFab();

  d.openFabMenu();
  await tick(2);
  assert.equal(d.annOn, false, 'nothing running, so nothing to put away');
  const off = () => [...d.$root.querySelectorAll('button')]
    .find(b => (b.getAttribute('aria-label') || '') === 'Hide the note card');
  assert.equal(off().style.display, 'none', 'and the row is not offered');

  // ITS OWN ROW, not a fifth glyph on the aims. A fifth key overflowed the
  // w-56 menu and was clipped away entirely, and an X at the end of four aims
  // reads as a fifth aim.
  const aims = d.$root.querySelector('[aria-label="Note the page"]').parentElement;
  assert.ok(!aims.contains(off()), 'it does not ride the aims group');
  assert.match(off().textContent, /Hide notes/, 'it is a labelled row like every other verb here');

  await d.annAim('page');
  assert.deepEqual(calls, ['enable', 'page']);

  d.openFabMenu();
  assert.equal(d.annOn, true, 'a card is up, read at open time');
  // x-show applies on Alpine's own schedule, so this waits for the condition
  // rather than for a fixed number of flushes: asserting after tick(2) passed
  // and then did not, which is a gate that reports the scheduler rather than
  // the behaviour.
  await shown(off);
  assert.notEqual(off().style.display, 'none');
  off().click();
  await tick(2);
  assert.deepEqual(calls, ['enable', 'page', 'disable'], 'and the tap unmounts the card');
  assert.equal(d.annOn, false);
  delete window.Annotate;
});

// The three that are not declared are this component's own, and they have to
// keep matching kits/annotate.js's AIM_ICON glyph for glyph: one aim, one mark,
// whichever control starts it.
test('the built-in aims wear the same glyphs the card does', async () => {
  clearPages();
  const d = await mountFab();
  d.openFabMenu();
  await tick(2);
  const glyph = (label) => {
    const b = [...d.$root.querySelectorAll('button')]
      .find(x => (x.getAttribute('aria-label') || '') === label);
    assert.ok(b, 'no row: ' + label);
    return b.querySelector('i').className;
  };
  assert.match(glyph('Note the page'), /\bph-file\b/);
  assert.match(glyph('Note an element'), /\bph-crosshair-simple\b/);
  assert.match(glyph('Note a region'), /\bph-frame-corners\b/);

  const card = readFileSync(path.join(repoRoot, 'lib/kits/annotate.js'), 'utf8');
  const lit = card.match(/const AIM_ICON = \{([\s\S]*?)\};/);
  assert.ok(lit, 'kits/annotate.js no longer carries AIM_ICON');
  for (const [key, g] of [['page', 'ph-file'], ['pick', 'ph-crosshair-simple'],
                          ['region', 'ph-frame-corners']]) {
    assert.match(lit[1], new RegExp(key + ":\\s*'" + g + "'"),
      'the card and the launcher disagree about the ' + key + ' aim');
  }
});

test('a declaration with no sections offers no row', async () => {
  clearPages();
  const box = doc.createElement('div');
  doc.body.appendChild(box);
  window.mdDoc.declare(box, { addr: {}, sections: [], source: 'no headings here' });
  const d = await mountFab();
  d.openFabMenu();
  await tick(2);
  assert.equal(d.annKind, null,
    'a heading-less markdown file declares, and there is still nothing to aim at');
  box.remove();
});

test('each row arms its own aim on the kit, and turns the annotator on first', async () => {
  clearPages();
  const calls = [];
  window.Annotate = {
    enabled: false,
    enable() { this.enabled = true; calls.push('enable'); },
    notePage(o) { calls.push('page:' + JSON.stringify(o)); },
    startPick(o) { calls.push('pick:' + (o && o.aim ? o.aim : 'el')); },
    startRegion() { calls.push('region'); },
    declaredKind: () => null,
    items: [],
  };
  const d = await mountFab();
  await d.annAim('page');
  await d.annAim('pick');
  await d.annAim('section');
  await d.annAim('region');
  assert.deepEqual(calls,
    ['enable', 'page:{"listen":false}', 'pick:el', 'pick:section', 'region'],
    'the first aim enables and the rest find it already on');
  delete window.Annotate;
});

// The toss case, and the bug the probe fixes. subjectReached is set inside
// detect(), which runs when the DRAWER opens, so before a reader has opened the
// drawer it is still false: a long press over a readable toss annotated the
// shell. Measured in a browser 2026-08-31 (toss-render over data-view, the
// frame holding a declared render, the fab reporting no kind), and held here.
test('over a toss, the subject frame is probed rather than taken on the scan flag', async () => {
  clearPages();
  const framed = doc.implementation.createHTMLDocument('subject');
  const box = framed.createElement('div');
  framed.body.appendChild(box);
  window.mdDoc.declare(box, {
    addr: { repo: 'mehrlander/web-tools', ref: 'main', path: 'docs/APP.md' },
    sections: [{ index: 0, depth: 1, title: 'The Web Tools app', slug: 'the-web-tools-app' }],
    source: '# The Web Tools app\n',
  });
  window.__tossFrame = { contentDocument: framed, contentWindow: { document: framed } };

  const d = await mountFab();
  d.viaToss = true;
  assert.equal(d.subjectReached, false, 'the drawer has not been opened, so no scan has run');
  assert.equal(d._annDoc(), framed, 'the frame is readable now, whatever the scan flag says');
  d.openFabMenu();
  await tick(2);
  assert.equal(d.annKind && d.annKind.kind, 'markdown',
    'the kind is the subject frame\'s, not the shell\'s');

  delete window.__tossFrame;
});

test('a sealed frame falls back to the shell rather than throwing', async () => {
  clearPages();
  window.__tossFrame = { get contentDocument() { throw new Error('cross-origin'); } };
  const d = await mountFab();
  d.viaToss = true;
  assert.equal(d._annDoc(), doc, 'an unreadable subject leaves the shell as all there is');
  assert.equal(d._declaredKind(), null);
  delete window.__tossFrame;
});

