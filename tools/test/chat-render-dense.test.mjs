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
  const el = dense({ role: 'user', md: 'why do three tables carry a label?', ts: '22:56:11' });
  assert.equal(standaloneHead(el), undefined, 'no chrome row above the text');
  const pre = el.querySelector('pre');
  assert.ok(pre.querySelector('i.ph'), 'the lead sits inside the first block');
  assert.ok(pre.textContent.startsWith('why do three'), 'and the text opens it');
  const a = dense({ role: 'assistant', md: 'Not a bug. The badge renders a kind.', ts: '22:58:30' });
  assert.equal(standaloneHead(a), undefined);
  assert.ok(a.querySelector('p').textContent.startsWith('Not a bug.'), 'a reply opens on its own sentence too');
});

test('no clock on any dense turn, and every turn keeps its own on the icon', () => {
  // A column of digits down the left edge is something the eye skips to reach
  // the sentence. What a card is read for is WHO, and the icon says that in one
  // glyph. The fact is not lost, only unrendered.
  for (const role of ['user', 'assistant', 'system']) {
    const el = dense({ role, md: 'text here', ts: '22:58:30' });
    assert.ok(!el.textContent.includes('22:58:30'), `a ${role} turn prints no clock`);
    assert.equal(el.querySelector('i.ph').getAttribute('title'), '22:58:30', 'but carries it');
  }
  const none = dense({ role: 'user', md: 'text here' });
  assert.equal(none.querySelector('i.ph').getAttribute('title'), null, 'and invents none where there was none');
  // Full size still prints it: a deck slide reads against the clock.
  assert.ok(cr.message({ role: 'user', md: 'x', ts: '22:58:30' }, { collapse: 0 })
    .textContent.includes('22:58:30'));
});

test('the chip is bound to the last word, so it cannot be orphaned on its own line', () => {
  // With a margin the chip is its own breakable token, and a last line ending
  // near the right edge dropped it onto a line by itself, where it read as a
  // fact about the turn rather than about that sentence.
  const el = dense({ role: 'assistant', md: 'One here.', dropped: 891 });
  const p = el.querySelector('p');
  const chip = p.lastElementChild;
  assert.ok(chip.textContent.includes('+891 chars'));
  assert.equal(chip.previousSibling.nodeType, 3, 'a text node sits between the prose and the chip');
  assert.equal(chip.previousSibling.data, '\u00A0', 'and it is the space that will not break');
  assert.ok(!/\bml-/.test(chip.className), 'no margin, which is what made it breakable');
});

test('a fenced artifact inside a dense reply takes the dense rhythm', () => {
  // Left at block()'s own my-3 it was the one thing still spaced for a page, so
  // a reply carrying a fence read as two turns with a gap between them.
  const el = dense({ role: 'assistant', md: 'before.\n\n```js\nconst x = 1;\n```\n\nafter.' });
  const card = el.querySelector('[data-block]');
  assert.ok(card, 'the fence rendered as an artifact');
  assert.equal(card.style.marginTop, '0.6em');
  assert.equal(card.style.marginBottom, '0.6em');
  const plain = cr.message({ role: 'assistant', md: '```js\nconst x = 1;\n```' }, { collapse: 0 });
  assert.equal(plain.querySelector('[data-block]').style.marginTop, '', 'full size keeps my-3');
});

test('a dense reply carries typography\'s paragraph rhythm halved, edges included', () => {
  // prose-sm spends 1.14em above and below every block, which is a page's
  // spacing. Here it has to stay UNDER the gap between turns or the grouping
  // inverts and a reply reads as two turns.
  const el = dense({ role: 'assistant', md: 'One here.\n\nTwo here.\n\nThree here.' });
  const ps = [...el.querySelectorAll('p')];
  assert.equal(ps.length, 3);
  assert.equal(ps[0].style.marginTop, '0px', 'the first block keeps typography\'s zero');
  assert.equal(ps[1].style.marginTop, '0.6em');
  assert.equal(ps[1].style.marginBottom, '0.6em');
  assert.equal(ps[2].style.marginBottom, '0px', 'and so does the last');
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

test('the reply hangs off the ask on the indent alone: no rail on either', () => {
  // A rail binds a wrapped line to its turn and colours the role. Dense does
  // both without it (the indent, mono against prose, the gap before each ask),
  // so kept it was the one vertical line on the card, drawing the eye to
  // chrome. The ask sits flush and everything answering it hangs off that edge.
  const u = dense({ role: 'user', md: 'the ask' });
  const a = dense({ role: 'assistant', md: 'the answer' });
  const sys = dense({ role: 'system', md: 'a note' });
  for (const [name, el] of [['ask', u], ['reply', a], ['system turn', sys]])
    assert.ok(!/border-l/.test(el.className), `the ${name} carries no rail`);
  assert.ok(!/\bml-/.test(u.className), 'the ask is flush, which the indent is measured against');
  assert.ok(a.className.includes('ml-5'), 'the reply indents under it');
  assert.ok(sys.className.includes('ml-5'), 'and so does every turn that is not the ask');
  const prose = a.querySelector('[data-flow="prose"]');
  assert.equal(prose.style.fontSize, '13px', 'one step under prose-sm, as a style: it has to beat prose-sm on the same element');
  // Full size is untouched: a deck slide is a page, not a panel.
  assert.ok(/border-l-2/.test(cr.message({ role: 'assistant', md: 'x' }, { collapse: 0 }).className));
});

test('a raw user turn folds its head into the <pre>, where the text is', () => {
  // A user turn renders as typed, so its whole body is one <pre> and there are
  // no blocks to pick from. The lead-in goes in the pre itself.
  const el = dense({ role: 'user', md: 'why do only three tables have the label?', ts: '22:56:11' });
  assert.equal(standaloneHead(el), undefined);
  const pre = el.querySelector('pre');
  assert.equal(pre.firstElementChild?.querySelector('i.ph')?.tagName, 'I', 'the lead is the pre\'s first child');
  assert.ok(pre.textContent.includes('why do only three'), 'and the typed text runs on from it');
});

test('the lead is tinted for the two conversation roles, and only those', () => {
  // What the rail used to say, in one glyph. The ask takes the theme's primary,
  // which is the hue its rail carried; the reply takes clay, this house's
  // Claude colour. The other three stay neutral because this theme's warning
  // and info sit at 88 to 89% lightness: fine as a 2px rail, unreadable as an
  // 11px glyph, and a colour that cannot be seen is worse than none.
  const icon = m => dense(m).querySelector('i.ph');
  assert.equal(icon({ role: 'user', md: 'x' }).style.color, 'var(--color-primary, currentColor)');
  assert.equal(icon({ role: 'assistant', md: 'x' }).style.color, 'rgb(217, 119, 87)', 'clay');
  for (const role of ['system', 'tool', 'meta']) {
    assert.equal(icon({ role, md: 'x' }).style.color, '', `${role} takes no tint`);
    assert.ok(icon({ role, md: 'x' }).className.includes('opacity-50'), 'and stays at the neutral weight');
  }
  // Full size is a page and keeps its rails, so it needs no tint.
  assert.equal(cr.message({ role: 'user', md: 'x' }, { collapse: 0 })
    .querySelector('i.ph').style.color, '');
});

test('no fill on any dense turn, so the whole frame is where the turn sits', () => {
  // The ask carried a band for one round and it did find the exchanges, but the
  // way a rail did: by drawing a shape around the text rather than letting the
  // text make one. What is left says the same thing with no ink, so the only
  // class a dense turn carries is its indent.
  for (const role of ['user', 'assistant', 'system', 'tool', 'meta'])
    assert.ok(!/\bbg-|\bborder|rounded/.test(dense({ role, md: 'x' }).className),
      `a ${role} turn carries no fill, rail or corner`);
  assert.equal(dense({ role: 'user', md: 'x' }).className, '', 'the ask is the bare edge');
  assert.equal(dense({ role: 'assistant', md: 'x' }).className, 'ml-5', 'and the reply is one word');
});

test('the turn hangs on its lead: the icon in the margin, every other line on one edge', () => {
  // The body is pushed in by the lead's width and the first line pulled back
  // out by the same amount, so the glyph sits outside the text column and lines
  // two onward, and every later paragraph, share one edge with line one's text.
  for (const role of ['user', 'assistant']) {
    const el = dense({ role, md: 'a turn' });
    const host = el.querySelector('.relative');
    const blk = el.querySelector('pre, p');
    assert.equal(host.style.paddingLeft, '17px', `${role}: the body clears the lead`);
    assert.equal(blk.style.textIndent, '-17px', `${role}: and line one comes back out`);
  }
  // Full size hangs nothing: its head is its own row.
  const full = cr.message({ role: 'user', md: 'a turn' }, { collapse: 0 });
  assert.equal(full.querySelector('.relative').style.paddingLeft, '');
});

test('the lead stops the indent inheriting, or a label lands on the icon', () => {
  // text-indent INHERITS, and the hanging indent puts a negative one on the
  // block the lead is prepended into. Left to inherit it the lead's own
  // contents were pulled a further 17px left, which with a label printed the
  // word on top of the icon. Invisible on an icon-only turn, which is every
  // turn but one, so it shipped looking correct.
  const el = dense({ role: 'assistant', md: 'the end.', label: 'closing reply' });
  const lead = el.querySelector('i.ph').parentElement;
  assert.equal(lead.style.textIndent, '0px');
  assert.ok(lead.textContent.includes('closing reply'), 'and the label is still in the lead');
});

test('a turn whose lead could not fold hangs nothing', () => {
  // The standalone head is its own row, so there is no first line to pull out
  // of and an indent would only push the whole body right for nothing.
  const el = dense({ role: 'assistant', md: '```js\nconst x = 1;\n```\n\nafter.' });
  assert.ok(standaloneHead(el), 'the fallback head is in play');
  assert.equal(el.querySelector('.relative').style.paddingLeft, '');
});
