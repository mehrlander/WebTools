// docs/manifest-fields.csv — the field registry for root `.web-tools.json`.
//
// Flat since 2026-08-16. Members of an array or object key used to be nested
// inside their parent row as `subfields`, which meant the census counted 20 rows
// while its own scope claimed "every key in use". There were 46. They are rows
// now, addressed pages[].path and stage.files, and the parent/child split is
// derived from the key rather than from the shape of the file.
//
// The registry replaces a 3,000-word prose field reference that sat inside
// docs/show-repo.md. Prose could not be checked against anything, and the cost
// showed: `quickLink` was live in two of the estate's four manifests and
// appeared in no field list at all. That is the failure this file exists to
// make loud.
//
// The gate runs one way, and the asymmetry is the point. Every key PRESENT in a
// real manifest must have a row, because an undocumented key in use is the
// defect. The reverse does not hold: every field is optional by design, so a
// row with no current user is a documented field nobody happens to need, not a
// stale row. Completeness in that direction would punish documenting a field
// before adopting it.
//
// The corpus is this repo's own manifest plus any sibling checkout that has
// one. Siblings are opportunistic: a session with only web-tools checked out
// still gets the local check, and one with the estate beside it gets the whole
// picture. A missing sibling is not evidence of anything, so it is skipped
// rather than failed, the same posture link-survey.py takes on an absent store.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';
import { loadRegistries, parseCsv } from '../build/registries-load.mjs';

const rowsAll = parseCsv(readFileSync(path.join(repoRoot, 'docs', 'manifest-fields.csv'), 'utf8'));
// A member row carries its parent in its key; a top-level row does not.
const isMember = k => k.includes('[].') || k.includes('.');
const parentOf = k => k.split(/\[\]\.|\./)[0];
const childOf = k => k.split(/\[\]\.|\./).slice(1).join('.');
const topRows = rowsAll.filter(r => !isMember(r.key));
const memberRows = rowsAll.filter(r => isMember(r.key));
// The consumer domain is declared once, in properties.csv, rather than kept a
// second time here. It used to live in manifest.json's own `consumers` block.
const CONSUMERS = new Set(
  loadRegistries(repoRoot).properties
    .find(p => p.registry === 'manifest-fields' && p.property === 'consumer').values);
const MANIFEST = '.web-tools.json';

// The estate as it sits on disk beside this checkout. Names rather than a glob,
// so a stray directory cannot quietly join the corpus.
const SIBLINGS = ['home', 'chat-histories', 'web-tools-private'];

function manifests() {
  const found = [];
  const own = path.join(repoRoot, MANIFEST);
  if (existsSync(own)) found.push(['mehrlander/web-tools', JSON.parse(readFileSync(own, 'utf8'))]);
  for (const name of SIBLINGS) {
    const p = path.join(repoRoot, '..', name, MANIFEST);
    if (existsSync(p)) {
      try { found.push([`mehrlander/${name}`, JSON.parse(readFileSync(p, 'utf8'))]); }
      catch (e) { found.push([`mehrlander/${name}`, { __unparsable: e.message }]); }
    }
  }
  return found;
}

test('every registry row is typed, and names a consumer the registry declares', () => {
  assert.ok(topRows.length > 10, 'the registry has fields');
  const seen = new Set();
  for (const f of topRows) {
    assert.ok(f.key, 'a field row names itself');
    assert.ok(!seen.has(f.key), f.key + ': appears in two rows');
    seen.add(f.key);
    assert.ok(f.type, f.key + ': type');
    assert.ok(CONSUMERS.has(f.consumer),
      `${f.key}: consumer must be one of ${[...CONSUMERS]}, got ${f.consumer}`);
    assert.ok(f.summary && f.summary.length > 20, f.key + ': summary says what the field does');
  }
  for (const s of memberRows) {
    assert.ok(s.type, `${s.key}: type`);
    assert.ok(s.summary && s.summary.length > 10, `${s.key}: summary`);
    assert.ok(seen.has(parentOf(s.key)), `${s.key}: names a parent with no row of its own`);
  }
});

test('a manifest on disk parses', () => {
  for (const [repo, m] of manifests()) {
    assert.ok(!m.__unparsable, `${repo}: ${MANIFEST} does not parse: ${m.__unparsable}`);
  }
});

// The one that earns its keep. A key used by a real repo and absent from the
// registry is a field somebody added without writing it down, and the reader
// who meets it next has nowhere to look.
test('every key used by a real manifest has a registry row', () => {
  const known = new Set(topRows.map(f => f.key));
  const unknown = [];
  for (const [repo, m] of manifests()) {
    if (m.__unparsable) continue;
    for (const k of Object.keys(m)) if (!known.has(k)) unknown.push(`${repo}: ${k}`);
  }
  assert.deepEqual(unknown, [],
    'these keys are live in a manifest but have no row in docs/manifest-fields.csv; ' +
    'add the row (mark it status: deprecated if it is on the way out) rather than ' +
    'leaving the next reader to guess');
});

test('every declared subfield key used by a real manifest has a subfield row', () => {
  const rows = new Map(topRows.map(f => [f.key, new Set()]));
  for (const m of memberRows) rows.get(parentOf(m.key))?.add(childOf(m.key));
  const unknown = [];
  for (const [repo, m] of manifests()) {
    if (m.__unparsable) continue;
    for (const [k, v] of Object.entries(m)) {
      const sub = rows.get(k);
      if (!sub || sub.size === 0) continue;
      const entries = Array.isArray(v) ? v : [v];
      for (const e of entries) {
        if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
        for (const sk of Object.keys(e)) if (!sub.has(sk)) unknown.push(`${repo}: ${k}[].${sk}`);
      }
    }
  }
  assert.deepEqual([...new Set(unknown)], [],
    'these member keys are live in a manifest but have no row in docs/manifest-fields.csv');
});

test('a manifest value matches its declared type', () => {
  const declared = new Map(topRows.map(f => [f.key, f.type]));
  const actual = v => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
  const wrong = [];
  for (const [repo, m] of manifests()) {
    if (m.__unparsable) continue;
    for (const [k, v] of Object.entries(m)) {
      const want = declared.get(k);
      if (!want) continue; // the previous test owns unknown keys
      const ok = want.split('|').map(s => s.trim()).includes(actual(v));
      if (!ok) wrong.push(`${repo}: ${k} is ${actual(v)}, registry says ${want}`);
    }
  }
  assert.deepEqual(wrong, [], 'a manifest value disagrees with its registry row');
});
