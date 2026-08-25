// The plugin's SessionStart dispatcher: does it find the right scripts, in the
// right checkouts, and refuse to let one of them take the session down?
//
// The dispatcher is the missing glob for session-start scripts (see the header
// of .claude/skills/hooks/session-dispatch.sh). Its whole contract is a
// filename rule, so the tests are about which files run and which do not,
// plus the two failure shapes that must never reach the session: a script that
// exits nonzero, and one that never returns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DISPATCH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '.claude', 'skills', 'hooks', 'session-dispatch.sh'
);

// A workspace nested one level inside the temp dir, because the dispatcher also
// scans the project root's SIBLINGS. Handing it a bare mkdtemp would make every
// other directory in /tmp a sibling, and the test would depend on the machine.
function workspace(scripts) {
  const box = mkdtempSync(join(tmpdir(), 'dispatch-'));
  const ws = join(box, 'ws');
  mkdirSync(ws);
  for (const [rel, body] of Object.entries(scripts)) {
    const file = join(ws, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body, { mode: 0o755 });
  }
  return { box, ws };
}

function dispatch(ws, env = {}) {
  return execFileSync('bash', [DISPATCH], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: ws, ...env },
    input: '{"hook_event_name":"SessionStart"}',
    encoding: 'utf8'
  });
}

test('runs session-*.sh in every checkout and ignores everything else', () => {
  const { box, ws } = workspace({
    'repoA/.claude/hooks/session-alpha.sh': '#!/bin/bash\necho "alpha spoke"\n',
    'repoA/.claude/hooks/build-on-commit.sh': '#!/bin/bash\necho "COMMIT HOOK RAN"\n',
    'repoA/.claude/hooks/helper.sh': '#!/bin/bash\necho "HELPER RAN"\n',
    'repoB/.claude/hooks/session-beta.sh': '#!/bin/bash\necho "beta spoke"\n'
  });
  try {
    const out = dispatch(ws);
    assert.match(out, /alpha spoke/);
    assert.match(out, /beta spoke/);
    // The opt-out is the name, and it has to be airtight: these two sit in the
    // same folder and must never be treated as session scripts.
    assert.doesNotMatch(out, /COMMIT HOOK RAN/);
    assert.doesNotMatch(out, /HELPER RAN/);
    // Two checkouts contributed, so each block is attributed.
    assert.match(out, /\[repoA\/session-alpha\.sh\]/);
    assert.match(out, /\[repoB\/session-beta\.sh\]/);
  } finally { rmSync(box, { recursive: true, force: true }); }
});

test('a silent script contributes nothing at all, not even a label', () => {
  const { box, ws } = workspace({
    'repoA/.claude/hooks/session-quiet.sh': '#!/bin/bash\nexit 0\n',
    'repoB/.claude/hooks/session-loud.sh': '#!/bin/bash\necho "loud spoke"\n'
  });
  try {
    const out = dispatch(ws);
    assert.match(out, /loud spoke/);
    // The gated-note pattern depends on this: a probe that decides nothing is
    // due must cost the session zero lines, not an empty labelled block.
    assert.doesNotMatch(out, /session-quiet/);
  } finally { rmSync(box, { recursive: true, force: true }); }
});

test('a failing script still delivers its output and never fails the session', () => {
  const { box, ws } = workspace({
    'repoA/.claude/hooks/session-angry.sh': '#!/bin/bash\necho "angry spoke"\nexit 3\n'
  });
  try {
    const out = dispatch(ws);
    assert.match(out, /angry spoke/);
  } finally { rmSync(box, { recursive: true, force: true }); }
});

test('a hung script is bounded, reported, and does not take the others with it', () => {
  const { box, ws } = workspace({
    'repoA/.claude/hooks/session-hang.sh': '#!/bin/bash\nsleep 30\n',
    'repoA/.claude/hooks/session-fast.sh': '#!/bin/bash\necho "fast spoke"\n'
  });
  try {
    const started = Date.now();
    const out = dispatch(ws, { WEB_TOOLS_SESSION_BUDGET: '1' });
    const elapsed = Date.now() - started;
    // Parallel, so the fast script is not held behind the slow one, and the
    // whole run is bounded by the budget rather than the sum.
    assert.match(out, /fast spoke/);
    assert.match(out, /session-hang\.sh\] exceeded 1s/);
    assert.ok(elapsed < 15000, `dispatcher took ${elapsed}ms, expected under the budget`);
  } finally { rmSync(box, { recursive: true, force: true }); }
});

test('each script runs with its own checkout as cwd and CLAUDE_PROJECT_DIR', () => {
  const { box, ws } = workspace({
    'repoA/.claude/hooks/session-where.sh': '#!/bin/bash\necho "cwd=$(pwd)"\necho "dir=$CLAUDE_PROJECT_DIR"\n'
  });
  try {
    const out = dispatch(ws);
    // This is what lets a script written for .claude/settings.json move under
    // the dispatcher unchanged: both anchors still point at its own repo.
    assert.match(out, /cwd=.*[/\\]repoA/);
    assert.match(out, /dir=.*[/\\]repoA/);
  } finally { rmSync(box, { recursive: true, force: true }); }
});

test('a workspace with no session scripts is completely silent', () => {
  const { box, ws } = workspace({
    'repoA/.claude/hooks/build-on-commit.sh': '#!/bin/bash\necho "COMMIT HOOK RAN"\n'
  });
  try {
    assert.equal(dispatch(ws), '');
  } finally { rmSync(box, { recursive: true, force: true }); }
});

test('the project root itself is a candidate, not only its children', () => {
  const { box, ws } = workspace({
    '.claude/hooks/session-root.sh': '#!/bin/bash\necho "root spoke"\n'
  });
  try {
    const out = dispatch(ws);
    assert.match(out, /root spoke/);
    // One contributor, so no attribution noise: a single-checkout session reads
    // exactly as it did when the hook was wired in settings.json.
    assert.doesNotMatch(out, /\[ws\/session-root\.sh\]/);
  } finally { rmSync(box, { recursive: true, force: true }); }
});

test('a script reachable twice by the overlapping searches runs once', () => {
  const { box, ws } = workspace({
    'repoA/.claude/hooks/session-once.sh': '#!/bin/bash\necho "once"\n'
  });
  try {
    // repoA is found as a child of ws; ws is found as a sibling of itself via
    // the parent scan. Deduping is what keeps that from doubling every note.
    const hits = dispatch(ws).match(/once/g) || [];
    assert.equal(hits.length, 1);
  } finally { rmSync(box, { recursive: true, force: true }); }
});

// The audit: a repo that still declares SessionStart in its own settings.json.
// Both shapes below look exactly like a healthy session from the outside, which
// is the only reason the dispatcher says anything at all. home sat in the first
// one on 2026-07-31 with four scripts and a core.hooksPath line, and the visible
// symptom was a pre-commit lint that quietly did not run.

test('a repo declaring SessionStart with no session-*.sh is reported, not left silent', () => {
  const { box, ws } = workspace({
    'repoA/.claude/settings.json':
      '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"x"}]}]}}',
    'repoA/.claude/hooks/load-conventions.sh': '#!/bin/bash\necho "NEVER RUNS"\n'
  });
  try {
    const out = dispatch(ws);
    // The script is correctly not run: it does not match the glob.
    assert.doesNotMatch(out, /NEVER RUNS/);
    // But its absence is now stated rather than inferred.
    assert.match(out, /\[repoA\] .*declares SessionStart, but no .*session-\*\.sh/);
  } finally { rmSync(box, { recursive: true, force: true }); }
});

test('a repo declaring SessionStart alongside session-*.sh is warned about double-running', () => {
  const { box, ws } = workspace({
    'repoA/.claude/settings.json':
      '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"x"}]}]}}',
    'repoA/.claude/hooks/session-thing.sh': '#!/bin/bash\necho "thing spoke"\n'
  });
  try {
    const out = dispatch(ws);
    assert.match(out, /thing spoke/);
    assert.match(out, /\[repoA\] .*still declares SessionStart.*run twice/s);
    // The note is a footnote: it must not displace the session's actual notes.
    assert.ok(out.indexOf('thing spoke') < out.indexOf('still declares SessionStart'));
  } finally { rmSync(box, { recursive: true, force: true }); }
});

test('a repo whose only hook is PreToolUse is correct, and draws no complaint', () => {
  const { box, ws } = workspace({
    'repoA/.claude/settings.json':
      '{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"x"}]}]}}',
    'repoA/.claude/hooks/build-on-commit.sh': '#!/bin/bash\necho "COMMIT HOOK RAN"\n'
  });
  try {
    // Keying the audit on an empty hooks folder instead of on the SessionStart
    // declaration would fire here, and a check that nags a correct repo is a
    // check that gets muted.
    assert.equal(dispatch(ws), '');
  } finally { rmSync(box, { recursive: true, force: true }); }
});
