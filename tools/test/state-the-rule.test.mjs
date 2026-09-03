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
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
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
  assert.equal(units[0].kind, 'h3', 'the heading is its own unit, at its own level');
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

// ── ops.py: the patch ──────────────────────────────────────────────────────
// The page applies each operation optimistically and ops.py is the authority
// that validates and writes, so what the two must agree on is the RESULT of a
// patch. These pin the half nobody can see in a screenshot: what a bad patch
// does to the file it was pointed at.

const DOC = 'Close the lid, because the contents spoil.\n\nCheck it twice.';

const BASE = () => ({
  kind: 'standoff/1',
  target: { path: 'doc.md' },
  vocabulary: [{ label: 'WHAT', side: 'declaration' },
               { label: 'WHY-MOT', side: 'explanation' }],
  units: [
    { uid: 'u-001', start: 0, end: 42, kind: 'sent', words: 7, label: 'WHAT' },
    { uid: 'u-002', start: 44, end: 59, kind: 'sent', words: 3, label: 'WHAT' },
  ],
});

function standoff(dir) {
  const doc = join(dir, 'doc.md');
  writeFileSync(doc, DOC);
  const sf = join(dir, 'so.json');
  writeFileSync(sf, JSON.stringify(BASE()));
  return { doc, sf };
}

// Returns { status, out, so } so a test can assert on both the exit and the
// file: a refusal that still wrote is the failure worth catching.
function patch(ops, write = true) {
  const dir = mkdtempSync(join(tmpdir(), 'ops-'));
  const { doc, sf } = standoff(dir);
  const pf = join(dir, 'patch.json');
  writeFileSync(pf, JSON.stringify(ops));
  const args = [join(SKILL, 'ops.py'), sf, pf, doc];
  if (write) args.push('--write');
  let status = 0, out = '';
  try { out = execFileSync('python3', args, { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { status = e.status; out = (e.stderr || '') + (e.stdout || ''); }
  const so = JSON.parse(readFileSync(sf, 'utf8'));
  rmSync(dir, { recursive: true, force: true });
  return { status, out, so };
}

test('a split leaves the two halves tiling the parent span', () => {
  const { so } = patch([{ op: 'split', uid: 'u-001', at: 15 }]);
  const [a, b] = so.units;
  assert.equal(a.uid, 'u-001a');
  assert.equal(b.uid, 'u-001b');
  assert.deepEqual([a.start, a.end, b.start, b.end], [0, 15, 15, 42]);
  assert.equal(a.from, 'split:u-001', 'the halves record what they came from');
});

test('a split at a boundary outside the unit is refused', () => {
  const { status, out, so } = patch([{ op: 'split', uid: 'u-001', at: 200 }]);
  assert.notEqual(status, 0);
  assert.match(out, /not inside/);
  assert.equal(so.units.length, 2, 'the file is untouched');
});

// The one that matters: an operation is checked after it is applied, so a patch
// whose LAST step is bad must not leave the earlier steps on disk.
test('a patch is refused whole, not applied up to the bad operation', () => {
  const { status, so } = patch([{ op: 'split', uid: 'u-001', at: 15 },
                                { op: 'relabel', uid: 'u-001a', label: 'NOPE' }]);
  assert.notEqual(status, 0);
  assert.equal(so.units.length, 2, 'the good split did not survive the bad relabel');
  assert.equal(so.units[0].uid, 'u-001');
});

test('a label outside the declared vocabulary is refused', () => {
  const { status, out } = patch([{ op: 'relabel', uid: 'u-001', label: 'WHY-OP' }]);
  assert.notEqual(status, 0);
  assert.match(out, /vocabulary/);
});

test('an unknown operation is refused rather than skipped', () => {
  const { status, out } = patch([{ op: 'reword', uid: 'u-001', text: 'no' }]);
  assert.notEqual(status, 0);
  assert.match(out, /unknown operation/);
});

test('the last unit has nothing to merge with', () => {
  const { status, out } = patch([{ op: 'merge', uid: 'u-002' }]);
  assert.notEqual(status, 0);
  assert.match(out, /nothing follows/);
});

// A merge that kept either side's kind would be stating something false about
// the span it now covers, and the kind is what the page styles on.
// DERIVED FROM THE SPAN, NOT FROM THE LABELS JOINED. Both units are `sent`, so
// the rule this replaces ("the two kinds differ, so say mixed") would have kept
// `sent` on a survivor plainly covering two paragraphs.
test('a merge reports the kind of the span it produced', () => {
  const { so } = patch([{ op: 'merge', uid: 'u-001' }]);
  assert.equal(so.units.length, 1);
  assert.equal(so.units[0].kind, 'mixed', 'the survivor spans a blank line');
  assert.equal(so.units[0].end, 59, 'the survivor covers both spans');
});

test('a note is set and cleared through the same operation', () => {
  const set = patch([{ op: 'note', uid: 'u-001', text: 'the reason is fused in' }]);
  assert.equal(set.so.units[0].note, 'the reason is fused in');
  const cleared = patch([{ op: 'note', uid: 'u-001', text: 'x' },
                         { op: 'note', uid: 'u-001', text: '' }]);
  assert.ok(!('note' in cleared.so.units[0]), 'an empty note removes the key');
});

// Without --write the run is a dry run, which is what makes a patch reviewable
// before it lands.
test('without --write nothing is written', () => {
  const { status, out, so } = patch([{ op: 'split', uid: 'u-001', at: 15 }], false);
  assert.equal(status, 0);
  assert.match(out, /2 units -> 3/);
  assert.equal(so.units.length, 2);
});

// ── the boundary ───────────────────────────────────────────────────────────
// A boundary is the object a reader moves: the end of one unit is the start of
// the next, so one operation moves both and the partition survives by
// construction rather than by a rule.

test('moving a boundary moves both units and keeps the partition', () => {
  const { so } = patch([{ op: 'shift', after: 'u-001', to: 30 }]);
  assert.deepEqual([so.units[0].start, so.units[0].end], [0, 30]);
  assert.deepEqual([so.units[1].start, so.units[1].end], [30, 59]);
  assert.equal(so.units[0].from, 'shift:u-001/u-002');
  assert.equal(so.units[1].from, 'shift:u-001/u-002');
});

test('a boundary outside the pair it separates is refused', () => {
  const { status, out } = patch([{ op: 'shift', after: 'u-001', to: 200 }]);
  assert.notEqual(status, 0);
  assert.match(out, /outside/);
});

test('the last unit has no boundary after it', () => {
  const { status, out } = patch([{ op: 'shift', after: 'u-002', to: 50 }]);
  assert.notEqual(status, 0);
  assert.match(out, /no boundary after it/);
});

// The complaint nothing made until 2026-08-30: the gap check only looks
// forward, so a unit starting BEFORE its predecessor ended passed every gate.
// The edge drag is what made one easy to create.
test('an overlap is reported, not just a gap', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-'));
  const { doc, sf } = standoff(dir);
  const so = JSON.parse(readFileSync(sf, 'utf8'));
  so.units[1].start = 30;                       // twelve characters in both
  writeFileSync(sf, JSON.stringify(so));
  const pf = join(dir, 'p.json');
  writeFileSync(pf, JSON.stringify([{ op: 'note', uid: 'u-001', text: 'x' }]));
  let out = '';
  try { execFileSync('python3', [join(SKILL, 'ops.py'), sf, pf, doc], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { out = (e.stderr || '') + (e.stdout || ''); }
  rmSync(dir, { recursive: true, force: true });
  assert.match(out, /u-002: overlaps the unit before it by 12 chars/);
});

// ── THE TWO IMPLEMENTATIONS, HELD TO EACH OTHER ──────────────────────────────
// tools/render/scenarios/audit-edit.mjs drives both end to end and PRINTS them
// for a person to diff. This asserts it, over the ops least likely to be
// re-checked by eye. `insert` is the reason: it is inert with respect to every
// span invariant, so nothing else here can see it drift, and it carries three
// interactions with the ops around it. A patch replaying differently in the two
// languages is the failure, and the browser is where it would be found last.

const win = {};
new Function('window', readFileSync(join(repoRoot, 'lib/kits/standoff.js'), 'utf8'))(win);
const KIT = win.Standoff;

// Both sides, one patch. Returns the two results so a test can compare them, and
// asserts up front that they AGREE ON WHETHER TO RUN AT ALL: a refusal on one
// side and a clean apply on the other is the drift that matters most, and
// comparing only the output would read it as an equality failure.
function both(ops) {
  const py = patch(ops);
  const js = KIT.apply(BASE(), ops, DOC);
  const pyRefused = py.status !== 0, jsRefused = js.complaints.length > 0;
  assert.equal(pyRefused, jsRefused,
    `python ${pyRefused ? 'refused' : 'applied'}, javascript ${jsRefused ? 'refused' : 'applied'}` +
    `\n  python: ${py.out.trim()}\n  javascript: ${js.complaints.join('; ')}`);
  return { py, js, refused: pyRefused };
}

// The whole patch, not just the insertions: an insert that also perturbed a span
// would show up here and nowhere else. Compared as BYTES rather than by
// deepEqual, which is blind to key order, and key order is the half that
// matters downstream: audit-payload.py and the page both write standoff.json,
// so a disagreement makes every real change arrive inside a whole-file
// reformat. The two did disagree when insert was written (`after, why, text`
// against `after, text, why`) and deepEqual passed.
const agree = (ops) => {
  const { py, js, refused } = both(ops);
  assert.equal(refused, false, `both refused: ${py.out.trim()}`);
  assert.deepEqual(js.so, py.so);
  assert.equal(JSON.stringify(js.so), JSON.stringify(py.so),
    'the two serializations differ in key order, which deepEqual cannot see');
  return py.so;
};

test('an insertion anchors to a boundary and both languages place it the same', () => {
  const so = agree([{ op: 'insert', after: 'u-001', text: 'A sentence the document lacks.' }]);
  assert.deepEqual(so.insertions,
    [{ after: 'u-001', text: 'A sentence the document lacks.' }]);
  assert.equal(so.units.length, 2, 'the units are untouched by an insertion');
});

test('an insertion carrying a reason serializes identically in both languages', () => {
  const so = agree([{ op: 'insert', after: 'u-001', text: 'the rule needs a case',
                      why: 'the boundary above states it and nothing shows it' }]);
  assert.deepEqual(Object.keys(so.insertions[0]), ['after', 'text', 'why']);
});

test('the head of the document is a boundary, and it is the one that follows nothing', () => {
  const so = agree([{ op: 'insert', after: null, text: 'A lead sentence.' },
                    { op: 'insert', after: 'u-002', text: 'A closing sentence.' }]);
  assert.deepEqual(so.insertions.map(i => i.after), [null, 'u-002'],
    'ordered by where the anchor sits, head first');
});

test('the anchor is the identity, so an empty text clears it', () => {
  const so = agree([{ op: 'insert', after: 'u-001', text: 'first thought' },
                    { op: 'insert', after: 'u-001', text: 'second thought' },
                    { op: 'insert', after: 'u-002', text: 'elsewhere' }]);
  assert.deepEqual(so.insertions,
    [{ after: 'u-001', text: 'second thought' }, { after: 'u-002', text: 'elsewhere' }],
    'a second insertion at one boundary replaces the first rather than joining it');

  const gone = agree([{ op: 'insert', after: 'u-001', text: 'x' },
                      { op: 'insert', after: 'u-001', text: '' }]);
  assert.equal('insertions' in gone, false, 'the last insertion out takes the key with it');
});

// The payoff of keying by uid rather than by offset, and the reason to state it
// as a test: an offset anchor would need rewriting on every drag, and the page
// produces drags from three call sites.
test('shifting the anchored boundary leaves the insertion alone', () => {
  const so = agree([{ op: 'insert', after: 'u-001', text: 'stays put' },
                    { op: 'shift', after: 'u-001', to: 30 }]);
  assert.deepEqual(so.insertions, [{ after: 'u-001', text: 'stays put' }]);
  assert.equal(so.units[0].end, 30, 'the boundary really did move under it');
});

test('splitting the anchor unit carries the insertion to the half that keeps the boundary', () => {
  const so = agree([{ op: 'insert', after: 'u-001', text: 'after the whole unit' },
                    { op: 'split', uid: 'u-001', at: 15 }]);
  assert.equal(so.insertions[0].after, 'u-001b',
    'the parent\'s end is the second half\'s end; the first half\'s end is a new boundary');
});

// Not tidiness. The survivor keeps `u-001`, so the anchor would still RESOLVE
// after the merge, naming the boundary past the absorbed unit: it would pass
// every check and sit in the wrong place.
test('a merge is refused while an insertion sits on the boundary it removes', () => {
  const { py, refused } = both([{ op: 'insert', after: 'u-001', text: 'here, between them' },
                                { op: 'merge', uid: 'u-001' }]);
  assert.equal(refused, true, 'the merge went through and moved the anchor silently');
  assert.match(py.out, /insertion/i);
  assert.equal(py.so.units.length, 2, 'a refused patch leaves the file alone');
});

test('an insertion anchored to no unit is refused by both', () => {
  assert.equal(both([{ op: 'insert', after: 'u-404', text: 'nowhere' }]).refused, true);
});

// THE SHAPE IS THE ONE THING THE DOCUMENT CANNOT ALWAYS ANSWER. materialize.py
// reads the separator standing at a boundary, which is mechanical and right
// everywhere the document has one to read. The tail does not: a file's final
// newline is a terminator, so the gap says "run" for a reason that has nothing
// to do with intent, and a closing paragraph was unsayable. `as` states it.
// Held here because it is an optional key, and an optional key is exactly where
// two serializations drift without either looking wrong.
test('an insertion may state how it arrives, and both languages write the same key', () => {
  const so = agree([{ op: 'insert', after: 'u-002', text: 'A closing paragraph.', as: 'block' }]);
  assert.deepEqual(Object.keys(so.insertions[0]), ['after', 'text', 'as']);
  assert.equal(so.insertions[0].as, 'block');
});

test('the shape sits before the reason, in both languages', () => {
  const so = agree([{ op: 'insert', after: 'u-002', text: 'A closing paragraph.',
                      as: 'block', why: 'the section ends without stating its own bound' }]);
  assert.deepEqual(Object.keys(so.insertions[0]), ['after', 'text', 'as', 'why']);
});

test('an unstated shape writes no key at all, which is not a third value of one', () => {
  const so = agree([{ op: 'insert', after: 'u-002', text: 'A closing paragraph.' }]);
  assert.ok(!('as' in so.insertions[0]),
    'unset hands the answer to the boundary; a stored default would not');
});

test('a shape the vocabulary does not carry is refused by both', () => {
  assert.equal(both([{ op: 'insert', after: 'u-002', text: 'x', as: 'paragraph' }]).refused, true);
});

// Not a matter of taste: the head precedes every unit, so there is no run on
// its side of the boundary for the text to join. Refusing it is the same kind
// of statement as refusing a shift with a unit on one side only.
test('a run at the head of the document is refused by both, having nothing to run into', () => {
  const { py, refused } = both([{ op: 'insert', after: null, text: 'x', as: 'run' }]);
  assert.equal(refused, true);
  assert.match(py.out, /nothing here to run into/);
  assert.equal(both([{ op: 'insert', after: null, text: 'x', as: 'block' }]).refused, false,
    'a block at the head is the default said out loud, not a contradiction');
});

// KIND IS DERIVED, so it is a third thing the two implementations have to agree
// about, and the one with no segmenter on the browser side. Asserted through the
// parity harness rather than twice, because the failure worth catching is one
// language re-deriving and the other carrying the old value forward: both would
// look correct alone. A shift is the case that exposed the gap, since only the
// JavaScript side had a test for it.
test('a boundary move re-derives the kind on both sides, in both languages', () => {
  const so = agree([{ op: 'shift', after: 'u-001', to: 50 }]);
  assert.deepEqual(so.units.map(u => [u.uid, u.kind]), [['u-001', 'mixed'], ['u-002', 'sent']],
    'the first unit swallowed across the blank line; the second is a plain sentence again');
});

test('a split re-derives the kind of both halves, in both languages', () => {
  const so = agree([{ op: 'split', uid: 'u-001', at: 15 }]);
  assert.deepEqual(so.units.map(u => [u.uid, u.kind]),
    [['u-001a', 'sent'], ['u-001b', 'sent'], ['u-002', 'sent']]);
});

// ── PROJECTING A STANDOFF ONTO TEXT ──────────────────────────────────────────
// materialize.py runs the edits the annotation SPECIFIES and reports the ones it
// cannot: DROP and insert are mechanical, REWRITE and MOVE each imply content
// the standoff does not carry. The failure worth pinning is not a crash, it is a
// projection that quietly invents something: a MOVE silently removed, a
// separator chosen rather than read, or an insertion applied a second time.

function project(mut, args = ['--json'], fixture = null) {
  const dir = mkdtempSync(join(tmpdir(), 'mat-'));
  const doc = join(dir, 'doc.md'), sf = join(dir, 'so.json'), out = join(dir, 'out.md');
  writeFileSync(doc, fixture ? fixture.text : DOC);
  const so = fixture ? fixture.so() : BASE();
  so.verdicts = ['KEEP', 'REWRITE', 'MOVE', 'DROP'].map(verdict => ({ verdict }));
  so.units.forEach(u => { u.verdict = 'KEEP'; });
  mut(so);
  writeFileSync(sf, JSON.stringify(so));
  const r = spawnSync('python3', [join(SKILL, 'materialize.py'), sf, doc, '--out', out, ...args],
                      { encoding: 'utf8' });
  const text = r.status === 0 ? readFileSync(out, 'utf8') : '';
  const json = args.includes('--json') && r.status === 0 ? JSON.parse(r.stdout) : null;
  return { status: r.status, stderr: r.stderr, text, json, dir, doc, sf };
}

test('an annotation specifying nothing executable projects the document unchanged', () => {
  const r = project(() => {});
  assert.equal(r.text, DOC, 'all-KEEP and no insertions is a no-op, byte for byte');
  assert.deepEqual(r.json.joins, {}, 'nothing was removed, so nothing was left behind');
});

test('DROP is executed and REWRITE and MOVE are left standing, named', () => {
  const r = project((so) => {
    so.units[0].verdict = 'REWRITE';
    so.units[1].verdict = 'MOVE';
  });
  assert.match(r.text, /Close the lid/, 'a REWRITE keeps its text: no replacement is stored');
  assert.match(r.text, /Check it twice/, 'a MOVE keeps its text: no destination is stored');
  assert.deepEqual(r.json.standing.map(s => [s.uid, s.verdict]),
    [['u-001', 'REWRITE'], ['u-002', 'MOVE']]);

  const dropped = project((so) => { so.units[1].verdict = 'DROP'; });
  assert.doesNotMatch(dropped.text, /Check it twice/);
  assert.equal(dropped.json.dropped_words, 3);
});

// MOVE is the one place this disagrees with check.py, which reads DROP and MOVE
// together as "should have left". That is right when JUDGING a rewrite a person
// made, because the person put the text somewhere. Here there is nowhere.
test('a MOVE is not a DROP: removing it would lose text with no record of where it went', () => {
  const r = project((so) => { so.units[1].verdict = 'MOVE'; });
  assert.match(r.text, /Check it twice/);
  assert.equal(r.json.dropped_words, 0);
});

// The separator is READ off the document, not chosen. Picking one would be the
// same kind of guess as inventing a REWRITE.
test('an insertion inherits the separator already standing at its boundary', () => {
  // u-001 and u-002 are separated by a blank line, so that boundary is a block.
  const block = project((so) => {
    so.insertions = [{ after: 'u-001', text: 'A new paragraph.' }];
  });
  assert.match(block.text, /spoil\.\n\nA new paragraph\.\n\nCheck/);

  // The tail's gap is the file's end, no blank line, so the text joins the run.
  const inline = project((so) => {
    so.insertions = [{ after: 'u-002', text: 'And once more.' }];
  });
  assert.match(inline.text, /Check it twice\. And once more\./);
});

test('the head of the document is a block, since it can continue nothing', () => {
  const r = project((so) => { so.insertions = [{ after: null, text: 'A lead sentence.' }]; });
  assert.ok(r.text.startsWith('A lead sentence.\n\nClose the lid'), r.text.slice(0, 60));
});

// THE CASE THAT NAMED THE FIELD, and its mirror. The tail's reading is not
// wrong so much as unavailable, so the annotation says it instead; the mirror
// is here because a fix that only reached the tail would be a special case
// wearing a general field's name.
test('a stated shape overrules the separator the document is carrying', () => {
  const closing = project((so) => {
    so.insertions = [{ after: 'u-002', text: 'A closing paragraph.', as: 'block' }];
  });
  assert.match(closing.text, /Check it twice\.\n\nA closing paragraph\./,
    'the tail read "run" and the annotation said otherwise');

  const joined = project((so) => {
    so.insertions = [{ after: 'u-001', text: 'And a rider.', as: 'run' }];
  });
  assert.match(joined.text, /spoil\. And a rider\.\n\nCheck/,
    'a block boundary overruled the other way, so the field is not tail-only');
});

// An honored override the account does not mention reads as a reading, and the
// two differ in who is answerable for the shape.
test('the report says how many insertions stated a shape rather than read one', () => {
  const r = project((so) => {
    so.insertions = [{ after: 'u-001', text: 'Read off the gap.' },
                     { after: 'u-002', text: 'Stated.', as: 'block' }];
  }, []);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json, null);
  const both_ = project((so) => {
    so.insertions = [{ after: 'u-001', text: 'Read off the gap.' },
                     { after: 'u-002', text: 'Stated.', as: 'block' }];
  });
  assert.equal(both_.json.inserted, 2);
  assert.equal(both_.json.stated, 1);
});

// A reporter blind to the commonest artifact of its own edit reads as an
// all-clear. Both units of the main fixture are whole paragraphs, so dropping
// one strands nothing; the artifacts only appear where units SHARE a line,
// which is the ordinary sentence-grain case.
const RUN = {
  text: 'One here. Two here. Three here.\n',
  so: () => ({
    kind: 'standoff/1', target: { path: 'doc.md' },
    vocabulary: [{ label: 'WHAT' }],
    units: [{ uid: 'r-1', start: 0, end: 9, kind: 'sent', words: 2, label: 'WHAT' },
            { uid: 'r-2', start: 10, end: 19, kind: 'sent', words: 2, label: 'WHAT' },
            { uid: 'r-3', start: 20, end: 31, kind: 'sent', words: 2, label: 'WHAT' }],
  }),
};

test('the whitespace a removal leaves is reported rather than cleaned up', () => {
  const r = project((so) => { so.units[1].verdict = 'DROP'; }, ['--json'], RUN);
  assert.equal(r.text, 'One here.  Three here.\n',
    'the span is removed and the spaces around it are left exactly as they were');
  assert.deepEqual(r.json.joins, { 'double space': 1 });
});

// The shape a first pass missed entirely: cutting the LAST unit of a line
// strands the space before it against the newline, which no mid-line run
// matches. It reported {} on an edit that had visibly left something.
test('a removal at the end of a line is reported too, not only one in the middle', () => {
  const r = project((so) => { so.units[2].verdict = 'DROP'; }, ['--json'], RUN);
  assert.equal(r.text, 'One here. Two here. \n');
  assert.deepEqual(r.json.joins, { 'trailing space': 1 });
});

// THE DIGEST IS THE LIFECYCLE. An insertion is pending while the document still
// has the bytes the annotation was made against; applying the projection ends
// that, and the same gate that protects the offsets is what stops a second
// application. Nothing has to mark an insertion "applied".
test('applying the projection retires its insertions, because the digest stops matching', () => {
  const r = project((so) => {
    so.target.sha256 = createHash('sha256').update(DOC).digest('hex');
    so.insertions = [{ after: 'u-001', text: 'A new paragraph.' }];
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.text, /A new paragraph/);

  // Write the projection over the target, the way a session would, then re-run.
  writeFileSync(r.doc, r.text);
  const again = spawnSync('python3', [join(SKILL, 'materialize.py'), r.sf, r.doc],
                          { encoding: 'utf8' });
  assert.notEqual(again.status, 0, 'the insertion would have been applied twice');
  assert.match(again.stderr, /not the document this standoff annotates/);
  assert.match(again.stderr, /re-anchoring/, 'the refusal says what to do instead');
});

// ── THE CLASSIFIER AND THE SEGMENTER, HELD TOGETHER ──────────────────────────
// `kind` is derived from a span so a boundary edit cannot leave it stale, which
// only works while the derivation agrees with the segmenter that produced the
// kinds in the first place. They are two statements of one rule in two
// languages: segment.py dispatches on a BLOCK, Standoff.kindOf on a SPAN, and a
// browser has no segmenter to fall back on. A drift makes a patched unit and a
// rebuilt one disagree about the same text, which nothing else would report.
//
// Run over the repo's own documents rather than a fixture, because the shapes
// that separate the two orderings (a fence whose body holds blank lines, a
// heading straight after a fence) are not ones a fixture author thinks to write.

const CORPUS = ['docs/SURFACING.md', 'docs/TRACKER.md', 'docs/CONVENTIONS.md',
                'skills/state-the-rule/SKILL.md', 'CLAUDE.md', 'docs/registries.md',
                'docs/showing.md', 'docs/stage.md', 'docs/loader.md'];

// PYTHON INDEXES BY CODE POINT AND JAVASCRIPT BY UTF-16 CODE UNIT, so one astral
// character (every emoji in these documents) shifts every later offset by one.
// docs/SURFACING.md carries 49 of them, and a browser slicing at segment.py's
// offsets reads a span starting two characters early. That is a defect in the
// FORMAT, not in the classification this test is about, and no stored run hits
// it yet (CONVENTIONS.md has none), so the offsets are converted here rather
// than the corpus being trimmed to documents that hide it.
function toUtf16(text) {
  const map = [];
  for (let i = 0; i < text.length;) { map.push(i); i += text.codePointAt(i) > 0xFFFF ? 2 : 1; }
  map.push(text.length);
  return map;
}

test('Standoff.kindOf agrees with segment.py on every unit of the repo corpus', () => {
  const seen = {}, drift = [];
  let n = 0, astral = 0;
  for (const rel of CORPUS) {
    const path = join(repoRoot, rel);
    const text = readFileSync(path, 'utf8');
    const map = toUtf16(text);
    astral += text.length - (map.length - 1);
    const units = execFileSync('python3', [join(SKILL, 'segment.py'), path, '1', '99999'],
                               { encoding: 'utf8' }).trim().split('\n').map(l => JSON.parse(l));
    for (const u of units) {
      n++;
      seen[u.kind] = (seen[u.kind] || 0) + 1;
      const got = KIT.kindOf(text, map[u.start], map[u.end]);
      if (got !== u.kind) drift.push(`${rel} ${u.uid}: segment.py ${u.kind}, kindOf ${got}` +
                                     ` — ${JSON.stringify(u.text.slice(0, 48))}`);
    }
  }
  assert.deepEqual(drift, []);
  // A corpus that lost its fences or tables would pass while testing nothing,
  // since `sent` is the fallback both sides reach by doing nothing.
  assert.ok(n > 1000, `only ${n} units in the corpus`);
  for (const k of ['sent', 'code', 'table'])
    assert.ok(seen[k] >= 10, `only ${seen[k] || 0} ${k} units to compare`);
  // Headings are a family now, so count them as one and then insist the corpus
  // actually spans levels: a corpus of nothing but `##` would agree on every
  // unit while never exercising the digit that was the point of the change.
  const heads = Object.entries(seen).filter(([k]) => /^h[1-6]$/.test(k));
  assert.ok(heads.reduce((n, [, c]) => n + c, 0) >= 10,
    `only ${heads.length} heading kind(s) to compare`);
  assert.ok(heads.length >= 3, `the corpus carries only ${heads.length} heading level(s)`);
  // And the conversion above is doing something, so a corpus quietly losing its
  // emoji cannot turn this into a test of nothing.
  assert.ok(astral > 20, `only ${astral} astral characters: the offset skew is untested`);
});

// The ordering is the whole design, and it is not obvious from either file. A
// structural marker outranks the remaining tests EXCEPT heterogeneity, which
// outranks every marker but a fence: a fence body legitimately holds blank
// lines, and nothing else does.
test('a fence outranks the blank line inside it, and every other marker does not', () => {
  const fence = '```markdown\nfirst line\n\nafter a blank line\n```';
  assert.equal(KIT.kindOf(fence, 0, fence.length), 'code',
    'reading the blank line first would call a fenced example mixed');

  const heading = '## Scope and precedence\n\nA sentence follows it.';
  assert.equal(KIT.kindOf(heading, 0, 23), 'h2');
  assert.equal(KIT.kindOf('#### Deeper still', 0, 17), 'h4', 'the kind carries the level');
  assert.equal(KIT.kindOf(heading, 0, 32), 'mixed',
    'a heading that swallowed across the break is no longer just a heading');

  const table = '| a | b |\n| - | - |';
  assert.equal(KIT.kindOf(table, 0, table.length), 'table');
});

// THE WHOLE TRIP, over the document that actually carries the problem.
// docs/SURFACING.md holds 49 astral characters, so every unit after the first is
// shifted for a browser reading segment.py's offsets directly. A fixture cannot
// stand in for this: the drift is proportional to how many emoji precede a unit,
// so only a real document exercises the accumulation.
test('every unit of an emoji-carrying document resolves to the text segment.py recorded', () => {
  const rel = 'docs/SURFACING.md';
  const path = join(repoRoot, rel);
  const text = readFileSync(path, 'utf8');
  const units = execFileSync('python3', [join(SKILL, 'segment.py'), path, '1', '99999'],
                             { encoding: 'utf8' }).trim().split('\n').map(l => JSON.parse(l));
  const astral = text.length - [...text].length;
  assert.ok(astral >= 40, `only ${astral} astral characters: the drift is untested`);

  const stored = { units: units.map(u => ({ uid: u.uid, start: u.start, end: u.end })) };
  const browser = KIT.adopt(stored, text);
  const wrong = browser.units
    .map((u, i) => [u.uid, text.slice(u.start, u.end), units[i].text])
    .filter(([, got, want]) => got !== want);
  assert.deepEqual(wrong.map(w => w[0]), [], 'adopted spans that do not match segment.py');

  // And back, byte for byte, since this is what gets written to the run file.
  assert.deepEqual(KIT.emit(browser, text).units, stored.units);

  // Without the conversion, most of the document is wrong: the assertion above
  // would pass over a no-op if the maps were ever reduced to identity.
  const raw = units.filter(u => text.slice(u.start, u.end) !== u.text).length;
  assert.ok(raw > units.length / 2,
    `only ${raw} of ${units.length} units drift unconverted; is the corpus still emoji-heavy?`);
});
