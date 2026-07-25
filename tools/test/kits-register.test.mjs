// Smoke test: every kit loads as a plain script against a bare window and
// registers exactly the global its header promises — the gh.load contract.
// (build.js is exercised by the build pipeline's verify-build instead: it
// expects the baked-in __REPO/ref context that tools/build/ provides.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKit } from './bootstrap.mjs';

const KITS = {
  'cm6.js': 'cm6',
  'compression.js': 'compression',
  'console.js': 'consoleKit',   // hooks window 'error' events at load
  'data-shelf.js': 'dataShelf',
  'export.js': 'exporter',
  'io.js': 'io',
  'messaging.js': 'messaging',
  'pdf.js': 'pdf',
  'persistence.js': 'persistence',
  'wring.js': 'wring',
  'wsl-core.js': 'wslCore',
};

for (const [file, globalName] of Object.entries(KITS)) {
  test(`${file} registers window.${globalName}`, () => {
    const w = loadKit(file, {
      window: { addEventListener: () => {} },
      console: { ...console },
    });
    assert.equal(typeof w[globalName], 'object', `window.${globalName} is set`);
    assert.ok(Object.keys(w[globalName]).length > 0, `window.${globalName} is non-empty`);
  });
}

test('wsl.js (async gh.load shape) registers window.wsl once awaited', async () => {
  const w = { addEventListener: () => {} };
  // wsl.js's first move is gh.load('kits/wsl-core.js'); satisfy it locally.
  // It references `gh` bare, which resolves in the Node global scope here.
  globalThis.gh = { load: async (p) => { loadKit(p.replace(/^kits\//, ''), { window: w }); } };
  try {
    loadKit('wsl.js', { window: w, console: { ...console } });
    await w.__kitReturn;
  } finally {
    delete globalThis.gh;
  }
  assert.equal(typeof w.wsl, 'object');
  assert.equal(typeof w.wsl.classifyPensionBill, 'function');
  assert.equal(typeof w.wsl.parseLegislationXml, 'function');
});
