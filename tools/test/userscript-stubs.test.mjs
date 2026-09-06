// A userscript stub, its bookmarklet twin and the body they load are generated
// together by scripts/userscript-stub.py, and two of the three are the kind of
// artifact nobody re-reads. The failures they invite:
//
//   - The stub re-pinned and the bookmarklet left behind, so two routes claim
//     to run one body and run different ones, silently.
//   - A body edited without re-stamping, so the launcher reports a build id
//     that was true yesterday. That is worse than no id: an unlooked-up answer
//     reading as a good one is the failure the stamp exists to prevent.
//
// The pin is deliberately a BRANCH here, which an earlier version of this file
// refused. A commit pin made every edit a reinstall on the phone, and the
// install is the one step that costs a person something. The stamp is what
// makes the branch pin safe to read.
import { test } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const stubs = fs.readdirSync(path.join(ROOT, 'userscripts'))
  .filter(f => f.endsWith('.user.js'));

const STAMP = /^const BUILD = '([^']*)';$/m;
const fnName = lib => 'wt' + lib.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');
const stampOf = text => crypto.createHash('sha256')
  .update(text.replace(STAMP, "const BUILD = '#BUILD#';")).digest('hex').slice(0, 7);

test('every stub loads a body that exists and defines what the stub calls', () => {
  assert.ok(stubs.length, 'no stubs found; this test would pass vacuously');
  for (const stub of stubs) {
    const lib = stub.replace('.user.js', '');
    const src = fs.readFileSync(path.join(ROOT, 'userscripts', stub), 'utf8');

    const req = src.match(/@require\s+(\S+)/);
    assert.ok(req, `${stub}: no @require`);
    assert.ok(req[1].endsWith(`/userscripts/lib/${lib}.js`),
      `${stub}: @require does not point at userscripts/lib/${lib}.js`);

    const body = path.join(ROOT, 'userscripts', 'lib', `${lib}.js`);
    assert.ok(fs.existsSync(body), `${stub}: body ${lib}.js is missing`);
    assert.match(fs.readFileSync(body, 'utf8'), new RegExp(`window\\.${fnName(lib)}\\s*=`),
      `${lib}.js must define window.${fnName(lib)}; the stub calls it`);
    assert.match(src, new RegExp(`window\\.${fnName(lib)}\\(`),
      `${stub} must call window.${fnName(lib)}`);
  }
});

test('the two routes load the same address', () => {
  for (const stub of stubs) {
    const lib = stub.replace('.user.js', '');
    const url = fs.readFileSync(path.join(ROOT, 'userscripts', stub), 'utf8')
      .match(/@require\s+(\S+)/)[1];
    const twin = path.join(ROOT, 'bookmarklets', `${lib}.js`);
    assert.ok(fs.existsSync(twin), `${stub}: no bookmarklet twin at bookmarklets/${lib}.js`);
    assert.ok(fs.readFileSync(twin, 'utf8').includes(url),
      `bookmarklets/${lib}.js loads a different address than ${stub}: ` +
      're-run scripts/userscript-stub.py, which writes both');
  }
});

test('every body carries a stamp matching its own contents', () => {
  for (const stub of stubs) {
    const lib = stub.replace('.user.js', '');
    const text = fs.readFileSync(path.join(ROOT, 'userscripts', 'lib', `${lib}.js`), 'utf8');
    const m = text.match(STAMP);
    assert.ok(m, `${lib}.js has no BUILD line for the generator to stamp`);
    assert.equal(m[1], stampOf(text),
      `${lib}.js was edited without re-stamping, so it would report build ` +
      `${m[1]} while running something else: python3 scripts/userscript-stub.py ${lib} …`);
  }
});
