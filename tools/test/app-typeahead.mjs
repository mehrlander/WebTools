#!/usr/bin/env node
// Typing anywhere in the app reaches a search box.
//
//   node tools/test/app-typeahead.mjs
//
// The rule under test is wireAppTypeahead in app/index.html: a bare printable
// key with nowhere else to go focuses a search box and lands in it. Two things
// make it a browser check rather than a jsdom one, and they are the two things
// most likely to break.
//
// THE CHARACTER IS CARRIED BY THE BROWSER, not by the handler. On the common
// path the handler focuses the box and returns without preventDefault, leaving
// the keydown's default action to run against whatever is focused by then,
// which is the box. jsdom runs no default action for a keydown, so a jsdom
// test can only say focus moved, which is the half that was never in doubt.
//
// AND VISIBILITY IS LAYOUT. The sidebar is a fixed overlay below lg and a
// static column at lg and up, hidden two different ways; `data-find-box`
// precedence is decided by getClientRects. Neither has meaning without a real
// layout engine.
//
// The app boots signed out, which is the state that caught the defect this
// check now pins: with no token there is no sidebar to open (showSidebar is
// false), and an earlier draft seeded the character into a box that stayed
// display:none while focus never moved. Browsing to a repo turns the sidebar
// on without a token, which is how the reachable cases are reached here.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
};

const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
  try {
    const body = await readFile(path.join(root, rel));
    res.writeHead(200, { 'content-type': typeFor(rel) });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// The app's CDN dependencies come off disk; without this the sandbox blocks
// jsDelivr and every assertion below fails as a boot failure.
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  const r = resolveCdn(url, root, null);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});
page.on('pageerror', e => console.log(`  [pageerror] ${e.message}`));

// What the keystroke did: where focus went, what the box holds, and whether
// the sidebar had to be opened to get there.
const state = () => page.evaluate(() => {
  const box = document.getElementById('quick-find-box');
  const a = document.activeElement;
  return {
    active: a?.id || a?.dataset?.probe ||
            (a?.hasAttribute?.('data-find-box') ? 'find-box' : null) || a?.tagName || null,
    box: box?.value ?? null,
    sidebarOpen: window.__shell.sidebarOpen,
    showSidebar: window.__shell.showSidebar,
  };
});
const reset = () => page.evaluate(() => {
  const box = document.getElementById('quick-find-box');
  if (box) { box.value = ''; box.dispatchEvent(new Event('input', { bubbles: true })); }
  document.activeElement?.blur?.();
  document.querySelectorAll('[data-probe]').forEach(el => el.remove());
});

try {
  await page.goto(`${origin}/app/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__shell && document.getElementById('quick-find-box'),
                             { timeout: 30000 });
  await page.waitForTimeout(600);

  console.log('signed out, where the sidebar has nothing to show:');
  let s = await state();
  ok('the app boots with no sidebar to open', s.showSidebar === false, JSON.stringify(s));
  await page.keyboard.press('k');
  await page.waitForTimeout(150);
  s = await state();
  ok('the key is left alone rather than seeded into a hidden box',
     s.active === 'BODY' && s.box === '', JSON.stringify(s));

  // A repo-context view turns the sidebar on without a token: estateCtx goes
  // false there, so showSidebar is true and the finder is a real destination.
  // Pages is such a view AND carries its own filter, which is the precedence
  // case; the landing carries none, which is every other case below.
  console.log('a view carrying its own search box (Pages):');
  await page.evaluate(() => window.__shell.goPages());
  await page.waitForFunction(() => window.__shell.showSidebar === true, { timeout: 10000 });
  await page.evaluate(() => { window.__shell.sidebarOpen = true; });
  await page.waitForTimeout(400);
  await reset();
  await page.keyboard.press('t');
  await page.waitForTimeout(150);
  s = await state();
  ok('the view filter takes the key, not the finder',
     s.active === 'find-box' && s.box === '', JSON.stringify(s));
  ok('and the character lands in it',
     (await page.evaluate(() => document.querySelector('[data-find-box]').value)) === 't');

  await page.evaluate(() => window.__shell.goLanding());
  await page.waitForTimeout(400);
  await reset();

  console.log('the sidebar out, no view box on screen:');
  await page.keyboard.press('k');
  await page.waitForTimeout(150);
  s = await state();
  ok('focus moves to the finder', s.active === 'quick-find-box', JSON.stringify(s));
  ok('and the browser carries the character into it', s.box === 'k', JSON.stringify(s));
  await page.keyboard.type('eyboard');
  await page.waitForTimeout(150);
  ok('the rest of the word follows natively',
     (await state()).box === 'keyboard', JSON.stringify(await state()));

  console.log('a field already has the keystroke:');
  await reset();
  await page.evaluate(() => {
    const i = document.createElement('input');
    i.dataset.probe = 'field';
    document.body.append(i); i.focus();
  });
  await page.keyboard.press('z');
  await page.waitForTimeout(150);
  s = await state();
  ok('the finder is not pulled out from under it', s.active === 'field' && s.box === '',
     JSON.stringify(s));

  console.log('a data-find-box that is not on screen:');
  await reset();
  await page.evaluate(() => {
    const i = document.createElement('input');
    i.dataset.probe = 'off'; i.setAttribute('data-find-box', '');
    i.style.display = 'none';
    document.body.append(i);
  });
  await page.keyboard.press('w');
  await page.waitForTimeout(150);
  s = await state();
  ok('is skipped for the finder', s.active === 'quick-find-box' && s.box === 'w',
     JSON.stringify(s));

  console.log('keys that are not a query:');
  for (const [key, why] of [['Tab', 'a named key'], [' ', 'space'], ['Enter', 'Enter']]) {
    await reset();
    await page.keyboard.press(key === ' ' ? 'Space' : key);
    await page.waitForTimeout(120);
    s = await state();
    ok(`${why} is left alone`, s.active !== 'quick-find-box' && s.box === '', JSON.stringify(s));
  }
  await reset();
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(120);
  s = await state();
  ok('a modifier combination is left alone', s.active !== 'quick-find-box' && s.box === '',
     JSON.stringify(s));

  console.log('the sidebar away, so the box has to be revealed first:');
  await reset();
  await page.evaluate(() => { window.__shell.sidebarOpen = false; });
  await page.waitForTimeout(250);
  ok('it starts hidden', (await page.evaluate(() =>
       document.getElementById('quick-find-box').getClientRects().length === 0)));
  await page.keyboard.press('r');
  await page.waitForTimeout(300);
  s = await state();
  ok('the sidebar opens', s.sidebarOpen === true, JSON.stringify(s));
  ok('focus lands on the finder', s.active === 'quick-find-box', JSON.stringify(s));
  ok('and the character is carried by hand', s.box === 'r', JSON.stringify(s));
  await page.keyboard.type('epo');
  await page.waitForTimeout(150);
  ok('typing continues natively from there',
     (await state()).box === 'repo', JSON.stringify(await state()));

  console.log('a deck on top:');
  await reset();
  await page.evaluate(() => window.gh.load('kits/swipe-deck.js'));
  await page.waitForFunction(() => !!window.swipeDeck, { timeout: 30000 });
  await page.evaluate(() => window.swipeDeck.open({
    items: [{ label: 'one' }], render: (it, host) => { host.textContent = it.label; },
  }));
  await page.waitForTimeout(400);
  await page.keyboard.press('m');
  await page.waitForTimeout(150);
  s = await state();
  ok('the finder stands down behind it', s.active !== 'quick-find-box' && s.box === '',
     JSON.stringify(s));
} catch (e) {
  console.log(`  FAIL  probe threw — ${e.message}`);
  failures.push('probe');
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failed` : '\nall ok');
process.exit(failures.length ? 1 : 0);
