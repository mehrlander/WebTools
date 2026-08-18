// The registry pair, read from CSV.
//
// docs/registries.csv is one row per registry; docs/properties.csv is one row
// per column of one registry. They were a single docs/properties.json until
// 2026-08-16, whose two tables plus a 544-word prose note lived in one file.
// CSV is the format because it cannot hold two tables: that is what makes "a
// registry is a file" true by construction rather than by convention, and it is
// what retired `carrier`, `rows` and `format` in one move.
//
// `path` replaces all three. It is a file path, plus a `#fragment` naming the
// key that holds the rows. The fragment is not a sharing artifact: only three
// registries share a file (docs/routes.json), while THIRTEEN carry a fragment,
// because every JSON carrier needs one to say which key is the table. It is
// doing `rows`' old job under a new name, and it goes only when a registry's
// file is a CSV, where the file IS the table.
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
const list = (s) => (s ? s.split(';').map(x => x.trim()).filter(Boolean) : []);

export function loadRegistries(root = repoRoot) {
  const read = (f) => parseCsv(readFileSync(path.join(root, 'docs', f), 'utf8'));
  const registries = read('registries.csv').map(r => ({
    ...r,
    // The fragment half of `path`, split out so a consumer that wants to open
    // the file does not have to know the syntax.
    file: r.path.split('#')[0],
    fragment: r.path.includes('#') ? r.path.split('#')[1] : '',
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
export function writeCsv(rows, cols) {
  const cell = (v) => {
    const s = Array.isArray(v) ? v.join(';') : (v ?? '');
    return /[",\n]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s);
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n') + '\n';
}

export const REGISTRY_COLS = ['id','path','key','identity','kind','target','scope',
                              'fields','gate','area','title','gloss','renders_in'];
export const PROPERTY_COLS = ['registry','property','mode','deriver','required','form',
                              'exclusive','values','gloss'];
