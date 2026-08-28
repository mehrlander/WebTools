// alpineComponents/viewer.js — WHAT show() PROMISES, held behaviourally rather
// than by reading the source for an `await`.
//
// A mode module's `after()` is its async mount: it fetches, loads its library,
// parses, draws, and publishes what it publishes on `root`. switchMode used to
// fire it into a $nextTick and drop the promise, so show() resolved before
// after() had been CALLED and a host had nothing to wait on. Five polls grew in
// that gap, three of them for one workbook's sheet list.
//
// Driven through a probe module with no `assets`, so prepare() short-circuits
// and nothing touches a CDN (the trick viewer-host-modules.test.mjs uses). The
// probe's mount is a promise this file resolves by hand, which is what makes
// "did not resolve YET" assertable at all: a real module would race the test.
//
// The workbook half stubs `window.xlsxKit`. readZip is xlsx.test.mjs's subject
// and re-reading a zip here would only move the failure; what is under test is
// the order the module draws in, and the stub is the smallest thing that lets
// the real after() run to its end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, tick } from './bootstrap.mjs';

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="v" x-data="viewer()"></div>
    <div id="wb" x-data="viewer()"></div>
  </body></html>`,
});

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/alpineComponents/viewer.js',
]);

const R = window.ViewRegistry;
const doc = window.document;
const data = Alpine.$data(doc.getElementById('v'));

// The probe's mount, steered per test: 'hold' parks on a promise this file
// resolves, 'throw' gives up the way a module does when its bytes will not
// open, 'quick' returns without awaiting anything.
let plan = 'hold';
let release = null;
let started = 0;

R.modules.unshift({
  id: 'probe', label: 'Probe', icon: 'ph-bug',
  exclusive: true,
  test: (f) => f.ext === 'probe',
  render: () => '<div data-probe="root"></div>',
  after: async (f, ctx) => {
    started++;
    if (plan === 'throw') throw new Error('the bytes did not open');
    if (plan === 'hold') await new Promise(r => { release = r; });
    ctx.root.__probe = { name: f.name };
  },
});

// ── what show() waits for ────────────────────────────────────────────────────

test('show() does not resolve until the module has finished mounting', async () => {
  plan = 'hold';
  release = null;
  const root = doc.getElementById('v');
  delete root.__probe;

  let settled = false;
  const shown = data.show('a.probe', 'x', { local: true }).then(() => { settled = true; });

  // Far past the $nextTick the mount used to be fired and forgotten on.
  await tick(6);
  assert.equal(started, 1, 'the module never mounted');
  assert.equal(settled, false, 'show() resolved while the mount was still running');
  assert.equal(root.__probe, undefined, 'the mount published before it was allowed to');

  release();
  await shown;
  assert.equal(settled, true);
});

test('what the module publishes is there the moment show() resolves', async () => {
  plan = 'quick';
  const root = doc.getElementById('v');
  delete root.__probe;

  await data.show('b.probe', 'x', { local: true });

  // No tick, no poll, no frame: the read happens on the line after the await,
  // which is the thing home's sheetsOf() had to loop for.
  assert.deepEqual(root.__probe, { name: 'b.probe' });
});

test('the pane is visible while the module works, not held behind the spinner', async () => {
  // viewLoading flips BEFORE the mount is awaited, deliberately: the module
  // draws into the body that `x-show="!viewLoading"` gates, and Tabulator sizes
  // off a container that display:none reports as zero. Awaiting first would
  // hide every module's own progress message behind this spinner.
  plan = 'hold';
  release = null;
  const shown = data.show('c.probe', 'x', { local: true });
  await tick(6);
  assert.equal(data.viewLoading, false, 'the spinner is still up during the mount');
  release();
  await shown;
});

test('a module that gives up does not reject show()', async () => {
  plan = 'throw';
  const before = problems.length;

  // Resolves rather than throws. A module reports its own failure in its own
  // pane, and no host has ever had a rejection here to handle.
  await data.show('d.probe', 'x', { local: true });

  const said = problems.slice(before).map(p => p.join(' ')).join('\n');
  assert.match(said, /probe module failed to mount/,
    'the failure was swallowed without a word');
});

// ── the workbook's first sheet ───────────────────────────────────────────────

const wbData = Alpine.$data(doc.getElementById('wb'));
const wbRoot = doc.getElementById('wb');

// Tabulator is a CDN asset; the module only ever constructs and destroys it.
window.Tabulator = class { constructor() {} destroy() {} };
R.loadAsset = () => Promise.resolve();
window.xlsxKit = {
  readZip: async () => ({ xl: { sheets: {
    s1: { name: 'Alpha', index: 0, cellCount: 1 },
    s2: { name: 'Beta', index: 1, cellCount: 1 },
    s3: { name: 'Gamma', index: 2, cellCount: 1 },
  } } }),
  sheetRows: (s) => [{ sheet: s.name }],
};

const XLSX_URI = 'data:application/vnd.openxmlformats;base64,' + window.btoa('PK');
const tabs = () => [...wbRoot.querySelectorAll('[data-xlsx="tabs"] button')];
const activeTab = () => tabs().findIndex(b => b.classList.contains('btn-active'));

test('the workbook has drawn its first sheet by the time show() resolves', async () => {
  await wbData.show('book.xlsx', XLSX_URI, { local: true });
  assert.deepEqual(tabs().map(b => b.textContent), ['Alpha', 'Beta', 'Gamma']);
  // Array.from, because `list` is built inside the jsdom realm and .map() on
  // it yields that realm's Array, which deepStrictEqual reports as a prototype
  // mismatch under a diff that reads identical.
  assert.deepEqual(Array.from(wbRoot.__sheets.list, s => s.name), ['Alpha', 'Beta', 'Gamma']);
  assert.equal(activeTab(), 0, 'the first sheet was left to a frame running after the mount');
});

test('a sheet chosen the moment show() resolves is not overwritten', async () => {
  // THE REGRESSION THIS FILE EXISTS FOR. The module opens sheet 0 on a frame;
  // while that frame ran after after() returned, a host acting on show()
  // selected its sheet first and the frame put sheet 0 back underneath the
  // heading the host had already written. Nothing in home was waiting for a
  // frame on purpose: a poll on a 100ms interval was the only thing sequencing
  // these two, by accident.
  await wbData.show('book.xlsx', XLSX_URI, { local: true });
  wbRoot.__sheets.show(2);
  await tick(6);
  assert.equal(activeTab(), 2, 'the mount drew over the sheet the host asked for');
});

test('mounting stayed quiet apart from the failure it was told to report', () => {
  const noise = problems.filter(([, m]) => !/probe module failed to mount/.test(String(m)));
  assert.deepEqual(noise, []);
});
