// Getting the conventions into a session, which is a delivery problem and was
// treated as an authoring one for nineteen days.
//
// A SessionStart hook's stdout is capped. Past the cap the harness writes the
// payload to a file and passes along a 2,000-byte preview, and from inside the
// script that is indistinguishable from success: it exits 0 and the session
// reports the hook ran. Measured 2026-08-26, home's loader had been emitting
// 36,135 bytes and delivering 1,843 since 2026-08-07, with SURFACING.md
// arriving not at all. The record is mehrlander/home
// chron/2026/08/2026-08-26-the-injection-delivers-five-percent.md.
//
// Three scripts share the fix and each is pinned here. The injector fits the
// channel and says so when it cannot. The dispatcher measures the total and
// warns FIRST, inside the bytes that survive. The PR hook carries the half the
// injector left out, at the moment that half becomes true.
//
// What none of these can assert is the cap itself, which is not documented
// anywhere readable. The budgets are set under a measured BOUND (29.4 KB, the
// smallest persisted output in the session archive), so what is pinned is that
// each script respects its own declared budget, not that the budget is right.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
const { readFileSync } = fs;
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'skills', 'hooks');
const run = (script, env = {}, input = '') =>
  execFileSync('bash', [join(HOOKS, script)], {
    env: { ...process.env, ...env }, input, encoding: 'utf8', timeout: 30000,
  });

// Read out of the script rather than restated here. A test that carries its own
// copy of a budget passes while the script uses a different one, which is the
// failure this whole file exists to prevent, one level up.
const BUDGET = Number(
  /BUDGET=\$\{WEB_TOOLS_INJECT_BUDGET:-(\d+)\}/
    .exec(readFileSync(join(HOOKS, 'inject-conventions.sh'), 'utf8'))?.[1]
);

test('the injected payload fits the channel', () => {
  assert.ok(Number.isFinite(BUDGET) && BUDGET > 0,
    'the budget parses out of the script, so this cannot pass against a stale copy');
  const out = run('inject-conventions.sh');
  assert.ok(out.length < BUDGET,
    `the injector emits ${out.length} bytes, over its own ${BUDGET}-byte budget. ` +
    'The harness truncates a payload this size to a 2,000-byte preview without saying so.');
  assert.doesNotMatch(out, /OUTPUT TRUNCATED|PARTIAL LOAD/, 'and it is the whole payload');
});

test('the budget is measured in bytes, so the locale cannot change the rung', () => {
  // `${#BODY}` counts CHARACTERS in a UTF-8 locale and BYTES in C. The channel
  // is bytes, these documents carry ⭐ 🥏 📦 and friends, and the gap between the
  // two units is about 200 bytes: enough to choose a rung that then overflows.
  // Measured 2026-08-27 from one commit, before the fix: the sandbox (C) chose
  // the primitives rung at 26,745 bytes and the GitHub runner (C.UTF-8) chose
  // the wider one at 27,639 and blew the budget. CI caught it and no local run
  // could have, which is exactly why the locale is pinned here rather than
  // inherited.
  const under = loc => run('inject-conventions.sh', { LC_ALL: loc });
  const c = under('C'), utf8 = under('C.UTF-8');
  assert.equal(c, utf8, 'the same commit must deliver the same payload in either locale');
  for (const [loc, out] of [['C', c], ['C.UTF-8', utf8]]) {
    assert.ok(Buffer.byteLength(out, 'utf8') < BUDGET,
      `under ${loc} the injector emits ${Buffer.byteLength(out, 'utf8')} bytes, over ${BUDGET}`);
  }
});

test('the receipts are inside the budget, not exempt from it', () => {
  // A receipt is what reports a dropped payload, so it must be the last thing
  // dropped. That argues for reserving room, never for exempting it: an exempt
  // receipt is just an overrun nobody counted, which is how this first shipped.
  const out = run('inject-conventions.sh');
  const receipts = out.split('\n').filter(l => l.startsWith('[startup-context] '));
  assert.equal(receipts.length, 2, 'one per document the injector supplies');
  for (const line of receipts) {
    const e = JSON.parse(line.slice('[startup-context] '.length));
    assert.ok(e.path && e.sha256 && e.basis === 'receipt', 'each receipt is complete');
    assert.ok(e.delivered, 'and names the rung that delivered it');
  }
  // The reservation is real: the whole payload, receipts included, fits.
  assert.ok(Buffer.byteLength(out, 'utf8') < BUDGET);
});

test('it carries every primitive and none of the course', () => {
  const out = run('inject-conventions.sh');
  const doc = readFileSync(join(HOOKS, '..', 'web-tools', 'SURFACING.md'), 'utf8');
  const section = doc.split('## Surfacing primitives')[1].split('## The surfacing course')[0];
  const rules = (section.match(/^\* \*\*/gm) || []).length;
  assert.equal((out.match(/^\* \*\*/gm) || []).length, rules,
    'every primitive in the document reaches the session');
  for (const heading of ['### The guide PR', '### Wrap-up', '## Post-merge handoff']) {
    assert.ok(!out.includes('\n' + heading), `the course stays out: ${heading}`);
  }
  assert.match(out, /NOT INCLUDED/, 'and the payload names what it withheld');
});

// The middle rung, added 2026-08-27 the first time the budget fired for real.
// Main added a closing state, the primitives section grew 158 words, and the
// payload went 127 bytes over: under a two-rung design that cost every
// primitive. What a session can most afford to lose goes first, and the rules
// themselves are not it.
// The rung window moves whenever the injected prose changes size, since it is
// the body's byte count that decides which rung a budget selects. Two shifts so
// far: the receipts reserved inside the budget on 2026-08-27 (514 bytes off the
// body), then two surfacing primitives grew on the same day, then the
// state-the-rule pass over Surfacing caption and Closing state on 2026-08-29 took
// 1,341 bytes back out and walked the window down by 1,342. Measured after all
// three, this rung is chosen for a budget in [25534, 26429); pick the midpoint so
// a small future edit does not walk the test off either edge silently.
test('over budget it drops the front matter before it drops a single rule', () => {
  const out = run('inject-conventions.sh', { WEB_TOOLS_INJECT_BUDGET: '25981' });
  assert.match(out, /ALSO NOT INCLUDED, to fit the channel/,
    'the second rung says what it withheld, as the first one does');
  assert.doesNotMatch(out, /PARTIAL LOAD/, 'and it is not the last rung');
  const doc = readFileSync(join(HOOKS, '..', 'web-tools', 'SURFACING.md'), 'utf8');
  const section = doc.split('## Surfacing primitives')[1].split('## The surfacing course')[0];
  assert.equal((out.match(/^\* \*\*/gm) || []).length,
    (section.match(/^\* \*\*/gm) || []).length,
    'every rule still arrives; only the pointers around them are gone');
  assert.ok(!out.includes('\n## One render path'), 'the front matter is what went');
});

// The last rung, and the half that matters more than the happy path. A budget nobody can exceed is
// untested; what has to hold is what happens when someone does.
test('past every rung it says so and degrades to a known half, never to a silent cut', () => {
  const out = run('inject-conventions.sh', { WEB_TOOLS_INJECT_BUDGET: '4000' });
  assert.match(out, /^===== Portable conventions: PARTIAL LOAD =====/,
    'the banner leads, so it survives a 2,000-byte preview');
  assert.match(out, /Run \/web-tools/, 'and it names the recovery');
  assert.match(out, /# Working conventions \(portable\)/, 'CONVENTIONS.md still arrives');
  assert.ok(!/^\* \*\*Show pixels/m.test(out), 'the primitives are the half dropped');
});

test('the dispatcher warns first when the whole session-start payload is too large', () => {
  const ws = tmpWorkspace('big');
  const out = execFileSync('bash', [join(HOOKS, 'session-dispatch.sh')], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: ws, WEB_TOOLS_OUTPUT_BUDGET: '500' },
    input: '{"hook_event_name":"SessionStart"}', encoding: 'utf8', timeout: 30000,
  });
  assert.match(out, /^===== SESSION START: OUTPUT TRUNCATED =====/,
    'the warning is the first thing printed, or it is inside the truncated part');
  assert.match(out, /Largest contributor: .*noisy\.sh at \d+ bytes/,
    'and it names which script to shrink, since "too large" alone sends a reader looking');
  assert.match(out, /padpadpad/, 'the output still follows: this warns, it never trims');
});

test('a healthy session start stays quiet', () => {
  const ws = tmpWorkspace('small');
  const out = execFileSync('bash', [join(HOOKS, 'session-dispatch.sh')], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: ws },
    input: '{"hook_event_name":"SessionStart"}', encoding: 'utf8', timeout: 30000,
  });
  assert.doesNotMatch(out, /OUTPUT TRUNCATED/, 'no warning when there is nothing to warn about');
});

test('the PR hook carries the course the injector left out', () => {
  const payload = JSON.stringify({
    tool_name: 'mcp__github__create_pull_request',
    tool_response: { url: 'https://github.com/mehrlander/web-tools/pull/999' },
  });
  const ctx = JSON.parse(run('pr-subscribe-hint.sh', {}, payload))
    .hookSpecificOutput.additionalContext;
  assert.match(ctx, /subscribe_pr_activity with owner=mehrlander, repo=web-tools, pullNumber=999/,
    'the subscribe hint is still the half that must not be lost');
  for (const heading of ['### The guide PR', '### Wrap-up', '## Post-merge handoff']) {
    assert.ok(ctx.includes(heading), `the course arrives here instead: ${heading}`);
  }
  assert.ok(!ctx.includes('## Surfacing primitives'),
    'and not the primitives, which session start already delivered');
});

// A workspace nested one level inside the temp dir, because the dispatcher also
// scans the project root's siblings; a bare mkdtemp would make every other
// directory in /tmp one, and the test would depend on the machine.
function tmpWorkspace(size) {
  const box = fs.mkdtempSync(join(os.tmpdir(), 'delivery-'));
  const ws = join(box, 'ws');
  fs.mkdirSync(join(ws, '.claude', 'hooks'), { recursive: true });
  const body = size === 'big'
    ? '#!/usr/bin/env bash\nfor i in $(seq 1 200); do echo padpadpadpadpadpadpadpadpad; done\n'
    : '#!/usr/bin/env bash\necho small\n';
  fs.writeFileSync(join(ws, '.claude', 'hooks', 'session-noisy.sh'), body, { mode: 0o755 });
  return ws;
}
