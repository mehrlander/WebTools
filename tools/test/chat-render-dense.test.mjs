// lib/kits/chat-render.js — dense mode: the same turn read as a LOG rather than
// as a page of cards, which is what the estate's session card mounts.
//
// Origin: the card renders a whole conversation in a hover panel, and at full
// density every turn spent a line on chrome before it said anything. Measured
// 2026-08-28 over the eight-turn fixture in tools/render/scenarios/
// estate-sessions.mjs: 119 pixels a turn before, 82 after, on identical text.
//
// The three moves are asserted here because each one can fail SILENTLY into
// something that still looks fine: a lead-in that lands in the wrong block, a
// dropped-characters chip that vanishes rather than falling back, an assistant
// turn that loses its indent and reads as an equal.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, makeWindow } from './bootstrap.mjs';

const { window } = makeWindow();
// A real-enough marked: dense mode is about WHERE things land in the rendered
// tree, so the tree has to have blocks in it. Only the shapes these tests use.
const html = (md) => String(md)
  .split(/\n{2,}/)
  .map(p => p.startsWith('```')
    ? ''
    : p.startsWith('- ') ? '<ul>' + p.split('\n').map(l => `<li>${l.slice(2)}</li>`).join('') + '</ul>'
    : `<p>${p}</p>`)
  .join('');
const marked = {
  lexer: (md) => {
    const out = [];
    for (const part of String(md).split(/\n{2,}/)) {
      if (part.startsWith('```')) out.push({ type: 'code', lang: 'js', text: part.replace(/```\w*\n?|\n?```/g, '') });
      else out.push({ type: 'paragraph', raw: part });
    }
    return out;
  },
  parser: (toks) => html(toks.map(t => t.raw).join('\n\n')),
  parse: html,
};
globalThis.marked = window.marked = marked;
// A fenced block goes through the escape vanilla-bundle.js puts on the window;
// this harness loads neither, so it supplies the one function the module reaches.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
window.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
for (const k of ['addEventListener', 'removeEventListener', 'history', 'location'])
  globalThis[k] = typeof window[k] === 'function' ? window[k].bind(window) : window[k];
new Function('window', 'document', readFileSync(path.join(repoRoot, 'lib/kits/swipe-deck.js'), 'utf8'))(window, window.document);
globalThis.swipeDeck = window.swipeDeck;
new Function('window', 'document', readFileSync(path.join(repoRoot, 'lib/kits/chat-render.js'), 'utf8'))(window, window.document);
const cr = window.chatRender;

const dense = m => cr.message(m, { dense: true, collapse: 0 });
// The head is a standalone row only when it could not fold into the text. It is
// the direct child that is not the body host, so this finds it or nothing.
const standaloneHead = el => [...el.children].find(n => n.className.includes('items-center'));

test('the head folds into the turn\'s first line, so a turn costs no chrome row', () => {
  const el = dense({ role: 'assistant', md: 'Not a bug. The badge renders a kind.', ts: '22:58:30' });
  assert.equal(standaloneHead(el), undefined, 'no chrome row above the text');
  const p = el.querySelector('p');
  assert.ok(p.textContent.startsWith('22:58:30'), 'the clock opens the first paragraph');
  assert.ok(p.textContent.includes('Not a bug.'), 'and the text follows it in the same block');
});

test('the role WORD goes for the two chat roles and stays for every other', () => {
  // Four carriers already say user from assistant in an alternating transcript:
  // the icon, the rail, the indent, and mono against prose. A system or tool
  // turn has none of that going for it, so it keeps its word.
  for (const role of ['user', 'assistant']) {
    const el = dense({ role, md: 'text here', ts: '01:02:03' });
    assert.ok(!/YOU|ASSISTANT/i.test(el.textContent), `${role} names itself with chrome, not a word`);
    assert.ok(el.querySelector('i.ph'), 'the icon is what carries it');
  }
  const sys = dense({ role: 'system', md: 'text here', ts: '01:02:03' });
  assert.ok(sys.textContent.includes('System'), 'a system turn keeps its label');
});

test('a caller-set label survives, because it is a claim and not decoration', () => {
  // The estate's card labels its last turn "closing reply" or "final turn, tail
  // only": a 500-character recorder tail and a whole reply are not the same
  // claim about fidelity, and only the label says which.
  const el = dense({ role: 'assistant', md: 'the end.', ts: '16:49:16', label: 'closing reply' });
  assert.ok(el.textContent.includes('closing reply'));
  assert.ok(el.querySelector('p').textContent.startsWith('closing reply'), 'inline, ahead of the prose');
});

test('what was dropped is said where the text STOPS, not under the turn', () => {
  // It was a <p> appended after the body, which read as a footnote about the
  // whole turn. On the last line it is what it is: this sentence continues.
  const el = dense({ role: 'assistant', md: 'One here.\n\nTwo here.', ts: '', dropped: 3276 });
  const ps = [...el.querySelectorAll('p')];
  assert.equal(ps.length, 2, 'no extra paragraph was added');
  assert.ok(ps[1].textContent.includes('+3,276 chars'), 'the chip closes the LAST block');
  assert.ok(!ps[0].textContent.includes('3,276'), 'and nothing marks the first');
});

test('the chip rides a plain turn too, so full density reports the same cut', () => {
  const el = cr.message({ role: 'assistant', md: 'One here.', dropped: 12 }, { collapse: 0 });
  assert.ok(el.textContent.includes('+12 chars'));
  assert.ok(standaloneHead(el), 'and the full-size head row is untouched');
});

test('a body that opens on a code fence keeps the standalone head', () => {
  // textEdge returns null where the first block is an artifact rather than
  // running text, and the fallback is the full-size chrome row. Nothing is
  // hidden by it: a lead-in that cannot fold is still shown.
  const el = dense({ role: 'assistant', md: '```js\nconst x = 1;\n```\n\nafter.', ts: '09:00:00' });
  const head = standaloneHead(el);
  assert.ok(head, 'the head stands on its own row');
  assert.ok(head.textContent.includes('09:00:00'));
});

test('the assistant turn hangs off the ask: indented, hairline rail, one size down', () => {
  const u = dense({ role: 'user', md: 'the ask' });
  const a = dense({ role: 'assistant', md: 'the answer' });
  assert.ok(u.className.includes('border-l-2'), 'the ask keeps the full rail');
  assert.ok(!u.className.includes('ml-'), 'flush left, which the indent is measured against');
  assert.ok(a.className.includes('ml-5'), 'the reply indents under it');
  assert.ok(a.className.includes('border-l ') || /border-l$/.test(a.className.trim()),
    'and its rail is a hairline, not the 2px the ask carries');
  const prose = a.querySelector('[data-flow="prose"]');
  assert.equal(prose.style.fontSize, '13px', 'one step under prose-sm, as a style: it has to beat prose-sm on the same element');
});

test('a raw user turn folds its head into the <pre>, where the text is', () => {
  // A user turn renders as typed, so its whole body is one <pre> and there are
  // no blocks to pick from. The lead-in goes in the pre itself.
  const el = dense({ role: 'user', md: 'why do only three tables have the label?', ts: '22:56:11' });
  assert.equal(standaloneHead(el), undefined);
  const pre = el.querySelector('pre');
  assert.ok(pre.textContent.startsWith('22:56:11'), 'the clock opens the typed text');
  assert.ok(pre.textContent.includes('why do only three'));
});
