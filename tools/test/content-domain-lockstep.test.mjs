// The content registry's value domains are defined by the content-registry
// SKILL, and copied into docs/properties.csv. This holds the copy to the
// original.
//
// Filed 2026-08-09 as an owners row saying the check was "none: the two domains
// agree today, six values and five, and nothing holds them together". That was
// the honest interim; this is the check, so the row can say what holds it.
//
// Why the skill is authoritative and not the declaration table: CLAUDE.md says
// the content-registry skill owns that convention, the skill is what a session
// reads before classifying anything, and the domains travel to other repos with
// the plugin while docs/properties.csv does not. The copy here exists so the
// properties gate can check content.csv's values without parsing markdown at
// every run; it is a convenience, and a convenience that can drift is exactly
// what this registry model exists to catch.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';
import { loadRegistries } from '../build/registries-load.mjs';

const SKILL = '.claude/skills/content-registry/SKILL.md';
const skill = readFileSync(path.join(repoRoot, SKILL), 'utf8');
const reg = loadRegistries(repoRoot);

// The skill states each domain as a bullet that opens with the property in
// backticks and then lists backticked values separated by pipes, wrapping
// across lines and carrying parenthetical prose that never contains backticks:
//
//   - `creation_mode`: `supplied` (external source material) | `mechanical`
//     (deterministic transformation) | `human-authored` | ...
//
// So: take the bullet's own line plus the indented continuation lines under it,
// drop the leading property, and every remaining backticked token is a value.
//
// The terminator has to be the indent, not "the next bullet". A first cut
// stopped at /\n- `/ and silently swallowed half the document for the LAST
// bullet in the list, which had no next bullet to stop at: it returned
// `analysis_use`'s five values plus eleven tokens from the prose below,
// including a locator grammar and two script paths. It failed loudly here only
// because the declared domain disagreed; had the extra tokens been a superset
// of nothing, it would have passed while reading the wrong text.
function domainFromSkill(prop) {
  const lines = skill.split('\n');
  const i = lines.findIndex(l => l.startsWith('- `' + prop + '`:'));
  assert.notEqual(i, -1, `${SKILL}: no bullet defines \`${prop}\``);
  const body = [lines[i].slice(('- `' + prop + '`:').length)];
  for (let j = i + 1; j < lines.length; j++) {
    if (!/^\s+\S/.test(lines[j])) break;      // continuation lines only
    body.push(lines[j]);
  }
  return [...body.join('\n').matchAll(/`([^`]+)`/g)].map(m => m[1]);
}

test('the content registry domains match the skill that defines them', () => {
  const declared = Object.fromEntries(
    reg.properties
      .filter(d => d.registry === 'content' && Array.isArray(d.values))
      .map(d => [d.property, d.values]));

  assert.deepEqual(Object.keys(declared).sort(), ['analysis_use', 'creation_mode'],
    'the closed domains of the content registry changed; teach this check the new set');

  for (const [prop, values] of Object.entries(declared)) {
    assert.deepEqual(values, domainFromSkill(prop),
      `docs/properties.csv's ${prop} domain has drifted from ${SKILL}, which owns it. ` +
      `The skill is authoritative: change it there and copy, never the other way.`);
  }
});
