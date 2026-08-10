// This repo's own prose field names are ones the vocabulary states.
//
// text-fields-registry.test.mjs holds the vocabulary's shape; this holds the
// repo to it. The two fail differently and both matter: one catches a
// vocabulary that has stopped being coherent, this catches a carrier that has
// grown a name nobody has accounted for.
//
// Only the UNCLAIMED class is gated, which is the same posture link-survey.py
// takes with its internal class. An alias passes: the vocabulary states what
// the old name means, so a carrier using it conforms by declaration, and gating
// on aliases would turn every existing carrier red with a rename across the
// estate as the only route back to green. That is the cost `instead_of` exists
// to avoid.
//
// A failure here is not automatically a mistake. Sometimes a carrier really has
// found a kind the set lacks, which is how `payload` was added: a tracker
// assessment's `prompt` column holds a session instruction, so the row exists to
// carry the text rather than to describe something else it holds, and no
// existing name meant that. The fix is then a thirteenth name and a moved count
// in the registry test, not an alias to something it is not.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('every prose field name in this repo is one the vocabulary accounts for', () => {
  let out = '';
  let failed = false;
  try {
    out = execFileSync('python3',
      [path.join(repoRoot, 'scripts', 'text-carriers.py'), repoRoot, '--check'],
      { encoding: 'utf8', cwd: repoRoot });
  } catch (e) {
    failed = true;
    out = (e.stdout || '') + (e.stderr || '');
  }
  assert.ok(!failed,
    'text-carriers.py --check failed. Either a carrier grew a field name nothing ' +
    'accounts for (see: python3 scripts/text-carriers.py . --offvocab), or an ' +
    'authored carrier is named nowhere in the repo. Tail of the run:\n' +
    out.split('\n').slice(-8).join('\n'));
});
