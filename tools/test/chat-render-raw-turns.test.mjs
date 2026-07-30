// lib/chat-render.js — the user/assistant render split. A user turn is not a
// markdown document (it is whatever someone typed or pasted into a chat box),
// so it renders as text; an assistant turn is markdown and still does.
//
// Regression origin: the ChatGPT chat in chat-histories' webi-drs-data
// envelope opens with a 318 KB pasted prompt. marked found 187 indented code
// blocks in it (the paste contains no fenced block at all) and each became an
// artifact card, so one turn built 5,151 nodes and 450 buttons and stood
// 139,124 pixels tall, with a pasted `<Mashup …>` XML header going through
// innerHTML unescaped on the way. These assert the shipped module against a
// jsdom document, not a transcription of it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, makeWindow } from './bootstrap.mjs';

const { window } = makeWindow();
// chat-render dereferences `marked` bare, so the stub goes on the global the
// module body actually reaches. It records what it was handed: these tests
// assert which turns reach markdown, not what marked does with them.
const marked = { lexer: () => [], parser: () => '', parse: () => '' };
globalThis.marked = window.marked = marked;
new Function('window', 'document', readFileSync(path.join(repoRoot, 'lib/chat-render.js'), 'utf8'))(window, window.document);
const cr = window.chatRender;

const PASTE = ['// COA', 'let', ...Array.from({ length: 400 }, (_, i) => `    Step${i} = Table.SelectRows(Source, each [n] = ${i}),`)].join('\n');
const body = m => {
  const el = cr.message(m);
  return { el, text: el.textContent, html: el.innerHTML };
};

test('a user turn renders as text, not markdown', () => {
  // Indented lines are what marked would promote to code blocks; nothing here
  // may become a <pre class=…> artifact card with view buttons.
  const { el } = body({ role: 'user', md: PASTE });
  assert.equal(el.querySelectorAll('.not-prose > pre, pre').length, 1, 'one plain pre, not one per indented run');
  assert.equal(el.querySelectorAll('button[class*="btn-xs"] i.ph-eye').length, 0, 'no Render view on a paste');
});

test('markup in a paste is escaped, never mounted', () => {
  const md = 'here is the query:\n<Mashup xmlns="http://schemas.microsoft.com/DataMashup"><Client>EXCEL</Client></Mashup>\n' + PASTE;
  const { el, text, html } = body({ role: 'user', md });
  assert.equal(el.querySelectorAll('Mashup, Client').length, 0, 'the paste did not become elements');
  assert.match(html, /&lt;Mashup/, 'angle brackets survive as text');
  assert.match(text, /<Mashup xmlns=/, 'and read back verbatim');
});

test('an assistant turn still goes through markdown', () => {
  let seen = null;
  marked.lexer = md => { seen = md; return []; };
  cr.message({ role: 'assistant', md: '## Findings\n\n```js\nconsole.log(1)\n```' });
  assert.equal(seen, '## Findings\n\n```js\nconsole.log(1)\n```');
});

test('raw:false renders a user turn as markdown, raw:true forces text on any role', () => {
  let seen = null;
  marked.lexer = md => { seen = md; return []; };
  cr.message({ role: 'user', md: 'hello' }, { raw: false });
  assert.equal(seen, 'hello', 'the override reaches marked');

  seen = null;
  cr.message({ role: 'assistant', md: PASTE }, { raw: true });
  assert.equal(seen, null, 'raw:true keeps an assistant turn out of marked');
});

test('a short paste gets no chrome; a long one gets a preview and an expander', () => {
  const short = body({ role: 'user', md: 'what columns do I need?' });
  assert.equal(short.el.querySelectorAll('button').length, 0);
  assert.equal(short.text.trim().endsWith('what columns do I need?'), true);

  const long = body({ role: 'user', md: PASTE });
  const labels = [...long.el.querySelectorAll('button')].map(b => b.textContent.trim());
  assert.ok(labels.includes('Show full text'), `expected an expander, got ${JSON.stringify(labels)}`);
  assert.ok(labels.includes('Copy'), 'a dump is the thing you want to grab');
  assert.ok(long.text.includes('lines · pasted text'), 'the turn says how big it is');
  assert.ok(long.text.length < PASTE.length / 2, 'collapsed shows a slice, not the whole paste');
});

test('expanding puts the paste in its own bounded scroller, so the reply stays reachable', () => {
  const { el } = body({ role: 'user', md: PASTE });
  const expand = [...el.querySelectorAll('button')].find(b => b.textContent.includes('Show full text'));
  expand.dispatchEvent(new window.Event('click'));

  const box = el.querySelector('.overflow-y-auto');
  assert.ok(box, 'expanded text is inside a scroller, not spilled down the page');
  assert.match(box.getAttribute('style') || '', /max-height/, 'the scroller is bounded');

  // Panes rather than one node: off-screen ones skip layout while staying in
  // the DOM, so find-in-page still reaches them.
  const panes = box.querySelectorAll('pre');
  assert.ok(panes.length > 1, `expected several panes, got ${panes.length}`);
  assert.equal([...panes].map(p => p.textContent).join('\n'), PASTE, 'the panes reassemble the paste exactly');
  assert.equal(panes[0].style.contentVisibility, 'auto');

  assert.equal(expand.textContent.trim(), 'Collapse');
  expand.dispatchEvent(new window.Event('click'));
  assert.equal(el.querySelector('.overflow-y-auto'), null, 'collapse drops the expanded panes again');
});
