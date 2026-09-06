// A userscript stub, its bookmarklet twin and the body they load are generated
// together by scripts/userscript-stub.py, and two of the three are the kind of
// artifact nobody re-reads. The failures they invite:
//
//   - The stub re-pinned and the bookmarklet left behind, so two routes claim
//     to run one body and run different ones, silently.
//   - A body edited without re-stamping, so the launcher reports a build id
//     that was true yesterday. That is worse than no id: an unlooked-up answer
//     reading as a good one is the failure the stamp exists to prevent.
//   - The published manifest disagreeing with the body, which would make an
//     up-to-date launcher announce that it is behind, or a stale one keep
//     quiet. The manifest is the one thing a reader on the phone cannot check
//     for themselves, so it is the one that most needs checking here.
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
const BUILT = /^const BUILT = '([^']*)';$/m;
const REF = /^const REF = '([^']*)';$/m;
const fnName = lib => 'wt' + lib.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');
const stampOf = text => crypto.createHash('sha256').update(
  text.replace(STAMP, "const BUILD = '#BUILD#';")
      .replace(BUILT, "const BUILT = '#BUILT#';")
      .replace(REF, "const REF = '#REF#';")).digest('hex').slice(0, 7);
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'userscripts', 'builds.json'), 'utf8'));

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

test('the published manifest agrees with every body it names', () => {
  for (const stub of stubs) {
    const lib = stub.replace('.user.js', '');
    const text = fs.readFileSync(path.join(ROOT, 'userscripts', 'lib', `${lib}.js`), 'utf8');
    const row = manifest[lib];
    assert.ok(row, `userscripts/builds.json has no row for ${lib}`);
    assert.equal(row.build, text.match(STAMP)[1],
      `builds.json says ${lib} is at ${row.build} and the body says ` +
      `${text.match(STAMP)[1]}, so a current launcher would report itself stale`);
    assert.equal(row.built, text.match(BUILT)[1], `${lib}: build times disagree`);
    assert.ok(!Number.isNaN(Date.parse(row.built)),
      `${lib}: built is not a date the launcher can subtract from now`);
  }
});

test('the manifest names nothing that has no body', () => {
  const libs = new Set(stubs.map(f => f.replace('.user.js', '')));
  const orphans = Object.keys(manifest).filter(k => !libs.has(k));
  assert.deepEqual(orphans, [],
    'these rows outlived their script and would answer for a build nobody ' +
    'ships: ' + orphans.join(', '));
});
