// A userscript stub and its bookmarklet twin are generated together from one
// body (scripts/userscript-stub.py) and are the one place a SHA is written by
// hand-adjacent means. The failure they invite is drift: the stub re-pinned and
// the bookmarklet left behind, which ships two routes claiming to run the same
// code and running different code, silently. That is the whole of what this
// holds, plus the contract the generator asserts at write time and nothing
// re-asserts afterwards.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const stubs = fs.readdirSync(path.join(ROOT, 'userscripts'))
  .filter(f => f.endsWith('.user.js'));

const fnName = lib => 'wt' + lib.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('');

test('every userscript stub is a pinned stub over a body that exists', () => {
  assert.ok(stubs.length, 'no stubs found; this test would pass vacuously');
  for (const stub of stubs) {
    const lib = stub.replace('.user.js', '');
    const src = fs.readFileSync(path.join(ROOT, 'userscripts', stub), 'utf8');

    const req = src.match(/@require\s+(\S+)/);
    assert.ok(req, `${stub}: no @require`);
    const sha = req[1].match(/web-tools@([0-9a-f]{40})\//);
    assert.ok(sha, `${stub}: @require must pin a full commit SHA, not a branch ` +
      '(jsDelivr caches a branch for ~12h, so the body would change unbidden)');
    assert.ok(req[1].endsWith(`/userscripts/lib/${lib}.js`),
      `${stub}: @require does not point at userscripts/lib/${lib}.js`);

    const body = path.join(ROOT, 'userscripts', 'lib', `${lib}.js`);
    assert.ok(fs.existsSync(body), `${stub}: body ${lib}.js is missing`);
    assert.match(fs.readFileSync(body, 'utf8'), new RegExp(`window\\.${fnName(lib)}\\s*=`),
      `${lib}.js must define window.${fnName(lib)}; the stub calls it`);
    assert.match(src, new RegExp(`window\\.${fnName(lib)}\\(`),
      `${stub} must call window.${fnName(lib)}`);

    const twin = path.join(ROOT, 'bookmarklets', `${lib}.js`);
    assert.ok(fs.existsSync(twin), `${stub}: no bookmarklet twin at bookmarklets/${lib}.js`);
    assert.ok(fs.readFileSync(twin, 'utf8').includes(sha[1]),
      `bookmarklets/${lib}.js pins a different commit than ${stub}: ` +
      'regenerate both with scripts/userscript-stub.py');
  }
});
