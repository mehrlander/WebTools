#!/usr/bin/env node
// The screenshot tool's warning block: does it say when the pixels are not
// your code?
//
//   node tools/test/shot-warnings.mjs
//
// This guards the one failure mode a screenshot cannot show, because in both
// of its shapes the page renders perfectly:
//
//   1. a lib file fails to load, and the pre-build's inlined copy of that
//      component keeps running (snags: silent-fallback-old-build)
//   2. dist/web-tools.js is behind lib/, and the page boots from it, so no
//      load is attempted and nothing fails (web-tools PR #419)
//
// Each is provoked here rather than described: the test edits a lib file, runs
// a real shot, reads the log, and puts the file back. A `finally` restores from
// a copy taken before anything is touched, so a crash mid-run cannot leave the
// tree broken.
//
// The third case is the control, and it matters as much as the other two: a
// clean run must print NO warning block. A warning that fires every time is a
// warning nobody reads, which is why the sandbox's routinely-blocked API
// requests are deliberately not warned on.
//
// Exits nonzero on any failure. Not part of `npm test` (drives a browser).

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOT = path.join(root, 'tools/render/screenshot.mjs');
const PAGE = 'pages/data-view.html';           // boots the gh.load chain
const VICTIM = path.join(root, 'lib/kits/url-params.js');   // a file that page loads
const BACKUP = path.join(root, 'tools/.preview/.url-params.bak');
const OUT = path.join(root, 'tools/.preview/shot-warnings.png');

const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
};

// Run a shot and hand back its stdout. The tool exits nonzero only on a fatal,
// which none of these cases are, so the status is checked rather than trusted.
function shot() {
  const r = spawnSync(process.execPath, [SHOT, PAGE, '--wait', '4000', '--out', OUT],
                      { cwd: root, encoding: 'utf8', timeout: 180000 });
  return (r.stdout || '') + (r.stderr || '');
}
const warningBlock = (out) => {
  const i = out.indexOf('!!! WARNINGS !!!');
  return i === -1 ? '' : out.slice(i, out.indexOf('png:', i));
};

try {
  copyFileSync(VICTIM, BACKUP);
  const clean = readFileSync(VICTIM, 'utf8');

  console.log('a clean run (the control):');
  spawnSync(process.execPath, [path.join(root, 'tools/build/build-lib.mjs')], { cwd: root });
  let out = shot();
  ok('says nothing', !out.includes('!!! WARNINGS !!!'), warningBlock(out).slice(0, 200));

  console.log('a lib file that fails to parse:');
  writeFileSync(VICTIM, clean + '\nconst unterminated = `oops;\n');
  out = shot();
  let block = warningBlock(out);
  ok('warns', !!block);
  ok('names the file that did not load', /kits\/url-params\.js/.test(block), block.slice(0, 200));
  ok('and says the pixels may be the last build', /last build/.test(block), block.slice(0, 200));
  ok('the warning is above the log body', out.indexOf('!!! WARNINGS !!!') < out.indexOf('--- loadedScripts'));

  console.log('a pre-build behind lib/:');
  // A comment is enough: build-lib --check compares content, so any edit that
  // is not rebuilt makes the artifact stale, exactly as a real edit would.
  writeFileSync(VICTIM, clean + '\n// a change that has not been built\n');
  out = shot();
  block = warningBlock(out);
  // data-view boots the gh.load chain, so it reads the edited file directly and
  // this case must NOT fire for it: the staleness warning is for a page that
  // boots the pre-build. Assert the discrimination rather than the warning.
  ok('a gh.load page is not warned about the pre-build', !/BEHIND lib/.test(block), block.slice(0, 200));

  const preBuildPage = 'pages/show-repo/show-repo.html';
  const r = spawnSync(process.execPath, [SHOT, preBuildPage, '--wait', '4000', '--out', OUT],
                      { cwd: root, encoding: 'utf8', timeout: 180000 });
  block = warningBlock((r.stdout || '') + (r.stderr || ''));
  ok('a pre-build page is', /BEHIND lib/.test(block), block.slice(0, 200));
  ok('and is told what to run', /npm run build:lib/.test(block), block.slice(0, 200));
} finally {
  if (existsSync(BACKUP)) { copyFileSync(BACKUP, VICTIM); unlinkSync(BACKUP); }
  // Leave the pre-build matching the restored tree, so a failed run does not
  // hand the next command a stale artifact it did not cause.
  spawnSync(process.execPath, [path.join(root, 'tools/build/build-lib.mjs')], { cwd: root });
}

console.log(failures.length ? `\n${failures.length} failure(s): ${failures.join(', ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
