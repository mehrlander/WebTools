// docs/surfacing.csv — the machine index of the surfacing primitives. Unlike
// routes.json, the PROSE is the authoritative carrier here: SURFACING.md is
// what sessions load and follow, and the manifest is its gated index for the
// Map view's Surfacing tab. This test holds membership two-way: every
// primitive bullet's bold lead-in in SURFACING.md has a manifest row, and
// every row points at a real bullet. The summaries are paraphrases and stay
// unchecked, which docs/docs.csv's claims table says out loud.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsv } from '../build/registries-load.mjs';
import { repoRoot } from './bootstrap.mjs';

const manifest = { primitives: parseCsv(readFileSync(path.join(repoRoot, 'docs', 'surfacing.csv'), 'utf8')) };
const surfacing = readFileSync(path.join(repoRoot, 'docs', 'SURFACING.md'), 'utf8');

// The primitives section: from its heading to the next hr/heading at its level.
const section = surfacing.split('## Surfacing primitives')[1]?.split('\n---')[0] || '';
const norm = (s) => s.replace(/[:.]\s*$/, '').trim();
const leadIns = [...section.matchAll(/^\* \*\*(.+?)\*\*/gm)].map(m => norm(m[1]));

test('the primitives section parses and both sides are non-trivial', () => {
  assert.ok(leadIns.length > 10, 'found primitive bullets in SURFACING.md');
  assert.ok(manifest.primitives.length > 10, 'manifest has rows');
  // The index used to carry a `doc` field naming its authoritative carrier, read
  // by this line and nothing else. That relation is a repetition with an owner,
  // so it is recorded in docs/owners.csv where every other one is, and checked
  // there rather than by a field the registry keeps about itself.
  const owns = parseCsv(readFileSync(path.join(repoRoot, 'docs', 'repetitions.csv'), 'utf8'));
  assert.ok(owns.some(r => r.where.includes('surfacing')),
    'the surfacing index is registered as a repetition of the prose that owns it');
});

test('every SURFACING.md primitive has a manifest row', () => {
  const rows = new Set(manifest.primitives.map(p => norm(p.lead)));
  for (const lead of leadIns) {
    assert.ok(rows.has(lead), 'primitive in SURFACING.md but not the manifest: ' + lead);
  }
});

test('every manifest row points at a real SURFACING.md primitive', () => {
  const doc = new Set(leadIns);
  for (const p of manifest.primitives) {
    assert.ok(doc.has(norm(p.lead)), 'in the manifest but not SURFACING.md: ' + p.lead);
    assert.ok(p.key && p.title && p.use, p.key + ': key/title/use');
  }
});
