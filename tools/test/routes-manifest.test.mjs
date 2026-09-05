// How content moves and renders (address grammar, delivery modes, toss
// routes), rendered by show-repo's Map view in its Transport tab. This test is
// what lets the routes live in two places without drifting: docs/routes-routes.csv
// owns the table, toss-render.html keeps an inlined literal so its critical
// render path takes no fetch, and adding a route to one without the other fails
// here.
//
// Four carriers since 2026-08-18. The three tables (modes, routes, showing
// mechanisms) are CSV registries of their own; docs/routes.json keeps what is
// not a table: the grammar, the parameter precedence, and the showing frame.
//
// Also checks the two claims a reader would otherwise have to trust: every
// renderer and doc the manifest names exists on disk, and every delivery mode
// it describes is a parameter toss-render actually reads.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

// An independent CSV reader, not the loader under tools/build/: this file is a
// gate on what the carriers hold, so borrowing the parser it checks against
// would let a parser bug agree with itself.
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

const read = (f) => readFileSync(path.join(repoRoot, 'docs', f), 'utf8');
const manifest = JSON.parse(read('routes.json'));
// The three tables read back onto the manifest object, which is the same shape
// the Map view assembles at load, so every assertion below is written against
// what a reader actually sees.
manifest.modes = parseCsv(read('routes-modes.csv'));
manifest.routes = parseCsv(read('routes-routes.csv'));
manifest.showing.mechanisms = parseCsv(read('showing-mechanisms.csv'));
const tossRender = readFileSync(path.join(repoRoot, manifest.renderer), 'utf8');

// Pull the TOSS_ROUTES literal out of the page source. Deliberately strict
// about the one-line-per-route shape: if the literal is reformatted past what
// this reads, the parse comes back short and the comparison below fails loudly
// rather than silently passing on a partial read.
function inlinedRoutes(src) {
  const block = src.match(/const TOSS_ROUTES = \{([\s\S]*?)\n {2}\};/);
  assert.ok(block, 'TOSS_ROUTES literal not found in ' + manifest.renderer);
  const out = {};
  const row = /'([^']+)':\s*\{\s*repo:\s*'([^']+)',\s*ref:\s*'([^']+)',\s*path:\s*'([^']+)'\s*\}/g;
  for (const [, key, repo, ref, p] of block[1].matchAll(row)) out[key] = { repo, ref, path: p };
  const declared = (block[1].match(/^\s*'[^']+':/gm) || []).length;
  assert.equal(Object.keys(out).length, declared, 'a route line did not parse; check the literal shape');
  return out;
}

test('manifest shape: renderer, grammar, modes, and typed routes', () => {
  assert.equal(manifest.hub, 'mehrlander/web-tools');
  assert.ok(existsSync(path.join(repoRoot, manifest.renderer)), 'renderer missing: ' + manifest.renderer);
  assert.match(manifest.grammar.form, /owner\/repo\[@ref\]:path/);
  assert.ok(manifest.grammar.usedBy.length > 1, 'the grammar is shared, so name where');
  assert.match(manifest.precedence, /fragment first/, 'the read order is the contract; state it');
  assert.ok(manifest.modes.length > 1);
  assert.ok(manifest.routes.length > 0);
  for (const m of manifest.modes) {
    assert.ok(m.param && m.form && m.note, m.param + ': param/form/note');
    assert.ok(['inline', 'reference'].includes(m.carries), m.param + ': carries');
  }
  for (const r of manifest.routes) {
    assert.ok(r.key && r.repo && r.ref && r.path && r.renders, r.key + ': fields');
  }
});

test('the manifest routes and the inlined TOSS_ROUTES literal agree', () => {
  const inlined = inlinedRoutes(tossRender);
  const fromManifest = Object.fromEntries(
    manifest.routes.map(r => [r.key, { repo: r.repo, ref: r.ref, path: r.path }]),
  );
  assert.deepEqual(inlined, fromManifest,
    'docs/routes-routes.csv and the TOSS_ROUTES literal have drifted; the CSV is the owner');
});

test('every renderer and doc the manifest names exists in the repo', () => {
  for (const r of manifest.routes) {
    if (r.repo === manifest.hub) {
      assert.ok(existsSync(path.join(repoRoot, r.path)), 'renderer missing on disk: ' + r.path);
    }
    if (r.doc) assert.ok(existsSync(path.join(repoRoot, r.doc)), 'doc missing on disk: ' + r.doc);
  }
  for (const u of manifest.grammar.usedBy) {
    assert.ok(existsSync(path.join(repoRoot, u.path)), 'grammar reference missing: ' + u.path);
  }
});

test('every described delivery mode is a parameter toss-render reads', () => {
  for (const m of manifest.modes) {
    if (m.param === '<route>') continue;          // the route keys, covered above
    if (m.param === 'src') {                       // the renderer side, not a toss-render param
      assert.match(tossRender, /\?src=\$\{encodeURIComponent\(env\)\}/, 'the ?src= handoff is gone');
      continue;
    }
    assert.ok(tossRender.includes(`param('${m.param}')`), 'not read by toss-render: ' + m.param);
  }
});

// The fab carries the INVERSE of the route keys: to tell a routed fragment from
// a plain one it only needs to know toss-render's own delivery params, so it
// keeps that short list rather than a copy of the route table. Short and stable
// is not the same as safe, though: adding a delivery mode to toss-render without
// adding it here would make the fab read the new param as a route key and
// mislabel whatever it addressed. So the manifest owns this list too.
test('the fab knows every delivery mode, so it never reads one as a route key', () => {
  const fab = readFileSync(path.join(repoRoot, 'lib/alpineComponents/fab.js'), 'utf8');
  const block = fab.match(/_TOSS_MODES: \[([^\]]*)\]/);
  assert.ok(block, '_TOSS_MODES not found in lib/alpineComponents/fab.js');
  const modes = [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

  const documented = manifest.modes.map(m => m.param)
    .filter(p => p !== '<route>' && p !== 'src');   // a route key, and the renderer side
  for (const p of documented) {
    assert.ok(modes.includes(p), 'the fab would read ' + p + '= as a route key: ' + p);
  }
  // The one extra is url's alias, which toss-render reads and the manifest does
  // not describe. Pinned so the list cannot quietly grow a third member.
  assert.deepEqual(modes.filter(m => !documented.includes(m)), ['u']);
  assert.match(tossRender, /param\('url'\) \|\| param\('u'\)/, 'the u alias is gone; drop it here too');
});

// ── The `showing` block ────────────────────────────────────────────────────
//
// This block exists because 1,589 words of CLAUDE.md, 63% of the file, failed
// to stop the session that was reading them from handing over the wrong link.
// The rule moved into data the app renders (show-repo's Map view, Transport
// tab), and the doc points there instead of restating it. What the tests below
// hold is the part that would rot silently: a row missing the field that says
// what it CANNOT show is worse than no row, since the whole point of the table
// is the boundaries rather than the recipes.
test('every showing mechanism declares its three axes and its boundary', () => {
  const s = manifest.showing;
  assert.ok(s, 'docs/routes.json has no showing block');
  assert.ok(s.mechanisms.length >= 5, 'suspiciously few mechanisms');
  for (const m of s.mechanisms) {
    for (const k of ['key', 'label', 'subject', 'version', 'viewer', 'use'])
      assert.ok(m[k], `mechanism ${m.key || '?'} is missing ${k}`);
    // `misses` is required and `reaches` is not: the one mechanism that reaches
    // nothing (a shell change aimed at the top-level document) is a real row,
    // and it is the row a reader most needs.
    assert.ok(m.misses, `mechanism ${m.key} does not say what it misses`);
  }
  const keys = s.mechanisms.map(m => m.key);
  assert.equal(new Set(keys).size, keys.length, 'duplicate mechanism key');
});

test('the axes are the three the mechanisms are indexed by', () => {
  assert.deepEqual(Object.keys(manifest.showing.axes), ['subject', 'version', 'viewer']);
});

test('the picker only routes to mechanisms that exist', () => {
  const keys = new Set(manifest.showing.mechanisms.map(m => m.key));
  for (const r of manifest.showing.picker.rules) {
    assert.ok(r.when && r.then, 'a picker rule is missing a half');
    // A rule may name alternatives ("toss-gz or artifact"); each must resolve.
    for (const k of r.then.split(/\s+or\s+/))
      assert.ok(keys.has(k), `picker routes to unknown mechanism: ${k}`);
  }
});

// The two CLAUDE.md assertions that used to sit here moved to
// claude-md.test.mjs on 2026-08-05. They are about the agent instructions
// rather than about this manifest, and grouping them under one name here meant
// a size failure arrived wearing a message about the showing material.

// ── docs/showing.md, the copy that had no check ────────────────────────────
// docs/repetitions.csv recorded two paraphrases of the showing mechanisms.
// CLAUDE.md's was checked (pointer plus a word cap, in claude-md.test.mjs);
// showing.md's carried "check: none; the doc itself declares the manifest
// authoritative", and a banner is not a check. The doc grew a full second copy
// of the table under that banner and nothing said so for eleven days.
//
// So showing.md gets the same instrument CLAUDE.md has, for the same reason.
// The ceiling is set with room above the 2026-08-19 chop and well under what
// the file was. If it fails, a mechanism, a boundary or an address is a row in
// showing-mechanisms.csv or a field of the routes.json showing block. Prose
// keeps what no row can hold: a relation between two rows, or a record of what
// a boundary cost to find. Raising the limit requires user approval.
const SHOWING_LIMIT = 1500;

test('docs/showing.md delegates the mechanisms rather than restating them', () => {
  const doc = readFileSync(path.join(repoRoot, 'docs', 'showing.md'), 'utf8');

  assert.match(doc, /showing-mechanisms\.csv/,
    'showing.md no longer points at the carrier it delegates to');
  assert.match(doc, /routes\.json/,
    'showing.md no longer points at the frame (the routes.json showing block)');

  const words = doc.split(/\s+/).length;
  assert.ok(words < SHOWING_LIMIT,
    `docs/showing.md is ${words} words, over its ${SHOWING_LIMIT}-word ceiling. ` +
    'A mechanism, a boundary or an address is a row in showing-mechanisms.csv ' +
    'or a field of the routes.json showing block. Prose keeps only what no row ' +
    'can hold. Raising the limit requires user approval.');
});

// The one duplicate a word cap cannot see, because it is inside the budget:
// the escape paragraph ("reachable by neither") sat in this file twice,
// verbatim, in two different sections. A file is allowed to restate a rule for
// emphasis; it is not allowed to do so by copy, since the copies then age
// apart inside one document and no cross-file scanner looks within a file.
test('docs/showing.md does not repeat a paragraph within itself', () => {
  const doc = readFileSync(path.join(repoRoot, 'docs', 'showing.md'), 'utf8');
  const paras = doc.split(/\n\s*\n/).map(p => p.trim())
    .filter(p => p.split(/\s+/).length >= 25 && !p.startsWith('|'));
  const seen = new Map();
  for (const p of paras) {
    const norm = p.replace(/\s+/g, ' ').toLowerCase();
    seen.set(norm, (seen.get(norm) || 0) + 1);
  }
  const dupes = [...seen].filter(([, n]) => n > 1).map(([p]) => p.slice(0, 60));
  assert.equal(dupes.join(' | '), '', 'paragraph repeated verbatim: ' + dupes.join(' | '));
});

// ── Kinds: what is being shown, and what that buys once it is on screen ─────
//
// docs/routes-kinds.csv is the fourth carrier, added 2026-08-31. The three
// above answer how a subject reaches a viewer; this one answers what the
// subject IS, which is the question three separate pieces of code were each
// answering privately: ViewRegistry.READ_MODE (which mode a file opens in),
// the toss routes (which page addresses it), and kits/md-doc.js's declaration
// (what units a note can be pinned to inside it).
//
// The `subject` and `shown_by` columns are the join to the showing frame, and
// `route` is the join to the routes table. They are checked here rather than
// described anywhere, so the association cannot rot into three tables that
// merely sit on one tab.
manifest.kinds = parseCsv(read('routes-kinds.csv'));

const viewerSrc = readFileSync(path.join(repoRoot, 'lib/alpineComponents/viewer.js'), 'utf8');
const mdDocSrc = readFileSync(path.join(repoRoot, 'lib/kits/md-doc.js'), 'utf8');

// The KIND_VIEW literal, read the same strict way as TOSS_ROUTES: a shape this
// cannot parse comes back short and fails loudly rather than passing on half.
function kindViews(src) {
  const block = src.match(/KIND_VIEW: \{([\s\S]*?)\n {2}\},/);
  assert.ok(block, 'KIND_VIEW literal not found in lib/alpineComponents/viewer.js');
  const out = {};
  for (const [, k, v] of block[1].matchAll(/(\w+):\s*'([^']+)'/g)) out[k] = v;
  const declared = (block[1].match(/\w+:\s*'/g) || []).length;
  assert.equal(Object.keys(out).length, declared, 'a KIND_VIEW pair did not parse');
  return out;
}

// Every kind KIND() can return. Collected from its `return '...'` literals,
// which is what makes "the classifier answers something the table does not
// carry" a failure rather than a surprise in the app.
function classifierKinds(src) {
  const block = src.match(/ {2}KIND\(f\) \{([\s\S]*?)\n {2}\},/);
  assert.ok(block, 'KIND(f) not found in lib/alpineComponents/viewer.js');
  // Read whole `return` statements, then the string literals inside them. A
  // bare `/return '(\w+)'/` misses the branch that decides two kinds at once
  // (`return isRowArray(...) ? 'records' : 'tree'`), and missing a branch here
  // would let the classifier answer something no row carries.
  const out = new Set();
  for (const [, stmt] of block[1].matchAll(/return ([^;]+);/g)) {
    for (const [, lit] of stmt.matchAll(/'([^']+)'/g)) out.add(lit);
  }
  return out;
}

test('kinds table: fields, and the subject axis it is written against', () => {
  assert.ok(manifest.kinds.length > 1);
  const axis = manifest.showing.axes.subject;
  for (const k of manifest.kinds) {
    assert.ok(k.kind && k.label && k.detect, k.kind + ': kind/label/detect');
    assert.ok(axis.includes(k.subject),
      `${k.kind}: subject "${k.subject}" is not a value of the showing axis`);
  }
  const keys = manifest.kinds.map(k => k.kind);
  assert.equal(new Set(keys).size, keys.length, 'duplicate kind key');
});

test('every kind joins to the mechanisms and routes beside it', () => {
  const mechanisms = new Set(manifest.showing.mechanisms.map(m => m.key));
  const routes = new Set(manifest.routes.map(r => r.key));
  for (const k of manifest.kinds) {
    for (const m of k.shown_by.split(';').filter(Boolean)) {
      assert.ok(mechanisms.has(m), `${k.kind}: shown_by names no such mechanism: ${m}`);
    }
    if (k.route) assert.ok(routes.has(k.route), `${k.kind}: route does not exist: ${k.route}`);
    if (k.kit) {
      assert.ok(existsSync(path.join(repoRoot, k.kit)), `${k.kind}: kit missing on disk: ${k.kit}`);
    }
  }
});

test('the kinds table and the viewer classifier agree', () => {
  const views = kindViews(viewerSrc);
  const fromTable = Object.fromEntries(
    manifest.kinds.filter(k => k.view).map(k => [k.kind, k.view]));
  assert.deepEqual(views, fromTable,
    'docs/routes-kinds.csv and ViewRegistry.KIND_VIEW have drifted; the CSV is the owner');

  // Every mode a kind names has to be a module the viewer actually has, or the
  // table is promising a view that resolves to the raw fallback.
  const modules = new Set([...viewerSrc.matchAll(/^ {6}id: '([a-z]+)',/gm)].map(m => m[1]));
  for (const k of manifest.kinds) {
    if (k.view) assert.ok(modules.has(k.view), `${k.kind}: no such viewer module: ${k.view}`);
  }

  // The classifier may not answer anything the table does not carry, and a row
  // with a view is a row the classifier has to be able to reach.
  const answered = classifierKinds(viewerSrc);
  const tabled = new Set(manifest.kinds.map(k => k.kind));
  for (const a of answered) assert.ok(tabled.has(a), 'KIND() returns an untabled kind: ' + a);
  for (const k of manifest.kinds) {
    if (k.view) assert.ok(answered.has(k.kind), 'no classifier branch reaches kind: ' + k.kind);
  }
});

// Every kind that names a kit inlines its own row there, the way toss-render
// inlines TOSS_ROUTES: the registry declares, the code carries a copy so no
// render path takes a fetch, and adding to one alone fails here.
function inlinedKind(src, file) {
  const block = src.match(/const KIND = Object\.freeze\(\{([\s\S]*?)\n {2}\}\);/);
  assert.ok(block, 'the KIND literal is gone from ' + file);
  const lit = {};
  for (const [, k, v] of block[1].matchAll(/(\w+):\s*'((?:[^'\\]|\\.)*)'/g)) lit[k] = v.replace(/\\'/g, "'");
  return lit;
}

test('every kind that names a kit inlines its own row there', () => {
  const declaring = manifest.kinds.filter(k => k.kit);
  assert.ok(declaring.length >= 2, 'a contract with one implementer is a rename');
  for (const row of declaring) {
    const src = readFileSync(path.join(repoRoot, row.kit), 'utf8');
    const lit = inlinedKind(src, row.kit);
    assert.equal(lit.kind, row.kind, row.kit + ': kind');
    assert.equal(lit.label, row.label, row.kit + ': label');
    assert.equal(lit.aim, row.aim, row.kit + ': aim');
    assert.equal(lit.aimLabel, row.aim_label, row.kit + ': aim_label');
    assert.equal(lit.aimHint, row.aim_hint, row.kit + ': aim_hint');
    assert.ok(row.unit.startsWith(lit.unit),
      `${row.kit}: unit "${row.unit}" does not open with "${lit.unit}"`);
  }
});

// The optional half of the contract, stated as a check so it cannot quietly
// become mandatory. A kind with an aim has to name what that aim is called and
// what its hint says, since kits/annotate.js draws the row from those two and
// an empty label would paint a blank control. A kind WITHOUT one carries
// neither: source code declines the gesture half because a line range is what
// an ordinary text selection already spans.
test('a kind names its aim completely, or carries no aim at all', () => {
  for (const k of manifest.kinds) {
    if (k.aim) {
      assert.ok(k.aim_label, k.kind + ': an aim with no label paints a blank row');
      assert.ok(k.aim_hint, k.kind + ': an aim with no hint');
      assert.ok(k.kit, k.kind + ': an aim needs a kit to define its units');
    } else {
      assert.equal(k.aim_label, '', k.kind + ': a label for an aim that does not exist');
      assert.equal(k.aim_hint, '', k.kind + ': a hint for an aim that does not exist');
    }
  }
});

// The carrier is the one place the aim rule lives, and both conditions have to
// be in it: a kind declaring an aim, and units for that aim to hit. Split
// across the kits it would be re-derived by every kind that ever declares.
test('the aim test is the carrier\'s, and tests both halves', () => {
  const src = readFileSync(path.join(repoRoot, 'lib/kits/src-doc.js'), 'utf8');
  assert.match(src, /st\.kind && st\.kind\.aim && st\.units > 0/,
    'kits/src-doc.js no longer tests both the declared aim and the unit count');
});

// The classification policy has ONE owner, and this is the check that keeps it
// that way. It was the Files view's private READ_MODE until 2026-08-15, moved
// to ViewRegistry when the stage wanted it, and a third copy (AUTO_VIEW, on
// pages/data-view.html) went on disagreeing until 2026-08-31: unknown
// extensions, the JSON table test, and the size guard all differed. A private
// re-implementation is what this forbids, by name.
test('no page keeps a private copy of the read-mode policy', () => {
  const dataView = readFileSync(path.join(repoRoot, 'pages/data-view.html'), 'utf8');
  assert.match(dataView, /ViewRegistry\.READ_MODE/, 'data-view no longer delegates the policy');
  assert.doesNotMatch(dataView, /ext === 'csv'|startsWith\('\['\)/,
    'pages/data-view.html has grown its own classifier again');
});
