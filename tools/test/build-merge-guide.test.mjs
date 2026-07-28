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
