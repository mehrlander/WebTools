// docs/owners.csv + docs/repetitions.csv — the owners registry: for a statement repeated across the
// hub's coordination layer, which carrier is authoritative and how every other
// mention relates to it.
//
// This gate is the reconciliation's answer to the one real maintenance hole the
// table had. Until 2026-08-09 the only check on it asserted `length > 3` ("the
// seed claims are present") and the row shape. Nothing verified that a cited
// carrier still existed, so the table could rot silently and the question "will
// anyone keep this current" was unanswerable rather than merely unanswered.
// Measured at the time this landed: 29 path-shaped references, 0 unresolved.
// The point of resolving them on every run is that the number stays honest.
//
// What is deliberately NOT checked: coverage. The registry is curated against a
// written scope (the `scope` field), and whether some fourth document has begun
// repeating a statement nobody has filed is not decidable from the carrier. The
// detectors answer that question (home's tools/duplicated-claims-survey.py,
// tools/concept-lab/termlab.py); a census gate here would only assert that the
// file agrees with itself.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';
import { loadRegistries, parseCsv } from '../build/registries-load.mjs';

const read = (f) => parseCsv(readFileSync(path.join(repoRoot, 'docs', f), 'utf8'));
// Rejoined for the assertions that read a statement with its repetitions. The
// files stay split because a repetition is a different target from a statement.
const reps = read('repetitions.csv');
const rows = read('owners.csv').map(r => ({
  ...r, repetitions: reps.filter(p => p.subject === r.subject),
}));

// Both domains are declared in properties.csv now, not kept a second time here.
// The repetitions table split out of owners.json on 2026-08-16: a repetition is a
// different target from the statement it repeats, so it is its own registry.
const domain = (registry, property) =>
  new Set(loadRegistries(repoRoot).properties
    .find(p => p.registry === registry && p.property === property).values);
const RELATIONS = domain('repetitions', 'relation');
const KINDS = domain('owners', 'kind');

// A locator is prose that names files. Pull the path-shaped tokens out of it
// rather than demanding a structured field: the prose says WHICH PART of the
// file carries the statement ("docs/PORTABLE.md Docs table"), which is the part
// worth reading, and a bare path column would lose it. Extensions are closed to
// the ones the estate commits, so "e.g." and version strings do not match.
// The lookbehind, rather than \b, is what lets a dotfile path match: \b would
// start the token after the leading dot and turn .claude-plugin/marketplace.json
// into a path that resolves nowhere.
const PATHISH = /(?<![\w.\-/])[.\w\-/]+?\.(?:md|json|html|mjs|js|py|sh|csv)\b/g;

// Rows name files both ways: fully ("docs/PORTABLE.md Docs table") and by
// basename once the folder is obvious from context ("routes-manifest.test.mjs").
// Both are checked, against the tracked tree rather than the filesystem, so an
// untracked scratch file cannot satisfy a locator.
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\0').filter(Boolean);
const trackedPaths = new Set(tracked);
const trackedNames = new Set(tracked.map(p => p.split('/').pop()));

const resolves = tok => (tok.includes('/') ? trackedPaths.has(tok) : trackedNames.has(tok));

function locators(row) {
  const out = [row.authoritative];
  for (const r of row.repetitions) out.push(r.where, r.check || '');
  return out;
}

test('the registry states its own scope', () => {
  const scope = loadRegistries(repoRoot).registries.find(r => r.id === 'owners').scope;
  assert.ok(scope && scope.length > 80,
    'the owners registry must carry a written scope: a dozen rows against an unstated denominator ' +
    'reads as a sample of the estate rather than a population of the coordination layer');
});

test('rows are keyed by a unique subject and typed by kind', () => {
  const subjects = rows.map(r => r.subject);
  for (const s of subjects) assert.ok(s, 'a row names no subject');
  assert.equal(new Set(subjects).size, subjects.length,
    'two rows share a subject; one subject has one owner');
  for (const r of rows) {
    assert.ok(KINDS.has(r.kind), `${r.subject}: kind must be one of ${[...KINDS]}, got ${r.kind}`);
  }
});

// The distinction the old schema drew with two exclusive keys, and the reason
// the table held two different objects: a family row is a DECLARATION in
// registries.md's sense (scope x property -> the carrier that owns it), not an
// assertion about one statement. It stays here rather than moving to
// the registry pair because its file is DISTRIBUTED (every skill's own
// SKILL.md), and the declaration table's registries name a single carrier path.
// See docs/registries.md, "What reconciliation found".
test('a family row scopes itself; a statement row does not pretend to', () => {
  for (const r of rows) {
    if (r.kind === 'family') {
      assert.ok(r.applies_to, `${r.subject}: a family rule must state the scope it applies to`);
    } else {
      assert.ok(!r.applies_to, `${r.subject}: applies_to belongs to a family rule, not a statement`);
    }
  }
});

test('every row names one authoritative carrier and at least one repetition', () => {
  for (const r of rows) {
    assert.ok(r.authoritative, `${r.subject}: no authoritative carrier`);
    assert.ok(Array.isArray(r.repetitions) && r.repetitions.length > 0,
      `${r.subject}: a row with no repetition is not a shared statement; retire it`);
    for (const rep of r.repetitions) {
      assert.ok(rep.where, `${r.subject}: a repetition says where`);
      assert.ok(RELATIONS.has(rep.relation),
        `${r.subject}: relation must be one of ${[...RELATIONS]}, got ${rep.relation}`);
      if (rep.kept) assert.equal(rep.relation, 'copy', `${r.subject}: kept applies only to copies`);
      if (rep.relation === 'copy') assert.ok(rep.kept, `${r.subject}: a copy says who keeps it`);
    }
  }
});

// The maintenance gate. A locator that no longer resolves is the failure mode
// the table is most exposed to, because nothing else in the repo reads it.
test('every path named by a locator resolves in the repo', () => {
  const dead = [];
  let total = 0;
  for (const r of rows) {
    for (const text of locators(r)) {
      for (const p of String(text).match(PATHISH) || []) {
        total++;
        if (!resolves(p)) dead.push(`${r.subject}: ${p}`);
      }
    }
  }
  assert.ok(total > 20, `only ${total} path-shaped locators found; the extractor has stopped matching`);
  assert.deepEqual(dead, [],
    'these locators name files that no longer exist; repoint the row or retire it');
});
