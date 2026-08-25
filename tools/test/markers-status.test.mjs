// markers-status.test.mjs — the status tool's grammar and resolution rules.
//
// Two things are held here, and both are held because they were already wrong
// once in a repo that used this convention for two months:
//
//   1. The marker grammar. A stricter pattern silently dropped ten of forty-four
//      real markers in `home`: four wrote `(tracker task NNNN)` between the date
//      and the colon, and six pointed the arrow at prose, inline code, or a
//      markdown link whose label contained spaces. A marker that does not parse
//      is invisible to the inventory, so the whole convention quietly failed on
//      the material it was written for. The near-miss detector exists so that
//      failure is loud next time; these cases keep it honest in both directions.
//
//   2. Declaration resolution, especially `except`. Frozen folders routinely
//      contain live inputs (a builder beside a pinned payload, one rebuilt
//      table among settled records). Any rule that treats a directory as
//      uniformly frozen fires on exactly the files an estate depends on, so the
//      per-entry exception is load-bearing rather than a convenience.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Deliberately not ./bootstrap.mjs: this exercises a standalone python script
// and needs none of the browser-test dependencies that module loads, so it
// stays runnable in a checkout with no node_modules.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATUS = path.join(repoRoot, '.claude/skills/markers/status.py');

const run = (cwd, ...args) =>
  spawnSync('python3', [STATUS, ...args], { cwd, encoding: 'utf8' });

/** A throwaway git repo with the given files, so `git ls-files` behaves. */
function fixture(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'markers-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  spawnSync('git', ['init', '-q', '.'], { cwd: dir });
  spawnSync('git', ['add', '-A'], { cwd: dir });
  return dir;
}

const withFixture = (files, fn) => {
  const dir = fixture(files);
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

// --- the marker grammar -----------------------------------------------------

const ACCEPTED = {
  'plain, no target': '**Stale 2026-06-24:** aged out.',
  'bare path target': '**Frozen 2026-07-10 → ../README.md:** moved.',
  'task parenthetical': '**Frozen 2026-07-06 (tracker task 0032):** pinned exhibit.',
  'markdown link target, spaces in label':
    "**Frozen 2026-07-27 → [the app's Funding view](../view/README.md):** superseded.",
  'inline-code target': '**Stale 2026-07-20 → `verify-properties.py` output:** counts moved.',
  'prose target, sentence close': '**Frozen 2026-07-13 → two successors below.**',
  'quoted target': '**Stale 2026-07-21 → CLAUDE.md "Cross-repo conventions":** rewritten.',
  'year-only date': '**Wrong 2026:** never held.',
};

for (const [label, line] of Object.entries(ACCEPTED)) {
  test(`marker grammar accepts: ${label}`, () => {
    withFixture({ 'a.md': `# A\n\n${line}\n` }, (dir) => {
      const out = run(dir, 'inventory').stdout;
      assert.match(out, /^Markers: 1 inline/m, `not parsed: ${line}`);
      assert.doesNotMatch(out, /does not parse/, `flagged as malformed: ${line}`);
    });
  });
}

// Ordinary bold prose that merely starts with a flavor word must not be
// mistaken for an attempted marker: the convention's own worked-examples entry
// writes `**Frozen**: preserved on purpose` as a definition list.
const NOT_MARKERS = {
  'definition list': '- **Frozen**: preserved on purpose.',
  'flavor then comma': '- **Stale, with a target**, in some file.',
  'hyphenated compound': '2. **Stale-branch piggybacking** rides old work.',
};

for (const [label, line] of Object.entries(NOT_MARKERS)) {
  test(`marker grammar ignores prose: ${label}`, () => {
    withFixture({ 'a.md': `# A\n\n${line}\n` }, (dir) => {
      const out = run(dir, 'inventory').stdout;
      assert.match(out, /^Markers: 0 inline/m);
      assert.doesNotMatch(out, /does not parse/, `false near-miss on: ${line}`);
    });
  });
}

test('a malformed marker is reported, not skipped', () => {
  withFixture({ 'a.md': '# A\n\n**Frozen July 2026:** no ISO date.\n' }, (dir) => {
    const r = run(dir, 'check');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /does not parse/);
  });
});

test('a path-shaped arrow target is existence-checked; a prose one is not', () => {
  withFixture({
    'a.md': '# A\n\n**Stale 2026-07-01 → missing/gone.md:** moved.\n',
    'b.md': '# B\n\n**Stale 2026-07-01 → two successors below.**\n',
  }, (dir) => {
    const r = run(dir, 'check');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /arrow target missing: missing\/gone\.md/);
    assert.equal((r.stderr.match(/arrow target missing/g) || []).length, 1);
  });
});

// --- declarations -----------------------------------------------------------

const WORKSPACE = {
  'ws/.paths.json': JSON.stringify({
    frozen: [
      'pages/pinned.html',
      { path: 'studies/', except: ['*/tools/*', 'README.md'] },
      { path: 'recs/', except: ['rebuilt.csv'] },
    ],
  }),
  'ws/pages/pinned.html': '<html>pinned</html>\n',
  'ws/pages/live.html': '<html>live</html>\n',
  'ws/studies/one/data.js': 'window.D = {}\n',
  'ws/studies/one/tools/build.py': 'print(1)\n',
  'ws/studies/README.md': '# Studies\n',
  'ws/recs/settled.csv': 'a,b\n',
  'ws/recs/rebuilt.csv': 'a,b\n',
};

const EXPECTED = [
  ['ws/pages/pinned.html', true, 'a named file'],
  ['ws/pages/live.html', false, 'an unnamed sibling'],
  ['ws/studies/one/data.js', true, 'a payload under a frozen directory'],
  ['ws/studies/one/tools/build.py', false, 'a builder beside a pinned payload'],
  ['ws/studies/README.md', false, 'prose describing frozen things'],
  ['ws/recs/settled.csv', true, 'a settled record'],
  ['ws/recs/rebuilt.csv', false, 'the one rebuilt table among them'],
];

for (const [rel, frozen, why] of EXPECTED) {
  test(`declaration resolves ${frozen ? 'frozen' : 'live'}: ${why}`, () => {
    withFixture(WORKSPACE, (dir) => {
      const out = run(dir, 'is', rel).stdout;
      if (frozen) assert.match(out, /FROZEN/, `${rel} should be frozen`);
      else assert.match(out, /live \(no declaration\)/, `${rel} should be live`);
    });
  });
}

test('entries are relative to the declaring file, so a workspace can move', () => {
  const moved = Object.fromEntries(
    Object.entries(WORKSPACE).map(([k, v]) => [k.replace(/^ws\//, 'deep/nest/ws/'), v]),
  );
  withFixture(moved, (dir) => {
    assert.match(run(dir, 'is', 'deep/nest/ws/pages/pinned.html').stdout, /FROZEN/);
    assert.match(run(dir, 'is', 'deep/nest/ws/studies/one/tools/build.py').stdout, /live/);
  });
});

test('a declaration written this session is visible before it is committed', () => {
  const dir = fixture({ 'a.md': '# A\n' });
  try {
    writeFileSync(path.join(dir, '.paths.json'), JSON.stringify({ frozen: ['a.md'] }));
    // deliberately not `git add`ed: a tool that cannot see an uncommitted
    // declaration is useless at the moment someone is writing one.
    assert.match(run(dir, 'declared').stdout, /a\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing or empty declared path fails the check', () => {
  withFixture({
    '.paths.json': JSON.stringify({ frozen: ['gone.html', 'empty.html'] }),
    'empty.html': '',
  }, (dir) => {
    const r = run(dir, 'check');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /does not exist: gone\.html/);
    assert.match(r.stderr, /is empty: empty\.html/);
  });
});

// --- the one cross-check, and its direction ---------------------------------

test('a markdown file declared frozen must carry a Frozen banner', () => {
  withFixture({
    '.paths.json': JSON.stringify({ frozen: ['silent.md', 'loud.md'] }),
    'silent.md': '# Silent\n\nnothing says so.\n',
    'loud.md': '# Loud\n\n> [!NOTE]\n> **Frozen 2026-07-06 (task 12):** pinned.\n',
  }, (dir) => {
    const r = run(dir, 'check');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /silent\.md: declared frozen, carries no Frozen banner/);
    assert.doesNotMatch(r.stderr, /loud\.md/);
  });
});

test('the cross-check does not run in reverse', () => {
  // A Frozen marker inside a living document annotates one claim. Requiring a
  // declaration for it would be wrong: the file is not the subject.
  withFixture({
    'living.md': '# Living\n\n**Frozen 2026-07-03 → elsewhere.md:** that claim is a snapshot.\n',
    'elsewhere.md': '# Elsewhere\n',
  }, (dir) => {
    const r = run(dir, 'check');
    assert.equal(r.status, 0, r.stderr);
  });
});

test('a clean repo with no declarations at all passes', () => {
  withFixture({ 'README.md': '# Nothing to declare\n' }, (dir) => {
    assert.equal(run(dir, 'check').status, 0);
  });
});
