// The landing has one owner, and the copy is held to it.
//
// kits/land.js owns where a landing sits and what colour it is. kits/pdf.js
// draws the same landing over a rendered page and CANNOT call it: pdf.js has no
// kit dependencies, one of its consumers loads it straight from jsDelivr, and
// pages/pdf-inspect.html loads nothing beside it. So it carries literals, and
// this is what stops them drifting, the same bargain deck-entry-parity.test.mjs
// makes for the deck door and surfacing-manifest.test.mjs for the primitives.
//
// WHAT DRIFTED BEFORE THIS EXISTED is the reason it is worth the file. On
// 2026-09-04 the estate had six landings across five files and two repos, and
// they disagreed on both axes: a find hit centred while a markdown bullet sat
// 28% down, and the marks were three different yellows, two of them a hardcoded
// orange the theme does not carry. Nothing reported either, because each one
// looked right on its own surface.
//
// Read off the source, the way the other registry gates read theirs: pdf.js
// needs a browser to evaluate, and the pattern is narrow enough that a match is
// the real literal and not prose about one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/land.js'), 'utf8'))();
const Land = window.Land;
const pdf = readFileSync(path.join(repoRoot, 'lib/kits/pdf.js'), 'utf8');

test('a find hit lands at the same height as a bullet', () => {
  const m = /box\.clientHeight \* ([\d.]+)\)/.exec(pdf);
  assert.ok(m, "pdf.js's findGo no longer scales by clientHeight; check it still lands");
  assert.equal(+m[1], Land.LAND_AT,
    `pdf.js lands at ${m[1]} and land.js at ${Land.LAND_AT}; one of them moved`);
});

test('and wears the same yellow, from the theme rather than a hex', () => {
  // The percentages are the OVERLAY pair, not the flow pair: a mark over a
  // rendered page multiplies against white and needs the stronger one.
  assert.ok(pdf.includes(`tint(${Land.PAGE.current})`),
    `the current hit must fill at ${Land.PAGE.current}%`);
  assert.ok(pdf.includes(`tint(${Land.PAGE.rest})`),
    `the other hits must fill at ${Land.PAGE.rest}%`);
  assert.match(pdf, /const tint = \(pct\) => `color-mix\(in oklab, var\(--color-warning\)/,
    'the tint reads --color-warning, so the marks follow the theme');
  assert.equal(/rgba\(2[0-9]{2},/.test(pdf), false,
    'a hardcoded rgba is back in pdf.js; the palette has one owner');
});

test('an overlay mark multiplies, so it sits under the glyphs it covers', () => {
  // A highlighter, not a selection. It is the one property a mark in the flow
  // does not need and a mark over print cannot do without.
  assert.match(Land.OVERLAY, /mix-blend-mode:\s*multiply/);
  assert.match(pdf, /mix-blend-mode:multiply/);
});

test('the current hit keeps a ring, which the fill alone cannot replace', () => {
  // At the size of a word on a page, an outline separates "this one" from "one
  // of these" more reliably than a stronger fill; that is why dropping the
  // orange hue did not drop the ring with it.
  assert.match(pdf, /box-shadow:0 0 0 1px \$\{tint\(\d+\)\}/);
});
