// docs/app-routes.json: the show-repo app's own destinations stated as data,
// and lib/kits/route-activity.js, the fold that ranks them. Two things to hold.
//
// The MANIFEST has to agree with the router. show-repo.html's VIEWS table is
// the authority on which addresses exist (it dispatches and stamps them); the
// manifest is the authority on what each one is for and which files draw it.
// A route in one and not the other is exactly the drift that made three
// hand-copied else-if chains disagree before VIEWS existed, so it fails here.
//
// The FOLD has to be honest about its coarseness: a wide file must not date a
// row it cannot speak for, and the shell must stay out of attribution.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'docs', 'app-routes.json'), 'utf8'));
const shellSrc = readFileSync(path.join(repoRoot, manifest.app), 'utf8');

// The VIEWS keys, read out of the shell. Deliberately strict about the block
// boundary: a parse that came back short would let a missing route pass as
// "not in VIEWS", so the count is asserted before anything is compared.
function viewKeys(src) {
  const block = src.match(/\n {2}VIEWS: \[([\s\S]*?)\n {2}\],/);
  assert.ok(block, 'VIEWS table not found in ' + manifest.app);
  const keys = [...block[1].matchAll(/\{ key: '([a-z]+)'/g)].map(m => m[1]);
  const declared = (block[1].match(/\{ key: '/g) || []).length;
  assert.equal(keys.length, declared, 'a VIEWS row did not parse; check the literal shape');
  assert.ok(keys.length > 15, 'VIEWS parsed suspiciously short: ' + keys.length);
  return keys;
}

test('every route the router dispatches is described, and nothing else is', () => {
  const inRouter = new Set(viewKeys(shellSrc));
  const inManifest = new Set(manifest.routes.map(r => r.key));
  for (const k of inRouter) assert.ok(inManifest.has(k), `VIEWS key '${k}' has no row in docs/app-routes.json`);
  for (const k of inManifest) assert.ok(inRouter.has(k), `docs/app-routes.json describes '${k}', which VIEWS does not dispatch`);
});

test('every row says what it is, where it is, and what draws it', () => {
  const groups = new Set(manifest.groups.map(g => g.key));
  assert.ok(existsSync(path.join(repoRoot, manifest.shell)), 'shell missing: ' + manifest.shell);
  for (const r of manifest.routes) {
    assert.ok(r.address, r.key + ': address');
    assert.ok(r.label, r.key + ': label');
    assert.ok(r.what, r.key + ': what');
    assert.ok(groups.has(r.group), `${r.key}: unknown group '${r.group}'`);
    assert.ok(Array.isArray(r.files), r.key + ': files is an array');
    for (const p of r.files) {
      assert.ok(existsSync(path.join(repoRoot, p)), `${r.key}: declared file missing: ${p}`);
    }
    // A row with no files of its own is a claim about the app, not an
    // omission, so it has to say so out loud rather than read as unfinished.
    if (!r.files.length) assert.ok(r.note, r.key + ': no files, so state why in `note`');
    // The shell carries every route, so naming it on one would make that row
    // move whenever anything moved.
    assert.ok(!r.files.includes(manifest.shell), r.key + ': the shell is not a route\'s own file');
  }
});

test('an alias is a retired key, so it never doubles as a live one', () => {
  const keys = new Set(manifest.routes.map(r => r.key));
  for (const r of manifest.routes) {
    if (r.alias) assert.ok(!keys.has(r.alias), `${r.key}: alias '${r.alias}' is also a live key`);
  }
});

// ── The fold ────────────────────────────────────────────────────────────────

const src = readFileSync(path.join(repoRoot, 'lib/kits/route-activity.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const R = window.routeActivity;

const FIXTURE = {
  shell: 'shell.html',
  shellNote: 'the shell',
  groups: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }],
  routes: [
    { key: 'one',   address: '?view=one',   label: 'One',   group: 'a', what: '.', files: ['one.js', 'wide.js'] },
    { key: 'two',   address: '?view=two',   label: 'Two',   group: 'a', what: '.', files: ['wide.js'] },
    { key: 'three', address: '?view=three', label: 'Three', group: 'b', what: '.', files: ['wide.js'] },
    { key: 'four',  address: '?view=four',  label: 'Four',  group: 'b', what: '.', files: [] },
  ],
};

test('shared is derived from being named twice, never authored', () => {
  const c = R.carriers(FIXTURE);
  assert.deepEqual(c.get('one.js'), ['one']);
  assert.deepEqual(c.get('wide.js'), ['one', 'two', 'three']);
});

test('a wide file does not date a row it cannot speak for', () => {
  const touches = {
    'one.js':  { date: '2026-08-01', subject: 'narrow' },
    'wide.js': { date: '2026-08-12', subject: 'wide' },
  };
  const rows = R.rank(FIXTURE, { touches });
  const one = rows.find(r => r.key === 'one');
  // 'one' has a narrow carrier, so its date is that carrier's, older though it
  // is: the newer wide commit says nothing about this route in particular.
  assert.equal(one.lastTouch.subject, 'narrow');
  assert.equal(one.borrowed, false);
  // 'two' has nothing but the wide file, so it borrows and says so.
  const two = rows.find(r => r.key === 'two');
  assert.equal(two.lastTouch.subject, 'wide');
  assert.equal(two.borrowed, true);
});

test('the shell is excluded from attribution and reported on its own', () => {
  const touches = { 'shell.html': { date: '2026-08-13', subject: 'router' } };
  const rows = R.rank(FIXTURE, { touches });
  assert.ok(rows.every(r => !r.lastTouch), 'a shell commit dated a route');
  const s = R.shellRow(FIXTURE, { touches });
  assert.equal(s.path, 'shell.html');
  assert.equal(s.routes, 4);
  assert.equal(s.touch.subject, 'router');
});

test('a route with no code of its own is a row, flagged, not a gap', () => {
  const four = R.rank(FIXTURE, {}).find(r => r.key === 'four');
  assert.equal(four.hasOwnCode, false);
  assert.equal(four.quiet, true);
});

test('branches join on the files they touch, carrying the hits', () => {
  const branches = [
    { repo: 'o/r', name: 'claude/x', files: ['one.js', 'README.md'] },
    { repo: 'o/r', name: 'claude/y', files: ['README.md'] },
  ];
  const rows = R.rank(FIXTURE, { branches });
  const one = rows.find(r => r.key === 'one');
  assert.equal(one.branches.length, 1);
  assert.deepEqual(one.branches[0].hits, ['one.js']);
  assert.equal(rows.find(r => r.key === 'four').branches.length, 0);
});

// The tiers, and the reason they beat a flat sort by date. 'one' is dated by
// its own narrow carrier and is the OLDER date; 'two' and 'three' borrow the
// newer wide one. A flat sort would put the borrowers on top, which is the
// reading the pane exists not to make.
test('a row dated by its own code outranks every borrowed one, however fresh', () => {
  const touches = {
    'one.js':  { date: '2026-08-01' },
    'wide.js': { date: '2026-08-12' },
  };
  assert.deepEqual(R.rank(FIXTURE, { touches }).map(r => r.key),
                   ['one', 'two', 'three', 'four']);
});

test('undated rows fall to the bottom rather than to the top', () => {
  const touches = { 'wide.js': { date: '2026-08-12' } };
  const rows = R.rank(FIXTURE, { touches });
  assert.ok(rows.findIndex(r => r.key === 'four') > rows.findIndex(r => r.key === 'two'),
            'an undated row sorted above a dated one');
});

// The branch join takes the same rule as the date. Without it a PR editing one
// wide file reports work open on every route that file carries.
test('a branch hitting only a wide file is near a route, not open on it', () => {
  const branches = [
    { pr: 1, files: ['one.js'] },              // narrow: open on 'one'
    { pr: 2, files: ['wide.js'] },             // wide only: near 'one', 'two', 'three'
  ];
  const rows = R.rank(FIXTURE, { branches });
  const one = rows.find(r => r.key === 'one');
  assert.deepEqual(one.branches.map(b => b.pr), [1]);
  assert.deepEqual(one.nearBranches.map(b => b.pr), [2]);
  const two = rows.find(r => r.key === 'two');
  assert.deepEqual(two.branches.map(b => b.pr), []);
  assert.deepEqual(two.nearBranches.map(b => b.pr), [2]);
});

test('pathsToRead is every carrier plus the shell, deduped', () => {
  assert.deepEqual(R.pathsToRead(FIXTURE).sort(), ['one.js', 'shell.html', 'wide.js']);
});
