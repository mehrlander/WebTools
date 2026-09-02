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
              'lib/kits/closing-state.js',
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
const rowOf = (n = 1) => window.document.querySelector(`[data-card="${n}"]`);
const preview = (n = 1) => rowOf(n)?.querySelector('.line-clamp-1');
const mark = (n = 1) => rowOf(n)?.querySelector('.ph-sparkle');
const lead = (n = 1) => rowOf(n)?.querySelector('i.ph');
const askOf = (n = 1) => rowOf(n)?.querySelector(':scope > div');

// The row's own controls, read off the element the way a finger would find them.
// PICKING IS ITS OWN CONTROL AGAIN, as of 2026-09-02. It rode the expansion,
// because a checkbox beside a one-line truncated title asked the reader to
// choose from too little and the expansion was the detail. Nothing expands now:
// the ask and the reply each open a panel carrying their own half whole, which
// is that detail, and they took the row's tap with them.
const pills = () => [...window.document.querySelectorAll('button[aria-label^="Include card"]')];
const decks = () => [...window.document.querySelectorAll('button[aria-label*="in the deck"]')];
const chip = (label) => [...window.document.querySelectorAll('button')].find(b => b.textContent.trim() === label);
// WHICH ROWS ARE IN. There was a tint behind the head, and it went through
// primary and then a neutral before both were dropped: this theme's greys are
// cool, so any step off the page washed the blue ask sitting on it. The pick
// button's own pressed state is what says it, with an inset ring on the card so
// a lit icon is not the only mark across twenty rows.
const openRows = () => [...window.document.querySelectorAll('button[aria-pressed="true"]')];
// The panel, and the two triggers that open it.
const peekOf = (n = 1) => boxOf(n)?.querySelector('.shadow-xl');
const trigs = (n = 1) => [...(rowOf(n)?.querySelectorAll('[role="button"]') || [])];
const stat = () => window.document.querySelector('.tabular-nums.text-base-content\\/50')?.textContent || '';

test('nothing is picked to begin with, so nothing is selected and the bar is away', () => {
  const v = build();
  assert.equal(v.selectedCount, 0);
  assert.equal(v.markdown(), '');
  assert.equal(openRows().length, 0);
  assert.ok(pills().length >= 2, 'a pick per card, which is what a reader taps');
});

test('picking a card selects it, and the markdown carries that card only', () => {
  const v = build();
  pills()[0].click();
  assert.ok(v.selectedCount > 0, 'the tap that picked is the tap that selected');
  const md = v.markdown();
  assert.match(md, /First ask/);
  assert.doesNotMatch(md, /Second ask/, 'the card that stayed closed stayed out');
});

test('a second tap is the deselect, exactly undoing the pick', () => {
  const v = build();
  pills()[0].click();
  const n = v.selectedCount;
  assert.ok(n > 0);
  pills()[0].click();
  assert.equal(v.selectedCount, 0, 'nothing left selected');
  assert.equal(v.markdown(), '', 'and nothing left to copy');
  assert.equal(openRows().length, 0, 'and the row stops saying it is in');
});

test('the row says which cards are in, so a scroll does not need a second column', () => {
  build();
  pills()[0].click();
  assert.equal(openRows().length, 1);
  pills()[1].click();
  assert.equal(openRows().length, 2);
  assert.equal(pills()[0].getAttribute('aria-pressed'), 'true');
});

test('the turn count is a readout and does not dress as a control', () => {
  build();
  // It was a bordered pill with a caret, which on this page is a dropdown, so
  // a reader tapped it for a list of turns and got the row's own expand
  // (reported 2026-09-01). The row is the control; nothing inside it may look
  // like a second one.
  const readout = [...rowOf(1).querySelectorAll('span')].find(e => /\d+ turns?$/.test(e.textContent.trim()));
  assert.ok(readout, 'the count is still on the row');
  assert.doesNotMatch(readout.className, /\bborder\b|\bbtn\b|\brounded/, readout.className);
  assert.equal(readout.tagName, 'SPAN', 'and it is not a button');
  // AND THE CARET IS GONE WITH THE EXPANSION. It was the row's open state; with
  // nothing opening it pointed at nothing, which is the same defect one step on.
  assert.equal(readout.querySelector('.ph-caret-down'), null);
  assert.equal(readout.querySelector('.ph-caret-up'), null);
});

test('Pick all and Clear move every card through the same door', () => {
  const v = build();
  chip('Pick all').click();
  assert.equal(openRows().length, pills().length, 'every row marked');
  const all = v.markdown();
  assert.match(all, /First ask/);
  assert.match(all, /Second ask/);
  chip('Clear').click();
  assert.equal(v.selectedCount, 0);
  assert.equal(openRows().length, 0);
});

test('a tap after Pick all drops just that card, not the whole set', () => {
  // The regression this guards: open state held in the DOM per row, with the
  // bulk chips writing the set directly, so the two disagree on the next tap.
  const v = build();
  chip('Pick all').click();
  const every = v.selectedCount;
  pills()[0].click();
  assert.ok(v.selectedCount > 0 && v.selectedCount < every, 'one card left, the rest still in');
  assert.equal(openRows().length, pills().length - 1);
});

test('startCard picks the deck card, drawn and not merely recorded', () => {
  const v = build({ startCard: 1 });
  assert.equal(openRows().length, 1, 'the row is painted, so the reader can see what arrived picked');
  assert.match(v.markdown(), /Second ask/);
  // Not "First ask": the header block titles the excerpt with the session's
  // opening ask whatever is selected, so the body is what to read here.
  assert.doesNotMatch(v.markdown(), /The reply runs on/, 'card 0 stayed out');
  assert.match(v.markdown(), /Short reply/);
});

test('the count is the size of what is about to be copied, and moves with it', () => {
  const v = build();
  assert.equal(stat(), '', 'nothing picked, nothing claimed');
  pills()[0].click();
  const one = stat();
  assert.match(one, /^1 card · \d+ turns? · /);
  chip('Pick all').click();
  assert.match(stat(), /^2 cards · /);
  assert.notEqual(stat(), one, 'it is a reading of the selection, not of the record');
});

test('the role toggles decide what comes with a picked card', () => {
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

test('a peeked half is drawn by the deck\'s renderer, not by a second one here', async () => {
  // The whole point of the 2026-09-01 change: two drawings of one turn, met
  // within two taps of each other. If this file ever grows its own turn markup
  // again, the markdown stops being markdown and that is what fails first.
  build();
  trigs(1)[1].click();                       // the reply line
  await drawn();
  const panel = peekOf(1);
  assert.ok(panel, 'the panel is hung on the card that owns the half');
  assert.ok(panel.querySelector('p'), 'prose arrives as rendered markdown, which a plain-text row never produced');
  assert.ok(panel.textContent.includes('The reply runs on'), 'and the reply is in it');
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
  chip('Pick all').click();
  const boxes = [...window.document.querySelectorAll('input[type="checkbox"]')]
    .filter(b => !b.closest('.hidden'));   // the Options row is collapsed, and owns the rest
  assert.deepEqual(boxes, [], 'the pick is an icon toggle; only Options still has switches');
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

test('one control per destination: the text peeks, the glyph decks, the ring picks', () => {
  // It was the other way round, with the title AND the glyph both entering the
  // deck and a pill doing the expanding: two doors to one place, and the third
  // hidden behind a chip. Three destinations now, and each has exactly one.
  const opened = [];
  const v = SE.index(RECORD, { onOpen: (i) => opened.push(i) });
  window.document.body.replaceChildren(v.el);

  trigs(1)[0].click();
  assert.deepEqual(opened, [], 'tapping a half does not leave for the deck');
  assert.equal(v.selectedCount, 0, 'nor does it pick: reading and picking are separate now');
  pills()[0].click();
  assert.equal(v.selectedCount > 0, true, 'the pick is what selects');

  decks()[1].click();
  assert.deepEqual(opened, [1], 'and the glyph is the only way out to the deck');
});

test('the row carries the ask itself, clamped, and the panel carries it whole', async () => {
  build();
  const title = rowOf(1).querySelector('.line-clamp-2');
  assert.ok(title, 'closed, the ask is clamped to two lines');
  // The trap that made the clamp inert for one commit: `block` and
  // `line-clamp-2` both set `display`, `block` won, and every row rendered
  // whole while still carrying the clamp class. jsdom compiles no Tailwind, so
  // the collision is what is assertable rather than the computed height.
  assert.ok(!title.classList.contains('block'),
    'no second display utility beside the clamp, which is what silenced it');
  assert.match(title.textContent, /^First ask/, 'and it is the ask, not a title derived from it');
  // THE CLAMP NEVER COMES OFF NOW. The row stopped expanding on 2026-09-02, so
  // its lines stay one and two lines forever and the whole text is a panel away.
  trigs(1)[0].click();
  await drawn();
  assert.ok(rowOf(1).querySelector('.line-clamp-2'), 'the row is unchanged by a peek');
  assert.match(peekOf(1).textContent, /First ask/, 'and the panel has it whole');
});

test('what the reply\'s panel carries is the reply, not the whole card again', async () => {
  build();
  trigs(1)[1].click();
  await drawn();
  const body = peekOf(1).textContent;
  assert.ok(body.includes('The reply runs on'), 'the prose that answers');
  // The ask is above, unclamped, so it is not repeated; the tool run is already
  // summarised on the row; and the record's capture note belongs to the deck's
  // first card, not under every row here.
  assert.ok(!body.includes('does not hold'), 'no capture note');
  assert.ok(!body.includes('ls -la'), 'no tool turns, which the row already counts');
  assert.equal((body.match(/First ask/g) || []).length, 0, 'and the ask is the other panel');
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
  // It survives where it was doing work: `data-card` on the row, and the
  // aria-labels of the two buttons in the rail beside it.
  assert.equal(rowOf().getAttribute('data-card'), '1');
  assert.equal(pills()[0].getAttribute('aria-label'), 'Include card 1 in the excerpt');
});

test('a card with no ask takes its own role glyph, and the heavier line', () => {
  // The capture note is a note and the closing summary is Claude speaking,
  // which is what the gutter has to say where there is no blue block to say it.
  // The weight goes with it: with no prompt, the titler's sentence IS the
  // card's heading, so this is the one place the heavier setting survives.
  buildWith({ ...MD_RECORD, prompts: [], prompts_stored: 0, exchanges: 0 });
  assert.ok(!lead().classList.contains('ph-user'));
  const title = window.document.querySelector('[data-card] > div');
  assert.ok(title.className.includes('font-medium'));
  assert.equal(title.style.background, '', 'and no fill, since nothing was asked');
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
  chip('Pick all').click();
  const painted = [...window.document.querySelectorAll('[class*="bg-"]')]
    .filter(el => /\bbg-(primary|base-(200|300))\b|\bbg-\w+\/\d/.test(el.className));
  assert.deepEqual(painted.map(el => el.className), [], 'no row carries a fill but the ask');
  assert.ok(openRows().length >= 1, 'and picked is still readable off the row');
});

test('a picked card is scoped by an edge, and only a picked one', () => {
  // It scoped the OPEN card for one commit; with nothing opening it scopes the
  // picked one, which is what needs a scope once the bar is counting. NOT A
  // BAND: a tint behind the head is what this had before, through primary and
  // then a neutral, and both washed the ask sitting on them. An inset ring
  // draws the edge and takes no layout, so the grid's alignment is untouched.
  buildWith(STATEFUL);
  const boxes = () => [...window.document.querySelectorAll('.mb-0\\.5.pl-3')];
  assert.equal(boxes().filter(b => b.style.boxShadow).length, 0, 'nothing is scoped shut');
  boxes()[0].querySelector('button[aria-label^="Include card"]')
    .dispatchEvent(new window.Event('click'));
  const ringed = boxes().filter(b => b.style.boxShadow);
  assert.equal(ringed.length, 1, 'exactly the card that was picked');
  assert.match(ringed[0].style.boxShadow, /inset/);
  assert.ok(ringed[0].className.includes('rounded-lg'));
  // And no fill anywhere, which is the answer this replaced twice.
  for (const b of boxes()) assert.equal(b.style.background, '');
});

test('the panel is bounded, so a long half stays a panel in the list', () => {
  // The row expanded in place until 2026-09-02 and opened to nine screens of
  // reply, so the row that was tapped scrolled off the top and the list under
  // it was unreachable without dragging past it all. The panel is capped, and
  // it overlays rather than pushing, so the list never moves at all.
  buildWith(STATEFUL);
  trigs(1)[0].click();
  const panel = peekOf(1);
  assert.ok(panel.className.includes('overflow-y-auto'));
  assert.match(panel.className, /max-h-\[min\(60vh,26rem\)\]/);
  assert.ok(panel.className.includes('absolute'), 'it overlays, so nothing below it moves');
  assert.equal(panel.parentElement, boxOf(1), 'hung on the card that owns the half');
});

test('every ask is set the same, whatever the exchange did', () => {
  // The title keyed on `kind` until 2026-09-02: quiet for an exchange that ran
  // tools, `font-medium` a notch larger for one that did not. So two of the
  // reader's own prompts sat on one screen in two weights for a reason about
  // neither of them, and the row already prints that reason in words as the
  // tool tally. Reported from the phone as the ask being bold "for some
  // reason", which is what it was.
  buildWith(STATEFUL);
  const titles = [...window.document.querySelectorAll('.mb-0\\.5.py-1.pl-3')]
    .map(b => b.querySelector('[data-card] > div'))
    .filter(t => t && t.style.background);          // the asks: a fill is the tell
  assert.ok(titles.length >= 3, 'several asks are drawn');
  for (const t of titles) {
    assert.ok(t.className.includes('font-normal'), 'no ask is set heavier than another');
    assert.ok(!t.className.includes('font-medium'));
    assert.ok(t.className.includes('text-[14px]'));
  }
});

test('a card with no ask takes no fill, and keeps its role word', () => {
  // The closing summary and the capture note have no user turn: the row shows
  // the titler's line, which is not something anybody said, so tinting it
  // would be the mark claiming an author it does not have.
  buildWith({ ...MD_RECORD, prompts: [], prompts_stored: 0, exchanges: 0 });
  const ask = askOf();
  assert.equal(ask.style.background, '');
  assert.ok(ask.classList.contains('w-full'));
  assert.match(rowOf(1).textContent, /Claude|Note/);
});

test('the row is unchanged by a peek, because the panel overlays it', async () => {
  // The expansion withdrew the preview, since the replies rendered under it in
  // full and a one-line copy of the last would have been the same words twice.
  // A panel is over the row rather than in it, so there is nothing to withdraw
  // and no display to toggle: the collision `hidden` and `line-clamp-1` had
  // over `display`, shipped twice in this file, has no site left here.
  buildWith(MD_RECORD);
  const before = rowOf(1).innerHTML;
  trigs(1)[1].click();
  await drawn();
  assert.equal(preview().style.display, '', 'the preview stays put');
  assert.equal(mark().style.display, '', 'and so does its glyph');
  assert.equal(rowOf(1).innerHTML.replace(/ aria-expanded="[^"]*"/g, ''),
               before.replace(/ aria-expanded="[^"]*"/g, ''),
               'nothing about the row moves but the trigger saying it is open');
});

test('the closed row no longer labels the half a reader can see', () => {
  buildWith(MD_RECORD);
  const row = rowOf(1);
  assert.doesNotMatch(row.textContent, /\bYou\b/,
    'with both halves present the ask is the lead, so a role word sat between them saying nothing');
});

test('without the kit the row still previews, and the emphasis still lands', () => {
  // The fallback is deliberate and it is the worse copy: raw text reads badly
  // and is never wrong, where an empty row would lose the half this exists to
  // show. session-brief loads the kit; a host that does not still gets a line.
  // The emphasis is not part of that fallback: splitting on `**` is this file's
  // own and runs whether or not the reduction does, so the kitless row loses
  // the link targets and the fences and keeps the bold.
  const kit = window.readAloud;
  try {
    delete window.readAloud;
    buildWith(MD_RECORD);
    assert.match(preview().textContent, /^Short answer: no\./);
    assert.equal(preview().querySelector('span.font-semibold').textContent, 'Short answer: no.');
  } finally { window.readAloud = kit; }
});

test('the panel takes the card\'s measure, not the row\'s', async () => {
  buildWith(MD_RECORD);
  trigs(1)[1].click();
  await drawn();
  // The open body used to be a cell of the head, pinned to the ask's column so
  // the two wrapped on one measure. A panel has no such constraint and wants
  // the opposite: it is the reading surface, so it spans the whole card rather
  // than stopping short by whatever the rail takes. jsdom lays nothing out, so
  // the structure that produces it is the assertion.
  const panel = peekOf(1);
  assert.equal(panel.parentElement, boxOf(1), 'a child of the card, not of the row or the head');
  assert.match(panel.className, /\bleft-2\b/);
  assert.match(panel.className, /\bright-2\b/);
  assert.ok(rowOf(1).parentElement.style.gridTemplateColumns.includes('auto'),
    'and the row keeps its own two-track head for the rail');
});

// ── Where the exchange arrived ──────────────────────────────────────────────
//
// The left edge keyed on `kind` until 2026-09-02: blue down the asks, clay down
// the replies, nothing beside the work. It marked a subset of the rows in the
// same two colours the row already spends, and the distinction it drew
// (`calls === 0`) is printed on the row in words as the tool tally.
//
// What the row carries now is the conventions' closing state, and it took three
// readings in one day to land. A full-height 2px rail: adjacent rows drew one
// unbroken line and the rhythm was muted to 0.4, which is where 2px of green
// stops reading as green. A dot in the box's left pad: bounded and legible, but
// hung at the height of the ask, so the ASSISTANT's claim about where the work
// arrived sat on the row carrying what the READER said. A line under the reply,
// which is where it belongs and is also the only one of the three that can
// print what the exchange arrived AT rather than only that it arrived.

const STATEFUL = {
  ...RECORD,
  exchanges: 3, prompts_stored: 3,
  prompts: [{ at: '2026-09-01T10:00:00Z', text: 'First ask' },
            { at: '2026-09-01T10:30:00Z', text: 'Second ask' },
            { at: '2026-09-01T11:00:00Z', text: 'Third ask' }],
  replies_total: 4, replies_stored: 4,
  replies: [
    { at: '2026-09-01T10:05:00Z', text: 'Did it.\n\n🟢 **Ready to continue.** The first offer.' },
    // A second turn in the SAME exchange, closing on the same state: one line,
    // and it is this one.
    { at: '2026-09-01T10:10:00Z', text: 'And again.\n\n🟢 **Ready to continue.** The live offer.' },
    { at: '2026-09-01T10:35:00Z', text: 'Two ways.\n\n🆚 **Choice needed.** Pick one.\n\n🟢 **Ready.** Or go.' },
    { at: '2026-09-01T11:05:00Z', text: 'No state here at all.' },
  ],
  calls_total: 0, calls: [],
};

const boxOf = (n = 1) => [...window.document.querySelectorAll('.mb-0\\.5.py-1.pl-3')][n - 1];
const statesOf = (n = 1) => {
  const row = boxOf(n)?.querySelector('[data-card]');
  return [...(row?.querySelectorAll('span.rounded-full') || [])]
    .map(mark => ({ mark, line: mark.nextElementSibling }));
};

test('a closing state is a line under the reply, in the reply\'s own words', () => {
  buildWith(STATEFUL);
  assert.equal(statesOf(1).length, 1, 'a card that closed once draws one line');
  assert.equal(statesOf(2).length, 2, 'and a card that closed twice draws two, in order');
  assert.equal(statesOf(3).length, 0, 'a card that closed on nothing draws nothing');
  // The order is the exchange's, so a decision put and then acted on reads
  // top to bottom the way it happened.
  assert.match(statesOf(2)[0].line.textContent, /^Choice needed\. Pick one\./);
  assert.match(statesOf(2)[1].line.textContent, /^Ready\. Or go\./);
});

test('the bold lead stays, because the row has to survive without its colour', () => {
  // Dropped, the 🆚 line reads "Pick one." and the only thing saying a decision
  // was put to the reader is a pink dot.
  buildWith(STATEFUL);
  assert.match(statesOf(2)[0].line.textContent, /Choice needed/);
  // The markers go, since this runs through the same speechText pass the reply
  // preview does, but what they marked is set bold rather than flattened.
  assert.doesNotMatch(statesOf(2)[0].line.textContent, /\*\*/);
  const strong = statesOf(2)[0].line.querySelector('span.font-semibold');
  assert.equal(strong.textContent, 'Choice needed.');
});

test('a reduced line keeps every emphasis, and the space either side of it', () => {
  // speechText takes `**` off with the fences and the link targets, which is
  // right for a voice and wrong for a row: what an author set bold is the half
  // a reader scans for. It also trims, and emphasis puts the space on the
  // OUTSIDE of the marker, so `Yes. **A term…**` splits into a run ending in a
  // space and a bold run starting with a letter. Testing only the incoming run
  // rendered "Yes.A term that names".
  buildWith({
    ...STATEFUL,
    replies: [{ at: '2026-09-01T10:05:00Z',
                text: 'Yes. **A term that names an intention.** And more after it.'
                      + '\n\n🟢 **Ready to continue.** Go.' }],
    replies_total: 1, replies_stored: 1,
  });
  const box = [...window.document.querySelectorAll('.mb-0\\.5.py-1.pl-3')][0];
  const preview = [...box.querySelectorAll('span.line-clamp-1')][0];
  assert.match(preview.textContent, /^Yes\. A term that names an intention\. And more/);
  assert.equal(preview.querySelector('span.font-semibold').textContent,
               'A term that names an intention.');
});

test('two closings on one state are one line, and it is the later claim', () => {
  // Two assistant turns in one exchange both offering to continue are two
  // versions of one offer, not two offers.
  buildWith(STATEFUL);
  assert.equal(statesOf(1).length, 1);
  assert.match(statesOf(1)[0].line.textContent, /The live offer/);
  assert.doesNotMatch(statesOf(1)[0].line.textContent, /The first offer/);
});

test('the state line is nested under the reply, not drawn as its sibling', () => {
  // It was absolutely positioned in the box's left pad, then a grid child of
  // the row itself, which put it in the track the user and sparkle glyphs
  // occupy and made it read as a third turn. It is not one: a closing state is
  // a passage INSIDE the reply above it. So it rides a nested grid in the
  // row's second column, one 17px step in, which is chat-render's LEAD_INDENT
  // and the measure the open body already hangs on.
  buildWith(STATEFUL);
  const { mark } = statesOf(1)[0];
  const wrap = mark.parentElement;
  assert.ok(wrap.className.includes('col-start-2'), 'in the text column, not the gutter');
  assert.ok(wrap.parentElement.hasAttribute('data-card'));
  assert.match(wrap.getAttribute('style'), /grid-template-columns:11px/);
  assert.ok(mark.className.includes('rounded-full') && mark.className.includes('size-[6px]'));
  assert.equal(mark.style.background, 'rgb(63, 185, 80)', "🟢's own green");
  assert.equal(mark.style.opacity, '', 'and nothing is dimmed: the disc is small, not quiet');
});

test('the disc opens nothing, because it is inside the row\'s own button', () => {
  // It carried `data-note` while it was a bare dot in the box's pad, outside
  // any control. Inside the button, the note kit's capture-phase pointerdown
  // does not stop propagation, so one tap would open a panel AND expand the
  // card. The words beside it carry the gloss instead.
  buildWith(STATEFUL);
  const { mark } = statesOf(1)[0];
  assert.equal(mark.getAttribute('data-note'), null);
  assert.equal(mark.getAttribute('title'), null, 'and it is not a tooltip either');
  assert.equal(mark.getAttribute('aria-hidden'), 'true', 'the line beside it says the same thing');
});

test('the state line opens the REPLY\'s panel, because that is what it is', () => {
  // It is a passage inside the reply, which is why it is indented under it; a
  // third panel for it would be a third speaker again.
  buildWith(STATEFUL);
  const { mark } = statesOf(1)[0];
  const wrap = mark.parentElement;
  assert.equal(wrap.getAttribute('role'), 'button');
  wrap.dispatchEvent(new window.Event('click'));
  assert.ok(peekOf(1), 'a panel opened');
  assert.match(peekOf(1).textContent, /^Claude/, 'and it is the reply\'s, not one of its own');
});

test('the capture note has no closing state, and draws no line', () => {
  // The one card that is the RENDERER's rather than the session's. It carried a
  // hollow ring for one commit, to say not-a-state without spending a colour;
  // with the mark moved onto the reply's line there is no reply to hang it on,
  // and the row already reads Note in the warning colour.
  buildWith({ ...STATEFUL, tools: { Bash: 3 } });
  const boxes = [...window.document.querySelectorAll('.mb-0\\.5.py-1.pl-3')];
  const note = boxes.find(b => /What this session touched/.test(b.textContent));
  assert.ok(note, 'the capture card is drawn');
  assert.equal(note.querySelectorAll('span.rounded-full').length, 0);
});

// ── The panel ───────────────────────────────────────────────────────────────
//
// It replaced the expansion on 2026-09-02. The row expanded in place and the
// expansion rendered every assistant turn whole, which is not what was asked
// for ("expand the truncated part but not expand the whole thing"): a card
// opened to nine screens, so it grew a height cap, and the cap needed a ring to
// say which card it was. A panel per HALF instead, since the ask and the reply
// are separate things to want.

test('the ask and the reply each open their own, and one at a time', () => {
  buildWith(STATEFUL);
  trigs(1)[0].click();
  assert.match(peekOf(1).textContent, /^You/);
  trigs(1)[1].click();
  assert.match(peekOf(1).textContent, /^Claude/, 'the second replaces the first');
  assert.equal(peekOf(2), null, 'and no other card is holding one');
});

test('a second tap on the same half closes it, so the trigger is a toggle', () => {
  buildWith(STATEFUL);
  const t = trigs(1)[0];
  t.click();
  assert.ok(peekOf(1));
  assert.equal(t.getAttribute('aria-expanded'), 'true');
  t.click();
  assert.equal(peekOf(1), null);
  assert.equal(t.getAttribute('aria-expanded'), 'false');
});

test('a trigger is not a button, because Safari sizes one from unclipped content', () => {
  // The row's lines are clamped, and this branch already shipped a clipped
  // child inside a button that left the button at its full height (snags:
  // safari-button-sizes-from-unclipped-content). `role` and a tabindex buy the
  // same reach without the box.
  buildWith(STATEFUL);
  for (const t of trigs(1)) {
    assert.notEqual(t.tagName, 'BUTTON');
    assert.equal(t.getAttribute('tabindex'), '0');
    assert.ok(t.className.includes('line-clamp-1') || t.className.includes('line-clamp-2')
              || t.querySelector('.line-clamp-1'), 'every trigger is a clamped line: ' + t.className);
  }
});

test('the panel is dismissed from inside the component, not from the document', () => {
  // This index is mounted per swiper slide, so a document listener would
  // outlive every copy of it.
  buildWith(STATEFUL);
  const src = readFileSync(path.join(repoRoot, 'lib/kits/session-export.js'), 'utf8');
  assert.doesNotMatch(src, /document\.addEventListener/, 'no listener outlives the mount');
  trigs(1)[0].click();
  assert.ok(peekOf(1));
  boxOf(2).dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  assert.equal(peekOf(1), null, 'a tap elsewhere in the list closes it');
});

// ── Hover, and the ask's own type ───────────────────────────────────────────

const hoverable = (on) => {
  window.matchMedia = (q) => ({ matches: on && /hover:\s*hover/.test(q), media: q,
                                addListener() {}, removeListener() {} });
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));

test('a fine pointer opens on hover after a dwell, and closes after leaving both', async () => {
  // Asked for on 2026-09-02: a reader running a mouse down the list wants the
  // half under it, not a click per row. The dwell stops a pointer crossing the
  // row from flashing a panel at it; the grace after leaving is what lets the
  // panel be entered, which is the rule kits/note.js can skip because its own
  // panel is `pointer-events:none` and this one is not.
  hoverable(true);
  buildWith(STATEFUL);
  const t = trigs(1)[0];
  t.dispatchEvent(new window.Event('pointerover', { bubbles: true }));
  assert.equal(peekOf(1), null, 'not on arrival');
  await wait(220);
  assert.ok(peekOf(1), 'and open after the dwell');

  t.dispatchEvent(new window.Event('pointerout', { bubbles: true }));
  assert.ok(peekOf(1), 'still there through the grace');
  await wait(320);
  assert.equal(peekOf(1), null, 'and gone after it');
});

test('entering the panel keeps it, which is why the grace exists', async () => {
  hoverable(true);
  buildWith(STATEFUL);
  const t = trigs(1)[0];
  t.dispatchEvent(new window.Event('pointerover', { bubbles: true }));
  await wait(220);
  const panel = peekOf(1);
  t.dispatchEvent(new window.Event('pointerout', { bubbles: true }));
  panel.dispatchEvent(new window.Event('pointerover', { bubbles: true }));
  await wait(320);
  assert.ok(peekOf(1), 'the pointer is in the panel, so it stays');
});

test('a coarse pointer never hover-opens, because a tap synthesises one', async () => {
  // Without the gate the dwell and the tap both fire and the panel opens and
  // toggles itself shut.
  hoverable(false);
  buildWith(STATEFUL);
  trigs(1)[0].dispatchEvent(new window.Event('pointerover', { bubbles: true }));
  await wait(220);
  assert.equal(peekOf(1), null);
  trigs(1)[0].click();
  assert.ok(peekOf(1), 'the tap is what opens it');
  hoverable(true);
});

test('the ask reads at the panel\'s size, and its double spaces are squeezed', async () => {
  // chat-render renders a prompt verbatim in a `<pre>`, because a prompt is
  // typed text and not markdown, and in dense mode drops it to 11px so the ask
  // reads under the reply it is context for. In a panel titled YOU there is
  // nothing to be under. And the verbatim whitespace shows every double space
  // after a sentence, which the row directly above collapses.
  buildWith({
    ...STATEFUL,
    prompts: [{ at: '2026-09-01T10:00:00Z', text: 'One.  Two.\n\n    indented line' },
              ...STATEFUL.prompts.slice(1)],
  });
  trigs(1)[0].click();
  await drawn();
  const pre = peekOf(1).querySelector('pre');
  assert.equal(pre.style.fontSize, '13px', 'the reading size, not the deck\'s subordinate one');
  assert.match(pre.textContent, /One\. Two\./, 'the mid-line run is squeezed');
  assert.match(pre.textContent, /\n\n {4}indented line/,
    'and both the newlines and the line-leading indent survive, which is what a paste needs');
});
