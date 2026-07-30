// skills/bake-page/scripts/bake.js — the injection step must paste inlined
// libraries in verbatim.
//
// Regression origin: injection used `html.replace(marker, scripts)`. A
// replacement STRING gives $$, $&, $` , $' and $1 pattern meanings, and a
// minified bundle is full of them. Alpine registers every magic through
// Object.defineProperty(t, `$${n}`, ...), which came out as `${n}`, so $el,
// $refs, $dispatch, $watch and $nextTick all registered without their $ and
// read as undefined in every expression. Nothing reported it: the bundle still
// parsed, the page still booted, and the console said only "$el is not
// defined" about a name plainly present in the source. The skill carried the
// symptom as a documented quirk of the runtime for as long as it went unfound.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const bake = readFileSync(path.join(repoRoot, 'skills/bake-page/scripts/bake.js'), 'utf8');

test('every injection into the page uses a function replacer', () => {
  // Both the CSS and JS injections, marker and fallback paths: four call sites.
  // Capture only what follows the comma; the replacer's own `()` would end an
  // unbalanced-paren match early.
  const sites = [...bake.matchAll(/\.replace\((?:'<!--(?:CSS|JS)-->'|'<\/(?:head|body)>')\s*,\s*(.{0,10})/g)];
  assert.equal(sites.length, 4, `expected 4 injection sites, found ${sites.length}`);
  for (const [, replacer] of sites)
    assert.match(replacer, /^\(\)\s*=>/, `injection passes a string, not a function: ${replacer}`);
});

test("a replacement carrying $-patterns survives injection", () => {
  // The exact shape from Alpine's minified magic registration, plus the other
  // patterns String.replace would eat.
  const payload = 'Object.defineProperty(t,`$${n}`,{});' + "const s = ['$&', '$`', \"$'\", '$1'];";
  const asString = '<!--JS-->'.replace('<!--JS-->', payload);
  const asFunction = '<!--JS-->'.replace('<!--JS-->', () => payload);

  assert.equal(asFunction, payload, 'a function replacer is verbatim');
  assert.notEqual(asString, payload, 'a string replacer is not, which is the whole point');
  assert.match(asString, /`\$\{n\}`/, 'the $$ collapses and the magic loses its $');
});

test('the skill no longer documents the symptom as a runtime property', () => {
  const skill = readFileSync(path.join(repoRoot, 'skills/bake-page/SKILL.md'), 'utf8');
  assert.doesNotMatch(skill, /Inlined Alpine lacks `\$nextTick`/,
    'the old entry blamed the runtime; the cause is the injection');
  assert.match(skill, /function replacers/, 'the cause is stated where a reader will hit it');
});
