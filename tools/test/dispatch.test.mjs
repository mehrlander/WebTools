// dispatch.js — the outbound link minter. What matters here is not that a URL
// comes back but that the LOSSES do: a scope narrowed silently is the failure
// the kit exists to remove, so every case that cannot carry an input asserts on
// `dropped` rather than only on the address.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/dispatch.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const D = window.dispatch;

const params = (url) => new URL(url).searchParams;

test('a bare call is the plain new-session address', () => {
  const r = D.code({});
  assert.equal(r.url, 'https://claude.ai/code');
  assert.deepEqual(r.dropped, []);
});

test('prompt and repositories ride, in the documented spellings', () => {
  const r = D.code({ prompt: 'Fix the login bug', repos: ['acme/webapp', 'acme/api'] });
  const p = params(r.url);
  assert.equal(p.get('prompt'), 'Fix the login bug');
  assert.equal(p.get('repositories'), 'acme/webapp,acme/api');
  assert.deepEqual(r.dropped, []);
});

test('repos dedupe and keep the order given', () => {
  const r = D.code({ repos: ['a/one', 'a/two', 'a/one'] });
  assert.equal(params(r.url).get('repositories'), 'a/one,a/two');
});

test('a bare checkout name is dropped and named, never emitted', () => {
  const r = D.code({ repos: ['web-tools', 'mehrlander/web-tools'] });
  assert.equal(params(r.url).get('repositories'), 'mehrlander/web-tools');
  assert.equal(r.dropped.length, 1);
  assert.match(r.dropped[0], /web-tools.*owner\/repo/);
});

test('one repo carries its branch, and says the route is unverified', () => {
  const r = D.code({ repos: 'a/one', branch: 'feature/x' });
  assert.equal(params(r.url).get('branch'), 'feature/x');
  assert.deepEqual(r.dropped, []);
  assert.match(r.carried.join(' '), /unverified/);
});

test('several repos cannot carry a branch, and the drop names the count', () => {
  const r = D.code({ repos: ['a/one', 'a/two'], branch: 'feature/x' });
  assert.equal(params(r.url).has('branch'), false);
  assert.equal(r.dropped.length, 1);
  assert.match(r.dropped[0], /2 repositories/);
});

test('a branch with no repo beside it is dropped', () => {
  const r = D.code({ branch: 'main' });
  assert.equal(params(r.url).has('branch'), false);
  assert.match(r.dropped[0], /needs a repository/);
});

test('an over-length prompt is refused whole, never truncated', () => {
  const long = 'x'.repeat(D.PROMPT_MAX + 1);
  const r = D.code({ prompt: long, repos: 'a/one' });
  assert.equal(params(r.url).has('prompt'), false);
  assert.equal(params(r.url).get('repositories'), 'a/one', 'the rest still rides');
  assert.match(r.dropped[0], new RegExp(String(D.PROMPT_MAX)));
  assert.equal(D.fits(long), false);
  assert.equal(D.fits('x'.repeat(D.PROMPT_MAX)), true);
});

test('prompt_url is passed through, and yields to prompt as documented', () => {
  const u = 'https://raw.githubusercontent.com/o/r/main/p.md';
  const alone = D.code({ promptUrl: u });
  assert.equal(params(alone.url).get('prompt_url'), u);

  const both = D.code({ prompt: 'hi', promptUrl: u });
  assert.equal(params(both.url).has('prompt_url'), false);
  assert.match(both.dropped[0], /ignored when prompt is set/);
});

test('an over-length prompt lets prompt_url through, since it did not ride', () => {
  const r = D.code({ prompt: 'x'.repeat(D.PROMPT_MAX + 1), promptUrl: 'https://e.co/p' });
  assert.equal(params(r.url).get('prompt_url'), 'https://e.co/p');
});

test('environment rides', () => {
  assert.equal(params(D.code({ environment: 'Default' }).url).get('environment'), 'Default');
});

test('chat takes q, not prompt, and refuses repositories out loud', () => {
  const r = D.chat({ prompt: 'hello', temporary: true, repos: ['a/one'] });
  const p = params(r.url);
  assert.equal(p.get('q'), 'hello');
  assert.equal(p.get('temporary-chat'), 'true');
  assert.match(r.dropped[0], /takes no repository/);
});

test('every target row declares whether the link submits on arrival', () => {
  for (const t of D.targets) assert.equal(typeof t.submits, 'boolean', t.key);
  assert.equal(D.targets.find((t) => t.key === 'code').submits, false);
  assert.equal(D.targets.find((t) => t.key === 'chat').submits, true);
});

test('an unreachable target yields no url and carries its reason', () => {
  const g = D.targets.find((t) => t.key === 'gemini');
  assert.equal(g.available, false);
  const r = D.url('gemini', { prompt: 'hi' });
  assert.equal(r.url, '');
  assert.equal(r.dropped[0], g.reason);
});

test('url() dispatches by key', () => {
  assert.equal(D.url('code', { repos: 'a/b' }).url, D.code({ repos: 'a/b' }).url);
  assert.match(D.url('nope', {}).dropped[0], /unknown target/);
});
