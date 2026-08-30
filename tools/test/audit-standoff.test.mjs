// The standoff annotation is only worth anything if it still describes the file
// it names. Two ways that breaks silently, and this fails on both: the target
// document is edited, so the spans point at moved text; or the page's embedded
// copy drifts from the committed file, so the Standoff view shows something the
// repo does not hold.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

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

test('the page shows the committed standoff, not a re-derivation', () => {
  const page = readFileSync('pages/audit-render.html', 'utf8');
  const m = /window\.__audit = (\{[\s\S]*?\});\n\/\* AUDIT:END/.exec(page);
  assert.ok(m, 'no audit payload found between the AUDIT markers');
  assert.deepEqual(JSON.parse(m[1]).standoff, standoff,
    'the embedded standoff differs from the committed file; rebuild:\n' +
    `  python3 tools/build/audit-payload.py payload ${standoff.target.path} ${RUN} --inject pages/audit-render.html`);
});
