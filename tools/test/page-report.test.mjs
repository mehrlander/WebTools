// page-report.js — the arm's own arithmetic, which is the part that decides
// whether an armed page is safe to hand to anyone. The Playwright driver
// (tools/render/scenarios/audit-report.mjs) covers the wiring on the page; this
// covers the two expiries and the silence, headless and in milliseconds.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/page-report.js'), 'utf8');

// The kit reads a browser it must never assume is well formed, so the stub is
// deliberately thin: anything it does not provide should be handled, not thrown.
function load({ storage = {} } = {}) {
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
    location: { href: 'https://x/pages/audit-render.html', pathname: '/pages/audit-render.html' },
    matchMedia: () => ({ matches: true }),
    innerWidth: 430, innerHeight: 900, devicePixelRatio: 3,
    GH: undefined,
  };
  new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));
  return { P: window.PageReport, storage };
}

test('off until armed, and the nag is empty while it is off', () => {
  const { P } = load();
  assert.equal(P.armed, false);
  assert.equal(P.status, '');
});

test('the nag names the repo, the budget and the time left', () => {
  const { P } = load();
  P.arm({ minutes: 30, budget: 5 });
  assert.match(P.status, /^reporting to mehrlander\/web-tools-private · 5 left · \d+m$/);
});

test('an expired arm is not an arm, and clears itself on read', () => {
  const { P, storage } = load();
  P.arm({ minutes: 60, budget: 5 });
  const a = JSON.parse(storage['pageReport:arm']);
  storage['pageReport:arm'] = JSON.stringify({ ...a, until: Date.now() - 1 });
  assert.equal(P.armed, false, 'a lapsed window still read as armed');
  assert.equal('pageReport:arm' in storage, false, 'the lapsed arm was left behind to lie later');
});

test('a spent budget is not an arm either', () => {
  const { P, storage } = load();
  P.arm({ minutes: 60, budget: 5 });
  const a = JSON.parse(storage['pageReport:arm']);
  storage['pageReport:arm'] = JSON.stringify({ ...a, left: 0 });
  assert.equal(P.armed, false);
});

test('unarmed and clean loads both send nothing', async () => {
  const { P } = load();
  assert.equal((await P.auto({ faults: [{ line: 'x' }] })).why, 'not armed');
  P.arm();
  assert.equal((await P.auto({ faults: [], crumb: null })).why, 'nothing to report');
});

test('a fault, a crumb or a named reason each earn a report', async () => {
  const { P } = load();
  P.arm();
  // No GH in the stub, so reaching the write is the assertion: `no GH` means
  // the gate passed and the send was attempted.
  for (const extra of [{ faults: [{ line: 'x' }] }, { crumb: { stage: 'paint' } }, { reason: 'asked for' }])
    assert.equal((await P.auto(extra)).why, 'no GH', JSON.stringify(extra));
});

test('nothing throws, including the send with no browser under it', async () => {
  const { P } = load();
  const res = await P.send({}, { force: true });
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
