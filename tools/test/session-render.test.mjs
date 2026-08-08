// lib/kits/session-render.js — the record-to-conversation mapping: the merge that
// interleaves three parallel lists, and the grouping the swipe deck pages on.
//
// Loads the real IIFE against a stub window, so these assert the shipped code
// rather than a transcription of it. `turns`, `groups` and `describe` are pure;
// only `open`/`deck` touch chatRender or the DOM, so neither is needed here.
//
// The two things worth guarding, both of which pass a naive check:
//
//   The MERGE is by `at` at one-second granularity, and an assistant turn
//   shares its timestamp with the tool calls it issued, since both are read
//   from one transcript message. Sorting on `at` alone leaves that tie to
//   concatenation order, which puts the calls above the sentence introducing
//   them. It looks fine on any fixture whose seconds happen not to collide.
//
//   The GROUPING is deliberately not chatRender.exchanges(). That one starts a
//   card per user turn, which is right for a chat and wrong here: measured on
//   the session that built this, 3 asks against 160 calls, so it would produce
//   three unreadable slides. A card per ask AND per prose turn is what makes a
//   session pageable, and it only became possible when schema 4 started
//   capturing prose at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/session-render.js'), 'utf8');
const window = {};
const document = { createElement: () => ({ style: {}, append() {}, setAttribute() {} }) };
new Function('window', 'document', src)(window, document);
const { turns, groups, describe } = window.sessionRender;

const at = s => `2026-08-07T15:00:${String(s).padStart(2, '0')}Z`;

// A schema-4 record with the one shape the rank exists for: the reply at :05
// and both of its calls carry the SAME timestamp.
const REC = {
  schema: 4,
  short: 'abc12345',
  day: '2026-08-07',
  started: at(0),
  ended: at(30),
  exchanges: 2,
  prompts_stored: 2,
  calls_total: 3,
  repos: [{ name: 'web-tools' }, { name: 'home' }],
  opening_ask: 'Do we capture session content?',
  prompts: [
    { at: at(0), text: 'Do we capture session content?' },
    { at: at(20), text: 'Please proceed.' },
  ],
  replies: [
    { at: at(5), text: 'Let me look at the plugin.' },
    { at: at(12), text: 'Yes, and here is what it holds.' },
  ],
  calls: [
    { at: at(5), name: 'Bash', ok: true, bytes: 40, arg: 'ls sessions/', body: 'README.md' },
    { at: at(5), name: 'Read', ok: true, bytes: 4821 },
    { at: at(14), name: 'Bash', ok: false, bytes: 60, arg: 'npm run broken', body: 'exit 1' },
  ],
};

const shape = list => list.map(t => t.role).join(',');

test('the merge interleaves the three lists in transcript order', () => {
  const t = turns(REC);
  assert.equal(shape(t), 'user,assistant,tool,tool,assistant,tool,user',
    'expected ask, reply, its two calls, reply, its call, ask');
});

test('a reply sorts above the calls that share its timestamp', () => {
  const t = turns(REC);
  const reply = t.findIndex(x => x.md === 'Let me look at the plugin.');
  const firstCall = t.findIndex(x => x.role === 'tool');
  assert.ok(reply < firstCall,
    'the calls sorted above the sentence that introduced them; the per-kind rank is not breaking the `at` tie');
});

test('a card starts at each ask and each prose turn, with calls attaching above', () => {
  const g = groups(turns(REC));
  assert.deepEqual(g.map(shape), [
    'user',
    'assistant,tool,tool',
    'assistant,tool',
    'user',
  ]);
});

test('grouping stays pageable on a real session shape (few asks, many calls)', () => {
  // The case chatRender.exchanges() collapses: 3 asks, 60 calls, one prose turn
  // introducing each run of 5.
  const prompts = [0, 100, 200].map(s => ({ at: at(s % 60), text: 'ask' }));
  const replies = [], calls = [];
  for (let i = 0; i < 12; i++) {
    replies.push({ at: at(i * 4 + 1), text: `step ${i}` });
    for (let k = 0; k < 5; k++) calls.push({ at: at(i * 4 + 2), name: 'Bash', ok: true, bytes: 1, arg: 'x', body: 'y' });
  }
  const g = groups(turns({ schema: 4, prompts, replies, calls, exchanges: 3, prompts_stored: 3 }));
  assert.ok(g.length >= 13, `expected a card per ask and per prose turn, got ${g.length}`);
  const biggest = Math.max(...g.map(c => c.length));
  assert.ok(biggest <= 7, `a card carries ${biggest} entries; the deck is back to unreadable slabs`);
});

test('a complete schema-4 record gets no capture note', () => {
  assert.ok(!turns(REC).some(t => t.role === 'meta'),
    'a clean record should not carry a disclaimer nobody asked for');
});

test('a schema-3 record says its prose was not captured', () => {
  const t = turns({ ...REC, schema: 3, replies: [], last_message: 'The final word.' });
  const note = t.find(x => x.role === 'meta');
  assert.ok(note, 'no capture note on a record that is missing its answering half');
  assert.match(note.md, /prose was not captured/i);
});

test('the capture note folds into the first card rather than taking a slide', () => {
  const g = groups(turns({ ...REC, schema: 3, replies: [], last_message: 'The final word.' }));
  assert.equal(g[0][0].role, 'meta', 'the note should lead the first card');
  assert.ok(g[0].length > 1, 'the note took a slide of its own; the deck opens on a disclaimer');
});

test('last_message is shown, and last, when there are no replies', () => {
  const t = turns({ ...REC, schema: 3, replies: [], last_message: 'The final word.' });
  const last = t[t.length - 1];
  assert.equal(last.md, 'The final word.');
  assert.match(last.label, /final turn only/,
    'the one surviving turn must be labelled as such, or it reads as the whole answer');
});

test('caps and drops are named in the note', () => {
  const t = turns({ ...REC, exchanges: 900, prompts_stored: 2, replies_elided: 3, bodies_dropped: 7 });
  const note = t.find(x => x.role === 'meta');
  assert.match(note.md, /2 of 900 asks stored/);
  assert.match(note.md, /3 prose turns elided/);
  assert.match(note.md, /7 result bodies dropped/);
});

test('a failing call is labelled and a body-less call states its size', () => {
  const t = turns(REC);
  const failed = t.find(x => x.role === 'tool' && /failed/.test(x.label));
  assert.ok(failed, 'a failing call must be distinguishable from a succeeding one');
  const dropped = t.find(x => x.label === 'Read');
  assert.match(dropped.md, /4\.7 KB returned, body not kept/,
    'a dropped body must still say how much there was; "nothing" and "not kept" are different claims');
});

test('a Bash arg is fenced as bash so it reads as a command', () => {
  const t = turns(REC);
  const call = t.find(x => x.label === 'Bash');
  assert.match(call.md, /```bash\nls sessions\/\n```/);
});

test('describe carries the facts the deck header needs', () => {
  const d = describe(REC);
  assert.match(d.title, /Do we capture session content/);
  assert.match(d.subtitle, /abc12345/);
  assert.match(d.subtitle, /web-tools, home/);
  assert.match(d.subtitle, /2 asks/);
});

test('the closing summary is its own card, last, carrying what the pane used to', () => {
  // This content is why removing the Sessions pane's inline expansion loses
  // nothing: the file list moved here rather than being dropped.
  const g = groups(turns({ ...REC, files_total: 1, files: { 'web-tools/a.js': { edit: 5 } } }));
  const last = g[g.length - 1];
  assert.equal(last.length, 1, 'the summary must not read as the tail of the last exchange');
  assert.equal(last[0].role, 'meta');
  assert.match(last[0].label, /What this session touched/);
});

test('the summary spells out the per-kind file breakdown and keeps its caveat', () => {
  const t = turns({
    ...REC,
    files_total: 2,
    files: { 'web-tools/a.js': { read: 1, edit: 5 }, 'home/b.md': { read: 2 } },
    tools: { Bash: 40, Read: 3 },
  });
  const s = t[t.length - 1];
  assert.match(s.md, /`web-tools\/a\.js` — 5 edit, 1 read/,
    'how a file was touched, not just how often');
  const aIdx = s.md.indexOf('web-tools/a.js'), bIdx = s.md.indexOf('home/b.md');
  assert.ok(aIdx < bIdx, 'busiest first');
  assert.match(s.md, /`Bash` — 40/);
  assert.match(s.md, /injected at session start/,
    'the counts say the opposite of the truth without their caveat');
});

test('a record with nothing to summarise gets no closing card', () => {
  const g = groups(turns({ schema: 4, prompts: [{ at: at(0), text: 'hi' }], exchanges: 1, prompts_stored: 1 }));
  assert.equal(g.length, 1, 'an empty summary card would be a blank slide at the end');
});

test('an empty schema-4 record renders nothing rather than throwing', () => {
  assert.deepEqual(turns({ schema: 4 }), []);
  assert.deepEqual(groups([]), []);
});

test('a record with no schema field is treated as schema 1, not as complete', () => {
  // The default matters: `schema || 1` is what makes an unversioned or
  // malformed record report its gaps instead of passing as a clean capture.
  const t = turns({});
  assert.equal(t.length, 1);
  assert.equal(t[0].role, 'meta');
  assert.match(t[0].md, /prose was not captured/i);
});
