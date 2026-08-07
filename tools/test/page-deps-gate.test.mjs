// The ready gate every pre-build page needs, checked statically.
//
// The hazard: importing dist/web-tools.js BOOTS ALPINE as part of the import,
// because alpine-bundle.js is the last entry in its auto-boot chain. So a page
// written as
//
//     await import('../dist/web-tools.js');   // ← Alpine starts in here
//     await gh.load('kits/whatever.js');      // ← runs after init() already did
//
// has already run its components' init() by the time it loads the kits those
// components read. Whichever kit init() touches first is the one that appears
// undefined, so the same bug reports differently depending on the page and on
// how far init gets: measured 2026-08-07 as `reviewTarget.parse` on one path
// and `BranchBrief.fetchBrief` one await later on another, from a real browser.
//
// The build already fixed this for its own two cases, forcing url-params.js and
// repo-address.js into the auto-boot chain "because a page's own gh.load chain
// runs AFTER this import" (tools/build/build-lib.mjs). That does not extend to a
// kit only one page wants, so each such page states its own readiness.
//
// This is a STATIC check and that is its honest limit: it proves the gate is
// declared, resolved, and awaited, not that a given component awaits it before
// every kit it touches. It exists because the failure is a race, so a passing
// run proves nothing on its own and only the shape can be pinned.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const pagesDir = path.join(repoRoot, 'pages');

// The pages at risk: they import the pre-build AND then load more of their own.
// A page that imports it and loads nothing else has nothing to race.
const atRisk = readdirSync(pagesDir)
  .filter(f => f.endsWith('.html'))
  .map(f => ({ file: f, src: readFileSync(path.join(pagesDir, f), 'utf8') }))
  .filter(({ src }) => /dist\/web-tools\.js/.test(src) && /gh\.load\(/.test(src));

test('the set of at-risk pages is non-empty, or this check is silently vacuous', () => {
  assert.ok(atRisk.length >= 3, `expected the pre-build pages, found ${atRisk.length}`);
});

for (const { file, src } of atRisk) {
  test(`${file} declares the ready gate before its module script`, () => {
    const decl = src.indexOf('window.__depsReady');
    const mod = src.indexOf('<script type="module">');
    assert.ok(decl !== -1, `${file} imports the pre-build and loads its own files, but declares no gate`);
    assert.ok(decl < mod,
      `${file} declares the gate inside or after its module script. A component that starts `
      + 'during the import would find the promise itself undefined and sail past it.');
  });

  test(`${file} resolves the gate, and does so even when a load fails`, () => {
    assert.match(src, /window\.__depsDone\(\)/, `${file} never resolves its gate`);
    const i = src.indexOf('window.__depsDone()');
    const before = src.slice(Math.max(0, i - 400), i);
    assert.match(before, /finally/,
      `${file} resolves its gate outside a finally: one failed load would hang the page `
      + 'behind a gate that never opens, which is worse than the bug being fixed.');
  });

  test(`${file} awaits the gate in init`, () => {
    assert.match(src, /await window\.__depsReady/,
      `${file} declares a gate nothing waits on`);
  });
}
