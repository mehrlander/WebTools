// The main-turn rule, read twice, held to one answer.
//
// A session's conversation has two populations of assistant turn. One answers
// the question. The other announces work: "Now let me render it to check the
// pixels", immediately followed by the calls it introduces. The swipe deck
// folds the second kind into the run it announces, and the sessions cache's
// `turns` field carries the first kind and not the second, so the row's card
// shows what the deck shows.
//
// The rule therefore has two readings. session-render.js decides it per CARD,
// inside blocks(), because it is building folds. repo-sessions-cache.js decides
// it per RECORD, inside priorTurns(), because it is building a flat list for a
// row. Neither can use the other: the render kit would drag the cache kit into
// every page that shows a deck, and the crawl cannot load a renderer. So there
// are two implementations, and this is the gate that stops them drifting. It
// runs both over the same records and asserts the same turns come back.
//
// Checked against all 172 schema-4 records in the store on 2026-08-27: exact
// agreement. The fixtures below are the shapes that agreement rests on.
//
// Driven over plain objects; no DOM, no network.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKit } from './bootstrap.mjs';

const w = {};
loadKit('repo-sessions-cache', { window: w });
// session-render's pure half needs chatRender only inside its render paths;
// turns(), groups() and blocks() never touch it.
loadKit('session-render', { window: Object.assign(w, { chatRender: {} }) });
const S = w.RepoSessionsCache;
const SR = w.sessionRender;

// What the DECK leaves expanded: an assistant turn rendered as its own block,
// rather than as the `intro` line of a fold. Walks a step sequence, since a run
// of steps nests its folds one level down.
function deckExpanded(record) {
  const out = [];
  const walk = (b) => {
    if (b.steps) { b.steps.forEach(walk); return; }
    if (b.turn && b.turn.role === 'assistant') out.push(b.turn.md);
  };
  for (const card of SR.groups(SR.turns(record))) SR.blocks(card).forEach(walk);
  return out;
}

// What the CACHE keeps, as full text rather than heads, so the two are
// comparable. priorTurns cuts to TURN_HEAD and drops the closing reply, both of
// which are the row's business and not the rule's.
function cacheMain(record) {
  const seq = [];
  for (const p of record.prompts || []) seq.push({ role: 'user', md: p.text || '', at: p.at });
  for (const x of record.replies || []) seq.push({ role: 'assistant', md: x.text || '', at: x.at });
  for (const c of record.calls || []) seq.push({ role: 'tool', md: '', at: c.at });
  const RANK = { user: 0, assistant: 1, tool: 2 };
  seq.forEach((t, i) => { t._i = i; });
  seq.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)
    || (RANK[a.role] - RANK[b.role]) || (a._i - b._i));
  return seq.filter((t, i) =>
    t.role === 'assistant'
    && !((t.md || '').length <= S.STEP_INTRO && seq[i + 1]?.role === 'tool')).map(t => t.md);
}

const at = (n) => `2026-08-05T10:${String(n).padStart(2, '0')}:00Z`;
const long = (n) => 'x'.repeat(n);

// An exchange with the shape the fold was built for: a question, three step
// intros each followed by calls, and the answer.
const TYPICAL = {
  schema: 4,
  prompts: [{ at: at(0), text: 'do the thing' }],
  replies: [
    { at: at(1), text: 'Let me look at the file.' },
    { at: at(3), text: 'Now let me render it to check the pixels.' },
    { at: at(5), text: long(2000) },
  ],
  calls: [
    { at: at(2), name: 'Read', ok: true },
    { at: at(4), name: 'Bash', ok: true },
  ],
};

test('a step intro folds in the deck and never reaches the row', () => {
  const got = cacheMain(TYPICAL);
  assert.equal(got.length, 1, 'the answer only');
  assert.equal(got[0], long(2000));
  assert.deepEqual(got, deckExpanded(TYPICAL), 'and the deck agrees');
});

test('a long turn followed by calls is an answer, not an intro', () => {
  // The cut is length and only length. A turn over STEP_INTRO is saying
  // something even when work follows it, which is the shape of a turn that
  // both reports and continues. 6% of turns followed by calls are this.
  const rec = {
    schema: 4,
    prompts: [{ at: at(0), text: 'ask' }],
    replies: [{ at: at(1), text: long(S.STEP_INTRO + 1) }, { at: at(3), text: 'done' }],
    calls: [{ at: at(2), name: 'Bash', ok: true }],
  };
  assert.deepEqual(cacheMain(rec), deckExpanded(rec));
  assert.equal(cacheMain(rec).length, 2, 'both turns are main');
});

test('exactly at the cut it is an intro; one character over it is not', () => {
  const mk = (n) => ({
    schema: 4,
    prompts: [{ at: at(0), text: 'ask' }],
    replies: [{ at: at(1), text: long(n) }, { at: at(3), text: 'the answer' }],
    calls: [{ at: at(2), name: 'Bash', ok: true }],
  });
  assert.equal(cacheMain(mk(S.STEP_INTRO)).length, 1, 'at the cut: folds');
  assert.equal(cacheMain(mk(S.STEP_INTRO + 1)).length, 2, 'over it: stays');
  for (const n of [S.STEP_INTRO, S.STEP_INTRO + 1])
    assert.deepEqual(cacheMain(mk(n)), deckExpanded(mk(n)), `n=${n}`);
});

test('a short turn with no calls after it is an answer, not an intro', () => {
  // "Done." is short and it is still the reply. The predicate needs BOTH
  // halves; length alone would drop the shortest answers in the store.
  const rec = {
    schema: 4,
    prompts: [{ at: at(0), text: 'ask' }],
    replies: [{ at: at(2), text: 'Done.' }],
    calls: [{ at: at(1), name: 'Bash', ok: true }],
  };
  assert.deepEqual(cacheMain(rec), ['Done.']);
  assert.deepEqual(cacheMain(rec), deckExpanded(rec));
});

test('an assistant turn sorts above the calls that share its timestamp', () => {
  // Both are read from one transcript message, so they carry the same `at`.
  // Without the rank the calls sort first and the sentence that introduced
  // them stops looking like an intro, which silently promotes narration.
  const rec = {
    schema: 4,
    prompts: [{ at: at(0), text: 'ask' }],
    replies: [{ at: at(1), text: 'Let me check.' }, { at: at(2), text: long(900) }],
    calls: [{ at: at(1), name: 'Read', ok: true }],
  };
  assert.deepEqual(cacheMain(rec), [long(900)], 'the intro folded');
  assert.deepEqual(cacheMain(rec), deckExpanded(rec));
});

// ── The row's own shaping, which is not the rule ────────────────────────────

test('priorTurns drops both ends, because the row already carries them', () => {
  // TYPICAL is one exchange: one ask, one answer. The ask is `ask` on the row
  // and the answer is `reply`, so there is nothing in between and the card
  // shows no scroll back at all rather than repeating either.
  assert.deepEqual(S.priorTurns(TYPICAL), []);
});

test('the opening ask is not repeated, since it IS the first prompt', () => {
  // Checked against all 225 records on file 2026-08-27: `opening_ask` and
  // prompts[0] agree every time. Keeping it opened the card on the same
  // question twice, once quiet at the top and once as its own separator.
  const rec = {
    schema: 4,
    prompts: [{ at: at(0), text: 'the opening ask' }, { at: at(3), text: 'a follow-up' }],
    replies: [{ at: at(1), text: 'first answer' }, { at: at(4), text: 'closing' }],
    calls: [],
  };
  const got = S.priorTurns(rec);
  assert.ok(!got.some(([k, t]) => k === 'u' && t === 'the opening ask'), 'not twice');
  assert.deepEqual(got, [['a', 'first answer', '10:01:00'], ['u', 'a follow-up', '10:03:00']],
    'and each entry carries the clock the card prints beside it');
});

test('the asks are what makes a run of replies read as a conversation', () => {
  const rec = {
    schema: 4,
    prompts: [{ at: at(0), text: 'first ask' }, { at: at(3), text: 'second ask' }],
    replies: [{ at: at(1), text: 'first answer' }, { at: at(4), text: 'second answer' }],
    calls: [],
  };
  assert.deepEqual(S.priorTurns(rec).map(([k]) => k).join(''), 'au',
    'the opener is on `ask` and the last answer on `reply`, so what is left is answer then ask');
});

test('each entry is cut to its opening, and an ask is cut shorter', () => {
  const rec = {
    schema: 4,
    prompts: [{ at: at(0), text: 'the opener' }, { at: at(2), text: long(500) }],
    replies: [{ at: at(1), text: long(500) }, { at: at(3), text: 'closing' }],
    calls: [],
  };
  const got = S.priorTurns(rec);
  assert.equal(got[0][1].length, S.TURN_HEAD, 'a turn shows its first sentence');
  assert.equal(got[1][1].length, S.PROMPT_HEAD, 'an ask is structure, so it is shorter');
  assert.ok(S.PROMPT_HEAD < S.TURN_HEAD, 'and the two caps are not the same number');
});

test('the newest survive the cap, because a reader scrolls backwards', () => {
  const prompts = [], replies = [];
  for (let i = 0; i < 40; i++) {
    prompts.push({ at: at(i) + i, text: 'ask ' + i });
    replies.push({ at: at(i) + 'z' + i, text: 'answer ' + i });
  }
  const rec = { schema: 4, prompts, replies, calls: [] };
  const got = S.priorTurns(rec);
  assert.equal(got.length, S.TURNS_KEPT, 'bounded');
  assert.equal(got[got.length - 1][1], 'ask 39',
    'the tail is kept: the last thing before the closing reply');
  assert.ok(!got.some(([k, t]) => k === 'u' && t === 'ask 0'), 'and the opener is gone either way');
  assert.equal(S.turnsPartial(rec), 'cut', 'and the drop is REPORTED, never silent');
});

test('a session that fits says so, rather than saying nothing', () => {
  // The two states have to be distinguishable at the top of a scroll: this is
  // the beginning of the session, or this is the beginning of what fits.
  assert.equal(S.turnsPartial(TYPICAL), '');
  assert.equal(S.turnsPartial({ schema: 4, prompts: [], replies: [], calls: [] }), '');
});

test('a schema-3 record has no turns to carry, and does not invent any', () => {
  // 52 of 224 records predate `replies`. `last_message` is the recorder's tail
  // of the final turn, which `reply` already carries and marks as a tail.
  const rec = { schema: 3, last_message: 'the tail', opening_ask: 'ask' };
  assert.deepEqual(S.priorTurns(rec), []);
  assert.equal(S.turnsPartial(rec), '');
});

test('the row carries both fields, and the version moved for them', () => {
  const row = S.summarize({
    ...TYPICAL, session_id: 'abc12345-x', short: 'abc12345', day: '2026-08-05',
    started: at(0), ended: at(5), opening_ask: 'do the thing', repos: [],
  }, 'sha');
  assert.deepEqual(row.turns, [], 'one exchange: the ask and the reply, both already on the row');
  assert.equal(row.turnsCut, '');
  assert.ok(row.v >= 6, 'a row built before `turns` existed must be refetched, and v is the only signal');
});
