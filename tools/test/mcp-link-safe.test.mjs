// scripts/mcp-link-safe.py — the write-path defanging checker, held to the
// measurements it encodes.
//
// The GitHub MCP write path wraps a URL of 150 characters or more in backticks,
// storing the link as dead literal text; 149 or fewer survives and the label
// never counts. The slash-joined pair is measured as one fused span running
// from the first URL's first character through the second URL's last, joining
// punctuation and the second label included.
//
// Every row below is a probe that was actually written to GitHub and read back
// (issue #498, PR #499, 2026-08-25), so this file is the rule in executable
// form: if someone "fixes" the threshold or drops the pair handling, the
// disagreement is with a measurement rather than with an opinion. Evidence:
// docs/environment/capabilities.md, "What gets counted".

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const SCRIPT = path.join(repoRoot, 'scripts', 'mcp-link-safe.py');

// Two real resolvable bases, padded with a ?x= query to an exact length.
const LONG = 'https://github.com/mehrlander/web-tools/blob/main/docs/SURFACING.md?x=';
const SHORT = 'https://github.com/mehrlander/web-tools?x=';
const url = (base, n) => base + '0123456789'.repeat(40).slice(0, n - base.length);
const label = n => (n === 1 ? 'r' : '0123456789'.repeat(40).slice(0, n));

function scan(markdown) {
  const out = execFileSync('python3', [SCRIPT, '--json', '-'], {
    input: markdown, encoding: 'utf8',
  });
  return JSON.parse(out);
}

const wraps = md => scan(md).length > 0;

test('the label does not count; a 149-character URL survives any label', () => {
  // Rounds 6a-6d: URL held fixed, label varied across the boundary. 6c is a
  // whole [label](url) construct of 273 characters that is measurably fine.
  assert.equal(wraps(`[${label(1)}](${url(LONG, 149)})`), false);
  assert.equal(wraps(`[${label(60)}](${url(LONG, 149)})`), false);
  assert.equal(wraps(`[${label(120)}](${url(LONG, 149)})`), false);
  assert.equal(wraps(`[${label(60)}](${url(LONG, 100)})`), false);
});

test('a 150-character URL wraps under even a one-character label', () => {
  // Rounds 6e-6f: the other side of the same control.
  assert.equal(wraps(`[${label(1)}](${url(LONG, 150)})`), true);
  assert.equal(wraps(`[${label(60)}](${url(LONG, 150)})`), true);
});

test('the boundary is inclusive at 150, bracketed one character at a time', () => {
  // Round 7, stepped with nothing else varying.
  for (const n of [146, 147, 148, 149]) {
    assert.equal(wraps(`[r](${url(LONG, n)})`), false, `${n} should survive`);
  }
  for (const n of [150, 151, 152]) {
    assert.equal(wraps(`[r](${url(LONG, n)})`), true, `${n} should wrap`);
  }
});

test('a slash-joined pair is measured as one fused span', () => {
  // Round 9a/9b: the one-character bracket on the span itself. 70 + 9 + 70 is
  // 149 and lives; one more character kills the pair, though neither URL is
  // remotely near the threshold on its own.
  const [a] = scan(`[main](${url(SHORT, 70)})/[diff](${url(SHORT, 71)})`);
  assert.equal(a.kind, 'pair');
  assert.equal(a.length, 150);
  assert.equal(wraps(`[main](${url(SHORT, 70)})/[diff](${url(SHORT, 70)})`), false);
  assert.equal(wraps(`[main](${url(SHORT, 45)})/[diff](${url(SHORT, 45)})`), false);
});

test('the pair dies at URL lengths less than half the threshold', () => {
  // Round 8d, the row that made the pair look like an exception to the rule:
  // 72 and 73 characters, and a span of 154.
  const [f] = scan(`[main](${url(LONG, 72)})/[diff](${url(LONG, 73)})`);
  assert.equal(f.kind, 'pair');
  assert.equal(f.length, 154);
});

test('the second label falls inside the fused span, the first does not', () => {
  // Round 9e: same two 70-character URLs as the surviving 9a, a longer second
  // label, and the span goes to 165. The first label sits before the token
  // starts; the second sits inside it.
  const [f] = scan(`[main](${url(SHORT, 70)})/[diffdiffdiffdiffdiff](${url(SHORT, 70)})`);
  assert.equal(f.length, 165);
});

test('comma-joining ends the run and puts each URL back on its own count', () => {
  // Rounds 8b and 9d: the controls at identical URLs. This is the substitution
  // SURFACING.md prescribes, and the reason it works.
  assert.equal(wraps(`[main](${url(LONG, 80)}), [diff](${url(LONG, 81)})`), false);
  assert.equal(wraps(`[main](${url(SHORT, 70)}), [diff](${url(SHORT, 71)})`), false);
  assert.equal(wraps(`[main](${url(LONG, 80)})`), false); // round 8e, lone link
});

test('a body read back with its backticks reports as already defanged', () => {
  // What the sanitizer's own output looks like coming back, so an audit can
  // tell a link already dead from one merely at risk.
  const [f] = scan('- [r](`https://example.com/already/wrapped`)');
  assert.equal(f.kind, 'defanged');
});

test('entity expansion in a readback is not mistaken for length', () => {
  // PR #400's URL is 148 characters and demonstrably intact, but reads back as
  // 152 because the MCP expands & into &amp;. Unescaping first is what keeps a
  // readback audit honest; without the flag the raw text really is over.
  const withEntity = url(LONG, 144) + '&amp;tab=x'; // 154 raw, 150 - 4 = 150 real
  const md = `[r](${withEntity})`;
  assert.equal(wraps(md), true, 'raw text is genuinely over the line');
  const out = execFileSync('python3', [SCRIPT, '--json', '--unescape-entities', '-'],
    { input: `[r](${url(LONG, 141)}&amp;tab=x)`, encoding: 'utf8' });
  assert.equal(JSON.parse(out).length, 0, 'unescaped, the same URL is 147 and fine');
});

test('--check exits non-zero only when something would be defanged', () => {
  const run = md => {
    try {
      execFileSync('python3', [SCRIPT, '--check', '-'], { input: md, encoding: 'utf8' });
      return 0;
    } catch (e) { return e.status; }
  };
  assert.equal(run(`[r](${url(LONG, 149)})`), 0);
  assert.equal(run(`[r](${url(LONG, 150)})`), 1);
});

// The instruction surfaces that feed the write path. The caption skill states
// the slash-joined pair as the chat row shape, which is correct and stays; what
// must not come back is the guide-body sync telling a session to write that list
// into a PR body. It did until 2026-08-25, contradicting SURFACING.md's own
// "The body does not enumerate files" since 2026-08-08.
test('the guide-body sync does not prescribe a file list in the body', () => {
  const skill = readFileSync(
    path.join(repoRoot, '.claude', 'skills', 'caption', 'SKILL.md'), 'utf8');
  const section = skill.slice(skill.indexOf('## Syncing a guide PR body'));
  assert.ok(section.length > 0, 'the guide-sync section still exists');
  assert.ok(!/Changed list/.test(section),
    'guide-sync must not tell a session to regenerate a Changed list into the body');
  assert.ok(/does not enumerate files/.test(section),
    'guide-sync should say the body carries judgment, not a file list');
  assert.ok(/mcp-link-safe\.py/.test(section),
    'guide-sync should name the checker for anything written to a body');
});

test('the branch-review gz link is not routed into a PR body or comment', () => {
  // The payload runs to hundreds of characters and the fragment is the
  // surface's only carrier, so a defanged one is lost content, not a dead link.
  const skill = readFileSync(
    path.join(repoRoot, '.claude', 'skills', 'caption', 'SKILL.md'), 'utf8');
  assert.ok(!/record the link in the PR \(body or a\s+comment\)/.test(skill),
    'the gz link must not be recorded in a PR body or comment');
  assert.ok(/never for a PR body or a comment/.test(skill),
    'the gz link should be marked chat-only');
  assert.ok(/&src=/.test(skill), 'the durable alternative should be named');
});
