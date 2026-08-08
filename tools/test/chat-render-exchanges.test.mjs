// lib/kits/chat-render.js — role normalization and the exchange grouping the swipe
// deck pages on. Loads the real IIFE against a stub window, so these assert the
// shipped code rather than a transcription of it.
//
// Regression origin: chat-histories' transcripts open with a title/uuid/date
// header, which parse() returns as a `meta` message. Two bugs stacked there.
// normRole('meta') returned 'user', because the `me` alternation matched the
// prefix, so the header rendered as a user turn; and since a user turn starts a
// new exchange, it also claimed the whole first slide, leaving the reader
// opening on ~120 characters of header with the conversation on slide 2.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

// chat-render.js hangs itself on `window` and touches the DOM only inside the
// render functions, so a stub window reaches parse() and exchanges() without
// jsdom. ensureDeckStyle is the one DOM call on this path (document.head).
const src = readFileSync(path.join(repoRoot, 'lib/kits/chat-render.js'), 'utf8');
const window = { addEventListener() {} };
const document = { head: { append() {} }, createElement: () => ({ style: {}, append() {}, setAttribute() {} }) };
new Function('window', 'document', src)(window, document);
const { parse, exchanges, ROLES } = window.chatRender;

const HEADER = [
  '# WebI Data Modeling',
  'uuid: 69b8ef63-66f0-8330-b83c-e8fc8b89beec',
  'created: 2026-03-17  updated: 2026-03-17  messages: 4',
  '',
  '--- Human ---',
  'What is in this export?',
  '',
  '--- Assistant ---',
  'A budget-to-actual model.',
  '',
  '--- Human ---',
  'And the vendor detail?',
  '',
  '--- Assistant ---',
  'EA08 carries it.',
].join('\n');

const roles = groups => groups.map(g => g.map(m => m.role).join('+'));

test('a leading header parses as a meta note, not a user turn', () => {
  const msgs = parse(HEADER);
  assert.equal(msgs[0].role, 'meta');
  assert.match(msgs[0].md, /uuid: 69b8ef63/);
  assert.deepEqual(msgs.map(m => m.role), ['meta', 'user', 'assistant', 'user', 'assistant']);
});

test('meta is a role of its own, with its own card label', () => {
  assert.equal(ROLES.meta.label, 'Note');
  assert.equal(parse('bare preamble with no turn markers')[0].role, 'meta');
});

// The load-bearing one: it fails if either half of the fix regresses. Without
// the normRole exact-name check, `meta` normalizes to `user` and starts a new
// group; without the exchanges splice, the note stands alone even when it
// normalizes correctly. Either way the reader opens on a header-only slide.
test('a leading meta note rides on the first exchange, not its own slide', () => {
  assert.deepEqual(roles(exchanges(parse(HEADER))),
    ['meta+user+assistant', 'user+assistant']);
});

test('grouping is unchanged when there is no leading meta note', () => {
  const msgs = [{ role: 'user', md: 'a' }, { role: 'assistant', md: 'b' },
    { role: 'user', md: 'c' }, { role: 'assistant', md: 'd' }];
  assert.deepEqual(roles(exchanges(msgs)), ['user+assistant', 'user+assistant']);
});

test('a transcript that is only a meta note stays one slide', () => {
  assert.deepEqual(roles(exchanges(parse('just a header, no markers'))), ['meta']);
});

test('dashed-fence transcripts split into turns', () => {
  // chat-histories' extract_chat.py emits `--- Human ---`, not `## User`.
  const msgs = parse(HEADER);
  assert.equal(msgs.filter(m => m.role === 'user').length, 2);
  assert.equal(msgs.filter(m => m.role === 'assistant').length, 2);
});

test('turn markers inside a fenced code block are not turns', () => {
  const md = ['--- Human ---', 'see this:', '```', '--- Assistant ---', '```', 'done'].join('\n');
  const msgs = parse(md);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].role, 'user');
});
