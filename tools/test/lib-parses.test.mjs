// Every loadable lib file parses, the way the loader parses it.
//
// The suite is browser-free by construction, which is a feature and has one
// hole: nothing here ever asked whether a lib file is even syntactically
// valid. A file that fails to parse is not a subtle defect, but it is a quiet
// one, because `gh.load` catches the SyntaxError, warns to the console, and
// leaves the pre-build's inlined copy of the component running. The page keeps
// working, at the previous version, and only a console read says otherwise.
//
// Measured 2026-08-14, in this repo, on lib/alpineComponents/fab.js: a comment
// inside the component's HTML template happened to quote an identifier in
// backticks, which closed the enclosing template literal. The page rendered
// perfectly, at the last build's markup, through four screenshots taken to
// check the very change that had failed to load.
//
// `new Function(src)` is the check because it is exactly what the loader does
// with these files (docs/loader.md): they are function bodies, not modules, so
// this compiles them under the same rules and runs nothing. The two real ES
// modules under lib/ are excluded by their own syntax, since `export` at top
// level is a parse error in a function body and would fail here for the wrong
// reason.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const DIRS = ['lib', 'lib/kits', 'lib/alpineComponents'];

// A file the loader would hand to `new Function`. ES modules are loaded as
// modules and are not this test's subject.
function loadable(src) {
  return !/^\s*(export|import)\s/m.test(src);
}

const files = DIRS.flatMap(dir =>
  readdirSync(path.join(repoRoot, dir))
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(dir, f)));

test('every loadable lib file compiles as a function body', () => {
  assert.ok(files.length > 50, `only ${files.length} lib files found; the glob is wrong`);
  let checked = 0;
  for (const rel of files) {
    const src = readFileSync(path.join(repoRoot, rel), 'utf8');
    if (!loadable(src)) continue;
    checked++;
    try {
      new Function(src);
    } catch (e) {
      // Name the trap by name: it is the one that has actually happened, and
      // the message alone ("Unexpected identifier") points nowhere near it.
      assert.fail(`${rel} does not parse: ${e.message}\n` +
        'A backtick inside an HTML template (a comment quoting `an identifier`, say) ' +
        'closes the template literal. gh.load would swallow this and keep the ' +
        "pre-build's older copy of the component running.");
    }
  }
  assert.ok(checked > 50, `only ${checked} files were checked; the loadable filter is too broad`);
});
