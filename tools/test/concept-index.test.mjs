// The concept-index tool: tiering, the handle test, and the two check findings.
// Fixture-driven so the assertions do not move when the repo's own prose does.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const VOCAB = join(dirname(fileURLToPath(import.meta.url)),
  '../../.claude/skills/concept-index/vocab.py')

function fixture () {
  const root = mkdtempSync(join(tmpdir(), 'concept-index-'))
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'docs/HUB.md'), [
    '# Hub',
    '',
    'A **stage link** moves a fileset across repos.',
    'The **guide region** is the managed part of a PR body.',
    ''
  ].join('\n'))
  // Reuse across files is what separates a term from one-off emphasis.
  writeFileSync(join(root, 'docs/USE.md'), [
    '# Use',
    '',
    'Open the stage link, then read the guide region.',
    'The stage link is token-gated; the guide region is not.',
    'A stage link and a guide region travel together.',
    ''
  ].join('\n'))
  // A phrase referenced as though established but declared nowhere.
  writeFileSync(join(root, 'docs/DRIFT.md'), [
    '# Drift',
    '',
    'The render harness owns this. The render harness is loaded first.',
    'Everything routes through the render harness.',
    ''
  ].join('\n'))
  writeFileSync(join(root, 'docs/OTHER.md'),
    'The render harness again, and the render harness once more.\n')
  return root
}

function index (root) {
  const out = join(root, 'idx.json')
  execFileSync('python3', [VOCAB, 'index', root, '--output', out, '--hub', 'docs/HUB.md'],
    { encoding: 'utf8' })
  return JSON.parse(readFileSync(out, 'utf8'))
}

function check (root, text, extra = []) {
  const out = execFileSync('python3',
    [VOCAB, 'check', '--index', join(root, 'idx.json'), '--json', ...extra],
    { input: text, encoding: 'utf8' })
  return JSON.parse(out)
}

test('a term declared in a hub doc is canonical', () => {
  const root = fixture()
  const idx = index(root)
  const tier = Object.fromEntries(idx.terms.map(t => [t.term, t.tier]))
  assert.equal(tier['stage link'], 'canonical')
  assert.equal(tier['guide region'], 'canonical')
})

test('a phrase referenced but never declared lands in assumed', () => {
  const root = fixture()
  const idx = index(root)
  const tier = Object.fromEntries(idx.terms.map(t => [t.term, t.tier]))
  assert.equal(tier['render harness'], 'assumed')
})

test('check flags a bare term and clears a handled one', () => {
  const root = fixture()
  index(root)
  const bare = check(root, 'Use the stage link to move it.')
  assert.deepEqual(bare.terms_unhandled.map(t => t.term), ['stage link'])

  const handled = check(root, 'Use the [stage link](https://example.com) to move it.')
  assert.equal(handled.terms_unhandled.length, 0)
})

test('a fenced code block is a demonstration, not prose', () => {
  const root = fixture()
  index(root)
  const fenced = check(root, ['Here is the output:', '', '```', 'the stage link', '```', ''].join('\n'))
  assert.equal(fenced.terms_unhandled.length, 0)
})

test('check reports a repo file named without a link, and not one inside a link', () => {
  const root = fixture()
  index(root)
  const bare = check(root, 'See docs/HUB.md for the rule.')
  assert.deepEqual(bare.paths_unlinked.map(p => p.path), ['docs/HUB.md'])

  const linked = check(root, 'See [docs/HUB.md](https://example.com/docs/HUB.md) for the rule.')
  assert.equal(linked.paths_unlinked.length, 0)
})

test('--repo turns a finding into an openable URL', () => {
  const root = fixture()
  index(root)
  const res = check(root, 'See docs/HUB.md.', ['--repo', 'owner/name', '--ref', 'main'])
  assert.equal(res.paths_unlinked[0].url,
    'https://github.com/owner/name/blob/main/docs/HUB.md')
})
