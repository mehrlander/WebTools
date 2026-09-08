// page-report.js — the gates that keep an always-on reporter quiet, which is
// the part that decides whether a page can report by default at all. The
// Playwright driver (tools/render/scenarios/audit-report.mjs) covers the wiring
// on the page; this covers the four gates and the off switches, headless.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/page-report.js'), 'utf8');

// The kit reads a browser it must never assume is well formed, so the stub is
// deliberately thin: anything it does not provide should be handled, not thrown.
function load({ storage = {}, search = '' } = {}) {
  const window = {};
  const sandbox = {
    window,
    localStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; },
    },
    navigator: { userAgent: 'stub/1', language: 'en', onLine: true },
    performance: { getEntriesByType: () => [] },
    location: { href: 'https://x/pages/audit-render.html', pathname: '/pages/audit-render.html', search },
    matchMedia: () => ({ matches: true }),
    innerWidth: 430, innerHeight: 900, devicePixelRatio: 3,
    GH: undefined,
  };
  new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));
  return { P: window.PageReport, storage };
}

test('silent until a page opts in, and it is the page that opts in', async () => {
  const { P } = load();
  assert.equal(P.enabled, false);
  assert.equal(P.status, '');
  assert.equal((await P.auto({ faults: [{ line: 'x' }] })).why, 'not watching');
  P.watch();
  assert.equal(P.enabled, true);
  assert.equal(P.status, 'reporting to mehrlander/web-tools-private');
});

test('a clean load writes nothing, however long it has been watching', async () => {
  const { P } = load();
  P.watch();
  assert.equal((await P.auto({ faults: [], crumb: null })).why, 'nothing to report');
});

test('a fault, a crumb or a named reason each earn a report', async () => {
  // No GH in the stub, so reaching the write is the assertion: `no GH` means
  // every gate passed and the send was attempted.
  for (const extra of [{ faults: [{ line: 'x' }] }, { crumb: { stage: 'paint' } }, { reason: 'asked for' }]) {
    const { P } = load();
    P.watch();
    assert.equal((await P.auto(extra)).why, 'no GH', JSON.stringify(extra));
  }
});

test('the same failure is not filed twice inside the quiet window', async () => {
  const storage = {};
  const mk = () => { const { P } = load({ storage }); P.watch({ quietMinutes: 30 }); return P; };
  const one = mk();
  // Stand in for a successful write, since the stub has no GH to reach.
  one.send = async function (extra) { this._filed = (this._filed || 0) + 1; storage['pageReport:seen'] = JSON.stringify({ [signatureOf(extra)]: Date.now() }); return { ok: true, path: 'x' }; };
  assert.equal((await one.auto({ faults: [{ line: 'boom' }] })).ok, true);
  // A fresh load of the page, same failure: dropped.
  assert.equal((await mk().auto({ faults: [{ line: 'boom' }] })).why, 'already filed');
  // A different failure still gets through.
  assert.equal((await mk().auto({ faults: [{ line: 'other' }] })).why, 'no GH');
});

test('a stale signature stops suppressing once the quiet window has passed', async () => {
  const storage = { 'pageReport:seen': JSON.stringify({ '~~boom': Date.now() - 60 * 60000 }) };
  const { P } = load({ storage });
  P.watch({ quietMinutes: 30 });
  assert.equal((await P.auto({ faults: [{ line: 'boom' }] })).why, 'no GH');
});

test('one load files at most perLoad, so a fault in a loop is not a loop of commits', async () => {
  const { P } = load();
  P.watch({ perLoad: 2 });
  P._filed = 2;
  assert.equal((await P.auto({ reason: 'again' })).why, 'enough for one load');
});

test('both off switches hold: durable, and one load from the address', async () => {
  const { P, storage } = load();
  P.watch();
  P.disable();
  assert.equal(P.enabled, false);
  assert.equal(P.status, 'reporting off');
  assert.equal((await P.auto({ reason: 'x' })).why, 'not watching');
  P.enable();
  assert.equal(P.enabled, true);
  assert.equal('pageReport:off' in storage, false);

  const off = load({ search: '?report=off' });
  off.P.watch();
  assert.equal(off.P.enabled, false);
  assert.equal(off.P.status, 'reporting off for this load');
});

test('nothing throws, including the send with no browser under it', async () => {
  const { P } = load();
  P.watch();
  const res = await P.send({});
  assert.equal(res.ok, false);
  assert.equal(res.why, 'no GH');
});

test('the report carries what a screenshot cannot', () => {
  const { P } = load();
  const doc = P.collect({ build: 'b', faults: [] });
  assert.equal(doc.page, 'audit-render.html');
  assert.equal(doc.environment.ua, 'stub/1');
  assert.equal(doc.environment.coarse, true);
  assert.deepEqual(doc.environment.viewport, { w: 430, h: 900, dpr: 3 });
  assert.equal(doc.resources.count, 0);
  assert.match(doc.at, /^\d{4}-\d\d-\d\dT/);
});

// The kit keeps its signature private, so the repeat test builds the same one.
// Kept beside the tests that use it rather than inside them: if this drifts
// from the kit, the repeat gates go quiet rather than failing, so it is written
// once and read twice.
function signatureOf(extra) {
  const faults = (extra.faults || []).map(f => f.line).join('|');
  const crumb = extra.crumb ? `crumb:${extra.crumb.stage || extra.crumb}` : '';
  return [extra.reason || '', crumb, faults].join('~').slice(0, 400);
}
