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
//   The GROUPING is one card per exchange, and what makes that readable is
//   the FOLD, in two levels. A run of tool calls plus the short sentence that
//   introduced it ("Now let me render it") is one STEP; a run of adjacent
//   steps is one SEQUENCE. The first version split a card at each prose turn
//   as well, because without any of this a slide carried a hundred expanded
//   tool entries. Every piece is pinned here, since dropping any one brings
//   the slab back in a smaller size: no folding at all is the original slab,
//   folding calls alone leaves the narration between question and answer,
//   folding steps alone leaves seven or eight lines of preparation, and
//   folding prose by length alone would swallow the answer itself.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/session-render.js'), 'utf8');
const window = {};
const document = { createElement: () => ({ style: {}, append() {}, setAttribute() {} }) };
new Function('window', 'document', src)(window, document);
const { turns, groups, blocks, outline, describe } = window.sessionRender;

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

test('a card is one exchange: the ask and everything before the next ask', () => {
  const g = groups(turns(REC));
  assert.deepEqual(g.map(shape), [
    'user,assistant,tool,tool,assistant,tool',
    'user',
  ]);
});

test('a short turn that introduces work folds with the work it introduced', () => {
  // REC's two replies are both step narration: short, and immediately
  // followed by the calls they announce. Expanded, they sit between the
  // question and the reply that answers it.
  const b = blocks(groups(turns(REC))[0]);
  assert.deepEqual(b.map(x => x.steps ? 'seq:' + x.steps.length : x.turn.role), ['user', 'seq:2']);
  assert.deepEqual(b[1].steps.map(st => st.tools.length), [2, 1],
    'a fold per call would condense nothing; a fold across the prose would lose the order');
  assert.equal(b[1].steps[0].lead, 'Let me look at the plugin.',
    'the sentence is the label: it places a run that the tool names only describe');
});

test('adjacent steps collapse into one sequence, and a lone step does not', () => {
  // The complaint one level up: seven folded steps still stand between the
  // question and its answer, so the run folds again. Wrapping a single step
  // would name nothing its own label does not, and would cost a tap.
  const one = { ...REC, replies: [{ at: at(5), text: 'Let me look at the plugin.' }],
    calls: REC.calls.filter(c => c.at === at(5)) };
  const b = blocks(groups(turns(one))[0]);
  assert.deepEqual(b.map(x => x.steps ? 'seq' : x.tools ? 'step' : x.turn.role), ['user', 'step']);
});

test('a sequence counts its steps and its calls, since that line is the card', () => {
  const b = blocks(groups(turns(REC))[0]);
  assert.equal(b[1].label, '2 steps  ·  3 calls  ·  2× Bash, Read  ·  1 failed');
});

test('a turn long enough to be saying something stays expanded', () => {
  // The guard on the fold above, and the reason it is length rather than
  // position: an assistant turn can report a finding AND keep working, and
  // hiding that one loses the answer. Measured over the store, narration runs
  // a median of 97 characters and an answer 3,499, so the two barely overlap.
  const long = 'Verified. Blue means merged, and the tint comes from one function. '.repeat(6);
  const rec = { ...REC, replies: [{ at: at(5), text: long }] };
  const b = blocks(groups(turns(rec))[0]);
  assert.deepEqual(b.map(x => x.tools ? 'run' : x.turn.role), ['user', 'assistant', 'run']);
  assert.ok(!b[2].lead, 'an expanded turn must not also be repeated as a fold label');
});

test('a step says what it holds, since a closed fold is all a reader sees', () => {
  const [, seq] = blocks(groups(turns(REC))[0]);
  assert.equal(seq.steps[0].label, '2 calls  ·  Bash, Read');
  assert.equal(seq.steps[1].label, '1 call  ·  Bash  ·  1 failed',
    'a failure inside a closed fold is invisible unless the summary names it');
});

test('a real session shape stays readable: three asks, three cards, the work folded', () => {
  // The shape the fold exists for: 3 asks, 60 calls, one prose turn
  // introducing each run of 5.
  const prompts = [0, 20, 40].map(s => ({ at: at(s), text: `ask at ${s}` }));
  const replies = [], calls = [];
  for (let i = 0; i < 12; i++) {
    replies.push({ at: at(i * 5 + 1), text: `step ${i}` });
    for (let k = 0; k < 5; k++) calls.push({ at: at(i * 5 + 2), name: 'Bash', ok: true, bytes: 1, arg: 'x', body: 'y' });
  }
  const g = groups(turns({ schema: 4, prompts, replies, calls, exchanges: 3, prompts_stored: 3 }));
  assert.equal(g.length, 3, 'a question and its answer must land on one slide');
  const b = g.map(blocks);
  assert.deepEqual(b.map(x => x.length), [2, 2, 2],
    'a card is the ask and one line for the work, not sixty entries');
  const seqs = b.map(card => card[1]);
  assert.ok(seqs.every(q => q.steps.length === 4), 'four steps behind each sequence');
  assert.ok(seqs.every(q => q.steps.every(st => st.tools.length === 5 && st.lead)),
    'each step keeps its five calls and the sentence that introduced them');
  assert.ok(seqs.every(q => /^4 steps {2}· {2}20 calls/.test(q.label)));
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
// The titler is mechanical: a card's title is the first sentence of its ask,
// and the first sentence of the reply when the ask carries nothing. Measured
// over the store's card leads on 2026-08-09, the residue split four ways, and
// three of those four are extraction bugs rather than anything a model would
// fix. These guard the three fixes, since each of them looks like a cosmetic
// nicety and is the difference between an outline that orients and one that
// reads as noise.

const outlineOf = rec => outline(rec).map(c => c.title);

// An exchange opened by an ask that says nothing, which is the case the
// understudy exists for: "go", "yes", "please proceed".
const answered = (text, rest = {}) =>
  ({ ...REC, prompts: [{ at: at(0), text: 'go' }], replies: [{ at: at(5), text }], ...rest });

test('a card is titled by the ask that opened it', () => {
  assert.equal(outlineOf(REC)[0], 'Do we capture session content?');
});

test('an ask that says nothing hands the title to the reply under it', () => {
  // A great many asks are "go" or "please proceed". Under the old grouping
  // those headed a card of their own with the answering card beside them;
  // now the prose is on the same card and can be read for the title.
  const c = outline(answered('The registry now names every page, which is what it was missing.',
    { calls: [] }))[0];
  assert.equal(c.title, 'The registry now names every page, which is what it was missing.');
  assert.equal(c.source, 'reply-sentence');
});

test('the title prefers a reply the reader can still see over a folded step', () => {
  // "Let me check the Sessions tab" is narration and folds; titling the card
  // with it names something no longer on screen. The answer under it is what
  // the card is about.
  const answer = 'Verified. Blue means merged, and the tint comes from one function. '.repeat(6);
  const rec = { ...REC,
    prompts: [{ at: at(0), text: 'go' }],
    replies: [{ at: at(2), text: 'Let me check what the Sessions tab does.' },
              { at: at(9), text: answer }],
    calls: [{ at: at(3), name: 'Bash', arg: 'ls' }] };
  const c = outline(rec)[0];
  assert.match(c.title, /^Blue means merged/,
    '"Verified." is under the minimum, so the titler falls through to the sentence after it');
  assert.equal(c.source, 'reply-sentence');
});

test('a lead that opens with chrome is skipped, not shown as the title', () => {
  // Every file-modifying reply opens with the branch anchor, so this shape
  // heads a card in most working sessions. Taking the first sentence naively
  // titles those cards with a URL.
  const rec = answered('Working branch: [claude/some-branch](https://github.com/o/r/tree/b)\n\n'
    + 'The registry now names every page, which is what the registry was missing.', { calls: [] });
  assert.equal(outline(rec)[0].title,
    'The registry now names every page, which is what the registry was missing.');
});

test('a lead too short to say anything falls through to the next sentence', () => {
  const rec = answered('Done. The lockstep test now re-runs each generator in check mode.', { calls: [] });
  assert.equal(outline(rec)[0].title, 'The lockstep test now re-runs each generator in check mode.');
});

test('with no usable prose, the title says what the card ran', () => {
  // The honest fallback, and it is marked as one: `source` lets the renderer
  // style a derived title differently from a narrated one, so a reader can
  // tell which rows the session actually described.
  // One ask means one card, so all three of REC's calls land on it.
  const c = outline(answered('Done.'))[0];
  assert.equal(c.title, 'Ran 2× Bash, Read');
  assert.equal(c.source, 'tool-calls');
});

test('the run summary counts repeats and keeps first-run order', () => {
  const rec = answered('x', { calls: [
    { at: at(5), name: 'Bash', arg: 'a' }, { at: at(5), name: 'Read', arg: 'b' },
    { at: at(5), name: 'Bash', arg: 'c' }, { at: at(5), name: 'Bash', arg: 'd' },
  ] });
  assert.equal(outline(rec)[0].ran, '3× Bash, Read');
});

test('a long title is cut at a word boundary and marked as cut', () => {
  const long = 'The registry ' + 'names every page and every kit and every doc '.repeat(4) + 'exactly once.';
  const title = outline(answered(long, { calls: [] }))[0].title;
  assert.ok(title.length <= 97, 'capped: ' + title.length);
  assert.match(title, /…$/);
  assert.doesNotMatch(title, /\s…$/, 'trailing space before the ellipsis');
});

test('one outline row per deck card, in the same order', () => {
  const o = outline(REC);
  assert.equal(o.length, groups(turns(REC)).length);
  assert.deepEqual(o.map(c => c.i), o.map((_, i) => i));
});

// `kind` is what the outline's glyph is drawn from, and it is the one thing
// about a card a reader cannot get from its title: whether the exchange was
// worked or merely discussed. About four in five cards in the store are
// `work`, which is why the other three are worth marking. If `calls` ever
// stops being the discriminator, every discussion in the list silently
// becomes work and the thing a reader is scanning for disappears.

test('an exchange that ran tools is work; one settled in prose is the answer', () => {
  // REC is one worked exchange and one ask nothing came back on.
  assert.deepEqual(outline(REC).map(c => c.kind), ['work', 'ask']);

  // Take the calls away and the same exchange is a conversation.
  assert.deepEqual(outline({ ...REC, calls: [] }).map(c => c.kind), ['answer', 'ask']);
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

test('a card carries the number of the ask that opened it', () => {
  // One card per exchange, so this now counts 1, 2, 3 down the conversation
  // cards. It stays a separate field from `i` because the meta cards are also
  // slides: "the second question" and "slide 2" are different addresses.
  assert.deepEqual(outline(REC).map(c => c.exchange), [1, 2]);
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
  const row = opts.index(0);
  assert.equal(row.title, line[0].title, 'the list and the outline say the same thing');
  assert.equal(row.subtitle, line[0].ran, 'a work card is placed by what it ran');
  assert.match(row.icon, /^ph-/, 'and the kind is a glyph, which the title cannot be wrong about');
  assert.notEqual(opts.index(0).icon, opts.index(1).icon,
    'a worked exchange does not look like an unanswered ask');
});

test('the labeler asks for no dot grouping, now that a card is an exchange', async () => {
  // The pager puts a margin before each new group. That earned its keep when
  // one exchange spanned six cards; with one card per exchange it would put a
  // gap between every pair of dots, separating nothing.
  const opts = await deckOpts(REC);
  assert.ok([0, 1].every(i => opts.index(i).group === undefined));
});

test('a labeler asked past the end answers rather than throwing', async () => {
  // The kit calls the labeler once per slide for the dots and again per row,
  // and a deck whose count and outline ever disagreed would take the whole
  // list down with it. One row failing is not the list failing.
  const opts = await deckOpts(REC);
  assert.deepEqual(opts.index(99), {});
});
