// properties-registry.test.mjs — holds docs/properties.json, the declaration
// table of docs/registries.md, to the carriers it governs.
//
// The model's integrity rules, as checks: every governed carrier exists and
// parses; within one, row fields are exactly the declared key plus declared
// properties (an undeclared field is an unaccounted classification, the drift
// the registry exists to catch; a declared property absent everywhere is a
// stale declaration); every computed declaration names a deriver that exists,
// and no recorded declaration names one. The registry is NOT a schema
// registry: registry-level blocks (notes, glossaries) are outside the rule,
// and files it does not govern are untouched.
//
// `fields` is the reconciliation's addition (2026-08-09). The estate ran
// thirteen registry-like mechanisms while six were declared, and five of the
// seven found could not be field-governed for reasons that are facts about the
// carrier rather than neglect: a bare array of groups, a deriver that ships in
// the plugin rather than this repo, four sibling blocks in one file, an index of
// prose, a target that is a manifest key. Declaring them `ungoverned` with a
// written `why` counts them instead of omitting them, which is the same
// count-rather-than-ban posture the censuses run for authored judgment. The
// number is asserted below so it can only move deliberately.
//
// It has moved once, down: the pages catalog was governed the same day, and
// the fix was the group walk in rowsAt() rather than anything about the
// carrier. That is the ledger working as intended, and the reason the count is
// asserted rather than merely reported.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const reg = JSON.parse(readFileSync(path.join(repoRoot, 'docs', 'properties.json'), 'utf8'));

const decls = reg.declarations;
const byRegistry = new Map(reg.registries.map(r => [r.id, r]));

// A `rows` spec addresses the row array inside a JSON carrier. Two shapes are
// in use. A named key ("documents") is the common one. A group walk
// ("[].items") is what pages/pages.json needs: its top level is the GROUPING,
// and the rows that carry per-page properties sit one level down. The carrier
// was left alone rather than reshaped into { groups: [...] }, because its
// layout is a published contract that show-repo reads for this repo and for
// every other repo's pages catalog; the limitation was the gate assuming one
// flat named array, so the gate is what moved.
function rowsAt(doc, spec) {
  let vals = [doc];
  for (const seg of spec.split('.')) {
    vals = seg === '[]'
      ? vals.flatMap(v => (Array.isArray(v) ? v : []))
      : vals.map(v => (v == null ? undefined : v[seg])).filter(v => v !== undefined);
  }
  return vals.flatMap(v => (Array.isArray(v) ? v : [v]));
}

// CSV parsing good enough for these carriers: quoted fields may contain commas
// and doubled quotes, which content.csv's prose notes do.
function parseCsv(raw) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (q) {
      if (c === '"' && raw[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.length > 1);
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

function carrierRows(r) {
  const raw = readFileSync(path.join(repoRoot, r.carrier), 'utf8');
  const rows = r.format === 'csv' ? parseCsv(raw) : rowsAt(JSON.parse(raw), r.rows);
  assert.ok(rows.length > 0, `${r.carrier}: no rows at "${r.rows ?? 'the CSV body'}"`);
  return rows;
}

function carrierFields(r) {
  if (r.format === 'csv') {
    // The header row carries the column set; quoting never appears in headers.
    const raw = readFileSync(path.join(repoRoot, r.carrier), 'utf8');
    return new Set(raw.split('\n')[0].trim().split(','));
  }
  const fields = new Set();
  for (const row of carrierRows(r)) {
    assert.ok(row[r.key] !== undefined && row[r.key] !== '',
      `${r.carrier}: a row is missing its key field "${r.key}"`);
    for (const k of Object.keys(row)) fields.add(k);
  }
  return fields;
}

test('registries are well-formed: unique ids, carriers and gates exist', () => {
  const ids = reg.registries.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate registry id');
  for (const r of reg.registries) {
    assert.ok(existsSync(path.join(repoRoot, r.carrier)), `${r.id}: carrier ${r.carrier} does not exist`);
    if (r.gate) assert.ok(existsSync(path.join(repoRoot, r.gate)), `${r.id}: gate ${r.gate} does not exist`);
    assert.ok(r.target, `${r.id}: no target grain; the model's targets are not all files, and a ` +
      `registry that does not say what it asserts about cannot be checked against a population`);
    assert.ok(['census', 'catalog'].includes(r.kind), `${r.id}: kind must be census or catalog`);
  }
  for (const d of decls) {
    assert.ok(byRegistry.has(d.registry), `declaration ${d.property}: unknown registry ${d.registry}`);
  }
});

// A ledger, not a ban. Ungoverned is an honest state with a stated cause; what
// it must never become is a quiet default for a carrier nobody wanted to type.
test('every ungoverned registry says why, and the count is the one on the books', () => {
  const ungoverned = reg.registries.filter(r => r.fields === 'ungoverned');
  for (const r of reg.registries) {
    assert.ok(['governed', 'ungoverned'].includes(r.fields),
      `${r.id}: fields must be governed or ungoverned, got ${r.fields}`);
    if (r.fields === 'ungoverned') {
      assert.ok(r.why && r.why.length > 40,
        `${r.id}: ungoverned needs a written reason naming what about the carrier prevents it`);
    } else {
      assert.ok(!r.why, `${r.id}: why belongs to an ungoverned registry`);
      assert.ok(r.key, `${r.id}: a governed registry names its key field`);
      // A CSV carrier has one implicit row set, so only JSON needs the pointer.
      if (r.format === 'json') assert.ok(r.rows, `${r.id}: a governed JSON carrier names its row array`);
    }
  }
  assert.equal(ungoverned.length, 3,
    'the ungoverned count moved. Down is progress and the number should follow; up means a ' +
    'carrier was declared without being governed, which wants a reason in the commit message');
});

test('each governed carrier holds exactly its key plus its declared properties', () => {
  for (const r of reg.registries.filter(r => r.fields === 'governed')) {
    const declared = new Set(decls.filter(d => d.registry === r.id).map(d => d.property));
    const fields = carrierFields(r);
    for (const f of fields) {
      assert.ok(f === r.key || declared.has(f),
        `${r.carrier}: field "${f}" carries no declaration in docs/properties.json; ` +
        `declare the property or it is an unaccounted classification`);
    }
    for (const p of declared) {
      assert.ok(fields.has(p),
        `${r.carrier}: declared property "${p}" appears in no row; retire the declaration or fix the carrier`);
    }
  }
});

// Declaring a closed domain and never checking it is the failure the origin
// instrument does not have: budget-drs's verify-properties.py hard-fails on any
// value outside the declared set, and that hard-fail is most of what makes its
// registry load-bearing. This gate declared eight closed domains and read none
// of them until 2026-08-09. A blank is legal wherever `required` is not
// `value`, since the censuses count blanks rather than banning them.
test('every value in a closed domain is in that domain', () => {
  for (const r of reg.registries.filter(r => r.fields === 'governed')) {
    const closed = decls.filter(d => d.registry === r.id && Array.isArray(d.values));
    if (!closed.length) continue;
    const rows = carrierRows(r);
    for (const d of closed) {
      const allowed = new Set(d.values);
      for (const row of rows) {
        const v = row[d.property];
        if (v === undefined || v === '') {
          assert.notEqual(d.required, 'value',
            `${r.carrier}: ${d.property} is blank on a row but declared required:value`);
          continue;
        }
        assert.ok(allowed.has(v),
          `${r.carrier}: ${d.property}="${v}" is outside its declared domain ` +
          `[${d.values.join(', ')}]. Widen the declaration or fix the row.`);
      }
    }
  }
});

test('modes are coherent: computed names a real deriver, recorded names none', () => {
  for (const d of decls) {
    if (d.mode === 'computed') {
      assert.ok(d.deriver, `${d.registry}.${d.property}: computed with no deriver`);
      assert.ok(existsSync(path.join(repoRoot, d.deriver)),
        `${d.registry}.${d.property}: deriver ${d.deriver} does not exist`);
    } else {
      assert.equal(d.mode, 'recorded', `${d.registry}.${d.property}: unknown mode ${d.mode}`);
      assert.ok(!d.deriver, `${d.registry}.${d.property}: recorded but names a deriver`);
    }
    assert.ok(['value', 'counted', 'none'].includes(d.required),
      `${d.registry}.${d.property}: unknown required grade ${d.required}`);
  }
  // One owner per pair within a registry; cross-registry reuse of a property
  // name is legal when scopes are disjoint (kind, role, title do this).
  const pairs = decls.map(d => d.registry + ' ' + d.property);
  assert.equal(new Set(pairs).size, pairs.length, 'a property is declared twice for one registry');
});
