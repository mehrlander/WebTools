// lib/alpineComponents/state-view.js — `feeds`, the consumer chips on each
// derived-cache row, held to the app's own routed view keys.
//
// The chips navigate: each entry is a ?view= key rendered as a chip that calls
// the shell's dispatcher, so a key that stops routing is a chip that goes
// nowhere. That failure is silent. It renders, it is tappable, and the shell's
// routeFromUrl finds no row and falls through to the landing, which reads as a
// slow tap rather than a broken one. Nothing else in the suite reads this
// field, so nothing else would catch a view being renamed out from under it.
//
// The keys are read from docs/app-routes.csv rather than parsed a second time
// out of the shell: app-routes.test.mjs already holds that file to the VIEWS
// table both ways, so the chain here is feeds -> app-routes.csv -> VIEWS, with
// one parse of the shell literal in the suite instead of two that could
// disagree about what "a routed key" means.
//
// No network, no browser: this is a read of two committed files.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';
import { parseCsv } from '../build/registries-load.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/alpineComponents/state-view.js'), 'utf8');

// Every `feeds: [...]` literal in the view: the three crawled caches, the
// entity index (empty, its consumers being pages) and the titles export.
const arrays = [...src.matchAll(/feeds:\s*\[([^\]]*)\]/g)].map(m => m[1]);
const entries = arrays.flatMap(a => [...a.matchAll(/'([^']+)'/g)].map(m => m[1]));

// `shell` is a row in the manifest and not an address: it draws every route and
// is reachable as none of them, so it is not a key a chip could carry.
const routed = new Set(parseCsv(readFileSync(path.join(repoRoot, 'docs/app-routes.csv'), 'utf8'))
  .map(r => r.key).filter(k => k !== 'shell'));

const orphansIn = (keys) => keys.filter(k => !routed.has(k));

test('the feeds literals parse, so a pass is not an empty read', () => {
  assert.ok(arrays.length >= 5, `only ${arrays.length} feeds arrays found; check the literal shape`);
  assert.ok(routed.size > 15, `app-routes.csv parsed suspiciously short: ${routed.size}`);
  assert.ok(entries.length > 5, `only ${entries.length} chips parsed out of ${arrays.length} arrays`);
});

test('every feeds entry is a routed view key', () => {
  assert.deepEqual(orphansIn(entries), [],
    'these chips name a ?view= key the shell does not dispatch, so they render and go nowhere');
});

// A gate that passes on a clean tree would pass identically if it were broken,
// so the same test drives a key that was never routed.
test('the check detects a chip that routes nowhere', () => {
  assert.deepEqual(orphansIn(['estate', 'guides']), ['guides']);
});
