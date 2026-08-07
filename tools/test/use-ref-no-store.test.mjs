// Every `?use=<ref>` loader fetches past the HTTP cache.
//
// `?use=` is the repo's preview mechanism, and the ref it pins is almost always
// a BRANCH, which moves with every push. The loaders fetch that ref's bundle
// from raw.githubusercontent and blob-import it, and two page comments claimed
// for months that the blob import made "a branch name cache-safe". It does not:
// the blob import defeats the module cache, keyed by URL, and nothing was
// defeating the HTTP cache, keyed by the same URL. So a preview link could
// serve a bundle from an earlier push, showing old code with nothing on screen
// to say so.
//
// That cost a whole session of rounds: a fix was shipped, the preview still
// showed the old behavior, and the obvious readings (a broken fix, a stale CDN,
// the viewer's browser) were all wrong. The failure is invisible by
// construction, which is exactly the kind that needs a test rather than care.
//
// A guard rather than a behavior check: this asserts over the source of every
// page that speaks the grammar, because the bug is a missing argument in files
// nobody edits together.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p, out); }
    else if (/\.(html|js)$/.test(name)) out.push(p);
  }
  return out;
}

// The loader line, as every page writes it: a template literal naming the ref.
const LOADER = /fetch\(`https:\/\/raw\.githubusercontent\.com\/mehrlander\/web-tools\/\$\{ref\}[^`]*`([^)]*)\)/g;

const files = [
  ...walk(path.join(repoRoot, 'pages')),
  ...walk(path.join(repoRoot, 'lib')),
].filter(p => !p.includes('/dist/'));

test('every ?use= loader passes cache: no-store', () => {
  const offenders = [];
  let seen = 0;
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(LOADER)) {
      seen++;
      if (!/cache:\s*'no-store'/.test(m[1])) {
        offenders.push(path.relative(repoRoot, file));
      }
    }
  }
  assert.ok(seen > 20, 'the pattern still matches the loaders (' + seen + ' found)');
  assert.deepEqual(offenders, [],
    'a ?use= ref moves, so its bundle must not come from the HTTP cache');
});

test('no page still claims a branch ref is cache-safe on its own', () => {
  const claims = files.filter(f => /cache-safe/.test(readFileSync(f, 'utf8')))
    .map(f => path.relative(repoRoot, f));
  assert.deepEqual(claims, [],
    'the phrase named the module cache and implied the HTTP one; both are handled explicitly now');
});
