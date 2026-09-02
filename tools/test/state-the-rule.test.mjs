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
test('a merge across two kinds reports mixed, not one of them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-'));
  const { doc, sf } = standoff(dir);
  const so = JSON.parse(readFileSync(sf, 'utf8'));
  so.units[1].kind = 'heading';
  writeFileSync(sf, JSON.stringify(so));
  const pf = join(dir, 'p.json');
  writeFileSync(pf, JSON.stringify([{ op: 'merge', uid: 'u-001' }]));
  execFileSync('python3', [join(SKILL, 'ops.py'), sf, pf, doc, '--write']);
  const after = JSON.parse(readFileSync(sf, 'utf8'));
  rmSync(dir, { recursive: true, force: true });
  assert.equal(after.units.length, 1);
  assert.equal(after.units[0].kind, 'mixed');
  assert.equal(after.units[0].end, 59, 'the survivor covers both spans');
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
