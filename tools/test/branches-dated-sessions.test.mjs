// gh-fetch.js — branchesDatedSessions(): the dated branch list and the
// authoring session per branch, from ONE walk of one refs connection.
//
// It exists because the activity crawl always wanted both and used to ask
// twice, paying for the same pagination each time. Measured 2026-08-17 off the
// crawl's own call log: 79 GraphQL posts costing 75s of request time across 22
// repos, three per repo, two of them this pair.
//
// So the assertions are that one walk answers both questions, that pagination
// is followed once rather than twice, and that the session is lifted from the
// first commit body in each branch's history that carries the footer.
//
// The stub is a fake graphql(), since what is under test is the walk and the
// shaping, not the transport.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const api = readFileSync(path.join(repoRoot, 'lib/gh-api.js'), 'utf8');
const fetchSrc = readFileSync(path.join(repoRoot, 'lib/gh-fetch.js'), 'utf8');

// gh-api is an ES module; the one export is what gh-fetch extends.
const { default: GH } = await import('../../lib/gh-api.js');
const window = { GH };
new Function('window', fetchSrc)(window);

const SESSION = 'https://claude.ai/code/session_01ABCdef';
const commit = (name, date, bodies) => ({
  name,
  target: { oid: 'sha-' + name, committedDate: date, messageHeadline: 'tip of ' + name,
            history: { nodes: bodies.map(b => ({ messageBody: b })) } },
});

// Two pages, so the walk's pagination is exercised: a single page would pass
// whether or not the cursor is followed.
const PAGES = [
  { nodes: [commit('b-old', '2026-08-01T00:00:00Z', ['no footer here']),
            commit('b-new', '2026-08-16T00:00:00Z', ['first', 'ran under ' + SESSION])],
    pageInfo: { hasNextPage: true, endCursor: 'cur1' } },
  { nodes: [commit('b-mid', '2026-08-10T00:00:00Z', [])],
    pageInfo: { hasNextPage: false, endCursor: null } },
];

const makeGh = () => {
  const gh = new GH({ repo: 'me/home' });
  const calls = [];
  gh.graphql = async (query, vars) => {
    calls.push({ query, vars });
    const page = PAGES[calls.length - 1];
    return { repository: { refs: page } };
  };
  return { gh, calls };
};

test('one walk answers both questions', async () => {
  const { gh, calls } = makeGh();
  const { branches, sessions } = await gh.branchesDatedSessions();
  // Newest first, the same order and shape branchesDated returns.
  assert.deepEqual(branches.map(b => b.name), ['b-new', 'b-mid', 'b-old']);
  assert.equal(branches[0].sha, 'sha-b-new');
  assert.equal(branches[0].subject, 'tip of b-new');
  assert.equal(branches[0].date, '2026-08-16T00:00:00Z');
  // And the sessions, keyed by branch, from the same response.
  assert.deepEqual(sessions, { 'b-new': SESSION });
  // Two pages, two posts. The pair this replaces would have made four.
  assert.equal(calls.length, 2);
  assert.equal(calls[1].vars.cursor, 'cur1', 'the second page follows the cursor');
});

test('the depth rides the query, since the footer may be a few commits back', async () => {
  const { gh, calls } = makeGh();
  await gh.branchesDatedSessions(100, 500, 3);
  assert.equal(calls[0].vars.depth, 3);
  assert.equal(calls[0].vars.per, 100);
});

test('a branch with no footer in reach simply has no session', async () => {
  const { gh } = makeGh();
  const { branches, sessions } = await gh.branchesDatedSessions();
  assert.equal(sessions['b-old'], undefined, 'a human-authored branch has none, honestly');
  assert.equal(branches.find(b => b.name === 'b-old').name, 'b-old', 'and it keeps its row');
});
