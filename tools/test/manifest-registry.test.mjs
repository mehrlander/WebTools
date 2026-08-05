// docs/manifest.json — the field registry for root `.web-tools.json`.
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

const registry = JSON.parse(readFileSync(path.join(repoRoot, 'docs', 'manifest.json'), 'utf8'));
const CONSUMERS = new Set(Object.keys(registry.consumers));
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
  assert.ok(Array.isArray(registry.fields) && registry.fields.length > 10, 'the registry has fields');
  const seen = new Set();
  for (const f of registry.fields) {
    assert.ok(f.key, 'a field row names itself');
    assert.ok(!seen.has(f.key), f.key + ': appears in two rows');
    seen.add(f.key);
    assert.ok(f.type, f.key + ': type');
    assert.ok(CONSUMERS.has(f.consumer),
      `${f.key}: consumer must be one of ${[...CONSUMERS]}, got ${f.consumer}`);
    assert.ok(f.summary && f.summary.length > 20, f.key + ': summary says what the field does');
    for (const s of (f.subfields || [])) {
      assert.ok(s.key, f.key + ': a subfield row names itself');
      assert.ok(s.type, `${f.key}.${s.key}: type`);
      assert.ok(s.summary && s.summary.length > 10, `${f.key}.${s.key}: summary`);
    }
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
  const known = new Set(registry.fields.map(f => f.key));
  const unknown = [];
  for (const [repo, m] of manifests()) {
    if (m.__unparsable) continue;
    for (const k of Object.keys(m)) if (!known.has(k)) unknown.push(`${repo}: ${k}`);
  }
  assert.deepEqual(unknown, [],
    'these keys are live in a manifest but have no row in docs/manifest.json; ' +
    'add the row (mark it status: deprecated if it is on the way out) rather than ' +
    'leaving the next reader to guess');
});

test('every declared subfield key used by a real manifest has a subfield row', () => {
  const rows = new Map(registry.fields.map(f => [f.key, new Set((f.subfields || []).map(s => s.key))]));
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
    'these nested keys are live in a manifest but have no subfield row in docs/manifest.json');
});

test('a manifest value matches its declared type', () => {
  const declared = new Map(registry.fields.map(f => [f.key, f.type]));
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
