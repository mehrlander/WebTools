// console/suite.js — the assembled console toolkit (base.js + mods), driven
// under jsdom. Tests run against assemble()'s output so they exercise exactly
// what a paste of suite.js executes; a final test pins the committed artifact
// to that output (the build is deterministic, so stale = byte-diff).
//
// jsdom caveat: layout is inert (offsetWidth 0, empty client rects), so
// sig.visible is false for everything; the `visible` engine is tested via
// visible=false only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';
import { assemble } from '../build/console-suite.mjs';

const PAGE = `<!doctype html><html><head></head><body>
  <h1>Bills</h1>
  <table id="bills">
    <thead><tr><th>Bill</th><th>Status</th></tr></thead>
    <tbody>
      <tr class="row odd"><td><a href="/hb1">HB 1001</a></td><td>In committee hearing</td></tr>
      <tr class="row even"><td><a href="/hb2">HB 1002</a></td><td>Passed</td></tr>
      <tr class="row odd"><td><a href="/hb3">HB 1003</a></td><td>Scheduled for hearing</td></tr>
    </tbody>
  </table>
  <div id="cards">
    <div class="c hash-x1">alpha</div>
    <div class="c hash-x2">beta</div>
    <div class="c hash-x3">gamma</div>
    <div class="other">delta</div>
    <p class="c">not a card</p>
  </div>
</body></html>`;

const boot = (html = PAGE) => {
  const { window } = makeWindow({ html });
  window.eval(assemble());
  return window;
};
// Spread into this realm: jsdom-realm arrays fail strict deepEqual on prototype.
const texts = els => [...els].map(n => n.textContent.trim().replace(/\s+/g, ' '));

// ---- q: the chain grammar ---------------------------------------------

test('q: chained css scopes each stage inside the previous set', () => {
  const w = boot();
  assert.equal(w.q('#bills >> tbody tr').length, 3);
  assert.equal(w.q('#cards >> div').length, 4);
});

test('q: text= forms — substring (case-insensitive), "exact", /regex/', () => {
  const w = boot();
  assert.deepEqual(texts(w.q('td >> text=HEARING')), ['In committee hearing', 'Scheduled for hearing']);
  assert.deepEqual(texts(w.q('td >> text="Passed"')), ['Passed']);
  assert.deepEqual(texts(w.q('td >> text=/^HB \\d+$/')), []); // links hold the text, not the cells
  assert.deepEqual(texts(w.q('a >> text=/^HB \\d+$/')), ['HB 1001', 'HB 1002', 'HB 1003']);
});

test('q: has-text= matches full textContent; has= requires a descendant', () => {
  const w = boot();
  assert.equal(w.q('tr >> has-text=/hb 100/i').length, 3);
  assert.equal(w.q('tr >> has=a[href="/hb2"]').length, 1);
});

test('q: nth picks indexes, negatives, and inclusive ranges', () => {
  const w = boot();
  const rows = 'tbody tr';
  assert.deepEqual(texts(w.q(`${rows} >> nth=0 >> down=a`)), ['HB 1001']);
  assert.deepEqual(texts(w.q(`${rows} >> nth=-1 >> down=a`)), ['HB 1003']);
  assert.equal(w.q(`${rows} >> nth=0-1`).length, 2);
  assert.equal(w.q(`${rows} >> nth=1--1`).length, 2);
});

test('q: dance stages — up to ancestors, down/down* to descendants, over to siblings', () => {
  const w = boot();
  assert.equal(w.q('a >> up=tr').length, 3);
  assert.equal(w.q('a >> up >> up').length, 3);            // td -> tr, bare up twice
  assert.deepEqual(texts(w.q('td >> text=Passed >> over=-1')), ['HB 1002']);
  assert.equal(w.q('tbody tr >> down=a').length, 3);        // first match per member
  assert.equal(w.q('#bills >> down*=td').length, 6);        // union of all matches
});

test('q: results dedupe in document order; visible=false passes everything in jsdom', () => {
  const w = boot();
  const tds = w.q('tbody tr >> td');                        // 2 tds per row, shared parents walked once
  assert.equal(tds.length, 6);
  assert.deepEqual(texts(w.q('td >> visible=false')).length, 6);
  assert.equal(w.q('td >> visible').length, 0);             // layout is inert under jsdom
});

test('q: decorations — texts(), glom() adopts the set', () => {
  const w = boot();
  assert.deepEqual([...w.q('a').texts()], ['HB 1001', 'HB 1002', 'HB 1003']);
  const set = w.q('tbody tr').glom();
  assert.equal(set.length, 3);
  assert.equal(w.document.querySelectorAll('[data-glom]').length, 3);
});

// ---- verbs: lockstep set navigation ------------------------------------

test('verbs: up/down/over move every member in lockstep', () => {
  const w = boot();
  w.glom(w.q('tbody a'));
  assert.equal(w.glom.up('tr').length, 3);
  assert.equal(w.glom.down('a').length, 3);
  w.glom.up('tr');
  assert.deepEqual(texts(w.glom.downAll('td')), [
    'HB 1001', 'In committee hearing', 'HB 1002', 'Passed', 'HB 1003', 'Scheduled for hearing',
  ]);
  w.glom(w.q('tbody td >> nth=0'));
  assert.deepEqual(texts(w.glom.over(1)), ['In committee hearing']);
});

test('verbs: members whose step lands nowhere drop out; landing together dedupes', () => {
  const w = boot();
  w.glom(w.q('#cards div'));                    // 4 divs
  assert.equal(w.glom.up().length, 1);          // all share #cards
  w.glom(w.q('h1'));
  assert.equal(w.glom.up('table').length, 0);   // h1 has no table ancestor
});

// ---- grow: by-example expansion ----------------------------------------

test('grow: two examples expand to structural siblings, shared classes filter decoys', () => {
  const w = boot();
  const cards = w.q('#cards div.c');
  w.glom([cards[0], cards[1]]);                 // two examples with hashy classes
  const grown = w.glom.grow();
  assert.equal(grown.length, 3);                // finds gamma, excludes .other and p.c
  assert.deepEqual(texts(grown), ['alpha', 'beta', 'gamma']);
});

test('grow: from table rows, header row is excluded by tag path (thead vs tbody)', () => {
  const w = boot();
  const rows = w.q('tbody tr');
  w.glom([rows[0], rows[1]]);
  assert.equal(w.glom.grow().length, 3);
  assert.equal(w.document.querySelectorAll('thead [data-glom], thead[data-glom]').length, 0);
});

test('alike: one example matches structure alone (classes unknowable from one)', () => {
  const w = boot();
  const alpha = w.q('#cards div >> text=alpha')[0];
  assert.equal(w.glom.alike(alpha).length, 4);  // 3 cards + .other, not p.c
});

// ---- pick: click-to-collect ---------------------------------------------

test('pick: clicks toggle membership, Esc finishes and disarms', () => {
  const w = boot();
  const [alpha, beta] = w.q('#cards div');
  const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));

  w.glom.clear();
  w.glom.pick();
  click(alpha); click(beta);
  assert.equal(w.glom.get().length, 2);
  click(alpha);                                  // toggle off
  assert.deepEqual(texts(w.glom.get()), ['beta']);

  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(w.document.getElementById('glom-pick-style'), null);
  click(alpha);                                  // disarmed: no effect
  assert.deepEqual(texts(w.glom.get()), ['beta']);
});

test('pick: swallows the click so page handlers never fire', () => {
  const w = boot();
  let navigated = 0;
  const link = w.q('a')[0];
  link.addEventListener('click', () => navigated++);
  w.glom.clear();
  w.glom.pick();
  link.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(navigated, 0);
  assert.equal(w.glom.get().length, 1);
  w.glom.pick.done();
});

// A phone sends pointerup and, for a non-interactive element, no click at all.
// jsdom has no PointerEvent, so these are plain Events with the coordinates
// set by hand, which is the shape the handlers actually read.
const ptr = (w, el, type, x = 0, y = 0) => {
  const e = new w.Event(type, { bubbles: true, cancelable: true });
  e.clientX = x; e.clientY = y;
  el.dispatchEvent(e);
};

test('pick: a tap selects with no click, the way a phone sends it', () => {
  const w = boot();
  const [alpha] = w.q('#cards div');
  w.glom.clear();
  w.glom.pick();
  ptr(w, alpha, 'pointerdown', 5, 5);
  ptr(w, alpha, 'pointerup', 5, 5);
  assert.deepEqual(texts(w.glom.get()), ['alpha']);
  w.glom.pick.done();
});

test('pick: a click echoing its own pointerup does not toggle twice', () => {
  const w = boot();
  const [alpha] = w.q('#cards div');
  w.glom.clear();
  w.glom.pick();
  ptr(w, alpha, 'pointerdown', 5, 5);
  ptr(w, alpha, 'pointerup', 5, 5);
  alpha.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.deepEqual(texts(w.glom.get()), ['alpha'], 'still in the set, not toggled back out');
  w.glom.pick.done();
});

test('pick: a pointerup that ended a scroll is not a tap', () => {
  const w = boot();
  const [alpha] = w.q('#cards div');
  w.glom.clear();
  w.glom.pick();
  ptr(w, alpha, 'pointerdown', 5, 5);
  ptr(w, alpha, 'pointermove', 5, 90);      // travelled well past the slop
  ptr(w, alpha, 'pointerup', 5, 90);
  assert.equal(w.glom.get().length, 0);
  // And a cancelled pointer, which is how a browser announces it took the
  // gesture for a scroll before any distance showed up.
  ptr(w, alpha, 'pointerdown', 5, 5);
  ptr(w, alpha, 'pointercancel', 5, 5);
  ptr(w, alpha, 'pointerup', 5, 5);
  assert.equal(w.glom.get().length, 0);
  w.glom.pick.done();
});

// ---- infer: selector synthesis -------------------------------------------

test('infer: shared classes give an exact selector', () => {
  const w = boot();
  w.glom(w.q('tbody tr'));
  const r = w.glom.infer();
  assert.equal(r.extra, 0);
  assert.equal(r.missing, 0);
  assert.deepEqual([...w.document.querySelectorAll(r.selector)], [...w.q('tbody tr')]);
});

test('infer: ancestor context rescues a too-loose atom', () => {
  const w = boot();
  w.glom(w.q('#cards div'));               // bare "div" would also match #cards itself
  const r = w.glom.infer();
  assert.equal(r.extra, 0);
  assert.equal(r.missing, 0);
  assert.equal(w.document.querySelectorAll(r.selector).length, 4);
});

test('infer: mixed-tag sets join per-tag selectors', () => {
  const w = boot();
  w.glom([w.q('h1')[0], ...w.q('tbody tr')]);
  const r = w.glom.infer();
  assert.match(r.selector, /,/);
  assert.equal(r.extra, 0);
  assert.equal(r.missing, 0);
});

// ---- tap: wire capture -----------------------------------------------------

test('tap: captures matching fetches, parses JSON, stop() restores', async () => {
  const w = boot();
  let served = 0;
  const stub = async url => { served++; return new Response('{"bills": [1, 2]}', { status: 200, headers: { 'content-type': 'application/json' } }); };
  w.fetch = stub;
  const seen = [];
  w.addEventListener('tap', e => seen.push(e.detail));

  w.tap(/\/api\//);
  await w.fetch('https://x.test/api/bills');
  await w.fetch('https://x.test/other/page');
  await new Promise(r => setTimeout(r, 0));    // clone().text() resolves async

  assert.equal(served, 2);                     // requests pass through untouched
  assert.equal(w.tap.hits.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(w.tap.last.data)), { bills: [1, 2] });
  assert.equal(w.tap.last.url, 'https://x.test/api/bills');
  assert.equal(seen.length, 1);                // CustomEvent per capture

  w.tap.stop();                                // restores a bound copy of the original
  await w.fetch('https://x.test/api/more');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(served, 3);                     // still serving
  assert.equal(w.tap.hits.length, 1);          // but no longer capturing
  w.tap.clear();
  assert.equal(w.tap.hits.length, 0);
});

test('tap.replay mutates params on a captured hit; tap.walk paginates until dry', async () => {
  const w = boot();
  w.fetch = async url => {
    const page = +new URL(String(url)).searchParams.get('page') || 1;
    const rows = page <= 3 ? [`row-${page}`] : [];
    return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  w.tap(/api/);
  await w.fetch('https://x.test/api/rows?page=1');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(w.tap.hits.length, 1);

  const page2 = await w.tap.replay(0, { page: 2 });
  assert.deepEqual([...page2], ['row-2']);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(w.tap.hits.length, 2);            // armed tap records the replay

  const pages = await w.tap.walk(0, { param: 'page', from: 1, to: 10, delay: 0 });
  assert.equal(pages.length, 3);                 // stopped dry at page=4, not at to=10
  assert.deepEqual([...pages].map(p => p.page), [1, 2, 3]);
  assert.deepEqual([...pages[2].data], ['row-3']);
  w.tap.stop();
});

// ---- veins: vein-to-skin matching --------------------------------------------

test('veins: JSON leaf fields join to the elements they feed', () => {
  const w = boot();
  w.glom.clear();
  const fields = w.glom.veins({
    bills: [
      { no: 'HB 1001', status: 'In committee hearing' },
      { no: 'HB 1002', status: 'Passed' },
      { no: 'HB 1003', status: 'Scheduled for hearing' },
    ],
    meta: { page: 1 },
  });
  const no = fields.find(f => f.field === 'bills[].no');
  assert.equal(no.coverage, '3/3');
  assert.deepEqual(texts(no.els), ['HB 1001', 'HB 1002', 'HB 1003']);
  const status = fields.find(f => f.field === 'bills[].status');
  assert.equal(status.coverage, '3/3');
  assert.ok(!fields.some(f => f.field === 'meta.page'), 'single-char noise filtered');

  const i = fields.indexOf(no);
  assert.equal(w.glom.veins.grab(i).length, 3);      // adopt the field's elements
});

test('veins: with no data argument, joins every tap capture', async () => {
  const w = boot();
  w.fetch = async () => new Response('{"rows":[{"t":"Passed"},{"t":"HB 1002"}]}',
    { status: 200, headers: { 'content-type': 'application/json' } });
  w.tap(/api/);
  await w.fetch('https://x.test/api/rows');
  await new Promise(r => setTimeout(r, 0));
  w.tap.stop();

  w.glom.clear();
  const fields = w.glom.veins();
  const t = fields.find(f => f.field === 'rows[].t');
  assert.equal(t.coverage, '2/2');
  assert.equal(t.count, 2);                          // the status td and the link
});

// ---- watch: self-healing set ---------------------------------------------------

test('watch: re-acquires the set after DOM churn, via inferred selector', async () => {
  const w = boot();
  w.glom(w.q('tbody tr'));
  w.glom.watch({ settle: 5 });                       // selector inferred from the set
  assert.ok(w.glom.watch.selector.includes('tr'));

  w.q('tbody tr')[0].remove();                       // a rerender eats a row
  await new Promise(r => setTimeout(r, 40));
  assert.equal(w.glom.get().length, 2);              // healed to what the selector finds

  const tbody = w.document.querySelector('tbody');
  tbody.append(w.document.createElement('tr'));      // note: no .row class
  tbody.lastChild.className = 'row new';
  await new Promise(r => setTimeout(r, 40));
  assert.equal(w.glom.get().length, 3);              // new member picked up

  w.glom.watch.stop();
  const late = w.document.createElement('tr');
  late.className = 'row late';
  tbody.append(late);                                // healing would make this 4
  await new Promise(r => setTimeout(r, 40));
  assert.equal(w.glom.get().length, 3);              // disarmed: set doesn't grow
});

test('watch: explicit selector needs no working set', async () => {
  const w = boot();
  w.glom.clear();
  w.glom.watch({ selector: '#cards div', settle: 5 });
  const extra = w.document.createElement('div');
  w.document.getElementById('cards').append(extra);
  await new Promise(r => setTimeout(r, 40));
  assert.equal(w.glom.get().length, 5);
  w.glom.watch.stop();
});

// ---- columns: repetition → table -------------------------------------------

test('columns: rows become records, boilerplate drops, links add @href', () => {
  const w = boot();
  w.glom(w.q('tbody tr'));
  const out = w.glom.columns();
  assert.equal(out.length, 3);
  const keys = Object.keys(out[0]);
  assert.ok(keys.some(k => k.endsWith('@href')), `expected an @href column in ${keys}`);
  const flat = out.map(r => Object.values(r).join(' '));
  assert.match(flat[0], /HB 1001/);
  assert.match(flat[0], /\/hb1/);
  assert.match(flat[1], /Passed/);
});

test('columns: single member keeps everything (nothing varies)', () => {
  const w = boot();
  w.glom(w.q('tbody tr >> nth=0'));
  const out = w.glom.columns();
  assert.equal(out.length, 1);
  assert.ok(Object.keys(out[0]).length >= 2);
});

// ---- harvest: sweep until dry -----------------------------------------------

test('harvest: accumulates records across scrolls until dry', async () => {
  const w = boot();
  const feed = w.document.createElement('div');
  feed.id = 'feed';
  w.document.body.append(feed);
  const add = n => { const d = w.document.createElement('div'); d.className = 'item'; d.textContent = `item ${n}`; feed.append(d); };
  add(1); add(2);

  let total = 2;
  const scroll = () => {                        // fake virtualization: each scroll reveals more
    if (total < 6) { add(++total); add(++total); }
    if (total >= 6) feed.removeChild(feed.children[0]);   // and older rows leave the DOM
  };
  const records = await w.glom.harvest({ selector: '#feed .item', scroll, settle: 1, dry: 2 });
  assert.equal(records.length, 6);              // all six seen, despite eviction
  assert.deepEqual([...new Set(records.map(r => r.text))].length, 6);
});

test('harvest: fingerprints from the working set when no selector given', async () => {
  const w = boot();
  w.glom(w.q('tbody tr >> nth=0'));
  const records = await w.glom.harvest({ scroll: () => {}, settle: 1, dry: 1 });
  assert.equal(records.length, 3);              // all rows share the seed's tag path
});

// ---- lasso: drag-rectangle select -------------------------------------------

test('lasso: discovery keeps selection roots; jsdom needs zero:true', async () => {
  const w = boot();
  w.glom.clear();
  const p = w.glom.lasso({ zero: true });       // jsdom boxes are all 0×0 at 0,0
  const veil = w.document.getElementById('glom-lasso-veil');
  assert.ok(veil, 'veil overlay armed');
  const ev = (type, x, y) => veil.dispatchEvent(new w.MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
  ev('pointerdown', 0, 0); ev('pointermove', 5, 5); ev('pointerup', 10, 10);
  const picked = await p;
  assert.equal(w.document.getElementById('glom-lasso-veil'), null);
  // roots = body's direct children (their parents aren't in the candidate set)
  assert.deepEqual(texts(picked).slice(0, 1), ['Bills']);
  assert.equal(picked.length, w.document.body.children.length);
});

test('lasso: Esc cancels, overlay gone, set unchanged', async () => {
  const w = boot();
  w.glom(w.q('tbody tr'));
  const p = w.glom.lasso();
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  const kept = await p;
  assert.equal(kept.length, 3);
  assert.equal(w.document.getElementById('glom-lasso-veil'), null);
});

// ---- census: page-shape ping --------------------------------------------------

test('census: ranks repeating tag paths, grab() adopts, clear() unmarks', () => {
  const w = boot();
  const groups = w.census(20, { min: 2 });
  assert.ok(groups.length >= 2);
  assert.equal(groups[0].count, 6);                       // the six tds lead
  assert.match(groups[0].path, /tbody\/tr\/td$/);
  const rows = [...groups].find(g => g.path.endsWith('tbody/tr'));
  assert.equal(rows.count, 3);                            // thead/tr is a different path
  assert.ok(w.document.querySelector('[data-census-0]'), 'top group marked');

  const i = groups.indexOf(rows);
  assert.equal(w.census.grab(i).length, 3);               // adopted as working set
  w.census.clear();
  assert.equal(w.document.querySelector('[data-census-0]'), null);
});

// ---- templates: Wring-style induction over signatures ----------------------------

test('templates: hashy per-instance classes become slots, decoys stay out', () => {
  const w = boot();
  w.glom(w.q('#cards div'));                    // c.hash-x1, c.hash-x2, c.hash-x3, other
  const groups = w.glom.templates();
  const cards = groups.find(g => g.template.includes('${0}'));
  assert.ok(cards, 'a slotted group exists');
  assert.match(cards.template, /c\.hash-x\$\{0\}$/);   // char refinement absorbed "hash-x"
  assert.equal(cards.count, 3);
  assert.deepEqual([...cards.slots].sort(), ['1', '2', '3']);
  assert.ok(!texts(cards.els).includes('delta'), '.other decoy excluded');
});

test('templates: whole page (empty set) — empty-slot semantics merge cell + link', () => {
  const w = boot();
  w.glom.clear();
  const groups = w.glom.templates();
  // Bookend templates match empty slots, so td (slot '') and td>a (slot 'a')
  // are one family — faithful Wring semantics.
  const cells = groups.find(g => /tbody\.tr\.td\.\$\{0\}$/.test(g.template));
  assert.equal(cells.count, 9);                 // 6 tds + 3 anchors
  assert.deepEqual([...cells.slots].sort(), ['', 'a']);
  const rows = groups.find(g => /tbody\.tr\.row\.\$\{0\}$/.test(g.template));
  assert.equal(rows.count, 3);                  // odd/even split lands in the slot
  assert.deepEqual([...rows.slots].sort(), ['even', 'odd']);
});

test('templates: grab adopts a group, clear removes hue marks', () => {
  const w = boot();
  w.glom.clear();
  const groups = w.glom.templates();
  assert.ok(w.document.querySelector('[data-tmpl-0]'), 'top group marked');
  const i = groups.findIndex(g => /row\.\$\{0\}$/.test(g.template));
  assert.equal(w.glom.templates.grab(i).length, 3);
  w.glom.templates.clear();
  assert.equal(w.document.querySelector('[data-tmpl-0]'), null);
});

test('templates: the raw engine is lossless, including empty slots', () => {
  const w = boot();
  const refined = w.glom.templates.group(['a.b.card-1', 'a.b.card-2', 'a.b.card-3', 'z.q']);
  assert.equal(refined.groups.length, 1);
  assert.match(refined.groups[0].template, /card-\$\{0\}$/);   // char refinement absorbed "card-"
  assert.deepEqual(refined.ungrouped, ['z.q']);

  const withEmpty = w.glom.templates.group(['a.b.card-1', 'a.b.card-2', 'a.b', 'z.q']);
  assert.equal(withEmpty.groups[0].members.length, 3);         // bare "a.b" joins via empty slot
  for (const r of [refined, withEmpty])
    for (const m of r.groups[0].members)
      assert.equal(w.glom.templates.reconstruct(r.groups[0].template, [...m.slots]), m.original);
});

// ---- sets: named working sets ---------------------------------------------------

test('sets: save/use/names/forget round-trip', () => {
  const w = boot();
  w.glom(w.q('tbody tr'));
  w.glom.save('rows');
  w.glom(w.q('#cards div'));
  w.glom.save('cards');
  assert.deepEqual({ ...w.glom.names() }, { rows: 3, cards: 4 });
  assert.equal(w.glom.use('rows').length, 3);
  assert.deepEqual(texts(w.glom.get()).length, 3);
  w.glom.forget('cards');
  assert.deepEqual({ ...w.glom.names() }, { rows: 3 });
  w.glom.forget();
  assert.deepEqual({ ...w.glom.names() }, {});
});

// ---- deck: live side-window -------------------------------------------------------

test('deck: renders the set, re-renders on every glom.set, close() unhooks', () => {
  const w = boot();
  const doc = w.document.implementation.createHTMLDocument('deck');
  w.open = () => ({ closed: false, document: doc, close() { this.closed = true; } });

  w.glom(w.q('tbody tr'));
  w.glom.deck();
  assert.equal(doc.querySelectorAll('tbody tr').length, 3);
  assert.match(doc.body.textContent, /3 in set/);

  w.glom(w.q('a'));                                       // any set change re-renders
  assert.equal(doc.querySelectorAll('tbody tr').length, 3);
  assert.match(doc.body.textContent, /HB 1001/);
  assert.match(doc.body.textContent, /\/hb1/);

  w.glom.deck.close();                                    // unsubscribes from onSet
  assert.equal(w.glom.onSet.length, 0);
  w.glom(w.q('td'));                                      // no longer renders
  assert.match(doc.body.textContent, /HB 1001/);
});

// ---- core: kernels + the onSet bus --------------------------------------------

test('core: onSet subscribers fire after every set, errors are contained', () => {
  const w = boot();
  const seen = [];
  w.glom.onSet.push(els => seen.push(els.length));
  w.glom.onSet.push(() => { throw new Error('bad subscriber'); });
  w.glom('hearing');
  w.glom.up('tr');
  assert.deepEqual([...seen], [2, 2]);                    // both ops funneled through set
  assert.ok(w.glom.core.SCOPE.includes('body'));
  assert.equal(w.glom.core.upath(w.q('a')[0]), 'html/body/table/tbody/tr/td/a');
});

// ---- recipe: the session journal ------------------------------------------------

test('recipe: console-level calls replay as a script; elements are placeholders', () => {
  const w = boot();
  w.glom.recipe.clear();
  w.glom('hearing');
  w.glom.up('tr');
  w.glom.keep(/1001/);
  w.glom.save('rows');
  const script = w.glom.recipe();
  assert.equal(script, 'glom("hearing");\nglom.up("tr");\nglom.keep(/1001/);\nglom.save("rows");');

  w.glom.recipe.clear();
  w.glom(w.q('a'));                                       // element args can't travel
  assert.match(w.glom.recipe.trail[1], /glom\(\/\* elements \*\/\)/);
  assert.match(w.glom.recipe.trail[0], /^q\("a"\)/);      // q calls recorded too
});

// ---- join: relational joins ------------------------------------------------------

test('join: structural relations pair named sets; custom predicates work', () => {
  const w = boot();
  w.glom(w.q('tbody a'));
  w.glom.save('links');
  w.glom(w.q('tbody tr'));
  w.glom.save('rows');

  const pairs = w.glom.join('links', 'rows', 'inside');
  assert.equal(pairs.length, 3);
  assert.deepEqual([...pairs].map(p => p.aText), ['HB 1001', 'HB 1002', 'HB 1003']);
  assert.ok([...pairs].every(p => p.b.contains(p.a)));

  const custom = w.glom.join('rows', 'links', (row, a) => row.contains(a));
  assert.equal(custom.length, 3);

  assert.deepEqual([...w.glom.join('links', 'rows', 'no-such-rel')], []);
});

// ---- semantics: the structured data pages already carry ---------------------------

test('semantics: JSON-LD, microdata, and social metas come back typed', () => {
  const w = boot(`<!doctype html><html><head>
      <meta property="og:title" content="Bill Tracker">
      <meta name="twitter:card" content="summary">
      <meta name="viewport" content="width=device-width">
      <script type="application/ld+json">{"@type": "Legislation", "name": "HB 1001"}</scr` + `ipt>
    </head><body>
      <div itemscope itemtype="https://schema.org/Person">
        <span itemprop="name">Ada</span>
        <a itemprop="url" href="/ada">profile</a>
        <div itemprop="knows" itemscope><span itemprop="name">Grace</span></div>
      </div>
    </body></html>`);
  const s = w.glom.semantics();
  assert.equal(s.jsonld[0]['@type'], 'Legislation');
  assert.deepEqual({ ...s.meta }, { 'og:title': 'Bill Tracker', 'twitter:card': 'summary' });
  const person = [...s.microdata].find(m => m.type.endsWith('Person'));
  assert.equal(person.props.name, 'Ada');                 // nested item's name doesn't leak up
  assert.equal(person.props.url, '/ada');                 // href read before text
  const nested = [...s.microdata].find(m => m.props.name === 'Grace');
  assert.ok(nested, 'nested itemscope is its own item');
});

// ---- grow by style ------------------------------------------------------------------

test('grow: {by:"style"} matches computed-style fingerprints (uniform under jsdom)', () => {
  const w = boot();
  w.glom([w.q('#cards div')[0]]);
  const grown = w.glom.grow({ by: 'style' });
  // jsdom computes identical styles for everything, so the tag component of
  // the fingerprint does the filtering: every div, nothing else.
  assert.equal(grown.length, w.document.querySelectorAll('body div').length);
  assert.ok([...grown].every(n => n.tagName === 'DIV'));
});

// ---- the committed artifact ----------------------------------------------

test('console/suite.js on disk matches a fresh assemble()', () => {
  const disk = readFileSync(path.join(repoRoot, 'console', 'suite.js'), 'utf8');
  assert.equal(disk, assemble(), 'console/suite.js is stale — run `npm run build:console`');
});
