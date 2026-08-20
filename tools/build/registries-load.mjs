// The registry pair, read from CSV.
//
// docs/registries.csv is one row per registry; docs/properties.csv is one row
// per column of one registry. They were a single docs/properties.json until
// 2026-08-16, whose two tables plus a 544-word prose note lived in one file.
// CSV is the format because it cannot hold two tables: that is what makes "a
// registry is a file" true by construction rather than by convention, and it is
// what retired `carrier`, `rows` and `format` in one move.
//
// `path` replaces all three, and it is now a plain file path. It briefly also
// took a `#fragment` naming the key that held the rows, which every JSON
// carrier needed and thirteen of twenty-one carried; that was `rows`' old job
// under a new name. It went when the last JSON carrier became a CSV on
// 2026-08-18, because a CSV's file IS its table. `file` survives as an alias of
// `path` so consumers written against the split still read.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../test/bootstrap.mjs';

// Comma-separated, double-quote quoting with "" escapes, one record per line.
// The registries' prose is single-line by construction, which is what lets the
// parse stay this small.
export function parseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// Header-driven, so a column reorder cannot silently shift meanings.
export function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const head = parseCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const f = parseCsvLine(line);
    return Object.fromEntries(head.map((h, i) => [h, (f[i] ?? '').trim()]));
  });
}

// A blank cell means NOT ASSERTED. Where a property has to tell "checked, and
// the answer is none" from "not checked", its value domain carries an explicit
// token (`gate` uses `none`), so no column here rests on empty-string versus
// null. That rule is why these splits are safe.
const list = (s) => (s ? splitList(s).map(x => x.trim()).filter(Boolean) : []);

export function loadRegistries(root = repoRoot) {
  const read = (f) => parseCsv(readFileSync(path.join(root, 'docs', f), 'utf8'));
  const registries = read('registries.csv').map(r => ({
    ...r,
    // `file` is `path`. Kept as its own key because a consumer asking "which
    // file is this?" should not have to know whether the syntax ever grew
    // anything after the path.
    file: r.path,
    renders_in: list(r.renders_in),
  }));
  const properties = read('properties.csv').map(p => ({
    ...p,
    values: p.values ? list(p.values) : null,
  }));
  return { registries, properties };
}

// Serialize back, quoting only what needs it. Column order is passed in rather
// than taken from the rows, so a restamp cannot reorder the file.
// A list rides in one cell, semicolon separated. Values can contain semicolons
// (an assertion name did, and split it in half), so the delimiter is escaped on
// the way out and honoured on the way back. Backslash escapes itself.
export const joinList = (xs) =>
  xs.map(x => String(x).replace(/\\/g, '\\\\').replace(/;/g, '\\;')).join(';');
export const splitList = (s) =>
  String(s).split(/(?<!\\);/).map(x => x.replace(/\\;/g, ';').replace(/\\\\/g, '\\'));

export function writeCsv(rows, cols) {
  const cell = (v) => {
    const s = Array.isArray(v) ? joinList(v) : (v ?? '');
    return /[",\n]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s);
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n') + '\n';
}

// The column order registries-reach writes the file back in. It is a SCHEMA,
// not a formatting preference: a column missing from this list is dropped on
// the next restamp, silently, because the writer emits exactly these. That is
// how the 2026-08-18 kind/membership split was reverted by a commit hook an
// hour after it landed and a green suite: the test ran before the hook, the
// hook rewrote the file from a stale list, and nothing re-ran. Change this list
// in the same commit as any column change to docs/registries.csv.
export const REGISTRY_COLS = ['id','path','key','identity','membership','inherits','target','scope',
                              'span','fields','gate','area','title','gloss','renders_in'];
export const PROPERTY_COLS = ['registry','property','mode','deriver','required','form',
                              'exclusive','values','gloss'];
