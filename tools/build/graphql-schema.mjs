#!/usr/bin/env node
// Regenerate the pruned GitHub GraphQL schema the test suite validates against.
//
//   npm run graphql-schema            fetch the published schema and re-prune
//   npm run graphql-schema -- --check exit 1 if the committed file is behind
//
// Why a pruned copy rather than the real one: GitHub's published SDL is ~1.5 MB,
// which does not belong in a commit, and the whole of it is not needed. Only the
// types and fields lib/gh-fetch.js's queries actually reach have to be present
// for `validate` to answer the question we ask it, which is whether a field name
// or a nesting exists. The closure is about twenty types.
//
// The prune is derived FROM the queries, so it cannot bless a typo: the queries
// are validated against the FULL schema first and nothing is written if that
// fails. What the committed file then catches is a query edited later, since the
// pruned schema stays where the last regeneration left it.
//
// Kept fields carry their whole argument list, not just the arguments in use, so
// a required argument left out of a query is still an error. That is what pulls
// the input objects and enums into the closure.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parse, buildSchema, validate, print,
  TypeInfo, visit, visitWithTypeInfo, getNamedType,
  isObjectType, isInterfaceType, isUnionType, isEnumType, isInputObjectType, isScalarType,
} from 'graphql';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_URL = 'https://docs.github.com/public/fpt/schema.docs.graphql';
const OUT = path.join(root, 'tools', 'graphql', 'github-schema.pruned.graphql');
const BUILTIN = new Set(['String', 'Int', 'Float', 'Boolean', 'ID']);

const check = process.argv.includes('--check');
const die = msg => { console.error(msg); process.exit(1); };

// The query documents, read out of lib/gh-fetch.js by running it against a stub
// window. Reading the file is the point: a query the source does not hold is a
// query nothing sends.
export function queriesFromLib(repoRoot = root) {
  const window = { GH: function GH() {} };
  window.GH.prototype = {};
  new Function('window', readFileSync(path.join(repoRoot, 'lib', 'gh-fetch.js'), 'utf8'))(window);
  const q = window.GH.queries;
  if (!q || !Object.keys(q).length) throw new Error('lib/gh-fetch.js exposed no GH.queries');
  return q;
}

// Every (type, field) the documents touch, plus the type conditions of their
// inline fragments. The visitor is graphql's own, so this tracks the real
// parent type through interfaces and fragments rather than guessing from names.
function usage(schema, docs) {
  const fields = new Map();   // type name -> Set(field name)
  const conditions = new Set();
  const use = (t, f) => {
    if (!fields.has(t)) fields.set(t, new Set());
    fields.get(t).add(f);
  };
  for (const doc of docs) {
    const typeInfo = new TypeInfo(schema);
    visit(doc, visitWithTypeInfo(typeInfo, {
      Field() {
        const parent = typeInfo.getParentType();
        const def = typeInfo.getFieldDef();
        if (parent && def) use(parent.name, def.name);
      },
      InlineFragment(node) {
        if (node.typeCondition) conditions.add(node.typeCondition.name.value);
      },
    }));
  }
  return { fields, conditions };
}

// Close over what the kept fields need: return types, argument types, and the
// field types of any input object those arguments reach.
function closure(schema, used) {
  const keep = new Set([...used.fields.keys(), ...used.conditions]);
  const queue = [...keep];
  const addType = name => { if (!BUILTIN.has(name) && !keep.has(name)) { keep.add(name); queue.push(name); } };

  while (queue.length) {
    const type = schema.getType(queue.shift());
    if (!type) continue;
    if (isInputObjectType(type)) {
      for (const f of Object.values(type.getFields())) addType(getNamedType(f.type).name);
      continue;
    }
    if (isUnionType(type)) {
      for (const m of type.getTypes()) if (keep.has(m.name)) addType(m.name);
      continue;
    }
    if (!isObjectType(type) && !isInterfaceType(type)) continue;
    for (const f of Object.values(type.getFields())) {
      if (!(used.fields.get(type.name) || new Set()).has(f.name)) continue;
      addType(getNamedType(f.type).name);
      for (const a of f.args) addType(getNamedType(a.type).name);
    }
    // An object reached through an inline fragment needs the abstract type it
    // was reached through, and only the ones already kept.
    for (const i of (isObjectType(type) ? type.getInterfaces() : [])) if (keep.has(i.name)) addType(i.name);
  }
  return keep;
}

// SDL for the kept slice. Field and type order follows the published schema, so
// a regeneration is a diff of what actually moved.
function printPruned(schema, used, keep) {
  const out = [];
  const names = [...keep].filter(n => !BUILTIN.has(n) && !n.startsWith('__')).sort();
  for (const name of names) {
    const type = schema.getType(name);
    if (!type) continue;
    if (isScalarType(type)) { out.push(`scalar ${name}`); continue; }
    if (isEnumType(type)) {
      out.push(`enum ${name} {\n${type.getValues().map(v => '  ' + v.name).join('\n')}\n}`);
      continue;
    }
    if (isInputObjectType(type)) {
      const fs = Object.values(type.getFields()).map(f => `  ${f.name}: ${f.type}`);
      out.push(`input ${name} {\n${fs.join('\n')}\n}`);
      continue;
    }
    if (isUnionType(type)) {
      out.push(`union ${name} = ${type.getTypes().filter(m => keep.has(m.name)).map(m => m.name).join(' | ')}`);
      continue;
    }
    if (!isObjectType(type) && !isInterfaceType(type)) continue;

    const wanted = used.fields.get(name) || new Set();
    let fields = Object.values(type.getFields()).filter(f => wanted.has(f.name));
    // An interface reached only as a fragment's base has no selected fields of
    // its own, and SDL forbids an empty one. Keep its first field so the type
    // exists; nothing validates against it.
    if (!fields.length) fields = Object.values(type.getFields()).slice(0, 1);
    const sig = f => {
      const args = f.args.length
        ? '(' + f.args.map(a => `${a.name}: ${a.type}${a.defaultValue === undefined ? '' : ' = ' + JSON.stringify(a.defaultValue)}`).join(', ') + ')'
        : '';
      return `  ${f.name}${args}: ${f.type}`;
    };
    const impls = isObjectType(type) ? type.getInterfaces().filter(i => keep.has(i.name)) : [];
    const head = `${isInterfaceType(type) ? 'interface' : 'type'} ${name}` +
      (impls.length ? ` implements ${impls.map(i => i.name).join(' & ')}` : '');
    out.push(`${head} {\n${fields.map(sig).join('\n')}\n}`);
    // A field kept only for the placeholder rule above can name a type the
    // closure never queued; keep the SDL buildable by naming it too.
    for (const f of fields) {
      const n = getNamedType(f.type).name;
      if (!keep.has(n) && !BUILTIN.has(n)) out.push(`scalar ${n}`);
    }
  }
  return out;
}

const header = queryNames => [
  '# GENERATED by tools/build/graphql-schema.mjs. Do not hand-edit.',
  '#',
  `# A pruned slice of GitHub's published GraphQL schema (${SCHEMA_URL}),`,
  '# covering exactly the types and fields these queries in lib/gh-fetch.js reach:',
  ...queryNames.map(n => `#   ${n}`),
  '#',
  '# Kept fields carry their full argument list, so a missing required argument',
  '# is still an error. Regenerate with `npm run graphql-schema` after editing a',
  '# query; tools/test/graphql-schema.test.mjs validates against this file offline.',
  '',
].join('\n');

async function main() {
  const queries = queriesFromLib();
  const names = Object.keys(queries);
  const docs = names.map(n => {
    try { return parse(queries[n]); }
    catch (e) { die(`${n}: not parseable as GraphQL — ${e.message}`); }
  });

  // The host is allowed, but the GET returns an intermittent 503 (twice in
  // about twenty tries, from both curl and node), so retry rather than
  // reporting the document unreachable on the strength of one answer.
  process.stderr.write(`fetching ${SCHEMA_URL} … `);
  let sdl = null, last = '';
  for (let attempt = 1; attempt <= 5 && sdl === null; attempt++) {
    try {
      const res = await fetch(SCHEMA_URL);
      if (res.ok) sdl = await res.text();
      else last = `HTTP ${res.status}`;
    } catch (e) { last = e.message; }
    if (sdl === null) await new Promise(r => setTimeout(r, 500 * attempt));
  }
  if (sdl === null) die(`\nschema fetch failed after 5 tries: ${last}`);
  process.stderr.write(`${(sdl.length / 1e6).toFixed(2)} MB\n`);
  const schema = buildSchema(sdl, { assumeValid: true });

  // Validate against the FULL schema first, so the prune can never be derived
  // from a query the real API would reject.
  for (const [i, doc] of docs.entries()) {
    const errors = validate(schema, doc);
    if (errors.length) die(`${names[i]} does not validate against the published schema:\n  ` +
      errors.map(e => e.message).join('\n  '));
  }

  const used = usage(schema, docs);
  const keep = closure(schema, used);
  const body = printPruned(schema, used, keep);
  const text = header(names) + body.join('\n\n') + '\n';

  // The prune is only worth committing if it answers the same question the full
  // schema does, so run the queries through it before writing.
  const pruned = buildSchema(text, { assumeValid: true });
  for (const [i, doc] of docs.entries()) {
    const errors = validate(pruned, doc);
    if (errors.length) die(`the pruned schema rejects ${names[i]}, so the prune is wrong:\n  ` +
      errors.map(e => e.message).join('\n  '));
  }

  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (check) {
    if (current === text) { console.log(`up to date: ${path.relative(root, OUT)}`); return; }
    die(`${path.relative(root, OUT)} is behind lib/gh-fetch.js. Run: npm run graphql-schema`);
  }
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`wrote ${path.relative(root, OUT)} — ${keep.size} types, ${(text.length / 1024).toFixed(1)} KB` +
    (current === text ? ' (unchanged)' : ''));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
