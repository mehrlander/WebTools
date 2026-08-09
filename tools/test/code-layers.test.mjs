// code-layers.test.mjs — holds the lib/ boundary of docs/code-layers.md against
// the tree, in all three directions, off scripts/code-shape-survey.py (the same
// instrument the rule was decided with, so the test and the survey cannot
// disagree about what a file attaches to).
//
// The rule (settled 2026-08-07, migrated 2026-08-08): every file registering a
// window namespace is a kit; lib/ root keeps the loader, the files extending
// its prototype, and the boot bundles. Precedence, which is what keeps the rule
// one grep instead of a pile of carve-outs:
//   - GH.prototype beats a window namespace (gh-auth.js registers window.ghAuth
//     and stays in root, because extending the shared object every page holds
//     is the stronger commitment);
//   - Alpine.data beats a window namespace (ref-switch.js, stage.js, viewer.js
//     each register one beside their component and stay components);
//   - the loader (gh-api.js defines GH itself) and the *-bundle.js boot bundles
//     are root by definition.
// Boot membership is deliberately NOT tested here: it is a cost, not a
// structure, and lives in gh-boot.js's declared BOOT manifest.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = execFileSync('python3', [path.join(root, 'scripts', 'code-shape-survey.py'), '--json', 'lib'],
  { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const rows = JSON.parse(out).rows.filter(r => r.side === 'browser');

const isBundle = r => /-bundle\.js$/.test(r.path);
const extendsProto = r => r.attaches.includes('GH.prototype');
const registersNamespace = r => r.attaches.some(a => a.startsWith('window.'));
const registersComponent = r => r.attaches.some(a => a.startsWith('Alpine.data:'));

test('lib/kits/: nothing extends GH.prototype', () => {
  const bad = rows.filter(r => r.layer === 'lib/kits' && extendsProto(r));
  assert.deepEqual(bad.map(r => r.path), [],
    'kit(s) extend GH.prototype; scaffolding belongs in lib/ root (docs/code-layers.md)');
});

test('lib/ root: only the loader, prototype extenders, and boot bundles', () => {
  for (const r of rows.filter(r => r.layer === 'lib')) {
    if (r.path === 'lib/gh-api.js') continue; // the loader: defines GH
    if (isBundle(r)) continue;
    assert.ok(extendsProto(r),
      `${r.path} sits in lib/ root but does not extend GH.prototype; ` +
      `a window-namespace logic module belongs in lib/kits/ (docs/code-layers.md)`);
    // A root file may also register a namespace (gh-auth.js), but never only that.
  }
  const strays = rows.filter(r => r.layer === 'lib' && !extendsProto(r) &&
    !isBundle(r) && r.path !== 'lib/gh-api.js' && registersNamespace(r));
  assert.deepEqual(strays.map(r => r.path), []);
});

test('lib/alpineComponents/: everything registers Alpine.data', () => {
  const bad = rows.filter(r => r.layer === 'lib/alpineComponents' && !registersComponent(r));
  assert.deepEqual(bad.map(r => r.path), [],
    'component file(s) register no Alpine.data; a plain logic module belongs in lib/kits/');
});
