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

// The preview is a clay mark and a clamped line; the row it sits on is what
// hides when the card opens.
const preview = (n = 1) => window.document.querySelector(`button[aria-label="Open card ${n}"] .line-clamp-1`);
const previewRow = (n = 1) => window.document.querySelector(`button[aria-label="Open card ${n}"] .ph-sparkle`)?.parentElement;

// The row's own controls, read off the element the way a finger would find them.
// The row itself, which is what opens a card now. The turn-count pill beside
// it is a readout, not a second control.
const pills = () => [...window.document.querySelectorAll('button[aria-label^="Open card"]')];
const decks = () => [...window.document.querySelectorAll('button[aria-label*="in the deck"]')];
const chip = (label) => [...window.document.querySelectorAll('button')].find(b => b.textContent.trim() === label);
const openRows = () => [...window.document.querySelectorAll('.bg-primary\\/10')];
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

test('the clamp is on the text, not on the row that lays it out', () => {
  buildWith(MD_RECORD);
  // `flex` and `line-clamp-1` both set `display`, and one of them wins: the
  // same collision that silenced the ask's clamp, one line lower. jsdom
  // compiles no Tailwind, so the collision is what is assertable.
  assert.ok(!preview().classList.contains('flex'));
  assert.ok(previewRow().classList.contains('flex'), 'the mark and the line still sit on one row');
});

test('opening the card takes the preview away, so nothing is on screen twice', async () => {
  buildWith(MD_RECORD);
  pills()[0].click();
  await drawn();
  assert.ok(previewRow().classList.contains('hidden'),
    'the replies render in full below, and a one-line copy of the last of them would be the same words twice');
  pills()[0].click();
  assert.ok(!previewRow().classList.contains('hidden'), 'and it comes back on the close');
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
