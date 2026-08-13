// fab-text.test.mjs — the drawer's fifth tab: what the page SAYS, as against
// the four tabs about how it was delivered.
//
// Two subjects, and they fail in different ways.
//
//   THE STRIP. Five tabs of icon-plus-label do not fit a 22rem drawer on a
//   phone, so the label rides the selected tab alone. That rule is only safe
//   while the strip is data-driven and every key in it has a pane: a tab with
//   no pane is a dead button that says nothing, and under the active-label
//   rule it does not even carry a name to explain itself.
//
//   THE READ. The pane reports figures it must be able to stand behind, so
//   the honesty gates are the thing worth pinning, not the arithmetic. Two of
//   them have already been wrong once: the app discriminator started as chrome
//   share and inverted the pages it was meant to separate, and the app banner
//   started as x-show and threw on a null scan because x-show evaluates the
//   children it hides.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, startAlpine, tick, repoRoot } from './bootstrap.mjs';

// The template is a string in the component file, so the pane-coverage and
// x-if claims are read from the source rather than from the rendered tree:
// a pane only renders once its tab is opened, and the claim is about all five.
const SRC = readFileSync(path.join(repoRoot, 'lib/alpineComponents/fab.js'), 'utf8');

const { window } = makeWindow({
  html: `<!doctype html><html><body></body></html>`,
});
const doc = window.document;
const Alpine = await startAlpine(window, [
  'lib/kits/guide-render.js', 'lib/alpineComponents/path-picker.js', 'lib/alpineComponents/fab.js',
]);

async function mountFab() {
  const host = doc.createElement('div');
  host.innerHTML = '<div x-data="fab()" data-repo="mehrlander/web-tools" data-path="pages/shorter.html"></div>';
  doc.body.appendChild(host);
  Alpine.initTree(host);
  await tick(3);
  return Alpine.$data(host.firstElementChild);
}

// A document to read: one paragraph of real sentences, in its own detached
// tree so the drawer's own markup never counts toward the figures.
const docWith = (html) => {
  const d = window.document.implementation.createHTMLDocument('probe');
  d.body.innerHTML = html;
  return d;
};

const PROSE = `<article><p>The estate has ten text instruments and every one of
  them runs somewhere other than the page you are reading. That is the gap this
  tab exists to close, and it is not a gap in capability.</p>
  <p>Nine of the ten take a corpus or a paste, so none of them takes this
  page.</p></article>`;

// Labels, the shape an app's text actually arrives in.
const APP = '<nav>' + Array.from({ length: 40 },
  (_, i) => `<button>tab ${i}</button><span>row ${i}</span>`).join('') + '</nav>';

test('the strip is data, and every tab in it has a pane', async () => {
  const d = await mountFab();
  // Joined rather than deep-compared: Alpine hands back a reactive Proxy, and
  // deepEqual checks the prototype before it checks the contents.
  const keys = [...d.TABS].map(t => t.key);
  assert.equal(keys.join(','), 'render,inspect,traffic,text,notes',
    'reading order: delivery first, then what the page says');

  // The pane list lives in the template, so read it from the source the
  // component was built from rather than from a second list here.
  for (const k of keys) {
    assert.ok(SRC.includes(`activeTab === '${k}'`),
      `tab ${k} has no pane: a tab with no pane is a dead button, and under the ` +
      'active-label rule it carries no name to explain itself');
  }

  // Every tab names an opening side effect that exists, since setTab calls it
  // by name and a typo would fail silently.
  for (const t of d.TABS) {
    assert.equal(typeof d[t.on], 'function', `${t.key}.on names no method: ${t.on}`);
  }
});

test('setTab switches the pane and runs the tab’s opener', async () => {
  const d = await mountFab();
  let ran = 0;
  d.textScan = function () { ran++; };
  d.setTab('text');
  assert.equal(d.activeTab, 'text');
  assert.equal(ran, 1, 'opening a tab runs its opener, once');
});

test('the strip’s one label names the selected tab, and is derived', async () => {
  const d = await mountFab();
  for (const t of [...d.TABS]) {
    d.activeTab = t.key;
    assert.equal(d.tabLabel, t.label, `the slot names ${t.key}`);
  }

  // A getter, not stored state. The label sits in its own slot away from the
  // buttons, so a copy that drifted would name one tab while another was
  // highlighted, and nothing on screen would resolve the disagreement.
  //
  // Asserted against the source, because the shape is not reachable at runtime:
  // Alpine's reactive proxy reports no descriptor for an accessor at all, own
  // or inherited, and Alpine.raw returns the same proxy through this harness.
  // So a runtime check here cannot tell a getter from a stored value, which is
  // exactly the distinction being made.
  assert.match(SRC, /get tabLabel\(\)/,
    'tabLabel must be derived from activeTab, not stored beside it');

  d.activeTab = 'nonesuch';
  assert.equal(d.tabLabel, '', 'an unknown tab empties the slot rather than throwing');
});

test('the read separates body prose from chrome, and counts runs', async () => {
  const d = await mountFab();
  const r = d._textRead(docWith(PROSE));

  assert.ok(r.words > 45 && r.words < 70, `unexpected word count: ${r.words}`);
  assert.equal(r.chrome, 0, 'prose in <p> is body, not chrome');
  assert.ok(r.sentences >= 3, `sentences: ${r.sentences}`);
  assert.equal(r.longest, 20, 'the longest sentence is reported in words');
  assert.match(r.longestText, /estate has ten text instruments/,
    'and carries its text, so the figure is checkable rather than asserted');
  assert.ok(r.minutes >= 1, 'reading time never rounds to zero');

  // The button and link text an app is made of is counted apart, so the word
  // row can carry a denominator instead of a bare number.
  const mixed = d._textRead(docWith(PROSE + '<button>Save</button><a href="#">Open</a>'));
  assert.equal(mixed.chrome, 2, 'button and link words land in chrome');
  assert.equal(mixed.words, r.words, 'and are kept out of the body count');
});

test('the app gate reads words per run, which is the signal that separates', async () => {
  const d = await mountFab();
  const prose = d._textRead(docWith(PROSE));
  const app = d._textRead(docWith(APP));

  assert.ok(app.perRun < 6, `an app's text arrives as labels: ${app.perRun}`);
  assert.ok(prose.perRun >= 6, `prose arrives as sentences: ${prose.perRun}`);

  // The measurement that retired the first attempt. Chrome share put the most
  // document-like page in the estate at 2% and an app at 9%, inverting the
  // separation, so it must not be what the gate reads. A document with no
  // buttons at all has a chrome share of zero and is still a document.
  assert.equal(prose.chromeShare, 0);
  assert.ok(prose.perRun >= 6,
    'a zero chrome share must not be readable as evidence either way');
});

test('the prose checks ignore what is not prose', async () => {
  const d = await mountFab();

  const dashes = d._textRead(docWith('<p>One thing—then another—then a third.</p>'));
  assert.equal(dashes.dashes, 2, 'the house rule is zero em dashes, so they are counted');

  // A path already inside a link is not a bare path; that is the whole rule.
  // A path in a code span is a citation, not a reference, and is left alone.
  const paths = d._textRead(docWith(
    `<p>See docs/text-tools.md for the design.</p>
     <p>See <a href="#">docs/loader.md</a> and <code>lib/kits/annotate.js</code>.</p>`));
  assert.equal(paths.barePaths, 1,
    'only the path outside a link and outside code counts');

  // Narrow on purpose: the check reports candidates, and a false positive here
  // is a finding nobody can act on.
  const noise = d._textRead(docWith('<p>Pick one and/or the other, in docs, at 3.5 percent.</p>'));
  assert.equal(noise.barePaths, 0, '"and/or", a bare folder, and a decimal are not paths');
});

test('an unreadable document is a null, not a throw', async () => {
  const d = await mountFab();
  assert.equal(d._textRead(null), null);
  assert.equal(d._textRead({}), null);

  // The banner that reads textStats sits outside the pane's x-if guard, so it
  // must be an x-if of its own. As an x-show it hid the element and still
  // evaluated the readout inside it, which threw on every mount that never
  // opened this tab.
  assert.ok(!/x-show="textStats && textStats\.perRun/.test(SRC),
    'the app banner must be x-if: x-show evaluates the children it hides');
});
