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

const KITS = ['lib/kits/proof.js', 'lib/kits/swipe-deck.js', 'lib/kits/chat-render.js',
              'lib/kits/session-render.js', 'lib/kits/session-export.js'];

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
for (const f of KITS) new window.Function(readFileSync(path.join(repoRoot, f), 'utf8'))();
const SE = window.sessionExport;

const build = (opts = {}) => {
  const view = SE.index(RECORD, opts);
  window.document.body.replaceChildren(view.el);
  return view;
};

// The row's own controls, read off the element the way a finger would find them.
const pills = () => [...window.document.querySelectorAll('button[aria-label^="Show this card"]')];
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
  assert.ok(pills()[0].getAttribute('aria-expanded') === 'true');
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

test('a long turn previews with a chars chip and opens on a tap', () => {
  build({ startCard: 0 });
  // The card also holds a tool turn whose fenced body is over the cap, so the
  // reply's chip is found by its own text rather than by being first.
  const chipEl = [...window.document.querySelectorAll('span')]
    .find(s => /^\+[\d,]+ chars$/.test(s.textContent.trim())
            && /The reply runs on/.test(s.closest('div.min-w-0')?.textContent || ''));
  assert.ok(chipEl, 'the reply is ~800 characters, so it must not arrive whole');
  const body = chipEl.closest('div.min-w-0');
  assert.ok(body);
  assert.ok(!body.textContent.includes(LONG.trim()), 'previewed, not printed');
  body.click();
  assert.ok(body.textContent.includes(LONG.trim()), 'and the tap opens it');
});

test('reading a turn in full does not change what is selected', () => {
  // The two levels, and only the outer one selects.
  const v = build({ startCard: 0 });
  const before = v.selectedCount;
  const chipEl = [...window.document.querySelectorAll('span')]
    .find(s => /^\+[\d,]+ chars$/.test(s.textContent.trim())
            && /The reply runs on/.test(s.closest('div.min-w-0')?.textContent || ''));
  chipEl.closest('div.min-w-0').click();
  assert.equal(v.selectedCount, before);
  assert.equal(openRows().length, 1);
});

test('no checkbox survives anywhere in the list', () => {
  build();
  chip('Open all').click();
  const boxes = [...window.document.querySelectorAll('input[type="checkbox"]')]
    .filter(b => !b.closest('.hidden'));   // the Options row is collapsed, and owns the rest
  assert.deepEqual(boxes, [], 'the list selects by opening; only Options still has switches');
});
