// The `cache -> module` half of the cache-to-view relation: for each thing the
// estate keeps derived, the app files that actually read it.
//
// It emits no artifact. Its output is a derivation the gate consumes
// (state-feeds.test.mjs), which is the whole point: what a scan can decide is
// never stored, so it cannot disagree with the code it was read from.
//
// WHAT IT CAN AND CANNOT DECIDE, because the split is the design.
//
// A scan alone answers `state/activity.json -> estate.js` and stops there.
// That is coarser than the sentence it would replace, because estate.js reads
// three of the four caches and backs seven routed views, so knowing it reads
// activity.json says nothing about WHICH view consumes it. The residue is
// authored, once, as `reads` on docs/app-routes.csv, and this scan is what
// bounds it: a view may not claim a read no file of its own makes, and where a
// reading file belongs to exactly one route the claim is forced rather than
// merely allowed. The authored half is exactly what a wide file hides.
//
// TWO FILES ARE READERS OF A PATH WITHOUT CONSUMING IT, and both are excluded:
//
//   the shell (app/index.html) runs the crawls, so it WRITES these files. The
//   Routes fold excludes it from attribution for the same reason: a file every
//   route is an address into says nothing about any one of them.
//
//   the declaring kit holds `const CACHE_PATH = '<path>'`. It is the source's
//   own home, and counting it would make every source read by exactly the file
//   that names it. The kit still appears in a route's `files`, which IS a
//   consumption claim and one the gate reads separately; what it is not is
//   scan evidence.
//
// The corpus and the comment rule are docs-reach's, imported rather than
// re-implemented, so "an app file names it" means one thing across the three
// scanners that ask it. A path in a comment is documentation of the code, not a
// read: estate.js names all three in prose it does not execute.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readCorpus, APP_DIRS, APP_EXT } from './docs-reach.mjs';

const STATE_VIEW = 'lib/alpineComponents/state-view.js';
// The shell: it writes these files rather than consuming them.
const WRITER = 'app/index.html';

// The block a named declaration spans, matched on brackets rather than on a
// closing line, so a nested object or array cannot end it early. Strict about
// finding the opener: a parse that came back empty would let a source vanish
// from the scan and read as "nothing depends on it".
function block(src, name) {
  const at = src.indexOf(`const ${name} = `);
  if (at < 0) throw new Error(`cache-readers: ${STATE_VIEW} declares no ${name}`);
  const open = at + `const ${name} = `.length;
  const pairs = { '[': ']', '{': '}' };
  const close = pairs[src[open]];
  if (!close) throw new Error(`cache-readers: ${name} is not an object or array literal`);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === src[open]) depth++;
    else if (src[i] === close && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`cache-readers: ${name} is unterminated`);
}

/**
 * Every source the State view reports on, read from the view's own declarations.
 * `file` is the name under state/; a source with none rides another and says so
 * in `via`. `declarer` is the kit holding the path as its CACHE_PATH constant.
 * `pages` is the consumer list a source carries where its consumers are pages
 * rather than routed views, a page opening at its own URL.
 * @param {string} repoRoot
 * @returns {{key: string, file: string, path: string, via: string,
 *            declarer: string, pages: string[]}[]}
 */
export function readSources(repoRoot) {
  const src = readFileSync(path.join(repoRoot, STATE_VIEW), 'utf8');
  const rows = [];
  for (const name of ['CACHES', 'OFFLINE', 'TITLES']) {
    const text = block(src, name);
    for (const m of text.matchAll(/key: '([a-z]+)',(?:\s*file: '([^']+)',)?/g)) {
      const file = m[2] || '';
      // The row's own text, so a field is read off the source it belongs to
      // rather than off whichever row happens to declare it next.
      const row = text.slice(m.index, text.indexOf("key: '", m.index + 6) + 1 || text.length);
      rows.push({
        key: m[1],
        file,
        // The view addresses every one of these as state/<file>; peekAddr and
        // fileGh build it the same way, so this is the view's own arithmetic
        // rather than a second convention.
        path: file ? 'state/' + file : '',
        via: (row.match(/via: '([a-z]+)'/) || [])[1] || '',
        pages: [...row.matchAll(/\{ path: '([^']+)'/g)].map(p => p[1]),
        declarer: '',
      });
    }
  }

  // Which kit owns each path. Derived, not listed: the declarer is whichever
  // kit assigns the path to CACHE_PATH, so adding a cache cannot forget to
  // register its kit here.
  const kits = readCorpus(repoRoot, ['lib/kits'], APP_EXT).filter(([p]) => p.endsWith('.js'));
  for (const r of rows) {
    if (!r.path) continue;
    const owner = kits.find(([, t]) => t.includes(`CACHE_PATH = '${r.path}'`));
    if (owner) r.declarer = owner[0];
  }
  return rows;
}

/**
 * For each source, the app files that read its path in code: the consumers.
 * @param {string} repoRoot
 * @param {{key: string, path: string, declarer: string}[]} sources
 * @returns {Map<string, string[]>}
 */
export function deriveReaders(repoRoot, sources) {
  const app = readCorpus(repoRoot, APP_DIRS, APP_EXT, true);
  const out = new Map();
  for (const s of sources) {
    out.set(s.key, !s.path ? [] : app
      .filter(([p, t]) => t.includes(s.path) && p !== WRITER && p !== s.declarer)
      .map(([p]) => p).sort());
  }
  return out;
}
