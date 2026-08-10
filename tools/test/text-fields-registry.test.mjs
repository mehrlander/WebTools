// text-fields-registry.test.mjs — holds docs/text-fields.csv, the estate's
// vocabulary of prose field names, to the properties it claims for itself.
//
// The vocabulary exists because 65 distinct field names were carrying what is
// broadly a dozen concepts, 80% of them in exactly one carrier, so nothing
// could ask the estate for its authored rationale and get an answer
// (docs/text-content.md). Two things then have to stay true, and neither is
// obvious from reading the file:
//
//   The alias map has to be a FUNCTION. One old name maps to one new name, or
//   the survey's arrow lies: `scripts/text-carriers.py` resolves an
//   off-vocabulary name through `instead_of`, and a name listed under two
//   fields would resolve to whichever row it read last.
//
//   An alias may not also be a sanctioned name, or a carrier using it is
//   simultaneously conformant and deprecated. `load_vocab` already skips such
//   an alias, so the collision would be silent rather than wrong: the failure
//   this catches is a vocabulary that quietly means less than it says.
//
// The row count is asserted for the same reason properties-registry.test.mjs
// asserts its ungoverned count. A vocabulary that grows a name whenever a
// carrier wants one is not a vocabulary, so the number moves deliberately or
// not at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const raw = readFileSync(path.join(repoRoot, 'docs', 'text-fields.csv'), 'utf8');

// Minimal RFC4180: quoted cells carrying commas and doubled quotes, which every
// prose column here does.
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.some(v => v.trim()))
             .map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const rows = parseCsv(raw);
const FIELDS = new Set(rows.map(r => r.field));
const AUDIENCES = new Set(['reader', 'editor']);
const EXPECTED_NAMES = 13;

function aliasesOf(r) {
  return (r.instead_of || '').split(',').map(s => s.trim()).filter(Boolean);
}

test('the vocabulary is the declared size', () => {
  assert.equal(rows.length, EXPECTED_NAMES,
    `docs/text-fields.csv has ${rows.length} names, expected ${EXPECTED_NAMES}. ` +
    'Adding one is a decision about the estate\'s vocabulary, so change this number in ' +
    'the same commit and say why in docs/text-content.md.');
});

test('every row is typed: field, audience, gloss, use_when', () => {
  for (const r of rows) {
    assert.match(r.field, /^[a-z][a-z_]*$/, `field name: ${r.field}`);
    assert.ok(AUDIENCES.has(r.audience),
      `${r.field}: audience must be reader or editor, got "${r.audience}"`);
    assert.ok(r.gloss && r.gloss.length > 20, `${r.field}: gloss too thin`);
    assert.ok(r.use_when && r.use_when.length > 20,
      `${r.field}: use_when is the column that settles which name to pick; a definition ` +
      'without it leaves the choice exactly as unresolved as it was');
  }
});

test('field names are unique', () => {
  assert.equal(FIELDS.size, rows.length, 'a field name appears twice');
});

test('the alias map is a function: no name maps to two fields', () => {
  const seen = new Map();
  for (const r of rows) {
    for (const a of aliasesOf(r)) {
      const prior = seen.get(a);
      assert.ok(!prior,
        `alias "${a}" is claimed by both ${prior} and ${r.field}; the survey would ` +
        'resolve it to whichever row it read last');
      seen.set(a, r.field);
    }
  }
});

test('no alias is also a sanctioned name', () => {
  for (const r of rows) {
    for (const a of aliasesOf(r)) {
      assert.ok(!FIELDS.has(a),
        `"${a}" is both a sanctioned name and an alias of ${r.field}; a carrier using it ` +
        'would be conformant and deprecated at once');
    }
  }
});

test('every sanctioned name is prose about a row, not a row identifier', () => {
  // The survey skips identifier-shaped columns (title, name, id, path) before it
  // ever checks the vocabulary, so sanctioning one would create a name that can
  // never match anything.
  const IDENTIFIERS = new Set(['title', 'name', 'id', 'key', 'path', 'label', 'url']);
  for (const r of rows) {
    assert.ok(!IDENTIFIERS.has(r.field),
      `${r.field} is an identifier; text-carriers.py filters those out before the ` +
      'vocabulary check, so the name could never match');
  }
});
