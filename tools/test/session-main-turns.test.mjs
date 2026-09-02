// What the card keeps, against what the deck expands.
//
// A session's assistant turns split two ways. Some answer the question. The
// rest are work in progress: the sentence announcing a step, or the running
// report between two of them, each immediately followed by tool calls.
//
// The two surfaces draw the line in different places, on purpose. The DECK is a
// reading surface, so it folds only the SHORT ones (session-render.js,
// STEP_INTRO) and leaves a long progress note expanded, where it is worth
// reading. The CARD is a scan surface, two or three lines a turn, and there a
// progress note is noise however long it runs: measured on one real record,
// seven of the fourteen turns the deck expanded were narration clustered just
// over the deck's threshold, and cut to a card's width they read as seven
// fragments. So the card drops anything followed by calls.
//
// That makes the card's set a strict SUBSET of the deck's, and the subset is
// what this gate holds. The failure it exists to catch is the card keeping a
// turn the DECK folds, which would put narration on a surface with no room for
// it while claiming to agree with the deck. Across the store the card drops 765
// turns the deck keeps, and what survives has a 10th percentile of 518
// characters: even the shortest tenth of it is a real answer.
//
// Driven over plain objects; no DOM, no network.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKit } from './bootstrap.mjs';

const w = {};
// The closing-state vocabulary is its own kit since 2026-09-02, and both of
// these read it: the cache to key a row's states, session-render to give each
// card its own.
loadKit('closing-state', { window: w });
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

// What the CARD keeps, as an assertion about the SOURCE turns rather than the
// heads it stores: priorTurns cuts to TURN_HEAD and drops the closing reply,
// which are the row's business and not the rule's.
function cardKeeps(record) {
  const heads = S.priorTurns(record).filter(([k]) => k === 'a').map(([, t]) => t);
  return heads;
}
// The deck's answers, put through the same head, so the two are comparable.
const asHeads = (mds) => mds.map(md => S.head(md, S.TURN_HEAD).text);

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

test('a step intro folds in the deck and never reaches the card', () => {
  // The case both surfaces agree on: short, and followed by calls.
  const deck = deckExpanded(TYPICAL);
  assert.equal(deck.length, 1, 'the deck expands the answer only');
  assert.equal(deck[0], long(2000));
  assert.equal(S.priorTurns(TYPICAL).filter(([k]) => k === 'a').length, 0,
    'and it is the closing reply, which the row carries itself');
});

test('a LONG turn followed by calls: the deck keeps it, the card does not', () => {
  // The one case the two surfaces disagree on, and the whole reason this gate
  // is a subset rather than an equality. Progress notes cluster just over the
  // deck's threshold; at a card's width they are fragments.
  const rec = {
    schema: 4,
    prompts: [{ at: at(0), text: 'ask' }],
    replies: [{ at: at(1), text: 'Now let me check the thing. ' + long(400) },
              { at: at(3), text: 'Done, and here is what came of it.' }],
    calls: [{ at: at(2), name: 'Bash', ok: true }],
  };
  assert.equal(deckExpanded(rec).length, 2, 'the deck expands both');
  assert.equal(cardKeeps(rec).length, 0,
    'the card keeps neither: one is narration, the other is the closing reply');
});

test('the card never keeps a turn the deck folds', () => {
  // The failure this gate exists to catch. A card holding narration the deck
  // hides would be putting fragments on the surface with the least room for
  // them, while claiming to agree with the deck.
  const recs = [TYPICAL, {
    schema: 4,
    prompts: [{ at: at(0), text: 'ask' }, { at: at(6), text: 'again' }],
    replies: [{ at: at(1), text: 'Let me look.' },
              { at: at(3), text: 'Now the longer note. ' + long(400) },
              { at: at(5), text: long(900) },
              { at: at(7), text: 'closing' }],
    calls: [{ at: at(2), name: 'Read', ok: true }, { at: at(4), name: 'Bash', ok: true }],
  }];
  for (const r of recs) {
    const deck = new Set(asHeads(deckExpanded(r)));
    for (const kept of cardKeeps(r)) assert.ok(deck.has(kept), 'not in the deck: ' + kept);
  }
});

test('length does not enter the card\'s rule at all', () => {
  // The deck has a threshold; the card has none. Followed by calls is the whole
  // test, so there is no boundary here for a turn to sit awkwardly on.
  const mk = (n) => ({
    schema: 4,
    prompts: [{ at: at(0), text: 'ask' }],
    replies: [{ at: at(1), text: 'Sentence one. ' + long(n) }, { at: at(3), text: 'the answer' }],
    calls: [{ at: at(2), name: 'Bash', ok: true }],
  });
  for (const n of [10, 300, 3000]) assert.equal(cardKeeps(mk(n)).length, 0, `n=${n}`);
});

test('a short turn with nothing after it is an answer, and both keep it', () => {
  // "Done." is short and it is still the reply. Dropping on length alone would
  // lose the shortest answers in the store; what matters is what follows.
  const rec = {
    schema: 4,
    prompts: [{ at: at(0), text: 'ask' }, { at: at(3), text: 'again' }],
    replies: [{ at: at(2), text: 'Done.' }, { at: at(4), text: 'closing' }],
    calls: [{ at: at(1), name: 'Bash', ok: true }],
  };
  assert.deepEqual(deckExpanded(rec), ['Done.', 'closing']);
  assert.deepEqual(cardKeeps(rec), ['Done.'], 'kept, with the closing reply on the row');
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
  assert.deepEqual(deckExpanded(rec), [long(900)], 'the intro folded');
  assert.deepEqual(cardKeeps(rec), [], 'and the survivor is the closing reply');
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

test('an entry ends where a sentence does, not mid-word', () => {
  // The complaint this replaced: a hard slice at a character count landed
  // mid-word with nothing to mark it, so every entry read as damage. Whole
  // sentences while they fit is what makes a short entry look finished.
  const rec = {
    schema: 4,
    prompts: [{ at: at(0), text: 'the opener' }, { at: at(3), text: 'a follow-up ask' }],
    replies: [{ at: at(1), text: 'First sentence here. Second one follows. ' + long(500) },
              { at: at(4), text: 'closing' }],
    calls: [],
  };
  const [[, turn], [, ask]] = S.priorTurns(rec);
  assert.equal(turn, 'First sentence here. Second one follows.',
    'both whole sentences fit; the 500-character third does not, so it is left out');
  assert.ok(!turn.endsWith('…'), 'and nothing was cut, so nothing is marked');
  assert.equal(ask, 'a follow-up ask');
  // The cap ran the other way until 2026-08-28, on the argument that an ask
  // here was STRUCTURE and only had to separate one exchange from the next.
  // The card is a transcript now and the ask is the half a reader scans for,
  // so an ask cut shorter than the reply under it is the cut that costs them
  // the thread. Stated as a direction rather than a number, so either cap can
  // move without the other having to.
  assert.ok(S.PROMPT_HEAD >= S.TURN_HEAD,
    'an ask is what a reader scans for, so it is never the shorter of the two');
});

// ── How much is missing ─────────────────────────────────────────────────────
// An ellipsis says there is more and nothing about how much, which is the
// difference between a summary and a teaser.

test('a turn carried whole reports nothing missing', () => {
  // Counted in SENTENCES, not as a difference of two string lengths. Joining
  // sentences with one space normalises the paragraph breaks between them, so
  // the length difference marked a whole turn as trimmed by a character or
  // two. A false "trimmed" is worse than none.
  assert.deepEqual(S.head('Just this.', 240), { text: 'Just this.', dropped: 0 });
  assert.deepEqual(S.head('One here.\n\nTwo here.', 240),
    { text: 'One here. Two here.', dropped: 0 }, 'two paragraphs, nothing lost but the break');
});

test('what is missing is counted, whether the cap or the lead filter took it', () => {
  const cut = S.head('Short. ' + 'x'.repeat(300) + '.', 240);
  assert.equal(cut.text, 'Short.', 'the whole sentence that fit');
  assert.equal(cut.dropped, 301, 'and the one that did not');
  const lead = S.head('Working branch: abc\n\nThe finding.', 240);
  assert.equal(lead.text, 'The finding.');
  assert.equal(lead.dropped, 19, 'a skipped lead is still text the reader is not seeing');
});

test('the closing reply is carried WHOLE, alone among the turns', () => {
  // Every other entry is an opening, because the card is a scan. This one is
  // the thing being scanned for, so a cap on it was cutting the answer: the
  // median reply runs 746 characters against the 600 it used to be cut at.
  const long = 'A complete sentence here. ' + 'z'.repeat(4000) + '.';
  const rec = { schema: 4, replies: [{ at: at(1), text: long }] };
  assert.equal(S.closingReply(rec), long, 'byte for byte');
  assert.equal(S.replyPartial(rec), '', 'and nothing to claim about it');
});

test('whole is safe because the RECORD bounds it, not this cache', () => {
  // The recorder caps prose at 8 KB a turn. Measured over the 233 replies on
  // file 2026-08-27 the longest is 7,453 characters, nine are over 5,000 and
  // none over 10,000, so removing the cap here does not remove the bound.
  const rec = { schema: 4, replies: [{ at: at(1), text: 'x'.repeat(7453) }] };
  assert.equal(S.closingReply(rec).length, 7453);
});

test('a schema-3 record still says its text is only a tail', () => {
  // The one fidelity claim left, and the cache is not the one making the cut:
  // last_message is the recorder's own 500-character tail of the final turn.
  assert.equal(S.replyPartial({ schema: 3, last_message: 'the tail' }), 'tail');
  assert.equal(S.replyPartial({ schema: 4, replies: [{ at: at(1), text: 'whole' }] }), '');
});

test('a bold or code lead is the answer, not chrome, and survives', () => {
  // Measured over 13,921 assistant turns: the wide filter session-render uses
  // for outline TITLES fired on 717 and 641 of those were content, among them
  // "**95 of 95 match exactly.**" and 368 turns opening on a code span. A
  // preview showed the second sentence of a turn whose first was the finding.
  for (const lead of ['**95 of 95 match exactly.**', '`npm run showing` reads the branch.',
                      '# The finding.', '> Quoted, but still the answer.']) {
    assert.ok(S.head(lead + ' And then more.', 240).text.startsWith(lead.slice(0, 6)),
      'lost: ' + lead);
  }
});

test('an address IS chrome, and is still skipped', () => {
  assert.equal(S.head('Working branch: claude/x\n\nThe finding.', 240).text, 'The finding.');
  assert.equal(S.head('https://example.com/a\n\nThe finding.', 240).text, 'The finding.');
});

test('a turn carries its dropped count, and a whole one carries no field', () => {
  const rec = {
    schema: 4,
    prompts: [{ at: at(0), text: 'opener' }, { at: at(3), text: 'ask' }],
    replies: [{ at: at(1), text: 'Kept whole.' },
              { at: at(2), text: 'Kept. ' + 'q'.repeat(400) + '.' },
              { at: at(4), text: 'closing' }],
    calls: [],
  };
  const got = S.priorTurns(rec);
  assert.equal(got[0].length, 3, 'nothing dropped, so no fourth element to carry');
  assert.equal(got[1][3], 401, 'and the count where there is one');
});

test('a first sentence longer than the cap is cut at a word, and says so', () => {
  // The one case a boundary cannot be found: there is no earlier sentence to
  // fall back to. Cut at a word and mark it, rather than mid-word and silent.
  const rec = {
    schema: 4,
    prompts: [{ at: at(0), text: 'opener' }, { at: at(3), text: 'ask' }],
    replies: [{ at: at(1), text: 'alpha bravo '.repeat(60) }, { at: at(4), text: 'closing' }],
    calls: [],
  };
  const [[, turn, , dropped]] = S.priorTurns(rec);
  assert.ok(turn.endsWith('…'), 'marked: ' + turn);
  assert.ok(dropped > 0, 'and the amount is stated, not only that there is one');
  assert.ok(turn.length <= S.TURN_HEAD + 1, 'within the cap, plus the ellipsis');
  // Every word kept is a WHOLE word from the source: cap() drops the trailing
  // partial before appending the mark, which is the whole difference between a
  // cut that reads as a summary and one that reads as damage.
  const words = turn.replace(/…$/, '').trim().split(' ');
  assert.ok(words.every(x => x === 'alpha' || x === 'bravo'), 'no half word: ' + words.at(-1));
});

test('an entry does not open on chrome, so a branch anchor is skipped', () => {
  // Half this estate's replies open with a branch anchor or a bare link. Titled
  // by that, an entry says the address and nothing about the turn.
  const rec = {
    schema: 4,
    prompts: [{ at: at(0), text: 'opener' }, { at: at(3), text: 'ask' }],
    replies: [{ at: at(1), text: 'Working branch: claude/thing\n\nThe actual finding is here.' },
              { at: at(4), text: 'closing' }],
    calls: [],
  };
  assert.equal(S.priorTurns(rec)[0][1], 'The actual finding is here.');
});

// ── Attachments are not prose ───────────────────────────────────────────────
// The harness records an attached image as a prompt whose whole text is its own
// placeholder. 653 of the 3,895 prompts on file are these, every one of them
// placeholder-only, never a placeholder beside a sentence.

const IMG = (n) => '[Image: original 3000x1900, displayed at 2000x1267. '
  + 'Multiply coordinates by ' + n + ' to map to original image.]';

test('an image-only prompt is an attachment, not a sentence to mine', () => {
  // What it did before, and why it looked like a parsing bug: the placeholder
  // is two sentences to a splitter, the first is discarded as a noise lead
  // because it opens with a bracket, and the SECOND survived. The turn read
  // "Multiply coordinates by 1.50 to map to original image.]".
  const rec = {
    schema: 4,
    prompts: [{ at: at(0), text: 'opener' }, { at: at(2), text: IMG('1.50') }],
    replies: [{ at: at(1), text: 'first answer' }, { at: at(3), text: 'closing' }],
    calls: [],
  };
  const got = S.priorTurns(rec);
  assert.deepEqual(got.at(-1), ['u', '[image]', '10:02:00']);
  assert.ok(!got.some(([, t]) => /Multiply coordinates/.test(t)), 'no half-placeholder anywhere');
});

test('a run of attachments is one turn, counted, dated from its first', () => {
  // They arrive in runs because a person drops several screenshots into one
  // message: across the store 653 attachments fall into 299 runs, the longest
  // 13. One line each is thirteen identical lines saying nothing.
  const prompts = [{ at: at(0), text: 'opener' }];
  for (let i = 1; i <= 5; i++) prompts.push({ at: at(i), text: IMG('1.2' + i) });
  const rec = { schema: 4, prompts, replies: [{ at: at(9), text: 'closing' }], calls: [] };
  const got = S.priorTurns(rec);
  assert.deepEqual(got, [['u', '[5 images]', '10:01:00']],
    'one entry, the count, and the clock the run started on');
});

test('a run broken by words is two runs, not one', () => {
  const rec = {
    schema: 4,
    prompts: [{ at: at(0), text: 'opener' }, { at: at(1), text: IMG('1.2') },
              { at: at(2), text: 'and here is a question' }, { at: at(3), text: IMG('1.3') },
              { at: at(4), text: IMG('1.4') }],
    replies: [{ at: at(9), text: 'closing' }], calls: [],
  };
  assert.deepEqual(S.priorTurns(rec).map(([, t]) => t),
    ['[image]', 'and here is a question', '[2 images]']);
});

test('the cut note counts a run as the one entry it becomes', () => {
  // Counting attachments singly would report a cut the list does not make.
  const prompts = [{ at: at(0), text: 'opener' }];
  for (let i = 1; i <= 40; i++) prompts.push({ at: at(i), text: IMG('1.5') });
  const rec = { schema: 4, prompts, replies: [{ at: at(50), text: 'closing' }], calls: [] };
  assert.equal(S.priorTurns(rec).length, 1, 'forty attachments, one entry');
  assert.equal(S.turnsPartial(rec), '', 'so nothing was cut, and the card must not say it was');
});

test('a prompt with words is untouched by any of this', () => {
  const rec = {
    schema: 4,
    prompts: [{ at: at(0), text: 'opener' }, { at: at(2), text: 'a real question about images' }],
    replies: [{ at: at(1), text: 'first answer' }, { at: at(3), text: 'closing' }],
    calls: [],
  };
  assert.equal(S.priorTurns(rec).at(-1)[1], 'a real question about images');
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
