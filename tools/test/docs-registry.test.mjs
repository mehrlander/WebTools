// docs/docs.json — the documentation registry: the documents census. Complete
// by construction: every .md/.json/.csv file under docs/ has exactly one row, so a
// file cannot sit in the folder unaccounted for (the same completeness gate
// build-census.py runs for budget-drs's data files).
//
// The shared-ownership table used to ride along here as a second `claims`
// block, checked by a shape test at the bottom of this file. It moved to
// docs/owners.json on 2026-08-09, with tools/test/owners-registry.test.mjs as
// its own gate: a registry does not live inside another registry's carrier, and
// a census and a curated catalog do not want the same checks.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';
import { deriveReach, deriveWords, CHANNELS } from '../build/docs-reach.mjs';

const registry = JSON.parse(readFileSync(path.join(repoRoot, 'docs', 'docs.json'), 'utf8'));

// `measured` was added 2026-08-05. Five rows were describing that genre in
// their maintenance prose ("per-claim verification dates", "re-probe on a new
// client") while their status said living, which is the tell that a vocabulary
// is a value short: the column that cannot say it says it somewhere else.
const STATUSES = new Set(['living', 'record', 'measured']);
// Rows whose maintenance says only that a human wrote it. Not banned, but
// counted: a bare row means nothing keeps the file true, and the count is the
// honest measure of how much of the folder is unheld. It stood at 15 of 42
// when the reach field was added; every one was then rewritten to say what
// actually holds the file, or to say plainly that nothing does.
const BARE = /^authored(?:,? (?:edited in place|by hand))?\.?$/i;

function docsFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) docsFiles(p, out);
    else if (/\.(md|json|csv)$/.test(e.name)) out.push(path.relative(repoRoot, p));
  }
  return out;
}

test('every docs/ file is claimed by exactly one document row, and every row exists', () => {
  const onDisk = new Set(docsFiles(path.join(repoRoot, 'docs')));
  const rows = registry.documents.map(d => d.path);
  const rowSet = new Set(rows);
  assert.equal(rows.length, rowSet.size, 'a path appears in two document rows');
  for (const p of onDisk) assert.ok(rowSet.has(p), 'in docs/ but not in the registry: ' + p);
  for (const p of rowSet) assert.ok(onDisk.has(p), 'in the registry but not on disk: ' + p);
});

test('every document row is typed: subject, status, reach, words, maintenance', () => {
  for (const d of registry.documents) {
    assert.ok(d.subject && d.subject.length > 5, d.path + ': subject');
    assert.ok(STATUSES.has(d.status),
      d.path + ': status must be one of ' + [...STATUSES] + ', got ' + d.status);
    assert.ok(CHANNELS.includes(d.reach),
      d.path + ': reach must be one of ' + CHANNELS + ', got ' + d.reach);
    assert.ok(Number.isInteger(d.words) && d.words >= 0,
      d.path + ': words must be a non-negative integer, got ' + d.words);
    assert.ok(d.maintenance && d.maintenance.length > 5, d.path + ': maintenance');
  }
});

// Reach is derived, never declared. The registry carries a copy so the Docs tab
// can render it without walking the repo, and this holds the copy to the
// derivation on every run. Add a doc, or name an existing one from a skill or a
// page, and the field moves on its own; forget to restamp it and this fails
// with the command that fixes it.
test('the declared reach of every document matches the derivation', () => {
  const derived = deriveReach(repoRoot, registry.documents.map(d => d.path));
  for (const d of registry.documents) {
    const { channel, via } = derived.get(d.path);
    assert.equal(d.reach, channel,
      `${d.path}: declared reach "${d.reach}" but derivation says "${channel}"` +
      (via ? ` (named by ${via})` : '') + '; restamp with: npm run docs-reach');
  }
});

// Words is the second derived field and is held the same way. It matters more
// than it looks: reach counts files and words weighs them, and on this folder
// the two disagree sharply. The 17 orphans are 40% of the files and 17% of the
// words, so a registry carrying only the count points at the tail while the
// mass sits in a handful of reachable documents.
//
// This assertion also pins the fixpoint. docs.json is itself a row, so its
// stored size is only correct if the stamp re-ran until the file stopped
// changing; a builder that settled for one pass would fail here on its own row
// and nowhere else.
test('the declared words of every document matches the derivation', () => {
  const derived = deriveWords(repoRoot, registry.documents.map(d => d.path));
  for (const d of registry.documents) {
    assert.equal(d.words, derived.get(d.path),
      `${d.path}: declared ${d.words} words but the file has ${derived.get(d.path)}` +
      '; restamp with: npm run docs-reach');
  }
});

// Not a ban, a ledger. A bare "authored" row is a file nothing holds true, and
// the point of the census is that such a file is visible rather than dressed.
// If this number climbs, rows are being filled to satisfy the census gate
// instead of being thought about, which is what happened the first time.
test('no document row has been filled in with a bare "authored"', () => {
  const bare = registry.documents.filter(d => BARE.test(d.maintenance.trim()));
  assert.deepEqual(bare.map(d => d.path), [],
    'these rows say only that a human wrote the file; say what keeps it true, ' +
    'or say plainly that nothing does');
});

test('paths named as document rows resolve inside the repo', () => {
  for (const d of registry.documents) {
    assert.ok(existsSync(path.join(repoRoot, d.path)), 'missing on disk: ' + d.path);
    assert.ok(statSync(path.join(repoRoot, d.path)).isFile(), 'not a file: ' + d.path);
  }
});
