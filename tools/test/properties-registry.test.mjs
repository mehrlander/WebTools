// properties-registry.test.mjs — holds docs/registries.csv and docs/properties.csv,
// the registry pair behind docs/registries.md, to the files they govern.
//
// Since 2026-08-16 the pair governs ITSELF: both have a row in registries.csv and
// every one of their columns has a property definition, which is how `kind` finally
// carries a value domain instead of a special rule.
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
import { loadRegistries } from '../build/registries-load.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const reg = loadRegistries(repoRoot);

const decls = reg.properties;
const byRegistry = new Map(reg.registries.map(r => [r.id, r]));

// A second CSV reader, deliberately not the one under tools/build/. This gate
// asserts what the carriers hold, so borrowing the loader's parser would let a
// parser bug agree with itself. Quoted fields may contain commas and doubled
// quotes, which the prose notes do.
function parseCsv(raw) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (q) {
      if (c === '"' && raw[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.length > 1);
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

function carrierRows(r) {
  const rows = parseCsv(readFileSync(path.join(repoRoot, r.file), 'utf8'));
  assert.ok(rows.length > 0, `${r.file}: no rows`);
  for (const row of rows)
    for (const k of r.key.split('+'))
      assert.ok(row[k] !== undefined && row[k] !== '',
        `${r.file}: a row is missing its key field "${k}"`);
  return rows;
}

// The column set is the header row, which never carries quoting. Read from the
// bytes rather than from the parsed rows, so a column that is blank on every
// row is still declared rather than silently absent.
function carrierFields(r) {
  const raw = readFileSync(path.join(repoRoot, r.file), 'utf8');
  return new Set(raw.split('\n')[0].trim().split(','));
}

test('registries are well-formed: unique ids, carriers and gates exist', () => {
  const ids = reg.registries.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate registry id');
  for (const r of reg.registries) {
    assert.ok(existsSync(path.join(repoRoot, r.file)), `${r.id}: file ${r.file} does not exist`);
    // `none` is the token for "nothing holds this registry", distinct from a
    // blank, which in CSV can only mean not asserted. Every gate is a path or
    // that word.
    if (r.gate && r.gate !== 'none')
      assert.ok(existsSync(path.join(repoRoot, r.gate)), `${r.id}: gate ${r.gate} does not exist`);
    assert.ok(r.target, `${r.id}: no target grain; the model's targets are not all files, and a ` +
      `registry that does not say what it asserts about cannot be checked against a population`);
    // `kind`'s domain is no longer a list in this file. It is declared in
    // properties.csv like every other closed domain, and enforced by the domain
    // check below, which is the whole point of the index governing itself.
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
      // Every registry is a CSV as of 2026-08-18, which is what makes "a
      // registry is a file" true by construction: a CSV cannot hold two tables,
      // so no carrier needs a pointer saying which key holds the rows, and no
      // two registries can quietly share one file again.
      assert.ok(r.file.endsWith('.csv'), `${r.id}: a registry carrier is a CSV`);
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
      assert.ok(r.key.split('+').includes(f) || declared.has(f),
        `${r.file}: field "${f}" carries no declaration in docs/properties.csv; ` +
        `declare the property or it is an unaccounted classification`);
    }
    for (const p of declared) {
      assert.ok(fields.has(p),
        `${r.file}: declared property "${p}" appears in no row; retire the declaration or fix the carrier`);
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
            `${r.file}: ${d.property} is blank on a row but declared required:value`);
          continue;
        }
        assert.ok(allowed.has(v),
          `${r.file}: ${d.property}="${v}" is outside its declared domain ` +
          `[${d.values.join(', ')}]. Widen the declaration or fix the row.`);
      }
    }
  }
});

// `required` was the next unchecked claim after `why`, and the same audit found
// the same shape of rot: 54 declarations said `value`, nothing read any of
// them, and three were false. Two were tests fields that are blank on
// the ten browser-driven checks (blank, never zero, because test() is not their
// unit), which is a `counted` figure wearing a `value` grade. The third was
// pages.title, blank on one page that genuinely had no <title>; there
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
        `${r.file}: ${d.property} is declared required:value but is blank on ` +
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
// its shape. The index used to be exempt: nothing declared its own columns, so
// a hand-kept REGISTRY_FIELDS set stood in for the check the carriers get. Since
// 2026-08-16 both halves of the pair have a row in registries.csv and a property
// definition per column, so the ordinary check above reaches them and the stand-in
// is gone. What is left here is content rather than schema. `area` is the reader's grouping and its rule is one question,
// stated in docs/registries.md: does the target have a path in this tree? Nine
// files, seven names. The first cut was three, splitting the names by topic,
// which did not survive: two of them were names a program parses and two were
// vocabulary a person picks from, so the seam ran through the group.
const AREAS = ['files', 'names'];
test('every registry declares its area, and leads with a title and a gloss', () => {
  for (const r of reg.registries) {
    assert.ok(AREAS.includes(r.area),
      `${r.id}: area must be one of ${AREAS.join(', ')}, got ${JSON.stringify(r.area)}`);
    assert.ok(r.title && r.title.length <= 40,
      `${r.id}: needs a short title, the identity a reader meets before the mechanics`);
    assert.ok(r.gloss && r.gloss.length > 40,
      `${r.id}: needs a gloss, one sentence on what it governs for someone who does not know`);
    assert.notEqual(r.title, r.gloss, `${r.id}: title and gloss are doing the same job`);
  }
  // Every property already glossed itself; no registry did, and that asymmetry
  // is what this pair of fields closes.
  for (const d of decls) assert.ok(d.gloss, `${d.registry}.${d.property}: no gloss`);
});

// `renders_in` is the registry row's one derived field: the app files that
// name the carrier in code, stamped by registries-reach.mjs the way docs-reach
// stamps the docs census's `reach` and `words`. Held to a re-derivation here
// for the same reason those are: a cached copy of a derivation is only worth
// keeping while something proves it current. An EMPTY list is legal and is the
// field's point: it is the Registries tab's warning state, a carrier no app
// surface reads.
import { deriveRendersIn } from '../build/registries-reach.mjs';

test('renders_in matches its derivation on every registry', () => {
  const derived = deriveRendersIn(repoRoot, reg.registries.map(r => r.file));
  for (const r of reg.registries) {
    assert.deepEqual(r.renders_in, derived.get(r.file),
      `${r.id}: renders_in is stale against the app corpus; run \`npm run registries-reach\` ` +
      `and commit docs/properties.csv`);
  }
});

// THE OWNERSHIP GATE. docs/registries.md: "Any applicable target x property
// resolves to at most one authoritative registry ... Two registries claiming
// the same pair is an invalid configuration, surfaced by the gate, never
// resolved by precedence." That rule was written on 2026-08-08 and nothing read
// it, so it was false in two places when this gate first ran: harness
// and portable both asserted `role` over nine scripts (paraphrases, one
// already stale on .mjs and .py), and pages and tools both
// asserted `title` and `note` over four pages (note differed on all four).
// Both are resolved by inheritance, not by renaming: a rename would defuse this
// gate while leaving one claim stored twice, which is worse than the collision.
//
// It decides on ASSERTIONS, not declarations. A blank is not an assertion, so a
// an inheriting registry may declare a property it fills only where no computed set owns it. And
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
  // Namespaced by the DECLARED identity space, not just by the `path:` prefix.
  // Two registries collide only when they describe the same thing, and a
  // registry id is not a filesystem path even when both read `skills`. Before
  // 2026-08-18 every space but `path:<root>` collapsed into one, so the gate
  // was comparing strings across incomparable spaces; renaming the skills
  // catalog to `skills` made it fire against the portable set's `skills/` row.
  const root = r.identity.startsWith('path:') ? r.identity.slice(5) : '';
  const space = r.identity.startsWith('path:') ? 'path' : r.identity;
  return space + '\u0000' + root + raw;
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
  // Two spellings of ONE file must normalize together, or the gate stops
  // catching real duplicates. Asserted as equality rather than against a
  // literal key, so the normalizer's internal format is free to change.
  const a = { id: 'a', identity: 'path', key: 'path' };
  const b = { id: 'b', identity: 'path:pages/', key: 'href' };
  assert.equal(identityOf(a, { path: 'pages/x.html' }), identityOf(b, { href: 'x.html' }),
    'the identity normalizer no longer brings two spellings of one target together');
});

// The other direction, and the one that was missing: two registries keyed in
// DIFFERENT spaces must not collide just because a string matches. Renaming the
// skills catalog to `skills` on 2026-08-18 put a registry id beside the portable
// set's `skills/` directory row, and the gate reported a `kind` conflict between
// two things that are not the same thing.
test('the ownership gate does not fire across two identity spaces', () => {
  const path = { id: 'portable', identity: 'path', key: 'path' };
  const regId = { id: 'registries', identity: 'registry-id', key: 'id' };
  assert.notEqual(identityOf(path, { path: 'skills' }), identityOf(regId, { id: 'skills' }),
    'a filesystem path and a registry id share a spelling, not an identity');
});

// An inheriting registry earns its shape only if the inheritance resolves. A Tools row
// whose page is gone renders with no title and no description, the silent-blank
// failure that dropping those fields makes possible.
test('every tools row resolves to a page the gallery owns', () => {
  const tools = reg.registries.find(r => r.id === 'tools');
  const pages = reg.registries.find(r => r.id === 'pages');
  const known = new Set(carrierRows(pages).map(row => 'pages/' + row[pages.key]));
  for (const row of carrierRows(tools)) {
    const p = row[tools.key];
    if (p.includes(':')) continue;   // a cross-repo ref is not this repo's to check
    assert.ok(known.has(p),
      `docs/tools.csv: "${p}" is not a row in pages/pages.csv, so the Tools view has no title ` +
      `or description to inherit for it`);
  }
});
