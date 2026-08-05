// scripts/build-merge-guide.py — the guide-region extraction that turns a
// merged PR body into a merge-guide entry. Pinned here because the region
// delimiters are now a set rather than one pair: new bodies carry the markdown
// link-label form, older ones carry HTML comments, and dropping recognition of
// either would silently orphan a slice of shipped history.
//
// extract() is a pure function with no import-time side effects and no network,
// so this drives it through python3 and reads back JSON.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Call extract(body) in the script and return {lead, region}.
function extract(body) {
  const src = [
    'import json, sys, importlib.util',
    'spec = importlib.util.spec_from_file_location("bmg", "scripts/build-merge-guide.py")',
    'm = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(m)',
    'lead, region = m.extract(json.load(sys.stdin))',
    'json.dump({"lead": lead, "region": region}, sys.stdout)',
  ].join('\n');
  const out = execFileSync('python3', ['-c', src], { input: JSON.stringify(body), encoding: 'utf8' });
  return JSON.parse(out);
}

const REGION = '⭐ **Look:** [thing](https://example.invalid/x)\n\n**Notes:** careful here';
const LEAD = 'One sentence saying what shipped.';

test('the link-label delimiters bound the region', () => {
  const { lead, region } = extract(
    `${LEAD}\n\n[//]: # (guide)\n\n${REGION}\n\n[//]: # (/guide)\n\n🤖 Generated with Claude Code`);
  assert.equal(lead, LEAD);
  assert.equal(region, REGION);
});

test('the older HTML-comment delimiters still bound the region', () => {
  const { lead, region } = extract(
    `${LEAD}\n\n<!-- guide -->\n${REGION}\n<!-- /guide -->\n\n🤖 Generated with Claude Code`);
  assert.equal(lead, LEAD, 'bodies predating the change must not orphan');
  assert.equal(region, REGION);
});

test('a body with neither pair falls back to the structural span', () => {
  const { lead, region } = extract(
    `${LEAD}\n\n${REGION}\n\n🤖 Generated with Claude Code`);
  assert.equal(lead, LEAD);
  assert.match(region, /^⭐ \*\*Look:\*\*/);
  assert.doesNotMatch(region, /Generated with/, 'the session footer is cut');
});

test('an unmatched opener does not swallow the body', () => {
  // Half a fence is not a region; fall through to the structural path rather
  // than returning everything after the opener.
  const { region } = extract(`${LEAD}\n\n[//]: # (guide)\n\n${REGION}`);
  assert.match(region, /^⭐ \*\*Look:\*\*/);
});

test('a terse body with no curated content yields nothing', () => {
  const { lead, region } = extract('just a sentence, no structure at all');
  assert.equal(lead, null);
  assert.equal(region, null);
});

// ── The index projection ────────────────────────────────────────────────────
// web-tools' own mode. The point of an index over copied entries is that it
// covers every merged PR rather than only the ones whose bodies followed the
// convention, so the terse-body case is the one that matters most here.

function renderIndex(prs, tail = '') {
  const src = [
    'import json, sys, importlib.util',
    'spec = importlib.util.spec_from_file_location("bmg", "scripts/build-merge-guide.py")',
    'm = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(m)',
    'prs, tail = json.load(sys.stdin)',
    'sys.stdout.write(m.render_index(prs, tail))',
  ].join('\n');
  return execFileSync('python3', ['-c', src], { input: JSON.stringify([prs, tail]), encoding: 'utf8' });
}

const PR = (number, merged_at, title, body) => ({ number, merged_at, title, body });

test('every merged PR gets a line, including one with a terse body', () => {
  const md = renderIndex([
    PR(2, '2026-08-05T00:00:00Z', 'Second thing', '⭐ **Look:** [x](y)\n\n**Notes:** n'),
    PR(1, '2026-08-04T00:00:00Z', 'First thing', 'no structure at all'),
  ]);
  assert.match(md, /- 2026-08-05 \[#2 Second thing\]\(https:\/\/github\.com\/[^)]+\/pull\/2\)/);
  assert.match(md, /- 2026-08-04 \[#1 First thing\]\(https:\/\/github\.com\/[^)]+\/pull\/1\)/,
    'a body the full-entry mode would drop still gets an index line');
});

test('rows run newest-first and group under their merge month', () => {
  const md = renderIndex([
    PR(1, '2026-07-30T00:00:00Z', 'July one'),
    PR(3, '2026-08-02T00:00:00Z', 'August two'),
    PR(2, '2026-08-01T00:00:00Z', 'August one'),
  ]);
  const order = [...md.matchAll(/^(## \w+ \d{4}|- \d{4}-\d{2}-\d{2} \[#\d+)/gm)].map(m => m[1]);
  assert.deepEqual(order, [
    '## August 2026', '- 2026-08-02 [#3', '- 2026-08-01 [#2',
    '## July 2026', '- 2026-07-30 [#1',
  ]);
});

test('titles are unescaped, since the API returns them HTML-escaped', () => {
  const md = renderIndex([PR(1, '2026-08-05T00:00:00Z', 'the fab&#39;s render tab')]);
  assert.match(md, /the fab's render tab/);
  assert.doesNotMatch(md, /&#39;/);
});

test('the hand-written PR-less tail is appended verbatim', () => {
  const tail = '## Merges without a pull request\n\n- 2026-05-29 **A direct merge**, kept by hand.';
  const md = renderIndex([PR(1, '2026-08-05T00:00:00Z', 'A thing')], tail);
  assert.ok(md.endsWith(tail + '\n'), 'the tail survives regeneration unchanged');
});

test('an index line carries no link that a later rename can break', () => {
  // The whole reason this mode exists: entries copied per-file blob URLs at
  // main, and a rename left them pointing at nothing. A PR URL never moves.
  const md = renderIndex([PR(7, '2026-08-05T00:00:00Z', 'Rename everything')]);
  const links = [...md.matchAll(/\]\((https:\/\/github\.com\/[^)]+)\)/g)].map(m => m[1]);
  assert.ok(links.length > 0);
  for (const url of links) assert.match(url, /\/pull\/\d+$/);
});
