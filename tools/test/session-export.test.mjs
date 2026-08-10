// lib/kits/session-export.js — the pure half: the turn/card index and the
// markdown builder. Loads the real IIFEs against a stub window, so these assert
// the shipped code rather than a transcription of it.
//
// Three things are worth guarding, and each of them passes a naive check:
//
//   Indices are positions in the CARDS flattened, not in turns(). groups()
//   folds a leading meta note into the first card, so the two sequences are
//   equal today. A selection that indexes one and groups by the other would
//   look right on any record whose first turn is not a meta note, which is
//   every complete schema-4 record.
//
//   Tool detail is split. `parts.arg` and `parts.body` exist so an excerpt can
//   carry the command without the output, which is where the bytes are. If
//   callTurn ever goes back to building one string, `bodies: false` silently
//   starts shipping every result body.
//
//   The header block states the bound. An excerpt pasted into another session
//   is read as a transcript unless it says otherwise, and the record is a
//   capture with caps on every field.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const load = (rel, window, document) =>
  new Function('window', 'document', readFileSync(path.join(repoRoot, rel), 'utf8'))(window, document);

const window = {};
const document = { createElement: () => ({ style: {}, append() {}, setAttribute() {} }) };
load('lib/kits/session-render.js', window, document);
// swipe-deck is required only for `h`, which the picker uses and these do not;
// the stub keeps the kit's own guard satisfied without pulling in the DOM.
window.swipeDeck = { h: () => ({}) };
load('lib/kits/session-export.js', window, document);
const { model, markdown } = window.sessionExport;

const at = s => `2026-08-09T05:01:${String(s).padStart(2, '0')}Z`;

const REC = {
  schema: 4,
  short: 'abc12345',
  day: '2026-08-09',
  started: at(0),
  ended: at(30),
  exchanges: 2,
  calls_total: 3,
  opening_ask: 'Did we create a new standard for registration?',
  agent_session: 'https://claude.ai/code/session_x',
  repos: [{ name: 'web-tools', branch: 'main' }],
  // Present so the record earns its closing summary card, which is what makes
  // the last card a `meta` turn and the count 5 rather than 4.
  files: { 'lib/kits/session-render.js': { read: 2 } },
  files_total: 1,
  tools: { Bash: 2, Read: 1 },
  prompts: [
    { at: at(1), text: 'Did we create a new standard for registration?' },
    { at: at(20), text: 'And the export view?' },
  ],
  replies: [
    { at: at(2), text: "I'll check what landed today." },
    { at: at(21), text: 'It lists turns and copies them out.' },
  ],
  calls: [
    { at: at(2), name: 'Bash', arg: 'ls /home/user/', body: 'home\nweb-tools', bytes: 15, ok: true },
    { at: at(3), name: 'Bash', arg: 'git log', body: '{"a":1}', bytes: 7, clipped: true, ok: true },
    { at: at(21), name: 'Read', arg: 'lib/kits/session-render.js', bytes: 9000 },
  ],
};

test('the index is the cards flattened, and the two agree turn for turn', () => {
  const m = model(REC);
  assert.equal(m.flat.length, m.cardOf.length);
  assert.equal(m.cardStart.length, m.cards.length);
  // Every card's turns sit at cardStart..cardStart+len, and cardOf agrees.
  m.cards.forEach((c, ci) => {
    c.forEach((t, k) => {
      const i = m.cardStart[ci] + k;
      assert.equal(m.flat[i], t);
      assert.equal(m.cardOf[i], ci);
    });
  });
});

test('a card per ask and per prose turn, with the calls attached above', () => {
  const m = model(REC);
  assert.deepEqual(m.cards.map(c => c.map(t => t.role).join('+')), [
    'user', 'assistant+tool+tool', 'user', 'assistant+tool', 'meta',
  ]);
});

test('a selection of one card carries only that card', () => {
  const m = model(REC);
  const sel = m.cards[1].map((_, k) => m.cardStart[1] + k);
  const md = markdown(REC, sel, { model: m });
  assert.match(md, /I'll check what landed today/);
  assert.doesNotMatch(md, /And the export view\?/);
  assert.match(md, /Excerpt: 3 of \d+ turns, from 1 of 5 cards \(2\)\./);
});

test('tool results are off by default and the command still rides', () => {
  const m = model(REC);
  const all = m.flat.map((_, i) => i);
  const lean = markdown(REC, all, { model: m });
  assert.match(lean, /ls \/home\/user\//);          // the argument
  assert.doesNotMatch(lean, /^home$/m);             // the body
  assert.match(lean, /Tool result bodies are omitted/);

  const full = markdown(REC, all, { model: m, bodies: true });
  assert.match(full, /^home$/m);
  assert.match(full, /Clipped to the per-result cap/);
  assert.doesNotMatch(full, /Tool result bodies are omitted/);
});

test('a call with no body kept is described by its size, not shown as empty', () => {
  const m = model(REC);
  const i = m.flat.findIndex(t => t.src?.name === 'Read');
  assert.match(markdown(REC, [i], { model: m, bodies: true }), /8\.8 KB returned, body not kept/);
});

test('the header names the record, the bound, and the session', () => {
  const m = model(REC);
  const md = markdown(REC, null, { model: m });
  assert.match(md, /^# Did we create a new standard for registration\?/);
  assert.match(md, /The whole record: \d+ turns across 5 cards\./);
  assert.match(md, /not a full transcript/);
  assert.match(md, /https:\/\/claude\.ai\/code\/session_x/);
});

test('capture gaps come from the record, and a complete record has none', () => {
  const m = model(REC);
  // This fixture stores 2 of 2 asks and elides nothing, so the only gap the
  // note can raise is... none. The meta card is absent and so is the section.
  assert.equal(m.cards.at(-1)[0].role, 'meta');   // the closing summary, not a gap note
  assert.doesNotMatch(markdown(REC, null, { model: m }), /What this record does not hold/);

  const partial = { ...REC, schema: 3, replies: [], prompts_stored: 1 };
  const md = markdown(partial, null, {});
  assert.match(md, /What this record does not hold/);
  assert.match(md, /Assistant prose was not captured/);
});

test('the header can be dropped, and an empty selection yields nothing', () => {
  const m = model(REC);
  assert.doesNotMatch(markdown(REC, [0], { model: m, head: false }), /^#/m);
  assert.equal(markdown(REC, [], { model: m }), '');
});

// The rule means "turns were dropped here", so it tracks the gap and not the
// card boundary. Ruling on every card change put a line between every pair of
// turns in an asks-and-prose excerpt, where each turn starts its own card:
// the mark for "something is missing" appearing exactly where nothing was.
test('a rule marks a gap, and contiguous turns run on', () => {
  const m = model(REC);
  const rules = md => (md.match(/^---$/gm) || []).length;
  assert.equal(rules(markdown(REC, [m.cardStart[0], m.cardStart[2]], { model: m, head: false })), 1);
  assert.equal(rules(markdown(REC, [0, 1, 2], { model: m, head: false })), 0);
  // Across a card boundary but with nothing skipped: still no rule.
  assert.ok(m.cardOf[m.cardStart[1] - 1] !== m.cardOf[m.cardStart[1]]);
  assert.equal(rules(markdown(REC, [m.cardStart[1] - 1, m.cardStart[1]], { model: m, head: false })), 0);
  // The header is fenced off from the turns whatever the selection.
  assert.equal(rules(markdown(REC, null, { model: m })), 1);
});
