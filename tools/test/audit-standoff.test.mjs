// The standoff annotation is only worth anything if it still describes the file
// it names. Two ways that breaks silently, and this fails on both: the target
// document is edited, so the spans point at moved text; or the page's embedded
// copy drifts from the committed file, so the Standoff view shows something the
// repo does not hold.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const RUN = 'skills/state-the-rule/runs/2026-08-29-conventions';
const standoff = JSON.parse(readFileSync(`${RUN}/standoff.json`, 'utf8'));
const doc = readFileSync(standoff.target.path, 'utf8');

test('the annotation still describes the document it names', () => {
  const digest = createHash('sha256').update(readFileSync(standoff.target.path)).digest('hex');
  assert.equal(digest, standoff.target.sha256,
    `${standoff.target.path} changed since it was annotated; re-run:\n` +
    `  python3 skills/state-the-rule/segment.py ${standoff.target.path} 1 999 > ${RUN}/units.jsonl\n` +
    `  (re-label, then) python3 tools/build/audit-payload.py standoff ${standoff.target.path} ${RUN} ...`);
});

test('every span resolves to real text', () => {
  const empty = standoff.units.filter(u => !doc.slice(u.start, u.end).trim());
  assert.equal(empty.length, 0, `empty spans: ${empty.map(u => u.uid).join(', ')}`);
});

test('the units tile the document, leaving no unannotated prose', () => {
  let prev = 0;
  const gaps = [];
  for (const u of [...standoff.units].sort((a, b) => a.start - b.start)) {
    if (u.start > prev && doc.slice(prev, u.start).trim()) gaps.push([prev, u.start]);
    prev = Math.max(prev, u.end);
  }
  assert.equal(gaps.length, 0, `unannotated regions: ${JSON.stringify(gaps)}`);
  assert.equal(doc.slice(prev).trim(), '', 'the document has an unannotated tail');
});

test('every unit carries a label from the declared vocabulary', () => {
  const vocab = new Set(standoff.vocabulary.map(v => v.label));
  const bad = standoff.units.filter(u => !vocab.has(u.label));
  assert.equal(bad.length, 0,
    `outside the vocabulary: ${bad.map(u => `${u.uid}=${u.label || '(none)'}`).join(', ')}`);
});

// THE SECOND AXIS. `vocabulary` says what a unit is, `verdicts` says what was
// decided about it, and a unit carries one of each. The pair is held here
// because the failure is silent either way: a verdict off the declared list
// paints as the fallback grey and reads as KEEP, and a unit with no verdict at
// all vanishes from the lens rather than reporting itself.
test('every unit carries a verdict from the declared list', () => {
  const declared = new Set(standoff.verdicts.map(v => v.verdict));
  assert.ok(declared.size, 'the annotation declares no verdicts');
  const bad = standoff.units.filter(u => !declared.has(u.verdict));
  assert.equal(bad.length, 0,
    `outside the declared verdicts: ${bad.map(u => `${u.uid}=${u.verdict ?? '(none)'}`).join(', ')}`);
});

// labels.tsv SEEDS the standoff and owns neither axis, which is only true while
// the two agree. check.py still reads the TSV, so a page edit that never made it
// back would leave the contract check judging the document against verdicts
// nobody holds any more.
test('the stored run agrees with the labels.tsv it was seeded from', () => {
  const [head, ...rows] = readFileSync(`${RUN}/labels.tsv`, 'utf8').trim().split('\n');
  assert.equal(head, 'uid\tlabel\tverdict');
  const seed = new Map(rows.map(r => r.split('\t')).map(([uid, label, verdict]) => [uid, { label, verdict }]));
  const drift = standoff.units
    .filter(u => seed.has(u.uid))
    .filter(u => seed.get(u.uid).label !== u.label || seed.get(u.uid).verdict !== u.verdict)
    .map(u => `${u.uid}: standoff ${u.label}/${u.verdict}, tsv ${seed.get(u.uid).label}/${seed.get(u.uid).verdict}`);
  assert.deepEqual(drift, []);
});

test('the page shows the committed standoff, not a re-derivation', () => {
  const page = readFileSync('pages/audit-render.html', 'utf8');
  const m = /window\.__audit = (\{[\s\S]*?\});\n\/\* AUDIT:END/.exec(page);
  assert.ok(m, 'no audit payload found between the AUDIT markers');
  assert.deepEqual(JSON.parse(m[1]).standoff, standoff,
    'the embedded standoff differs from the committed file; rebuild:\n' +
    `  python3 tools/build/audit-payload.py payload ${standoff.target.path} ${RUN} --inject pages/audit-render.html`);
});

// The standoff has two writers now: tools/build/audit-payload.py rebuilds it
// from the run's inputs, and pages/audit-render.html saves an edited one back
// through gh-store. They have to agree on bytes, or each save reformats the
// other's file and every real change arrives buried in a whole-file diff.
test('the page and the builder serialize to the same bytes', () => {
  const raw = readFileSync(`${RUN}/standoff.json`, 'utf8');
  assert.equal(JSON.stringify(JSON.parse(raw), null, 1) + '\n', raw,
    "JSON.stringify(so, null, 1) is what the page writes; python json.dumps(indent=1) " +
    'is what the builder writes. They have parted.');
});

// One lookup serves both axes on the page (RGB = { ...HUE, ...VHUE }), so a name
// appearing in both would silently take the label's colour under the verdict
// lens. A shared VALUE is the subtler one: the lenses never paint at once, but
// the Standoff table puts a label chip beside a verdict chip, and there one
// swatch would mean two things. Nothing about the two lists forces either apart.
test('the label and verdict palettes share no name and no colour', () => {
  const page = readFileSync('pages/audit-render.html', 'utf8');
  const entries = (name) => [...(new RegExp(`const ${name} = \\{([^}]*)\\}`).exec(page)?.[1] ?? '')
    .matchAll(/(\w+): '([\d,]+)'/g)].map(m => [m[1], m[2]]);
  const hue = entries('HUE'), vhue = entries('VHUE');
  assert.ok(hue.length && vhue.length, 'could not read both palettes off the page');
  const keys = (e) => e.map(x => x[0]), vals = (e) => e.map(x => x[1]);
  assert.deepEqual(keys(hue).filter(k => keys(vhue).includes(k)), []);
  assert.deepEqual(vals(hue).filter(v => vals(vhue).includes(v)), []);
  const hueKeys = keys(hue), vhueKeys = keys(vhue);
  // And every declared key on either axis has a colour, or it paints as the
  // fallback grey and reads as a category the page does not know about.
  const named = new Set([...hueKeys, ...vhueKeys]);
  assert.deepEqual(
    [...standoff.vocabulary.map(v => v.label), ...standoff.verdicts.map(v => v.verdict)]
      .filter(k => !named.has(k)), []);
});

test('the annotation carries its own address, not only its target', () => {
  // `target` is the document. Without `self` the page can render the standoff
  // and cannot write it back, because nothing on the page names the run.
  assert.ok(standoff.self?.path?.endsWith('/standoff.json'),
    'standoff.self.path must name the annotation itself; rebuild with audit-payload.py');
  assert.match(standoff.self.repo ?? '', /^[^/]+\/[^/]+$/);
});

// A REBUILD IS A RESET, and the guard that says so reads the standoff for work
// the two inputs cannot reconstruct. It read only `from` on units, so a standoff
// carrying insertions and no split or merge history rebuilt clean and lost every
// one of them without asking: an insertion is anchored to a boundary, not
// carried on a unit, so it leaves no `from` anywhere. Both tells are held here
// because the silent half is the one that was missing.
test('rebuilding refuses over work units.jsonl and labels.tsv cannot hold', () => {
  const dir = mkdtempSync(join(tmpdir(), 'payload-'));
  const doc = join(dir, 'doc.md');
  writeFileSync(doc, 'One rule here.\n\nA second one.\n');
  writeFileSync(join(dir, 'units.jsonl'),
    execFileSync('python3', ['skills/state-the-rule/segment.py', doc, '1', '99'],
                 { encoding: 'utf8' }));
  const uids = readFileSync(join(dir, 'units.jsonl'), 'utf8').trim().split('\n')
    .map(l => JSON.parse(l).uid);
  writeFileSync(join(dir, 'labels.tsv'),
    ['uid\tlabel\tverdict', ...uids.map(u => `${u}\tWHAT\tKEEP`)].join('\n') + '\n');

  const build = () => {
    try { execFileSync('python3', ['tools/build/audit-payload.py', 'standoff', doc, dir],
                       { encoding: 'utf8', stdio: 'pipe' }); return ''; }
    catch (e) { return (e.stderr || '') + (e.stdout || ''); }
  };
  assert.equal(build(), '', 'the first build has nothing to protect');

  const sf = join(dir, 'standoff.json');
  const so = JSON.parse(readFileSync(sf, 'utf8'));
  so.insertions = [{ after: uids[0], text: 'A sentence the document lacks.' }];
  assert.deepEqual(so.units.filter(u => 'from' in u), [],
    'the case that matters: insertions with no patched unit anywhere');
  writeFileSync(sf, JSON.stringify(so, null, 1) + '\n');
  assert.match(build(), /1 insertion\(s\)/, 'rebuilt over the insertions in silence');

  delete so.insertions;
  so.units[0].from = 'split:x';
  writeFileSync(sf, JSON.stringify(so, null, 1) + '\n');
  assert.match(build(), /1 patched unit/, 'the tell the guard already read');

  rmSync(dir, { recursive: true, force: true });
});
