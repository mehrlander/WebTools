// docs/docs.json — the documentation registry: the documents census and the
// shared-claims table. The census half is complete by construction: every
// .md/.json file under docs/ has exactly one row, so a file cannot sit in the
// folder unaccounted for (the same completeness gate build-census.py runs for
// budget-drs's data files). The claims half is curated, not complete: a claim
// earns a row by living in more than one place, and this test checks shape and
// vocabulary, not coverage.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';
import { deriveReach, CHANNELS } from '../build/docs-reach.mjs';

const registry = JSON.parse(readFileSync(path.join(repoRoot, 'docs', 'docs.json'), 'utf8'));

// `measured` was added 2026-08-05. Five rows were describing that genre in
// their maintenance prose ("per-claim verification dates", "re-probe on a new
// client") while their status said living, which is the tell that a vocabulary
// is a value short: the column that cannot say it says it somewhere else.
const STATUSES = new Set(['living', 'record', 'measured']);
const RELATIONS = new Set(['copy', 'paraphrase', 'pointer', 'live read']);
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
    else if (/\.(md|json)$/.test(e.name)) out.push(path.relative(repoRoot, p));
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

test('every document row is typed: subject, status, reach, maintenance', () => {
  for (const d of registry.documents) {
    assert.ok(d.subject && d.subject.length > 5, d.path + ': subject');
    assert.ok(STATUSES.has(d.status),
      d.path + ': status must be one of ' + [...STATUSES] + ', got ' + d.status);
    assert.ok(CHANNELS.includes(d.reach),
      d.path + ': reach must be one of ' + CHANNELS + ', got ' + d.reach);
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

test('claims are shaped: one authoritative carrier, typed repetitions, families scoped', () => {
  assert.ok(registry.claims.length > 3, 'the seed claims are present');
  for (const c of registry.claims) {
    const name = c.claim || c.family;
    assert.ok(name, 'a claims row names itself via claim or family');
    assert.ok(!(c.claim && c.family), name + ': claim and family are exclusive');
    if (c.family) assert.ok(c.applies_to, name + ': a family rule states its scope');
    assert.ok(c.authoritative, name + ': authoritative carrier');
    assert.ok(Array.isArray(c.repetitions) && c.repetitions.length > 0, name + ': repetitions');
    for (const r of c.repetitions) {
      assert.ok(r.where, name + ': a repetition says where');
      assert.ok(RELATIONS.has(r.relation), name + ': relation must be one of ' + [...RELATIONS] + ', got ' + r.relation);
      if (r.kept) assert.equal(r.relation, 'copy', name + ': kept applies only to copies');
      if (r.relation === 'copy') assert.ok(r.kept, name + ': a copy says who keeps it');
    }
  }
});

test('paths named as document rows resolve inside the repo', () => {
  for (const d of registry.documents) {
    assert.ok(existsSync(path.join(repoRoot, d.path)), 'missing on disk: ' + d.path);
    assert.ok(statSync(path.join(repoRoot, d.path)).isFile(), 'not a file: ' + d.path);
  }
});
