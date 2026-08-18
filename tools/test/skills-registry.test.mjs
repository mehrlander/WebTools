// skills/manifest.csv — the skills census, held to the folder both ways.
//
// Found undeclared by the 2026-08-09 reconciliation, and it was the clearest
// case of the class: a real census, exact coverage (34 of 34 on the day it was
// checked), a `meta.snapshot_date` implying someone refreshes it, and no gate
// and no builder anywhere in the repo. Its accuracy rested entirely on whoever
// last added a skill remembering to add a row. This is the check that was
// missing, not a new convention.
//
// It stays hand-kept rather than generated. The manifest is a SNAPSHOT served
// to other repos over raw.githubusercontent, and a description written for that
// audience is not always the SKILL.md front-matter line verbatim. Generating it
// would decide that question by fiat; gating it leaves the judgment and removes
// the drift.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';
import { parseCsv } from '../build/registries-load.mjs';

const skillsDir = path.join(repoRoot, 'skills');
const manifest = { skills: parseCsv(readFileSync(path.join(skillsDir, 'manifest.csv'), 'utf8')) };

const onDisk = readdirSync(skillsDir, { withFileTypes: true })
  .filter(e => e.isDirectory()).map(e => e.name).sort();

test('every skill directory has exactly one manifest row, and every row a directory', () => {
  const rows = manifest.skills.map(s => s.name);
  assert.equal(new Set(rows).size, rows.length, 'a skill name appears in two rows');
  assert.deepEqual([...rows].sort(), onDisk,
    'skills/manifest.csv and skills/ disagree; add the row, or drop it if the skill is gone');
});

test('every row carries a description', () => {
  for (const s of manifest.skills) {
    assert.ok(s.description && s.description.length > 30,
      `${s.name}: a description short enough to be a placeholder is not a trigger line`);
  }

});

// The manifest is served to other repos by absolute URL, so a wrong source is
// not a cosmetic error: it points consumers at a tree that may not be this one.
test('the skill that fetches the library names this repo and this folder', () => {
  // The URL used to be copied into the manifest as `source`. It is stated by
  // load-skill, which is the thing that does the fetching, so it is read there.
  const skill = readFileSync(path.join(repoRoot, '.claude/skills/load-skill/SKILL.md'), 'utf8');
  assert.match(skill, /mehrlander\/web-tools\/main\/skills/,
    'the loader skill must name this repo and this folder; other repos fetch against it');
});
