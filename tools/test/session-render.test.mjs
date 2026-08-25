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
const { turns, groups, outline, describe } = window.sessionRender;

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

// ── The outline ────────────────────────────────────────────────────────────
// The titler is mechanical: a card's title is the first sentence of its lead
// turn. Measured over the store's 1,242 card leads on 2026-08-09, the residue
// split four ways, and three of those four are extraction bugs rather than
// anything a model would fix. These guard the three fixes, since each of them
// looks like a cosmetic nicety and is the difference between an outline that
// orients and one that reads as noise.

const outlineOf = rec => outline(rec).map(c => c.title);

test('a card is titled by the first sentence of its lead turn', () => {
  const t = outlineOf(REC);
  assert.equal(t[0], 'Do we capture session content?');
  assert.equal(t[1], 'Let me look at the plugin.');
  assert.equal(t[2], 'Yes, and here is what it holds.');
});

test('a lead that opens with chrome is skipped, not shown as the title', () => {
  // Every file-modifying reply opens with the branch anchor, so this shape
  // heads a card in most working sessions. Taking the first sentence naively
  // titles those cards with a URL.
  const rec = { ...REC, replies: [{ at: at(5),
    text: 'Working branch: [claude/some-branch](https://github.com/o/r/tree/b)\n\n'
        + 'The registry now names every page, which is what the registry was missing.' }] };
  const t = outline(rec).find(c => c.role === 'assistant');
  assert.equal(t.title, 'The registry now names every page, which is what the registry was missing.');
  assert.equal(t.source, 'lead-sentence');
});

test('a lead too short to say anything falls through to the next sentence', () => {
  const rec = { ...REC, replies: [{ at: at(5),
    text: 'Done. The lockstep test now re-runs each generator in check mode.' }] };
  assert.equal(outline(rec).find(c => c.role === 'assistant').title,
    'The lockstep test now re-runs each generator in check mode.');
});

test('with no usable prose, the title says what the card ran', () => {
  // The honest fallback, and it is marked as one: `source` lets the renderer
  // style a derived title differently from a narrated one, so a reader can
  // tell which rows the session actually described.
  // One reply means one prose card, so all three of REC's calls attach to it.
  const rec = { ...REC, replies: [{ at: at(5), text: 'Done.' }] };
  const c = outline(rec).find(x => x.role === 'assistant');
  assert.equal(c.title, 'Ran 2× Bash, Read');
  assert.equal(c.source, 'tool-calls');
});

test('the run summary counts repeats and keeps first-run order', () => {
  const rec = { ...REC, replies: [{ at: at(5), text: 'x' }], calls: [
    { at: at(5), name: 'Bash', arg: 'a' }, { at: at(5), name: 'Read', arg: 'b' },
    { at: at(5), name: 'Bash', arg: 'c' }, { at: at(5), name: 'Bash', arg: 'd' },
  ] };
  assert.equal(outline(rec).find(c => c.role === 'assistant').ran, '3× Bash, Read');
});

test('a long title is cut at a word boundary and marked as cut', () => {
  const long = 'The registry ' + 'names every page and every kit and every doc '.repeat(4) + 'exactly once.';
  const rec = { ...REC, replies: [{ at: at(5), text: long }] };
  const title = outline(rec).find(c => c.role === 'assistant').title;
  assert.ok(title.length <= 97, 'capped: ' + title.length);
  assert.match(title, /…$/);
  assert.doesNotMatch(title, /\s…$/, 'trailing space before the ellipsis');
});

test('one outline row per deck card, in the same order', () => {
  const o = outline(REC);
  assert.equal(o.length, groups(turns(REC)).length);
  assert.deepEqual(o.map(c => c.i), o.map((_, i) => i));
});

// `kind` is what the outline's guideline is drawn from, and it is the one
// classification a reader cannot make by eye: a coding session alternates
// between saying something and doing something, and both are assistant cards.
// Measured across the store on 2026-08-09: 13.5% ask, 13.0% answer, 72.2%
// work, 1.2% note. The near 1:1 of ask to answer is the pattern the test
// pins; if `calls` ever stops being the discriminator, every answer in the
// list silently becomes work and the spine disappears.

test('an assistant card with tool calls is work; without them it is the answer', () => {
  const kinds = outline(REC).map(c => c.kind);
  assert.deepEqual(kinds, ['ask', 'work', 'work', 'ask']);

  // REC's two replies both carry calls. Give the second none and it flips.
  const rec = { ...REC, calls: REC.calls.filter(c => c.at === at(5)) };
  assert.deepEqual(outline(rec).map(c => c.kind), ['ask', 'work', 'answer', 'ask']);
});

test('a meta card is a note, never an answer', () => {
  // The closing summary and the capture note are assistant-shaped in neither
  // role nor content, and styling them as replies would put a rule beside a
  // renderer's own footnote.
  // The closing summary is the standalone meta card; a leading capture note
  // folds into card 0 and the ask there still leads it, which is why the
  // fixture supplies `tools` rather than a gap.
  const o = outline({ schema: 4, tools: { Bash: 2 },
    prompts: [{ at: at(0), text: 'Anything?' }], replies: [], calls: [] });
  assert.ok(o.every(c => c.kind !== 'answer'));
  assert.ok(o.some(c => c.kind === 'note'));
});


// ── The deck's contents list ────────────────────────────────────────────────
//
// The deck pages `groups(turns(record))` and the list is built from
// `outline(record)`, which derives the same cards. That is the invariant the
// whole feature rests on: row `i` IS slide `i`, by construction rather than by
// a mapping that could drift. `one outline row per deck card` above pins the
// count; these pin what the row then says and what the labeler hands the kit.

test('a card belongs to the exchange it answers, counted from the ask', () => {
  // REC is ask, work, work, ask: the first question owns three cards and the
  // second owns one. That is exactly the run a pager clusters, and it is the
  // reason the group is the exchange and not the kind.
  assert.deepEqual(outline(REC).map(c => c.exchange), [1, 1, 1, 2]);
});

test('a card before the first ask is exchange 0 rather than joining the ask after it', () => {
  // A leading capture note folds into card 0, so reaching this needs a record
  // whose first card is a standalone meta one. The closing summary is that
  // card when there are no prompts at all.
  const o = outline({ schema: 4, tools: { Bash: 1 }, prompts: [], replies: [], calls: [] });
  assert.ok(o.length, 'the summary card is there to be numbered');
  assert.equal(o[0].exchange, 0, 'nothing has been asked yet, and the count says so');
});

// Loading the shipped open() means stubbing the two kits it delegates to, which
// is what lets a pure-function harness assert the wiring: the options object
// swipe-deck receives is the whole contract between them.
const load = (rel, w, doc) =>
  new Function('window', 'document', readFileSync(path.join(repoRoot, rel), 'utf8'))(w, doc);

const deckOpts = async (record) => {
  const w = {};
  const doc = { createElement: () => ({ style: {}, append() {}, setAttribute() {} }) };
  load('lib/kits/session-render.js', w, doc);
  w.chatRender = { ready: async () => {}, message: () => ({}) };
  let seen = null;
  w.swipeDeck = { open: (opts) => { seen = opts; return { deck: {} }; } };
  await w.sessionRender.open(record);
  return seen;
};

test('the deck is handed a labeler, so the header mark opens a contents list', async () => {
  const opts = await deckOpts(REC);
  assert.equal(typeof opts.index, 'function',
    'without this the mark is a plaque and thirty cards are reachable only by swiping');
  assert.equal(opts.count, groups(turns(REC)).length);
});

test('a row carries the card title, what it ran, and a mark for its kind', async () => {
  const opts = await deckOpts(REC);
  const line = outline(REC);
  const row = opts.index(1);
  assert.equal(row.title, line[1].title, 'the list and the outline say the same thing');
  assert.equal(row.subtitle, line[1].ran, 'a work card is placed by what it ran');
  assert.match(row.icon, /^ph-/, 'and the kind is a glyph, which the title cannot be wrong about');
  assert.notEqual(opts.index(0).icon, opts.index(1).icon, 'an ask does not look like work');
});

test('the labeler groups by exchange, which is what the pager clusters on', async () => {
  const opts = await deckOpts(REC);
  assert.deepEqual([0, 1, 2, 3].map(i => opts.index(i).group), [1, 1, 1, 2]);
});

test('a labeler asked past the end answers rather than throwing', async () => {
  // The kit calls the labeler once per slide for the dots and again per row,
  // and a deck whose count and outline ever disagreed would take the whole
  // list down with it. One row failing is not the list failing.
  const opts = await deckOpts(REC);
  assert.deepEqual(opts.index(99), {});
});
