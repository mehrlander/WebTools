// skills/state-the-rule/ — the documentation-reduction tooling. Every figure it
// has produced was read by hand, and each of the rules pinned here was learned
// by getting it wrong on a real document (skills/state-the-rule/LOG.md). They
// are the branchy part: a wrong answer here does not throw, it quietly passes a
// cut that lost a rule, or fires on a correct one until nobody reads it.
//
// The tooling is python3/stdlib, so this drives it the way a session does,
// through the file system, and reads what it prints.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from './bootstrap.mjs';

const SKILL = join(repoRoot, 'skills', 'state-the-rule');

// One rule kept, one reason dropped, one pointer in each. Small enough to hold
// in the head, which is the point: every assertion below names a line of it.
const ORIGINAL = [
  'Always close the lid.',
  'It matters because the contents spoil, per [notes.md](notes.md).',
  'Replaced the 2019 rule on 2026-01-01, measured in [probe.md](probe.md).',
].join('\n\n');

function fixture(rewrite) {
  const dir = mkdtempSync(join(tmpdir(), 'str-'));
  const orig = join(dir, 'orig.md');
  const rw = join(dir, 'rewrite.md');
  writeFileSync(orig, ORIGINAL);
  writeFileSync(rw, rewrite);
  const units = execFileSync('python3', [join(SKILL, 'segment.py'), orig, '1', '99'],
                             { encoding: 'utf8' });
  const uf = join(dir, 'units.jsonl');
  writeFileSync(uf, units);
  const ids = units.trim().split('\n').map(l => JSON.parse(l).uid);
  // unit 1 is the rule, 2 the reason carrying notes.md, 3 the provenance
  // carrying probe.md. KEEP / DROP / MOVE in that order.
  const ann = ['uid\tlabel\tstruct\tverdict',
               `${ids[0]}\tWHAT\t0\tKEEP`,
               `${ids[1]}\tWHY-MOT\t0\tDROP`,
               `${ids[2]}\tPROV\t0\tMOVE`].join('\n') + '\n';
  const af = join(dir, 'ann.tsv');
  writeFileSync(af, ann);
  const out = execFileSync('python3', [join(SKILL, 'check.py'), uf, af, orig, rw],
                           { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  return out;
}

test('a KEEP unit that vanished is reported as a candidate breach', () => {
  const out = fixture('Nothing of the sort.');
  assert.match(out, /candidate breaches 1/,
    'a rule the annotation protected went missing and the check said nothing');
  assert.match(out, /Always close the lid/, 'the breach names the unit it lost');
});

test('a KEEP unit that survived, reworded, is not a breach', () => {
  const out = fixture('Always close the lid. See [notes.md](notes.md).');
  assert.match(out, /candidate breaches 0/);
});

test('a DROP unit still present verbatim is reported, not silently accepted', () => {
  const out = fixture(ORIGINAL);
  assert.match(out, /not-removed 2/,
    'the annotation said two units go; both stayed and the check passed them');
});

// Learned on docs/CONVENTIONS.md: registries.md and showing.md lived only in the
// provenance sentence being moved. Reporting them punishes a correct removal,
// and a check that fires on correct work stops being read.
test('a reference living only in a removed unit is excused, not counted lost', () => {
  const out = fixture('Always close the lid.');
  assert.match(out, /REFERENCES lost 0/);
  assert.match(out, /excused[^\n]*probe\.md/, 'the excused reference is still named');
});

// The other half of the same rule: notes.md is in a DROP unit here, so it is
// excused too, but a reference in a KEEP unit is a real loss and must report.
test('a reference the annotation kept, then dropped from the rewrite, is a loss', () => {
  const dir = mkdtempSync(join(tmpdir(), 'str-'));
  const orig = join(dir, 'orig.md');
  const rw = join(dir, 'rewrite.md');
  writeFileSync(orig, 'Always close the lid, per [notes.md](notes.md).');
  writeFileSync(rw, 'Always close the lid.');
  const units = execFileSync('python3', [join(SKILL, 'segment.py'), orig, '1', '99'],
                             { encoding: 'utf8' });
  writeFileSync(join(dir, 'u.jsonl'), units);
  const uid = JSON.parse(units.trim().split('\n')[0]).uid;
  writeFileSync(join(dir, 'a.tsv'),
                `uid\tlabel\tstruct\tverdict\n${uid}\tWHAT\t0\tKEEP\n`);
  const out = execFileSync('python3',
    [join(SKILL, 'check.py'), join(dir, 'u.jsonl'), join(dir, 'a.tsv'), orig, rw],
    { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  assert.match(out, /REFERENCES lost 1: \['notes\.md'\]/);
});

// Learned twice on docs/SURFACING.md: writing `docs/envelopes/surface.md` where
// the source said `surface.md` is the SAME destination made more specific, and
// reading it as a loss sent two passes chasing a defect that was not there.
test('a path made more specific is not a lost reference', () => {
  const out = fixture('Always close the lid, per [docs/notes.md](docs/notes.md).');
  assert.match(out, /REFERENCES lost 0/);
});

// Everything above rests on the segmentation being stable: if the same bytes
// produce different units on a later run, every stored annotation orphans at
// once and the contract is worthless.
test('segmentation is deterministic', () => {
  const dir = mkdtempSync(join(tmpdir(), 'str-'));
  const f = join(dir, 'x.md');
  writeFileSync(f, ORIGINAL);
  const run = () => execFileSync('python3', [join(SKILL, 'segment.py'), f, '1', '99'],
                                 { encoding: 'utf8' });
  const a = run(), b = run();
  rmSync(dir, { recursive: true, force: true });
  assert.equal(a, b, 'the same bytes segmented twice must give byte-identical units');
  assert.equal(a.trim().split('\n').length, 3, 'three paragraphs, three units');
});
