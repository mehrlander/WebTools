// The derived field of docs/properties.json: `renders_in`, the app files that
// name each registry's carrier. Restamped by `npm run registries-reach` and
// gated by properties-registry.test.mjs, the way docs-reach.mjs and the docs
// census hold `reach` and `words`.
//
// The question it answers is the registry model's own audit rule turned on the
// registries themselves. The audits recorded in docs/registries.md kept finding
// one shape of rot: an authored claim nothing reads goes wrong (`why` ran
// nought for five, `required` fifty-one for fifty-four). A registry no surface
// renders is the same exposure one level up: its carrier is committed, gated,
// and read by nobody, so its claims can rot without anyone meeting them. The
// Docs tab's `reach` column proved that making such a gap visible gets it
// closed (the derivation moved twice from being looked at); this field is the
// same instrument pointed at the registries.
//
// What the scan claims, exactly: a file under lib/ or pages/ contains the
// carrier's repo-relative path in CODE, comments stripped. That is docs-reach's
// `app` channel verbatim, and the scanners are imported from it rather than
// re-implemented so the two fields cannot disagree about what "the app names
// it" means. Naming is the strongest claim a textual scan can make: a named
// carrier is fetched, rendered, or opened by that file in every case measured
// at introduction, but the field's honest reading stays "the app reaches it",
// not "a reader saw it".
//
// An empty list is the warning state the field exists to surface, and it is a
// fact, not an accusation: a carrier read only by its gate, or projected only
// to GitHub-rendered markdown (tracker/board.json's board.md), has no app
// surface, and whether that is fine is a judgment for the reader of the
// Registries tab. At introduction three registries were empty: manifest-fields
// (docs/manifest.json), skills-catalog (skills/manifest.json), and
// text-field-vocabulary (docs/text-fields.csv).
//
// No fixpoint is needed, unlike docs-reach: the stamp writes docs/, the scan
// reads lib/ and pages/, and the two do not intersect. The stamped paths are
// sorted, so the output is byte-deterministic.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCorpus, stripComments, APP_DIRS, APP_EXT } from './docs-reach.mjs';

/**
 * For each carrier path, the sorted app files that name it in code.
 * @param {string} repoRoot
 * @param {string[]} carriers repo-relative carrier paths
 * @returns {Map<string, string[]>}
 */
export function deriveRendersIn(repoRoot, carriers) {
  const app = readCorpus(repoRoot, APP_DIRS, APP_EXT, true);
  const out = new Map();
  for (const c of carriers) {
    out.set(c, app.filter(([, text]) => text.includes(c)).map(([p]) => p).sort());
  }
  return out;
}

// ── CLI: restamp docs/properties.json (--check compares instead) ────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const file = path.join(repoRoot, 'docs', 'properties.json');
  const registry = JSON.parse(readFileSync(file, 'utf8'));
  const derived = deriveRendersIn(repoRoot, registry.registries.map(r => r.carrier));
  const checkOnly = process.argv.includes('--check');

  const stale = [];
  for (const r of registry.registries) {
    const next = derived.get(r.carrier);
    if (JSON.stringify(r.renders_in) !== JSON.stringify(next)) stale.push(r.id);
    r.renders_in = next;
  }

  if (checkOnly) {
    if (stale.length) {
      console.error(`registries-reach --check: renders_in is stale on ${stale.join(', ')}; ` +
        'run `npm run registries-reach` and commit docs/properties.json');
      process.exit(1);
    }
  } else {
    writeFileSync(file, JSON.stringify(registry, null, 2) + '\n');
  }

  const empty = registry.registries.filter(r => !r.renders_in.length);
  console.log(`registries-reach: ${registry.registries.length} registries, ` +
    `${registry.registries.length - empty.length} with an app surface` +
    (empty.length ? `; no app surface: ${empty.map(r => r.id).join(', ')}` : ''));
}
