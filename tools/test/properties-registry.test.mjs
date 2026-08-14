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
// `fields` is the reconciliation's addition (2026-08-09), and it is now a
// PROHIBITION rather than a ledger: the assertion below reads zero. The estate ran
// thirteen registry-like mechanisms while six were declared, and five of the
// seven found could not be field-governed for reasons that are facts about the
// carrier rather than neglect: a bare array of groups, a deriver that ships in
// the plugin rather than this repo, four sibling blocks in one file, an index of
// prose, a target that is a manifest key. Declaring them `ungoverned` with a
// written `why` counts them instead of omitting them, which is the same
// count-rather-than-ban posture the censuses run for authored judgment. The
// number is asserted below so it can only move deliberately.
//
// It moved four times in two days, always down, and ended at zero: all five
// reasons were wrong on inspection, two being false statements about the repo
// and three being statements about this gate mistaken for statements about a
// carrier. So the ledger became a prohibition. `fields` survives only so that
// adding an ungoverned carrier has to change this test, which is a deliberate
// act; the record says such a reason is more likely an unchecked assumption
// than a fact. docs/registries.md carries the five and what each got wrong.

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
  assert.equal(ungoverned.length, 0,
    'a carrier was declared ungoverned. Every one of the five that ever claimed this was wrong ' +
    'on inspection, so check the carrier before believing the reason: is there a keyed row array ' +
    'anywhere in it, possibly under a dotted or [] path, and may it be a second registry sharing ' +
    'the carrier? If it truly cannot be governed, say why here and raise this number.');
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

// `required` was the next unchecked claim after `why`, and the same audit found
// the same shape of rot: 54 declarations said `value`, nothing read any of
// them, and three were false. Two were tests-census fields that are blank on
// the ten browser-driven checks (blank, never zero, because test() is not their
// unit), which is a `counted` figure wearing a `value` grade. The third was
// pages-catalog.title, blank on one page that genuinely had no <title>; there
// the data was wrong rather than the grade, and the page got a title.
//
// So `value` now means what it says on every governed property, not only on the
// ones that happen to carry a closed domain.
test('every required:value property is present on every row', () => {
  for (const r of reg.registries.filter(r => r.fields === 'governed')) {
    const required = decls.filter(d => d.registry === r.id && d.required === 'value');
    if (!required.length) continue;
    const rows = carrierRows(r);
    for (const d of required) {
      const blank = rows.filter(row => {
        const v = row[d.property];
        return v === undefined || v === null || v === '' ||
          (Array.isArray(v) && v.length === 0);
      });
      assert.equal(blank.length, 0,
        `${r.carrier}: ${d.property} is declared required:value but is blank on ` +
        `${blank.length} of ${rows.length} rows. Either fill them, or grade it "counted" ` +
        `(a blank that means something and is worth a ledger figure) or "none".`);
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
  // One owner per pair within a registry. Cross-registry reuse of a property
  // NAME is legal and common (kind, role, title, note all do it); what is not
  // legal is two registries asserting it about the same target, which the
  // ownership gate below decides on the assertions rather than on the names.
  const pairs = decls.map(d => d.registry + '\0' + d.property);
  assert.equal(new Set(pairs).size, pairs.length, 'a property is declared twice for one registry');
});

// A registry row is itself an unaccounted classification unless something holds
// its shape. properties.json is the index rather than a peer, so no declaration
// governs it and the field check above cannot reach it. This is that check,
// self-applied. `area` is the reader's grouping and its rule is one question,
// stated in docs/registries.md: does the target have a path in this tree? Nine
// files, seven names. The first cut was three, splitting the names by topic,
// which did not survive: two of them were names a program parses and two were
// vocabulary a person picks from, so the seam ran through the group.
const AREAS = ['files', 'names'];
const REGISTRY_FIELDS = new Set(['id', 'area', 'title', 'gloss', 'carrier', 'format', 'key',
  'identity', 'rows', 'kind', 'target', 'scope', 'gate', 'fields', 'why']);

test('every registry declares its area, and leads with a title and a gloss', () => {
  for (const r of reg.registries) {
    assert.ok(AREAS.includes(r.area),
      `${r.id}: area must be one of ${AREAS.join(', ')}, got ${JSON.stringify(r.area)}`);
    assert.ok(r.title && r.title.length <= 40,
      `${r.id}: needs a short title, the identity a reader meets before the mechanics`);
    assert.ok(r.gloss && r.gloss.length > 40,
      `${r.id}: needs a gloss, one sentence on what it governs for someone who does not know`);
    assert.notEqual(r.title, r.gloss, `${r.id}: title and gloss are doing the same job`);
    for (const f of Object.keys(r)) {
      assert.ok(REGISTRY_FIELDS.has(f),
        `${r.id}: registry field "${f}" is not accounted for. The index governs the carriers and ` +
        `nothing governs the index, so add it to REGISTRY_FIELDS deliberately or drop it.`);
    }
  }
  // Every declaration already glossed its property; no registry did, and that
  // asymmetry is what this pair of fields closes.
  for (const d of decls) assert.ok(d.gloss, `${d.registry}.${d.property}: no gloss`);
});

// THE OWNERSHIP GATE. docs/registries.md: "Any applicable target x property
// resolves to at most one authoritative registry ... Two registries claiming
// the same pair is an invalid configuration, surfaced by the gate, never
// resolved by precedence." That rule was written on 2026-08-08 and nothing read
// it, so it was false in two places when this gate first ran: harness-census
// and portable-catalog both asserted `role` over nine scripts (paraphrases, one
// already stale on .mjs and .py), and pages-catalog and tools-gallery both
// asserted `title` and `note` over four pages (note differed on all four).
// Both are resolved by inheritance, not by renaming: a rename would defuse this
// gate while leaving one claim stored twice, which is worse than the collision.
//
// It decides on ASSERTIONS, not declarations. A blank is not an assertion, so a
// crosswalk may declare a property it fills only where no census owns it. And
// it compares only registries whose key resolves to a shared identity space,
// declared as `identity`: "path" where the key is a repo-relative path,
// "path:<prefix>" where it is relative to one. Absent means opaque, and an
// opaque target never collides, which is honest rather than lax: a route key
// and a docs path are not the same kind of name, so no comparison of them means
// anything. Matching is exact, so content.csv's directory locators do not
// collide with the files beneath them; nesting is a scope question the model
// handles by subtraction, and deliberately not this gate's business.
function identityOf(r, row) {
  if (!r.identity) return null;
  const raw = String(row[r.key] ?? '');
  if (!raw) return null;
  // A qualified cross-repo ref (owner/repo[@ref]:path) addresses another repo
  // and shares no identity space with a bare path here.
  if (raw.includes(':')) return null;
  return (r.identity.startsWith('path:') ? r.identity.slice(5) : '') + raw;
}

function assertionOwners() {
  const seen = new Map();   // identity -> Map(property -> [registry id])
  for (const r of reg.registries.filter(r => r.identity && r.fields === 'governed')) {
    const declared = decls.filter(d => d.registry === r.id).map(d => d.property);
    for (const row of carrierRows(r)) {
      const id = identityOf(r, row);
      if (!id) continue;
      for (const prop of declared) {
        const v = row[prop];
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
        if (!seen.has(id)) seen.set(id, new Map());
        const byProp = seen.get(id);
        byProp.set(prop, [...(byProp.get(prop) ?? []), r.id]);
      }
    }
  }
  return seen;
}

test('no target answers to two registries for the same property', () => {
  const conflicts = [];
  for (const [id, byProp] of assertionOwners()) {
    for (const [prop, owners] of byProp) {
      if (owners.length > 1) conflicts.push(`${id} . ${prop} <- ${owners.join(' and ')}`);
    }
  }
  assert.deepEqual(conflicts, [],
    `${conflicts.length} target/property pairs are claimed by two registries. This is an invalid ` +
    `configuration, not a precedence question: decide which registry owns the claim, blank it in ` +
    `the other, and join the two at render time. Do NOT rename one of the properties, which hides ` +
    `the duplication from this gate without removing it.\n  ` + conflicts.join('\n  '));
});

// The gate above passes on a clean tree, so a broken one would pass identically.
// This drives the same normalizer with a synthetic pair to prove it can still
// bring two spellings of one target together.
test('the ownership gate still fires when two registries do claim one pair', () => {
  const a = { id: 'a', identity: 'path', key: 'path' };
  const b = { id: 'b', identity: 'path:pages/', key: 'href' };
  const owners = new Map();
  for (const [r, row] of [[a, { path: 'pages/x.html' }], [b, { href: 'x.html' }]]) {
    const id = identityOf(r, row);
    owners.set(id, [...(owners.get(id) ?? []), r.id]);
  }
  assert.deepEqual(owners.get('pages/x.html'), ['a', 'b'],
    'the identity normalizer no longer brings two spellings of one target together');
});

// A crosswalk earns its shape only if the inheritance resolves. A Tools row
// whose page is gone renders with no title and no description, the silent-blank
// failure that dropping those fields makes possible.
test('every tools-gallery row resolves to a page the gallery owns', () => {
  const tools = reg.registries.find(r => r.id === 'tools-gallery');
  const pages = reg.registries.find(r => r.id === 'pages-catalog');
  const known = new Set(carrierRows(pages).map(row => 'pages/' + row[pages.key]));
  for (const row of carrierRows(tools)) {
    const p = row[tools.key];
    if (p.includes(':')) continue;   // a cross-repo ref is not this repo's to check
    assert.ok(known.has(p),
      `docs/tools.json: "${p}" is not a row in pages/pages.json, so the Tools view has no title ` +
      `or description to inherit for it`);
  }
});
