// kits/peek.js — the ancestor chain and the two things that address a node:
// the selector it builds and the tree it serializes.
//
// jsdom caveat: layout is inert, so every rect is zero and nothing here
// asserts geometry. The pointer path, the outlines and the auto-dock are
// browser facts and live in tools/render/scenarios/peek-walk.mjs instead.
//
// The selector tests are the point of the file. The first algorithm climbed
// ancestors until a selector was unique, which cannot separate SIBLINGS: two
// <li> with the same classes have the same ancestor path, so the climb ran to
// <body> still matching two and fell back to something matching three.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

// Self-similar nesting, which is what broke the first climb: `ul > li > ul > li`
// matches at two depths, and `One point one` / `One point two` are siblings
// no amount of ancestor prefix can tell apart.
const PAGE = `<!doctype html><html><head></head><body class="bg">
  <main class="p-4">
    <section class="card">
      <div><div class="box">
        <ul class="lst"><li>One
          <ul class="lst"><li>One point one
            <ul class="lst"><li>One point one point one</li></ul>
          </li><li>One point two</li></ul>
        </li><li>Two</li></ul>
      </div></div>
    </section>
    <table id="bills"><tbody>
      <tr><td><a href="/a" class="link">HB 1044</a></td><td>Ormsby</td></tr>
      <tr><td><a href="/b" class="link">SB 5187</a></td><td>Rolfes</td></tr>
    </tbody></table>
  </main>
</body></html>`;

// vanilla-bundle.js first, because peek escapes panel text with the window.esc
// it puts there rather than defining a second one (tools/test/one-escape-helper).
// It is boot-loaded on every loader page, so this is the real arrangement.
const boot = () => {
  const { window } = makeWindow({ html: PAGE });
  window.eval(readFileSync(path.join(repoRoot, 'lib/vanilla-bundle.js'), 'utf8'));
  window.eval(readFileSync(path.join(repoRoot, 'lib/kits/peek.js'), 'utf8'));
  window.Peek.enable();
  return window;
};

const deepest = (w, txt) => {
  const all = [...w.document.querySelectorAll('li')].filter(n => n.textContent.includes(txt));
  return all[all.length - 1];
};

test('chain: runs from the node to <body>, innermost first', () => {
  const w = boot();
  w.Peek.select(deepest(w, 'One point one point one'));
  const chain = w.Peek.chain();
  assert.equal(chain[0].tagName, 'LI');
  assert.equal(chain.at(-1).tagName, 'BODY');
  assert.equal(w.Peek.current(), chain[0]);
});

test('chain: up/down move the index, and up wraps at <body>', () => {
  const w = boot();
  w.Peek.select(deepest(w, 'One point one point one'));
  const n = w.Peek.chain().length;
  w.Peek.up();
  assert.equal(w.Peek.current().tagName, 'UL');
  w.Peek.down();
  assert.equal(w.Peek.current().tagName, 'LI');
  w.Peek.to(n - 1);
  assert.equal(w.Peek.current().tagName, 'BODY');
  w.Peek.up();                       // past the top comes back to the tap
  assert.equal(w.Peek.current(), w.Peek.chain()[0]);
});

test('selector: every rung of a self-similar chain is unique', () => {
  const w = boot();
  w.Peek.select(deepest(w, 'One point one point one'));
  const chain = w.Peek.chain();
  for (let i = 0; i < chain.length; i++) {
    const f = w.Peek.facts(chain[i]);
    assert.equal(f.matches, 1, `rung ${i} (${f.atom}) matched ${f.matches}: ${f.selector}`);
    assert.equal(w.document.querySelectorAll(f.selector)[0], chain[i], `rung ${i} resolves elsewhere`);
  }
});

test('selector: siblings sharing an atom are separated by position', () => {
  const w = boot();
  const lis = [...w.document.querySelectorAll('li')];
  const one = lis.find(n => n.textContent.startsWith('One point one'));
  const two = lis.find(n => n.textContent.trim() === 'One point two');
  assert.ok(one && two && one.parentElement === two.parentElement);
  const [a, b] = [w.Peek.facts(one).selector, w.Peek.facts(two).selector];
  assert.match(b, /nth-child/);
  assert.notEqual(a, b);
  assert.equal(w.document.querySelector(a), one);
  assert.equal(w.document.querySelector(b), two);
});

test('selector: an id short-circuits the climb', () => {
  const w = boot();
  const f = w.Peek.facts(w.document.getElementById('bills'));
  assert.equal(f.selector, '#bills');
  assert.equal(f.matches, 1);
});

test('tree: structure plus own text, indented, root included', () => {
  const w = boot();
  const row = w.document.querySelectorAll('tbody tr')[1];
  const lines = w.Peek.tree(row).split('\n');
  assert.equal(lines[0], 'tr');
  assert.equal(lines[1], '  td');
  assert.match(lines[2], /^ {4}a\.link {2}"HB 1044"|^ {4}a\.link {2}"SB 5187"/);
  assert.ok(lines.some(l => l.includes('"Rolfes"')));
});

test('tree: depth cap reports the children it stopped at', () => {
  const w = boot();
  const outer = w.document.querySelector('ul.lst');
  const capped = w.Peek.tree(outer, { depth: 1 });
  assert.match(capped, /… \d+ more/);
  assert.ok(w.Peek.tree(outer, { depth: 9 }).split('\n').length
          > capped.split('\n').length);
});

test('facts: own text excludes descendants', () => {
  const w = boot();
  const one = [...w.document.querySelectorAll('li')].find(n => n.textContent.includes('One point one'));
  assert.equal(w.Peek.facts(one).text, 'One');          // not the nested items
  assert.ok(w.Peek.facts(one).children > 0);
});

test('json: carries the chain and the index it was read at', () => {
  const w = boot();
  w.Peek.select(deepest(w, 'One point one point one'));
  w.Peek.up();
  const j = w.Peek.json();
  assert.equal(j.format, 'peek/1');
  assert.equal(j.index, 1);
  assert.equal(j.chain.length, w.Peek.chain().length);
  assert.equal(j.atom, w.Peek.facts(w.Peek.current()).atom);
});

// The library contract annotate depends on: no enable(), no cover, no panel,
// and every computation reads the element's own document.
test('library: facts, tree and the chain work with no enable()', () => {
  const { window } = makeWindow({ html: PAGE });
  window.eval(readFileSync(path.join(repoRoot, 'lib/vanilla-bundle.js'), 'utf8'));
  window.eval(readFileSync(path.join(repoRoot, 'lib/kits/peek.js'), 'utf8'));
  assert.equal(window.Peek.enabled, false);
  const row = window.document.querySelectorAll('tbody tr')[1];
  const f = window.Peek.facts(row);
  assert.equal(f.matches, 1);
  assert.equal(window.document.querySelector(f.selector), row);
  assert.equal(window.Peek.tree(row).split('\n')[0], 'tr');
  assert.equal(window.Peek.chainOf(row).at(-1).tagName, 'BODY');
  assert.equal(window.Peek.atom(row), 'tr');
  // Nothing was mounted by asking.
  assert.equal(window.document.querySelectorAll('[data-peek-ui]').length, 0);
});

test('disable: removes every node it added', () => {
  const w = boot();
  w.Peek.select(deepest(w, 'Two'));
  assert.ok(w.document.querySelectorAll('[data-peek-ui]').length > 0);
  w.Peek.disable();
  assert.equal(w.document.querySelectorAll('[data-peek-ui]').length, 0);
  assert.equal(w.Peek.enabled, false);
});
