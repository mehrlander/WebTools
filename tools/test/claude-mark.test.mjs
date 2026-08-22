// kits/claude-mark.js — the Claude logomark's one owner, and the gate that
// keeps it the only one.
//
// The kit itself is four lines of string building and barely needs a test. The
// gate does. This mark spent months as six inline copies (docs/SNAGS.md,
// `claude-logomark-copied`), and the failure mode was never that a copy broke:
// it was that a seventh got pasted, or a consumer improvised a generic arrow,
// and nothing anywhere said so. A path constant with no gate behind it is a
// seventh copy waiting to happen.
//
// So the assertion that earns its place is the last one here: nothing outside
// this kit may carry the eleven-ray path. It fails on the paste, in the commit
// that makes it, rather than months later when someone notices two marks have
// drifted apart.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, makeWindow } from './bootstrap.mjs';

const KIT = 'lib/kits/claude-mark.js';
const src = readFileSync(path.join(repoRoot, KIT), 'utf8');

const load = () => {
  const { window } = makeWindow();
  new window.Function(src)();
  return window;
};

test('svg() defaults to the brand colour and the standard box', () => {
  const { claudeMark } = load();
  const out = claudeMark.svg();
  assert.match(out, /^<svg viewBox="0 0 24 24"/);
  assert.match(out, /class="w-6 h-6 shrink-0"/);
  assert.match(out, /style="stroke:#d97757"/);
  assert.ok(out.includes(claudeMark.PATH), 'the path constant is what gets drawn');
});

test('cls and color are the two things a consumer overrides', () => {
  const { claudeMark } = load();
  // The FAB draws it small; the Sessions pane draws the "no session here"
  // case in the row's own colour rather than the brand's.
  assert.match(claudeMark.svg({ cls: 'w-3.5 h-3.5' }), /class="w-3\.5 h-3\.5"/);
  assert.match(claudeMark.svg({ color: 'currentColor' }), /style="stroke:currentColor"/);
});

test('el() returns a real SVG element, not an HTML one', () => {
  // The reason el() parses through a container instead of createElement: an
  // <svg> built the naive way lands in the HTML namespace and draws nothing.
  const window = load();
  const el = window.claudeMark.el();
  assert.equal(el.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(el.tagName.toLowerCase(), 'svg');
  assert.equal(el.querySelectorAll('path').length, 1);
});

test('the eleven rays all start at the centre', () => {
  const { claudeMark } = load();
  const rays = claudeMark.PATH.split('M12,12 ').filter(Boolean);
  assert.equal(rays.length, 11);
  for (const r of rays) assert.match(r.trim(), /^L[\d.]+,[\d.]+$/);
});

// ── the gate ────────────────────────────────────────────────────────────────

// Every tracked source file, minus the places a copy is not a copy: the kit
// itself, and dist/ which is the whole of lib/ frozen into one artifact by the
// pre-build and so contains the kit verbatim by construction.
function sourceFiles() {
  const out = [];
  const skip = new Set(['node_modules', '.git', 'dist', 'tools']);
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const fp = path.join(dir, name);
      if (statSync(fp).isDirectory()) walk(fp);
      else if (/\.(js|html|mjs)$/.test(name)) out.push(fp);
    }
  })(repoRoot);
  return out;
}

test('the logomark path exists in exactly one file', () => {
  const { claudeMark } = load();
  // A fragment rather than the whole path, so a reformatted paste (the copies
  // this replaced were split across lines three different ways) is still
  // caught. Two rays is past coincidence.
  const needle = 'M12,12 L12.0,1.6 M12,12 L17.62,3.25';
  const offenders = sourceFiles()
    .filter(fp => readFileSync(fp, 'utf8').includes(needle))
    .map(fp => path.relative(repoRoot, fp))
    .filter(rel => rel !== KIT);
  assert.deepEqual(offenders, [],
    `the logomark belongs to ${KIT} alone; these carry their own copy: ${offenders.join(', ')}`);
});

// Every consumer reads the kit through an Alpine `x-html`, so its argument is
// a string in a template that nothing type-checks and no unit test mounts with
// the pane state needed to render it. Pulling the real expressions out and
// running them is the cheap way to know all six draw something: a typo in one
// site's options object is otherwise a blank icon nobody sees until they open
// that pane.
test('every call site renders the mark, arguments and all', () => {
  const { claudeMark } = load();
  const sites = sourceFiles().flatMap((fp) => {
    const rel = path.relative(repoRoot, fp);
    return [...readFileSync(fp, 'utf8').matchAll(/x-html="(window\.claudeMark\.svg\([^"]*\))"/g)]
      .map(m => [rel, m[1]]);
  });
  assert.ok(sites.length >= 6, `expected the known consumers, found ${sites.length}`);
  for (const [rel, expr] of sites) {
    const out = new Function('window', `return ${expr};`)({ claudeMark });
    assert.ok(out.includes(claudeMark.PATH), `${rel} draws no mark: ${expr}`);
    assert.match(out, /stroke:(#d97757|currentColor)/, `${rel} draws it off-palette: ${expr}`);
  }
});

test('gh-boot carries the kit, since the FAB draws it and no page chain owns the FAB', () => {
  const boot = readFileSync(path.join(repoRoot, 'lib/gh-boot.js'), 'utf8');
  assert.ok(boot.includes("{ path: 'kits/claude-mark.js' }"),
    'a component reading window.claudeMark needs it loaded before Alpine starts');
});
