// .claude/skills/hooks/session-record.sh: the Stop hook the portable plugin
// ships. It fires on every turn of every session that installs the plugin, in
// repos that have nothing to do with session recording, so the behavior worth
// pinning is not "it records" but "it stays out of the way": find the store when
// a checkout declares one, do nothing otherwise, and never exit non-zero.
//
// The store's own runner (record.py, sync.sh) lives in whichever repo declares
// the store and is tested there. Here it is replaced by a stub that reports what
// it was handed, so this covers discovery and delegation only, hermetically.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const HOOK = '.claude/skills/hooks/session-record.sh';
const PAYLOAD = JSON.stringify({
  session_id: 'abcdef12-0000-0000-0000-000000000000',
  transcript_path: '/does/not/matter.jsonl',
  hook_event_name: 'Stop',
});

// A store whose runner records the payload it received instead of doing work.
function store(dir) {
  mkdirSync(join(dir, 'tools'), { recursive: true });
  writeFileSync(join(dir, 'tools', 'on-stop.sh'), `#!/usr/bin/env bash\ncat > "${dir}/received.json"\n`);
  return dir;
}

function manifest(repo, body) {
  mkdirSync(repo, { recursive: true });
  writeFileSync(join(repo, '.web-tools.json'), body);
  return repo;
}

// Run the hook with CLAUDE_PROJECT_DIR set to `root`. Returns the exit status and
// whatever the stub store received, if it ran at all.
function run(root, { env = {}, payload = PAYLOAD, receipt } = {}) {
  const res = spawnSync('bash', [HOOK], {
    input: payload,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, SESSIONS_SYNC_SECS: '0', ...env },
  });
  return {
    status: res.status,
    delegated: receipt ? existsSync(receipt) : false,
    received: receipt && existsSync(receipt) ? readFileSync(receipt, 'utf8') : null,
  };
}

function scratch(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'session-hook-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The three shapes a session actually takes. All three must find the store: the
// hook cannot know which one it is in, and getting this wrong is silent.
test('finds a declared store when the project root sits above the checkouts', () => {
  scratch((dir) => {
    const repo = manifest(join(dir, 'private'), '{"sessions": "sessions"}');
    store(join(repo, 'sessions'));
    const out = run(dir, { receipt: join(repo, 'sessions', 'received.json') });
    assert.equal(out.status, 0);
    assert.ok(out.delegated, 'store should have been found one level down');
  });
});

test('finds the store when the project root is the declaring repo itself', () => {
  scratch((dir) => {
    const repo = manifest(join(dir, 'private'), '{"sessions": "sessions"}');
    store(join(repo, 'sessions'));
    const out = run(repo, { receipt: join(repo, 'sessions', 'received.json') });
    assert.equal(out.status, 0);
    assert.ok(out.delegated, 'store should have been found at the root');
  });
});

test('finds the store when the project root is a sibling checkout', () => {
  scratch((dir) => {
    const repo = manifest(join(dir, 'private'), '{"sessions": "sessions"}');
    store(join(repo, 'sessions'));
    const sibling = manifest(join(dir, 'public'), '{"icon": "ph-wrench"}');
    const out = run(sibling, { receipt: join(repo, 'sessions', 'received.json') });
    assert.equal(out.status, 0);
    assert.ok(out.delegated, 'store should have been found beside the project root');
  });
});

// The payload is the only thing the runner gets, and record.py parses it for the
// transcript path. A mangled hand-off would look exactly like a missing store.
test('hands the payload through byte-identical', () => {
  scratch((dir) => {
    const repo = manifest(join(dir, 'private'), '{"sessions": "sessions"}');
    store(join(repo, 'sessions'));
    const receipt = join(repo, 'sessions', 'received.json');
    const awkward = JSON.stringify({
      session_id: 'x',
      transcript_path: '/tmp/a b/c.jsonl',
      note: 'quotes " backslash \\ dollar $HOME backtick ` newline \n done',
    });
    const out = run(dir, { payload: awkward, receipt });
    assert.equal(out.status, 0);
    assert.equal(out.received, awkward);
  });
});

// Everything below is the quiet path: the common case is a session with no store
// checked out at all, and it must cost nothing and say nothing.
test('does nothing when no checkout declares a store', () => {
  scratch((dir) => {
    manifest(join(dir, 'public'), '{"icon": "ph-wrench", "inbox": "inbox"}');
    const out = run(dir);
    assert.equal(out.status, 0);
  });
});

test('does nothing when there is no manifest anywhere', () => {
  scratch((dir) => {
    mkdirSync(join(dir, 'plain'), { recursive: true });
    const out = run(dir);
    assert.equal(out.status, 0);
  });
});

// A checkout can sit on a branch that declares the store but predates its
// tooling. That is an ordinary state, not a failure to report.
test('declines a declared store whose runner is missing', () => {
  scratch((dir) => {
    const repo = manifest(join(dir, 'private'), '{"sessions": "sessions"}');
    mkdirSync(join(repo, 'sessions'), { recursive: true });
    const out = run(dir, { receipt: join(repo, 'sessions', 'received.json') });
    assert.equal(out.status, 0);
    assert.equal(out.delegated, false);
  });
});

test('survives a malformed manifest that mentions the field', () => {
  scratch((dir) => {
    manifest(join(dir, 'broken'), '{"sessions": ');
    const out = run(dir);
    assert.equal(out.status, 0);
  });
});

test('ignores a sessions field of the wrong type', () => {
  scratch((dir) => {
    manifest(join(dir, 'wrong'), '{"sessions": true}');
    const out = run(dir);
    assert.equal(out.status, 0);
  });
});

test('empty stdin is not an error', () => {
  scratch((dir) => {
    const repo = manifest(join(dir, 'private'), '{"sessions": "sessions"}');
    store(join(repo, 'sessions'));
    const out = run(dir, { payload: '' });
    assert.equal(out.status, 0);
  });
});

// The escape hatch for a layout the bounded search would not reach.
test('SESSIONS_STORE overrides the search', () => {
  scratch((dir) => {
    const far = store(join(dir, 'elsewhere', 'store'));
    const bare = join(dir, 'bare');
    mkdirSync(bare, { recursive: true });
    const out = run(bare, {
      env: { SESSIONS_STORE: far },
      receipt: join(far, 'received.json'),
    });
    assert.equal(out.status, 0);
    assert.ok(out.delegated, 'the override should have been used');
  });
});

test('SESSIONS_STORE pointing nowhere is not an error', () => {
  scratch((dir) => {
    const out = run(dir, { env: { SESSIONS_STORE: join(dir, 'absent') } });
    assert.equal(out.status, 0);
  });
});

// The hook is declared to the plugin loader, not merely present on disk. A file
// nobody wired up is the failure this whole change is fixing.
// The wiring this pins changed on 2026-07-30. The entry used to carry
// `"hooks": "./hooks/hooks.json"` and this test asserted it, on the reading
// that a marketplace entry accepts any plugin-manifest field. The loader
// rejects that form outright: `claude plugin list` reported "× failed to load
// / Hook load failed: hooks: the file-path and array forms are not yet
// supported in a marketplace entry", and removing the key flipped the same
// command to "√ enabled". So the assertion is inverted. The key must be
// ABSENT, and the file is found at the plugin root's default location instead,
// which is where it already sat. Asserting the absence is the point: the old
// declaration reads as diligence and would otherwise be added back.
test('the hook is wired at the default location, and the entry does not redeclare it', () => {
  const market = JSON.parse(readFileSync('.claude-plugin/marketplace.json', 'utf8'));
  const portable = market.plugins.find((p) => p.name === 'portable');
  assert.ok(portable, 'the portable plugin should still exist');
  assert.equal(portable.hooks, undefined,
    'a file-path `hooks` key in a marketplace entry fails the plugin load; the default location carries it');

  // Default discovery: `hooks/hooks.json` in the plugin root, and the plugin
  // root is the entry's source, not the repo root.
  const hooksPath = join(portable.source, 'hooks', 'hooks.json');
  const hooks = JSON.parse(readFileSync(hooksPath, 'utf8'));
  const commands = hooks.hooks.Stop.flatMap((g) => g.hooks.map((h) => h.command));
  assert.equal(commands.length, 1);
  assert.match(commands[0], /\$\{CLAUDE_PLUGIN_ROOT\}/);
  assert.match(commands[0], /hooks\/session-record\.sh/);
  assert.ok(existsSync(HOOK), 'the script the declaration names should exist');
});
