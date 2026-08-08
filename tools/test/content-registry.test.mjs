// lib/kits/content-registry.js — the browser-side registry reader: the CSV parse
// (quoted fields, header-driven columns, fragment locators dropped), locator
// resolution (exact file beats any subtree, longest prefix wins among
// subtrees, null when nothing covers), and the display grouping (authored
// first, mechanical last and collapsed, the registry's description carried as
// the group note only when one locator covers the whole group). Pure logic;
// no network, no DOM.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const w = {};
new Function('window', readFileSync(path.join(repoRoot, 'lib/kits/content-registry.js'), 'utf8'))(w);
const CR = w.ContentRegistry;

const CSV = `locator,creation_mode,analysis_use,description
lib/,hybrid-authored,exclude,Library JavaScript; code register
lib/vendored/,supplied,exclude,Third-party code kept verbatim
dist/,mechanical,exclude,The pre-build
docs/plan.md,human-authored,prose-review,"The plan, hand-written"
skills/,mixed,concept-vocabulary,"Skill prose is authored, schemas are supplied"
notes.md#heading=quotes,supplied,exclude,A fragment row; ignored for paths
`;

test('parse: header-driven, quoted fields, fragment locators dropped', () => {
  const rows = CR.parse(CSV);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[3], { locator: 'docs/plan.md', mode: 'human-authored',
                              use: 'prose-review', description: 'The plan, hand-written' });
  assert.ok(!rows.some(r => r.locator.includes('#')));
  // Reordered columns still land in the right fields.
  const re = CR.parse('creation_mode,locator\nmechanical,gen/\n');
  assert.deepEqual(re, [{ locator: 'gen/', mode: 'mechanical', use: '', description: '' }]);
});

test('resolve: exact file beats subtrees, longest prefix wins, null when uncovered', () => {
  const rows = CR.parse(CSV);
  assert.equal(CR.resolve(rows, 'lib/gh-api.js').locator, 'lib/');
  assert.equal(CR.resolve(rows, 'lib/vendored/thing.js').locator, 'lib/vendored/');
  assert.equal(CR.resolve(rows, 'docs/plan.md').mode, 'human-authored');
  assert.equal(CR.resolve(rows, 'README.md'), null);
});

test('group: authored leads, mechanical trails collapsed, undeclared is a normal state', () => {
  const rows = CR.parse(CSV);
  const files = [
    { path: 'dist/web-tools.js' },
    { path: 'lib/a.js' },
    { path: 'lib/b.js' },
    { path: 'docs/plan.md' },
    { path: 'README.md' },
  ];
  const groups = CR.group(files, rows);
  assert.deepEqual(groups.map(g => g.mode),
    ['human-authored', 'hybrid-authored', 'undeclared', 'mechanical']);
  const mech = groups.find(g => g.mode === 'mechanical');
  assert.equal(mech.collapsed, true);
  assert.equal(mech.note, 'The pre-build');
  const und = groups.find(g => g.mode === 'undeclared');
  assert.equal(und.collapsed, false);
  // A group drawn from ONE locator carries its description; several carry none.
  const hyb = groups.find(g => g.mode === 'hybrid-authored');
  assert.equal(hyb.note, 'Library JavaScript; code register');
  const two = CR.group([{ path: 'lib/a.js' }, { path: 'skills/x.md' }],
                       CR.parse('locator,creation_mode,description\nlib/,hybrid-authored,A\nskills/,hybrid-authored,B\n'));
  assert.equal(two[0].note, '');
  // Every file keeps its resolved row for finer display.
  assert.equal(mech.files[0].entry.locator, 'dist/');
});

test('the repo\'s own registry parses and classifies its own oddballs', () => {
  const rows = CR.parse(readFileSync(path.join(repoRoot, 'data/design/content.csv'), 'utf8'));
  assert.ok(rows.length >= 15);
  // The exact-file row wins over the data/ subtree it sits inside.
  assert.equal(CR.resolve(rows, 'data/design/content.csv').mode, 'hybrid-authored');
  assert.equal(CR.resolve(rows, 'dist/web-tools.js').mode, 'mechanical');
  assert.equal(CR.resolve(rows, 'lib/gh-api.js').mode, 'hybrid-authored');
});
