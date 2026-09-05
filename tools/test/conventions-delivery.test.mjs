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
//
// The budget stopped being a literal on 2026-08-30: it is derived from the
// ceiling the dispatcher owns, less a reserve for the sibling scripts sharing
// that ceiling. So the derivation is what gets parsed, and `budgetFor` below is
// this file's only statement of it.
const INJECTOR = readFileSync(join(HOOKS, 'inject-conventions.sh'), 'utf8');
const constant = name =>
  Number(new RegExp(`^${name}=\\$\\{[A-Z_]+:-(\\d+)\\}`, 'm').exec(INJECTOR)?.[1]);
const CEILING = constant('CEILING');
const BASE_RESERVE = constant('BASE_RESERVE');
const PER_SIBLING = constant('PER_SIBLING');
const budgetFor = siblings => CEILING - BASE_RESERVE - siblings * PER_SIBLING;
// Zero siblings is the script run on its own, which is how every `run()` below
// invokes it.
const BUDGET = budgetFor(0);

// ── The rung window, derived rather than pinned ────────────────────────────
//
// The middle rung needs a budget that selects it, and that budget used to be a
// hand-picked constant: the midpoint of a window measured by hand, under a
// comment listing the three times the window had moved and an instruction to
// re-pick it when it moved again. Nothing re-derived it. On 2026-08-31 a
// 66-byte edit to the primitives walked the body up the window until the stale
// midpoint selected the last rung instead of the middle one, and the failure
// read as a budget breach when the real delivery was fine and the constant was
// simply out of date.
//
// So the window is bisected here instead. Rung is a non-increasing step
// function of the budget, so each edge is one bisection: about 30 invocations
// at ~36ms, which is cheaper than one wrong diagnosis.
const rungOf = out => /PARTIAL LOAD/.test(out) ? 3
  : /ALSO NOT INCLUDED, to fit the channel/.test(out) ? 2 : 1;
const rungCache = new Map();
const rungAt = budget => {
  if (!rungCache.has(budget)) rungCache.set(budget, rungOf(
    run('inject-conventions.sh', { WEB_TOOLS_INJECT_BUDGET: String(budget) })));
  return rungCache.get(budget);
};
// The smallest budget whose rung is n or wider.
const firstAtMost = n => {
  let lo = 0, hi = CEILING;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rungAt(mid) <= n) hi = mid; else lo = mid + 1;
  }
  return lo;
};
const RUNG2_LO = firstAtMost(2);
const RUNG2_HI = firstAtMost(1);
const MID_BUDGET = String((RUNG2_LO + RUNG2_HI) >> 1);

test('the injected payload fits the channel', () => {
  assert.ok([CEILING, BASE_RESERVE, PER_SIBLING].every(Number.isFinite) && BUDGET > 0,
    'the derivation parses out of the script, so this cannot pass against a stale copy');
  const out = run('inject-conventions.sh');
  assert.ok(out.length < BUDGET,
    `the injector emits ${out.length} bytes, over its own ${BUDGET}-byte budget. ` +
    'The harness truncates a payload this size to a 2,000-byte preview without saying so.');
  // The banner forms, not the words: the recovery block quotes both strings so a
  // reader can recognise them, which is exactly the text this used to match on.
  assert.doesNotMatch(out, /^=+ SESSION START: OUTPUT TRUNCATED/m, 'and it is the whole payload');
  assert.doesNotMatch(out, /^=+ Portable conventions: PARTIAL LOAD/m, 'at its widest rung');
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
  // The course is excluded by its OWN BOUNDARY, not by three sampled headings.
  // Sampling was the older shape and it coupled a delivery claim to the course's
  // internal structure: paring that section on 2026-09-05 dropped two of the
  // three subheadings and broke a test that had no opinion about them.
  assert.ok(!out.includes('\n## The surfacing course'), 'the course stays out');
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
test('the middle rung spans enough budget to survive an ordinary edit', () => {
  // The window's width is essentially the front matter, since that is what this
  // rung drops. Narrowing toward zero means the middle rung has stopped being a
  // rung and the ladder goes straight from everything to CONVENTIONS.md alone,
  // which is the cliff it was added to prevent. Measured 2026-08-31 at 895,
  // and about 650 after the per-repo settings moved to CONVENTIONS.md on
  // 2026-09-05, which is why the floor sits well under the front matter.
  assert.ok(RUNG2_HI > RUNG2_LO, 'the middle rung is reachable at some budget');
  assert.ok(RUNG2_HI - RUNG2_LO >= 300,
    `the middle rung spans only ${RUNG2_HI - RUNG2_LO} bytes, collapsing toward the cliff`);
});

test('over budget it drops the front matter before it drops a single rule', () => {
  const out = run('inject-conventions.sh', { WEB_TOOLS_INJECT_BUDGET: MID_BUDGET });
  assert.match(out, /ALSO NOT INCLUDED, to fit the channel/,
    'the second rung says what it withheld, as the first one does');
  assert.doesNotMatch(out, /PARTIAL LOAD/, 'and it is not the last rung');
  const doc = readFileSync(join(HOOKS, '..', 'web-tools', 'SURFACING.md'), 'utf8');
  const section = doc.split('## Surfacing primitives')[1].split('## The surfacing course')[0];
  assert.equal((out.match(/^\* \*\*/gm) || []).length,
    (section.match(/^\* \*\*/gm) || []).length,
    'every rule still arrives; only the pointers around them are gone');
  // By the opening's own words, not a heading: the heading this held until
  // 2026-09-05 had been renamed by then, so the line passed on any output.
  assert.ok(!out.includes("Making a session's work visible"), 'the front matter is what went');
});

// The last rung, and the half that matters more than the happy path. A budget nobody can exceed is
// untested; what has to hold is what happens when someone does.
test('past every rung it says so and degrades to a known half, never to a silent cut', () => {
  const out = run('inject-conventions.sh', { WEB_TOOLS_INJECT_BUDGET: '4000' });
  assert.match(out, /^=+ Portable conventions: PARTIAL LOAD =+$/m,
    'it says which rung it landed on');
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
  // VERBATIM AND WHOLE, which is the real claim and is what three sampled
  // headings could only approximate: a payload carrying the course's opening
  // line and nothing after it passed the old form. The hook takes the document
  // from the course heading to EOF, so that is exactly what is compared.
  const doc = readFileSync(join(HOOKS, '..', 'web-tools', 'SURFACING.md'), 'utf8');
  const course = ('## The surfacing course' + doc.split('## The surfacing course')[1]).trim();
  assert.ok(ctx.includes(course),
    'the whole course arrives, not a sample of its headings');
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

// ── The reserve, which is what the flat number could not do ────────────────
// The budget was a literal 27,000 until 2026-08-30: one guess at the ceiling
// minus its siblings, frozen, and blind to how many siblings there were.
// Measured that day across three checkouts, the guess reserved 1,000 bytes
// while the siblings emitted 1,223, and rung 1 fitted only because the ceiling
// is itself conservative against the measured bound. These pin the derivation
// that replaced it, not the numbers it currently produces.

test('the budget tightens as more session scripts share the ceiling', () => {
  // The banking. Every byte a sibling might spend is a byte this script must
  // not, so the room left has to fall as the session grows; a budget that
  // ignores its neighbours spends their headroom and nothing says so.
  assert.ok(budgetFor(20) < budgetFor(6) && budgetFor(6) < budgetFor(0),
    'more siblings, less room');
  const rung = n => run('inject-conventions.sh',
    { WEB_TOOLS_OUTPUT_BUDGET: String(CEILING), WEB_TOOLS_SESSION_SIBLINGS: String(n) });
  assert.doesNotMatch(rung(0), /ALSO NOT INCLUDED|PARTIAL LOAD/,
    'a session with no siblings gets the widest rung');
  assert.match(rung(400), /PARTIAL LOAD/,
    'and a session crowded past every rung says so rather than overrunning in silence');
});

test('the ceiling comes from the dispatcher, so the two cannot drift apart', () => {
  // One fact, one owner. The dispatcher enforces the shared ceiling and now
  // exports it; a second copy here is the drift this replaces.
  const dispatcher = readFileSync(join(HOOKS, 'session-dispatch.sh'), 'utf8');
  assert.match(dispatcher, /^OUTPUT_BUDGET="\$\{WEB_TOOLS_OUTPUT_BUDGET:-(\d+)\}"/m);
  assert.equal(Number(/^OUTPUT_BUDGET="\$\{WEB_TOOLS_OUTPUT_BUDGET:-(\d+)\}"/m
    .exec(dispatcher)[1]), CEILING, 'the injector falls back to the same number it enforces');
  assert.match(dispatcher, /^export WEB_TOOLS_OUTPUT_BUDGET=/m, 'and hands it down');
  assert.match(dispatcher, /WEB_TOOLS_SESSION_SIBLINGS="\$\(\(\$\{#scripts\[@\]\} - 1\)\)"/,
    'with the count of the others, which a script cannot discover for itself');

  // A lowered ceiling reaches the rung, which is the whole point of exporting it.
  const out = run('inject-conventions.sh', { WEB_TOOLS_OUTPUT_BUDGET: '12000' });
  assert.match(out, /PARTIAL LOAD/);
});

test('a garbled sibling count falls back rather than failing into the session', () => {
  const out = run('inject-conventions.sh', { WEB_TOOLS_SESSION_SIBLINGS: 'not-a-number' });
  assert.doesNotMatch(out, /PARTIAL LOAD/);
  assert.match(out, /# Working conventions \(portable\)/);
});

// ── What went out, not what is on disk ─────────────────────────────────────
// `bytes` is the document in the plugin; `sent` is what this script put on the
// channel. They were one field until 2026-08-30, which made every receipt claim
// the whole file had arrived even at a rung that withheld two thirds of it: the
// one number that could have contradicted `delivered` agreed with it instead.

test('each receipt reports the bytes it actually sent, per rung', () => {
  const receiptsOf = out => Object.fromEntries(out.split('\n')
    .filter(l => l.startsWith('[startup-context] '))
    .map(l => JSON.parse(l.slice('[startup-context] '.length)))
    .map(e => [e.path.replace(/^.*\//, ''), e]));

  const doc = readFileSync(join(HOOKS, '..', 'web-tools', 'SURFACING.md'), 'utf8');
  const onDisk = Buffer.byteLength(doc, 'utf8');

  const wide = receiptsOf(run('inject-conventions.sh'))['SURFACING.md'];
  assert.equal(wide.delivered, 'without_course');
  assert.equal(wide.bytes, onDisk, 'bytes is the document, whichever rung fired');
  assert.ok(wide.sent > 0 && wide.sent < wide.bytes,
    'and even the widest rung withholds the course, so sent is short of it');

  const mid = receiptsOf(run('inject-conventions.sh', { WEB_TOOLS_INJECT_BUDGET: MID_BUDGET }));
  assert.equal(mid['SURFACING.md'].delivered, 'primitives_only');
  assert.ok(mid['SURFACING.md'].sent < wide.sent, 'a narrower rung sends less');
  assert.equal(mid['CONVENTIONS.md'].sent, mid['CONVENTIONS.md'].bytes,
    'CONVENTIONS.md rides every rung whole, so its two numbers agree');

  const last = receiptsOf(run('inject-conventions.sh', { WEB_TOOLS_INJECT_BUDGET: '4000' }));
  assert.equal(last['SURFACING.md'].delivered, 'omitted');
  assert.equal(last['SURFACING.md'].sent, 0, 'nothing sent reads as zero, not as the file size');
  assert.equal(last['SURFACING.md'].bytes, onDisk, 'the document is still that big');
});

test('the sent figure is the payload, so it matches what the rung emitted', () => {
  // The check that keeps `sent` from becoming a second label. It is a byte
  // count of real text, so it has to agree with the text that went out.
  const out = run('inject-conventions.sh');
  const surf = out.split('\n').filter(l => l.startsWith('[startup-context] '))
    .map(l => JSON.parse(l.slice('[startup-context] '.length)))
    .find(e => e.path.endsWith('SURFACING.md'));
  const doc = readFileSync(join(HOOKS, '..', 'web-tools', 'SURFACING.md'), 'utf8');
  // Trailing newlines stripped, because that is what the script measures: the
  // slice goes through `$(...)`, which drops them, and the payload gets its own
  // single newline back at print time. So `sent` is the document's own bytes
  // and not the separators around it, which is the number worth reporting.
  const head = doc.split('\n## The surfacing course')[0].replace(/\n+$/, '');
  assert.equal(surf.sent, Buffer.byteLength(head, 'utf8'),
    'the widest rung sends SURFACING.md up to the course heading');
});

// ── The recovery block ─────────────────────────────────────────────────────
// The budget can be respected and the payload still lost: the ceiling belongs
// to the harness, not to this script, and past it the whole stdout goes to a
// file while the session gets a ~2 KB preview. Measured 2026-08-30 on a live
// session, that preview is 1,997 bytes and ends partway into CONVENTIONS.md's
// opening. So the head of this payload is the only part guaranteed to arrive,
// and what sits there is a design decision, not a formatting one.

test('the recovery block leads every rung, since only the head is guaranteed to arrive', () => {
  const budgets = [undefined, '25981', '4000'];   // rung 1, rung 2, the partial rung
  for (const b of budgets) {
    const out = run('inject-conventions.sh', b ? { WEB_TOOLS_INJECT_BUDGET: b } : {});
    assert.match(out, /^RECOVERY: /,
      `the recovery block is the first thing printed (budget ${b || 'default'})`);
    assert.ok(Buffer.byteLength(out.split('\n\n')[0], 'utf8') < 1500,
      'and it fits inside a 2,000-byte preview with room for the banner behind it');
  }
});

test('the recovery block names files, a directory, and an ordering', () => {
  // The dispatcher already warned, and its warning states the problem without
  // the remedy: no file, no path, and nothing about when to act. Each of these
  // is a thing a session needs in order to do something rather than worry.
  const out = run('inject-conventions.sh');
  const block = out.split('\n\n')[0];
  assert.match(block, /CONVENTIONS\.md and SURFACING\.md/, 'which documents were lost');
  assert.match(block, /from \/\S+/, 'an absolute path to read them from');
  assert.doesNotMatch(block, /\/\.\.\//, 'resolved, not joined: a reader should not unpick it');
  assert.match(block, /before acting on the request/, 'and when to do it');
  assert.match(block, /no network needed/,
    'the recovery must hold when the network is the thing that is broken');
});

test('the recovery block stays small enough not to cost a rung', () => {
  // It did, at 480 bytes: it traded SURFACING.md's opening away in every session
  // to buy a message that matters only in the cut ones. The size is the whole
  // reason one directory is printed rather than two full paths.
  const out = run('inject-conventions.sh');
  const block = out.split('\n\n')[0] + '\n\n';
  assert.ok(Buffer.byteLength(block, 'utf8') < 450,
    `the recovery block is ${Buffer.byteLength(block, 'utf8')} bytes; over 450 it starts buying its room from the rungs`);
});

test('the path the recovery names is real, and holds both documents', () => {
  // A recovery instruction pointing at nothing is worse than none: it costs the
  // session a detour and ends where it started.
  const out = run('inject-conventions.sh');
  const dir = /from (\/\S+)/.exec(out.split('\n\n')[0])?.[1];
  assert.ok(dir, 'the block names a directory');
  for (const f of ['CONVENTIONS.md', 'SURFACING.md']) {
    assert.ok(fs.existsSync(join(dir, f)), `${f} is where the block says it is`);
  }
});
