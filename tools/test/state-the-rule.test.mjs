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

// A run covering part of a file has to slice both sides the same way, or the
// size figure compares a section against a whole document. The section that was
// annotated and the section that was not are the same kind of range, so the
// checker names one rather than carrying a hardcoded heading. They are not a
// partition: the heading and the `---` that ends it fall outside both.
test('--section and --not-section slice to opposite halves of a file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'str-'));
  const body = ['# Doc', '', 'Head sentence.', '', '## Part', '',
                'Inside the part.', '', '---', '', '## Tail', '',
                'After the part.'].join('\n');
  const f = join(dir, 'doc.md');
  writeFileSync(f, body);
  // Annotate the one unit inside `## Part`, so the slice decides what is compared.
  const units = execFileSync('python3', [join(SKILL, 'segment.py'), f, '7', '7'],
                             { encoding: 'utf8' });
  writeFileSync(join(dir, 'u.jsonl'), units);
  const uid = JSON.parse(units.trim().split('\n')[0]).uid;
  writeFileSync(join(dir, 'a.tsv'), `uid\tlabel\tstruct\tverdict\n${uid}\tWHAT\t0\tKEEP\n`);
  const size = extra => Number(execFileSync('python3',
    [join(SKILL, 'check.py'), join(dir, 'u.jsonl'), join(dir, 'a.tsv'), f, f, ...extra],
    { encoding: 'utf8' }).match(/SIZE\s+(\d+)w/)[1]);
  const whole = size([]);
  const part = size(['--section', '## Part']);
  const rest = size(['--not-section', '## Part']);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(whole, 15, 'unsliced, the checker measures the whole file');
  assert.equal(part, 3, '`## Part` holds "Inside the part." and stops at the rule');
  assert.equal(rest, 9, 'the complement holds the head and the tail, and not the part');
  assert.ok(part < whole && rest < whole,
    'a slice that returned the whole file would compare a section against a document');
});

// Learned on home/CLAUDE.md, the first run outside this repo: that file puts
// bullet lists directly under `###` headings with no blank line, so a whole
// 700-word section arrived as a single `heading` unit and could not be
// annotated at all. A block is not always one unit.
test('a heading with no blank line under it does not swallow its section', () => {
  const dir = mkdtempSync(join(tmpdir(), 'str-'));
  const f = join(dir, 'x.md');
  writeFileSync(f, ['### Rules', '- First rule. It has two sentences.',
                    '- Second rule.', '- Third rule.'].join('\n'));
  const units = execFileSync('python3', [join(SKILL, 'segment.py'), f, '1', '99'],
                             { encoding: 'utf8' }).trim().split('\n').map(JSON.parse);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(units[0].kind, 'heading', 'the heading is its own unit');
  assert.equal(units[0].text, '### Rules', 'and owns only its own line');
  assert.ok(units.length >= 5,
    `three bullets and a two-sentence first one is 5+ units, got ${units.length}`);
  assert.ok(units.every(u => u.words < 20), 'no unit swallowed the section');
});

// Found by rolling this segmenter up against doc-audit's paragraph segmenter,
// which masks fences before it splits at all. A fence recognised only when it
// opens a block misses two shapes: one opened inside a list item, and one whose
// body holds a blank line, which the block splitter shreds into pieces carrying
// no fence marker. Both let template text be annotated as though it were a rule.
test('a fence is one unit whether or not it opens its block', () => {
  const dir = mkdtempSync(join(tmpdir(), 'str-'));
  const f = join(dir, 'x.md');
  writeFileSync(f, ['* **A rule.** It has a form:', '  ```bash', '  echo hi',
                    '  ```', '  **Boundary:** and an edge.', '',
                    '```markdown', 'Placeholder line.', '',
                    'Second placeholder.', '```', '', 'Real prose after.'
                   ].join('\n'));
  const units = execFileSync('python3', [join(SKILL, 'segment.py'), f, '1', '99'],
                             { encoding: 'utf8' }).trim().split('\n').map(JSON.parse);
  rmSync(dir, { recursive: true, force: true });
  const code = units.filter(u => u.kind === 'code');
  assert.equal(code.length, 2, `both fences are code units, got ${code.length}`);
  assert.ok(code[0].text.includes('echo hi'),
    'a fence opened inside a list item is still one code unit');
  assert.ok(code[1].text.includes('Second placeholder'),
    'a blank line inside a fence body does not split it into prose');
  assert.ok(!units.some(u => u.kind !== 'code' && u.text.includes('Placeholder')),
    'no fence body line is segmented as prose');
  assert.ok(units.some(u => u.kind !== 'code' && u.text.includes('Boundary')),
    'prose after a mid-block fence is still segmented');
});

// The defect the contract check structurally cannot see: the neighbour of a
// removed unit survives, so the contract counts it honoured. Three runs found
// these by hand before seams.py existed.
test('seams.py reports a neighbour left pointing at nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'str-'));
  const orig = join(dir, 'orig.md');
  const rw = join(dir, 'rewrite.md');
  writeFileSync(orig, 'Always close the lid.\n\nThe contents spoil.\n\nThat is why.');
  writeFileSync(rw, 'Always close the lid.\n\nThat is why.');
  const units = execFileSync('python3', [join(SKILL, 'segment.py'), orig, '1', '99'],
                             { encoding: 'utf8' });
  writeFileSync(join(dir, 'u.jsonl'), units);
  const ids = units.trim().split('\n').map(l => JSON.parse(l).uid);
  writeFileSync(join(dir, 'a.tsv'), ['uid\tlabel\tstruct\tverdict',
    `${ids[0]}\tWHAT\t0\tKEEP`, `${ids[1]}\tWHY-MOT\t0\tDROP`,
    `${ids[2]}\tWHY-MOT\t0\tKEEP`].join('\n') + '\n');
  const out = execFileSync('python3',
    [join(SKILL, 'seams.py'), join(dir, 'u.jsonl'), join(dir, 'a.tsv'), orig, rw],
    { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  assert.match(out, /back-reference/, '"That is why" lost what it pointed at');
  assert.match(out, /SEAMS      1 /, 'one seam, not one per removed predecessor');
  assert.match(out, /READ/, 'the check names the files it read');
});

// The other shape, and the one that broke a heading in the real run: a removed
// span can take the newline with it and leave the heading carrying prose.
test('seams.py reports a heading that swallowed the line under it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'str-'));
  const orig = join(dir, 'orig.md');
  const rw = join(dir, 'rewrite.md');
  writeFileSync(orig, '## Blog\n\nA tentative format.\n\nPosts are canonical.');
  writeFileSync(rw, '## Blog Posts are canonical.');
  const units = execFileSync('python3', [join(SKILL, 'segment.py'), orig, '1', '99'],
                             { encoding: 'utf8' });
  writeFileSync(join(dir, 'u.jsonl'), units);
  const ids = units.trim().split('\n').map(l => JSON.parse(l).uid);
  writeFileSync(join(dir, 'a.tsv'), ['uid\tlabel\tstruct\tverdict',
    `${ids[0]}\tWHAT\t0\tKEEP`, `${ids[1]}\tWHY-MOT\t0\tDROP`,
    `${ids[2]}\tWHAT\t0\tKEEP`].join('\n') + '\n');
  const out = execFileSync('python3',
    [join(SKILL, 'seams.py'), join(dir, 'u.jsonl'), join(dir, 'a.tsv'), orig, rw],
    { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  assert.match(out, /heading-absorbed/, 'the heading line carries a sentence');
});
