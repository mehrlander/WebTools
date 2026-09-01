// kits/session-export.js — open is selected.
//
// The picker used to carry a checkbox per card and per turn, so a reader ticked
// a row whose title was one truncated line and then expanded it to find out
// what they had picked. Reported 2026-09-01 from the phone. Expanding is the
// decision now, and collapsing is the deselect, which means one gesture stands
// for two things and the interesting failures are all the same shape: the two
// coming apart.
//
// So every test here is that invariant from a different side. A card opened by
// a tap, by "Open all", or by `startCard` must reach the same state, because
// three doors into one boolean is exactly where a DOM-held flag drifts from the
// set that decides the output. What is drawn, what is counted, and what lands
// on the clipboard all have to agree, on every path.
//
// jsdom with no Alpine: this is a DOM-rendering kit and its element is the
// whole product, so the assertions read the element rather than an internal.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, makeWindow } from './bootstrap.mjs';

// read-aloud is in the list because the row's reply preview reduces its
// markdown through it, and because session-brief's `ready()` now loads it
// before this view is built. A file that left it out would test the fallback
// and call it the behaviour.
const KITS = ['lib/kits/proof.js', 'lib/kits/swipe-deck.js', 'lib/kits/chat-render.js',
              'lib/kits/session-render.js', 'lib/kits/session-export.js',
              'lib/kits/read-aloud.js'];

// Two exchanges and a long one, so there is something to preview and something
// to leave out.
const LONG = 'The reply runs on. '.repeat(40);       // ~800 chars
const RECORD = {
  schema: 7, short: 'test1234', day: '2026-09-01',
  started: '2026-09-01T10:00:00Z', ended: '2026-09-01T11:00:00Z',
  repos: [{ name: 'web-tools', branch: 'claude/x' }],
  opening_ask: 'First ask',
  exchanges: 2, prompts_stored: 2,
  prompts: [{ at: '2026-09-01T10:00:00Z', text: 'First ask' },
            { at: '2026-09-01T10:30:00Z', text: 'Second ask' }],
  replies_total: 2, replies_stored: 2,
  replies: [{ at: '2026-09-01T10:05:00Z', text: LONG },
            { at: '2026-09-01T10:35:00Z', text: 'Short reply.' }],
  calls_total: 2,
  calls: [{ at: '2026-09-01T10:02:00Z', name: 'Bash', ok: true, arg: 'ls -la', body: 'a\nb' },
          { at: '2026-09-01T10:32:00Z', name: 'Bash', ok: true, arg: 'pwd', body: '/tmp' }],
};

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener(){}, removeEventListener(){} }));

// chat-render's ready() loads `marked` from a CDN, which never resolves here, so
// an open card would sit empty forever and the last three tests would be
// asserting a race rather than a rendering. Same stand-in the chat-render tests
// use, and it is enough: what is asserted below is that the markup came from
// that kit at all, not what its markdown parser makes of a paragraph.
const mdHtml = (md) => String(md).split(/\n{2,}/).map(x => `<p>${x}</p>`).join('');
window.marked = globalThis.marked = {
  lexer: (md) => String(md).split(/\n{2,}/).map(raw => ({ type: 'paragraph', raw })),
  parser: (toks) => mdHtml(toks.map(t => t.raw).join('\n\n')),
  parse: mdHtml,
};
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
window.esc = window.esc || (s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]));

for (const f of KITS) new window.Function(readFileSync(path.join(repoRoot, f), 'utf8'))();
const SE = window.sessionExport;
// The estate's Claude colour, in the form jsdom normalizes the hex to.
const CLAY = 'rgb(217, 119, 87)';   // #d97757

const build = (opts = {}) => {
  const view = SE.index(RECORD, opts);
  window.document.body.replaceChildren(view.el);
  return view;
};

// One exchange, two assistant turns, markdown in both: the fixture for the
// row's reply preview. Separate from RECORD so the card and turn counts every
// other test reads stay exactly where they are.
const MD_RECORD = {
  ...RECORD,
  exchanges: 1, prompts_stored: 1,
  prompts: [{ at: '2026-09-01T10:00:00Z', text: 'Only ask' }],
  replies_total: 2, replies_stored: 2,
  replies: [
    { at: '2026-09-01T10:01:00Z', text: 'Let me check where it stands rather than guess.' },
    { at: '2026-09-01T10:20:00Z',
      text: '**Short answer: no.** See [the registry](https://example.com/x) '
          + 'and `docs/registries.csv`.\n\n```bash\nls -la\n```' },
  ],
  calls_total: 0, calls: [],
};

const buildWith = (rec, opts = {}) => {
  const view = SE.index(rec, opts);
  window.document.body.replaceChildren(view.el);
  return view;
};

// The row is a two-column grid and every part of it is a DIRECT child, which
// is what puts the two glyphs in one gutter and the two texts on one edge.
const rowOf = (n = 1) => window.document.querySelector(`button[aria-label="Open card ${n}"]`);
const preview = (n = 1) => rowOf(n)?.querySelector('.line-clamp-1');
const mark = (n = 1) => rowOf(n)?.querySelector('.ph-sparkle');
const lead = (n = 1) => rowOf(n)?.querySelector('i.ph');
const askOf = (n = 1) => rowOf(n)?.querySelector(':scope > div');

// The row's own controls, read off the element the way a finger would find them.
// The row itself, which is what opens a card now. The turn-count pill beside
// it is a readout, not a second control.
const pills = () => [...window.document.querySelectorAll('button[aria-label^="Open card"]')];
const decks = () => [...window.document.querySelectorAll('button[aria-label*="in the deck"]')];
const chip = (label) => [...window.document.querySelectorAll('button')].find(b => b.textContent.trim() === label);
// WHICH ROWS ARE IN, read the way the row now says it. There was a tint behind
// the head, and it went through primary and then a neutral before both were
// dropped: this theme's greys are cool, so any step off the page washed the
// blue ask sitting on it. `aria-expanded` is what is left, and it was always
// the load-bearing half, since open IS selected.
const openRows = () => [...window.document.querySelectorAll('button[aria-expanded="true"]')];
const stat = () => window.document.querySelector('.tabular-nums.text-base-content\\/50')?.textContent || '';

test('nothing is open to begin with, so nothing is selected and the bar is away', () => {
  const v = build();
  assert.equal(v.selectedCount, 0);
  assert.equal(v.markdown(), '');
  assert.equal(openRows().length, 0);
  assert.ok(pills().length >= 2, 'a pill per card, which is what a reader taps');
});

test('opening a card selects it, and the markdown carries that card only', () => {
  const v = build();
  pills()[0].click();
  assert.ok(v.selectedCount > 0, 'the tap that expanded is the tap that selected');
  const md = v.markdown();
  assert.match(md, /First ask/);
  assert.doesNotMatch(md, /Second ask/, 'the card that stayed closed stayed out');
});

test('collapsing is the deselect, exactly undoing the open', () => {
  const v = build();
  pills()[0].click();
  const n = v.selectedCount;
  assert.ok(n > 0);
  pills()[0].click();
  assert.equal(v.selectedCount, 0, 'nothing left selected');
  assert.equal(v.markdown(), '', 'and nothing left to copy');
  assert.equal(openRows().length, 0, 'and the row stops saying it is in');
});

test('the row says which cards are in, so a scroll does not need a control column', () => {
  build();
  pills()[0].click();
  assert.equal(openRows().length, 1);
  pills()[1].click();
  assert.equal(openRows().length, 2);
  assert.equal(pills()[0].getAttribute('aria-expanded'), 'true');
});

test('the turn count is a readout and does not dress as a control', () => {
  build();
  // It was a bordered pill with a caret, which on this page is a dropdown, so
  // a reader tapped it for a list of turns and got the row's own expand
  // (reported 2026-09-01). The row is the control; nothing inside it may look
  // like a second one.
  const readout = [...pills()[0].querySelectorAll('span')].find(e => /\d+ turns?$/.test(e.textContent.trim()));
  assert.ok(readout, 'the count is still on the row');
  assert.doesNotMatch(readout.className, /\bborder\b|\bbtn\b|\brounded/, readout.className);
  assert.equal(readout.tagName, 'SPAN', 'and it is not a button');
  assert.ok(readout.querySelector('.ph-caret-down'), 'the caret stays: it is the state, not an affordance');
});

test('Open all and Close all move every card through the same door', () => {
  const v = build();
  chip('Open all').click();
  assert.equal(openRows().length, pills().length, 'every row marked');
  const all = v.markdown();
  assert.match(all, /First ask/);
  assert.match(all, /Second ask/);
  chip('Close all').click();
  assert.equal(v.selectedCount, 0);
  assert.equal(openRows().length, 0);
});

test('a tap after Open all closes just that card, not the whole set', () => {
  // The regression this guards: open state held in the DOM per row, with the
  // bulk chips writing the set directly, so the two disagree on the next tap.
  const v = build();
  chip('Open all').click();
  const every = v.selectedCount;
  pills()[0].click();
  assert.ok(v.selectedCount > 0 && v.selectedCount < every, 'one card left, the rest still in');
  assert.equal(openRows().length, pills().length - 1);
});

test('startCard opens the deck card, drawn and not merely recorded', () => {
  const v = build({ startCard: 1 });
  assert.equal(openRows().length, 1, 'the row is painted, so the reader can see what arrived open');
  assert.match(v.markdown(), /Second ask/);
  // Not "First ask": the header block titles the excerpt with the session's
  // opening ask whatever is selected, so the body is what to read here.
  assert.doesNotMatch(v.markdown(), /The reply runs on/, 'card 0 stayed out');
  assert.match(v.markdown(), /Short reply/);
});

test('the count is the size of what is about to be copied, and moves with it', () => {
  const v = build();
  assert.equal(stat(), '', 'nothing open, nothing claimed');
  pills()[0].click();
  const one = stat();
  assert.match(one, /^1 card · \d+ turns? · /);
  chip('Open all').click();
  assert.match(stat(), /^2 cards · /);
  assert.notEqual(stat(), one, 'it is a reading of the selection, not of the record');
});

test('the role toggles decide what comes with an open card', () => {
  // Not a render flag: emit() gives a tool turn a heading whatever the render
  // flags say, so excluding one has to happen in the selection.
  const withTools = build({ startCard: 0 });
  const a = withTools.markdown();
  assert.match(a, /ls -la/, 'a tool call rides along by default');

  const noTools = build({ startCard: 0, args: false, bodies: false });
  const b = noTools.markdown();
  assert.doesNotMatch(b, /ls -la/);
  assert.doesNotMatch(b, /call only/, 'the turn is dropped, not reduced to a stub heading');
  assert.match(b, /First ask/, 'and the ask is still there');

  const asksOnly = build({ startCard: 0, replies: false, args: false, bodies: false });
  assert.match(asksOnly.markdown(), /First ask/);
  assert.doesNotMatch(asksOnly.markdown(), /The reply runs on/);
});

// The card body is built after chat-render's ready() resolves, so a mount that
// only just opened has an empty box for a tick.
const drawn = () => new Promise(r => setTimeout(r, 30));

test('an open card is drawn by the deck\'s renderer, not by a second one here', async () => {
  // The whole point of the 2026-09-01 change: two drawings of one turn, met
  // within two taps of each other. If this file ever grows its own turn markup
  // again, the markdown stops being markdown and that is what fails first.
  build({ startCard: 0 });
  await drawn();
  const body = window.document.body;
  assert.ok(body.querySelector('p'), 'prose arrives as rendered markdown, which a plain-text row never produced');
  assert.ok(body.textContent.includes('The reply runs on'), 'and the reply is in it');
});

test('nothing this file draws survives beside it', async () => {
  build({ startCard: 0 });
  await drawn();
  const src = readFileSync(path.join(repoRoot, 'lib/kits/session-export.js'), 'utf8');
  assert.doesNotMatch(src, /function turnRow/, 'the second renderer is gone, not merely unused');
  assert.match(src, /SR\(\)\.card\(/, 'and the card body comes from session-render');
});

test('no checkbox survives anywhere in the list', () => {
  build();
  chip('Open all').click();
  const boxes = [...window.document.querySelectorAll('input[type="checkbox"]')]
    .filter(b => !b.closest('.hidden'));   // the Options row is collapsed, and owns the rest
  assert.deepEqual(boxes, [], 'the list selects by opening; only Options still has switches');
});

test('there is one list, and no route from the deck to a second copy of it', () => {
  // The loop: list -> deck -> a takeover holding the same list, so going
  // forward twice landed the reader back where they started. Reported three
  // times on 2026-09-01. `open()` had exactly one caller, the deck's own header
  // button, and both are gone; this is what stops either coming back.
  assert.equal(SE.open, undefined, 'the takeover is not an export any more');
  const exp = readFileSync(path.join(repoRoot, 'lib/kits/session-export.js'), 'utf8');
  assert.doesNotMatch(exp, /^\s*function open\(record/m, 'nor a function waiting to be re-exported');

  const render = readFileSync(path.join(repoRoot, 'lib/kits/session-render.js'), 'utf8');
  assert.doesNotMatch(render, /sessionExport\.open/, 'and the deck offers no door to one');

  // The list itself is untouched: it is still what every host mounts.
  assert.equal(typeof SE.index, 'function');
});

test('one control per destination: the item opens, the glyph decks', () => {
  // It was the other way round, with the title AND the glyph both entering the
  // deck and a pill doing the expanding: two doors to one place, and the third
  // hidden behind a chip.
  const opened = [];
  const v = SE.index(RECORD, { onOpen: (i) => opened.push(i) });
  window.document.body.replaceChildren(v.el);

  pills()[0].click();
  assert.deepEqual(opened, [], 'tapping the item does not leave for the deck');
  assert.equal(v.selectedCount > 0, true, 'it opens the card, which selects it');

  decks()[1].click();
  assert.deepEqual(opened, [1], 'and the glyph is the only way out to the deck');
});

test('the row carries the ask itself, clamped closed and whole open', async () => {
  build();
  const title = window.document.querySelector('button[aria-label="Open card 1"] .line-clamp-2');
  assert.ok(title, 'closed, the ask is clamped to two lines');
  // The trap that made the clamp inert for one commit: `block` and
  // `line-clamp-2` both set `display`, `block` won, and every row rendered
  // whole while still carrying the clamp class. jsdom compiles no Tailwind, so
  // the collision is what is assertable rather than the computed height.
  assert.ok(!title.classList.contains('block'),
    'no second display utility beside the clamp, which is what silenced it');
  assert.match(title.textContent, /^First ask/, 'and it is the ask, not a title derived from it');
  pills()[0].click();
  await drawn();
  assert.ok(!window.document.querySelector('button[aria-label="Open card 1"] .line-clamp-2'),
    'open, the clamp comes off rather than a second copy appearing below');
});

test('what opens is the reply, not the whole card again', async () => {
  build();
  pills()[0].click();
  await drawn();
  const body = window.document.body.textContent;
  assert.ok(body.includes('The reply runs on'), 'the prose that answers');
  // The ask is above, unclamped, so it is not repeated; the tool run is already
  // summarised on the row; and the record's capture note belongs to the deck's
  // first card, not under every row here.
  assert.ok(!body.includes('does not hold'), 'no capture note');
  assert.ok(!body.includes('ls -la'), 'no tool turns, which the row already counts');
  assert.equal((body.match(/First ask/g) || []).length, 1, 'and the ask appears once');
});

// ── The reply on the surface ────────────────────────────────────────────────
//
// Reported 2026-09-01, from the phone: every closed row said "You" and showed
// the ask, so the list read as half a conversation and what came back was a tap
// away. The row carries one line of the reply now, and these hold the three
// decisions inside that line.

test('the closed row previews the reply, and it is the LAST one', () => {
  buildWith(MD_RECORD);
  const p = preview();
  assert.ok(p, 'a closed row shows a line of what came back');
  assert.match(p.textContent, /Short answer: no\./);
  // A work exchange opens with the sentence that introduces the work, which
  // says nothing about how it turned out. The last turn is the answer.
  assert.doesNotMatch(p.textContent, /Let me check/, 'not the turn that only announced the work');
});

test('the preview is prose, not markdown', () => {
  buildWith(MD_RECORD);
  const t = preview().textContent;
  assert.doesNotMatch(t, /\*\*/, 'no emphasis markers');
  assert.doesNotMatch(t, /`/, 'no code ticks');
  assert.doesNotMatch(t, /https?:/, 'no URL');
  assert.match(t, /the registry/, 'the link keeps its label');
  assert.match(t, /registries\.csv/, 'and a path code span keeps the name');
  assert.doesNotMatch(t, /ls -la/, 'the fence is not read out on a one-line preview');
});

test('the clamp is on the text, and nothing else on that element sets display', () => {
  buildWith(MD_RECORD);
  // `flex` and `line-clamp-1` both set `display`, and one of them wins: the
  // same collision that silenced the ask's clamp, one line lower. jsdom
  // compiles no Tailwind, so the collision is what is assertable.
  for (const c of ['flex', 'block', 'inline-flex', 'grid', 'hidden'])
    assert.ok(!preview().classList.contains(c), `no ${c} beside the clamp`);
});

test('the answer is marked by the glyph alone, and set apart from the ask', () => {
  buildWith(MD_RECORD);
  // It carried the word `Claude` on a header line of its own for one commit,
  // which on a list is a column of the same fact down every row, in the space
  // the answer was going to use. The deck's dense mode drops the role word for
  // both chat roles and this follows it.
  assert.equal(mark().style.color, CLAY, 'in Claude\'s own clay, as everywhere else in the estate');
  assert.doesNotMatch(rowOf().textContent, /\bClaude\b(?!'s)/, 'the glyph says it, not a word');
  assert.ok(preview().classList.contains('mt-1.5'), 'with air between the fill above and the answer');
});

test('one gutter, one edge: the row is a grid and every part is a direct child', () => {
  buildWith(MD_RECORD);
  const row = rowOf();
  // The reply's mark used to sit INSIDE the text column, so the ask started at
  // the column edge and the answer started a glyph and a gap further in. The
  // Activity popover, which is chatRender's dense mode, puts every glyph in one
  // gutter and every text on one edge; a fixed first track is what makes that
  // exact rather than close. jsdom lays nothing out, so what is assertable is
  // the structure that produces it.
  assert.ok(row.classList.contains('grid'));
  assert.match(row.style.gridTemplateColumns, /^\d+px minmax\(0, ?1fr\)$/, row.style.gridTemplateColumns);
  const kids = [...row.children];
  assert.ok(kids.includes(lead()), 'the ask glyph is a cell, not a nested lead');
  assert.ok(kids.includes(mark()), 'and so is the reply glyph, in the same column');
  assert.ok(kids.includes(askOf()) && kids.includes(preview()), 'both texts in the second');
  assert.ok(!askOf().contains(mark()), 'the reply mark is out of the ask column, which is the whole fix');
  assert.ok(row.querySelector('.col-start-2'), 'and the facts line joins them on that edge');
});

test('the gutter carries the role, and the number is gone from the page', () => {
  buildWith(MD_RECORD);
  const g = lead();
  assert.ok(g.classList.contains('ph-user'), 'an ask is a user turn whatever the card kind says');
  assert.match(g.style.color, /--color-primary/);
  // The index survives where it was doing work rather than on the page: a mono
  // column of digits the eye skipped to reach the sentence.
  assert.doesNotMatch(rowOf().textContent, /^\s*\d/, 'no number opens the row');
  // It survives on the aria-label, which is how every test in this file, and
  // the deck button beside the row, name a card.
  assert.equal(rowOf().getAttribute('aria-label'), 'Open card 1');
});

test('a card with no ask takes its own role glyph', () => {
  // The capture note is a note and the closing summary is Claude speaking,
  // which is what the gutter has to say where there is no blue block to say it.
  buildWith({ ...MD_RECORD, prompts: [], prompts_stored: 0, exchanges: 0 });
  assert.ok(!lead().classList.contains('ph-user'));
});

test('the ask takes the blue, and nothing else on the row does', () => {
  buildWith(MD_RECORD);
  const ask = askOf();
  // The same convention chatRender.message uses in dense mode, which is what
  // the deck's slide body and the Activity popover both render through.
  assert.match(ask.style.background, /--color-primary/);
  assert.equal(ask.style.borderRadius, '3px');
  assert.ok(ask.classList.contains('w-fit'), 'so a short ask hugs its words');
  assert.ok(ask.classList.contains('max-w-full'), 'and a long one caps at the column and wraps');

  // ONE ACCENT, AND NOTHING BEHIND IT. The open row was tinted, first at
  // bg-primary/10 and then at a neutral, and both washed the ask sitting on
  // them: the greys in this theme are cool, so there is no step off the page
  // that is not a little blue. The band is gone, and what it was covering is
  // covered better by the expansion itself.
  chip('Open all').click();
  const painted = [...window.document.querySelectorAll('[class*="bg-"]')]
    .filter(el => /\bbg-(primary|base-(200|300))\b|\bbg-\w+\/\d/.test(el.className));
  assert.deepEqual(painted.map(el => el.className), [], 'no row carries a fill but the ask');
  assert.ok(openRows().length >= 1, 'and open is still readable off the row');
});

test('a card with no ask takes no fill, and keeps its role word', () => {
  // The closing summary and the capture note have no user turn: the row shows
  // the titler's line, which is not something anybody said, so tinting it
  // would be the mark claiming an author it does not have.
  buildWith({ ...MD_RECORD, prompts: [], prompts_stored: 0, exchanges: 0 });
  const ask = askOf();
  assert.equal(ask.style.background, '');
  assert.ok(ask.classList.contains('w-full'));
  assert.match(window.document.querySelector('button[aria-label="Open card 1"]').textContent, /Claude|Note/);
});

test('opening the card takes the preview away, so nothing is on screen twice', async () => {
  buildWith(MD_RECORD);
  pills()[0].click();
  await drawn();
  // BY STYLE, NOT BY `hidden`: that utility sets `display` and so does
  // `line-clamp-1`, which is the collision this file has shipped twice. An
  // inline display beats both, and '' hands the clamp back its own.
  assert.equal(preview().style.display, 'none',
    'the replies render in full below, and a one-line copy of the last would be the same words twice');
  assert.equal(mark().style.display, 'none', 'and its glyph goes with it, or the gutter keeps a mark to nothing');
  pills()[0].click();
  assert.equal(preview().style.display, '', 'and it comes back on the close');
  assert.equal(mark().style.display, '');
});

test('the closed row no longer labels the half a reader can see', () => {
  buildWith(MD_RECORD);
  const row = window.document.querySelector('button[aria-label="Open card 1"]');
  assert.doesNotMatch(row.textContent, /\bYou\b/,
    'with both halves present the ask is the lead, so a role word sat between them saying nothing');
});

test('without the kit the row still previews, markers and all', () => {
  // The fallback is deliberate and it is the worse copy: raw text reads badly
  // and is never wrong, where an empty row would lose the half this exists to
  // show. session-brief loads the kit; a host that does not still gets a line.
  const kit = window.readAloud;
  try {
    delete window.readAloud;
    buildWith(MD_RECORD);
    assert.match(preview().textContent, /\*\*Short answer: no\.\*\*/);
  } finally { window.readAloud = kit; }
});
