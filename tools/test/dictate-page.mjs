#!/usr/bin/env node
// pages/dictate.html — the four claims that only the assembled page can answer.
//
//   node tools/test/dictate-page.mjs
//
// kits/dictate.js has its own suite under node --test, and it covers the
// composition rules with a stub. What it cannot cover is the PAGE: whether the
// draft really survives a reload, whether the correction list reaches the
// buffer, whether a filed note really stops coming back, and whether the Save
// button is where a thumb can reach it. The last one is not a style question.
// The first headless shot of this page showed Save sitting under the FAB
// launcher, which is fixed at bottom-6 right-6 on every page that boots the
// lib chain: a primary action covered by standing equipment, invisible in the
// source and invisible to jsdom, which has no layout.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PHONE = { width: 390, height: 844 };

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
const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true });
// A token, so Jot and Drop are live. BEFORE newPage: an init script added to a
// context does not reach a page that already exists, which is why Drop sat
// disabled the first time this ran.
await ctx.addInitScript(() => { try { localStorage.setItem('ghToken', 'test-token'); } catch {} });
const page = await ctx.newPage();

// A correction list with two entries. Everything the page writes is caught
// rather than sent.
const writes = [];
await page.route('**/*', route => {
  const url = route.request().url();
  // Only the page's OWN reads and writes are caught here. Everything else on
  // api.github.com is the lib chain fetching its own files, which resolveCdn
  // answers from the checkout; catching those too was the first thing this
  // harness got wrong and it 404'd the whole boot.
  if (url.includes('api.github.com') && url.includes('/contents/')) {
    if (route.request().method() === 'PUT') {
      const body = JSON.parse(route.request().postData() || '{}');
      writes.push({ url, message: body.message,
                    text: Buffer.from(body.content || '', 'base64').toString('utf8') });
      return route.fulfill({ status: 201, contentType: 'application/json',
                             body: JSON.stringify({ content: { sha: 'written' } }) });
    }
    if (url.includes('dictation-fixes.json')) {
      const fixes = { items: [{ from: 'js deliver', to: 'jsDelivr' },
                              { from: 'web tools', to: 'web-tools' }] };
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ content: Buffer.from(JSON.stringify(fixes)).toString('base64'),
                               encoding: 'base64', sha: 'fixes', size: 1 }) });
    }
    if (/web-tools-private|mehrlander\/home/.test(url)) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
  }
  if (url.startsWith(origin)) return route.continue();
  const r = resolveCdn(url, root, null);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});
page.on('pageerror', e => console.log(`  [pageerror] ${e.message}`));

// The stub goes in AFTER load, since the kit resolves its constructor lazily
// at start() and this Chromium carries a real webkitSpeechRecognition that
// would answer instead.
const stub = () => page.evaluate(() => {
  class FakeSR {
    constructor() { window.__sr = this; window.__engines = (window.__engines || 0) + 1; }
    start() {}
    stop() { this.onend && this.onend(); }
    say(text, final) {
      this.onresult({ resultIndex: 0,
        results: [Object.assign([{ transcript: text }], { isFinal: !!final })] });
    }
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
  window.__engines = 0;
});

const open = async (query = '') => {
  await page.goto(`${origin}/pages/dictate.html${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await stub();
};
const begin = async () => {
  const tap = page.locator('button:has-text("start talking"), button:has-text("Tap to carry on")');
  if (await tap.count()) await tap.first().click();
  await page.waitForTimeout(200);
};
const say = async (t, final = true) => {
  await page.evaluate(([x, f]) => window.__sr.say(x, f), [t, final]);
  await page.waitForTimeout(120);
};
const buffer = () => page.evaluate(() => document.querySelector('[x-ref="body"]').textContent);

try {
  // ── 1. The corner belongs to the cursor pad ──────────────────────────
  // The FAB launcher is fixed at bottom-6 right-6 on every page that boots
  // the lib chain, and it sat on this page's Save button until the layout
  // reserved the corner. Once the composer's grid came across, the corner
  // became the CURSOR PAD's, which is the one control here that is held and
  // dragged rather than tapped, so the page opts out of the FAB entirely
  // (data-no-fab). Both halves are asserted, because a silently returning
  // launcher would land on the pad and the source would not say so.
  console.log('geometry at 390x844:');
  await open();
  const boxes = await page.evaluate(() => {
    const byTitle = (t) => document.querySelector(`button[title^="${t}"]`);
    const r = (el) => el ? el.getBoundingClientRect().toJSON() : null;
    return {
      save: r([...document.querySelectorAll('button')].find(b => /Save/.test(b.textContent))),
      pad: r(document.querySelector('button:has(i.ph-crosshair)')),
      mic: r(document.querySelector('button[title*="listening"], button[title*="Recording"]')),
      fab: r(document.querySelector('.fixed.bottom-6.right-6')),
      h: innerHeight, docH: document.body.scrollHeight, w: innerWidth,
    };
  });
  ok('the page declines the FAB, so nothing is fixed over the corner', !boxes.fab,
    JSON.stringify(boxes.fab));
  // The instruments live in the HEADER now: record, undo, redo and the target
  // are each tapped a handful of times a session, and the bottom of a phone
  // belongs to whatever is tapped every sentence.
  ok('the target sits in the header', !!boxes.pad && boxes.pad.top < 60, JSON.stringify(boxes.pad));
  ok('the mic sits in the header', !!boxes.mic && boxes.mic.top < 60, JSON.stringify(boxes.mic));
  ok('and none of them overlaps its neighbour',
    !!boxes.mic && !!boxes.pad && boxes.mic.right <= boxes.pad.left,
    `mic.right=${boxes.mic?.right} target.left=${boxes.pad?.left}`);
  ok('Save is a thumb-sized target', !!boxes.save && boxes.save.height >= 44 && boxes.save.width >= 100,
    JSON.stringify(boxes.save));
  ok('and it reaches the bottom of the screen', !!boxes.save && boxes.save.bottom > boxes.h - 24,
    JSON.stringify(boxes.save));
  ok('the shell does not scroll the document', boxes.docH <= boxes.h + 1,
    `body=${boxes.docH} viewport=${boxes.h}`);
  ok('the painter is asked for no arrow cluster',
    !(await page.evaluate(() => !!document.querySelector('[data-d="nudge"]'))));

  // ── 1b. The selection lock, over the WHOLE surface ───────────────────
  // Reported from the phone on 2026-08-24: selection was not suppressed where
  // it should be. The painted text was locked and the scroll box around it was
  // not, so every press in the padding and in the empty canvas below the last
  // line, which is most of the screen, raised the platform's own selection.
  // The lock is a stylesheet now, for the reason the composer has one, and
  // this is the measurement rather than a reading of the CSS.
  console.log('the selection lock:');
  const locks = await page.evaluate(() => {
    const cs = (sel) => {
      const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
      if (!el) return null;
      const c = getComputedStyle(el);
      return { sel: c.webkitUserSelect || c.userSelect, touch: c.touchAction };
    };
    const host = document.querySelector('[x-ref="body"]');
    return {
      host: cs(host),
      view: cs('[x-ref="view"]'),
      layer: cs('[x-ref="layer"]'),
      marks: cs('[x-ref="layer"] ~ div button'),
      pad: cs('button:has(i.ph-crosshair)'),
      root: cs('[data-dictate-ui]'),
    };
  });
  for (const [name, v] of Object.entries(locks)) {
    if (name === 'pad') continue;
    ok(`${name} refuses the browser its own selection`, v && v.sel === 'none', JSON.stringify(v));
    ok(`${name} refuses double-tap zoom`, v && v.touch === 'manipulation', JSON.stringify(v));
  }
  // touch-action does NOT inherit, which is how the host and the painted spans
  // computed `auto` under a layer that said manipulation.
  ok('the painted spans are covered too, since touch-action does not inherit',
    await page.evaluate(() => {
      const sp = document.querySelector('[x-ref="body"] [data-d="text"]');
      if (!sp) return false;
      const c = getComputedStyle(sp);
      return (c.webkitUserSelect || c.userSelect) === 'none' && c.touchAction === 'manipulation';
    }));
  // The pad is the one deliberate exception, and it says so inline so that
  // specificity settles it rather than source order.
  ok('the pad keeps touch-action:none, which is what makes its drag work',
    locks.pad && locks.pad.touch === 'none', JSON.stringify(locks.pad));
  // And the keyboard gets the platform back, since a textarea is where a
  // reader looks for select-all and the caret handles.
  await page.evaluate(() => {
    const el = document.querySelector('[x-data="dictate"]');
    el._x_dataStack[0].edit = true;
  });
  await page.waitForTimeout(150);
  ok('the textarea gets selection back',
    await page.evaluate(() => {
      const c = getComputedStyle(document.querySelector('textarea'));
      return (c.webkitUserSelect || c.userSelect) === 'text';
    }));
  await page.evaluate(() => { document.querySelector('[x-data="dictate"]')._x_dataStack[0].edit = false; });
  await page.waitForTimeout(150);

  // ── 2. The engine is kept alive ──────────────────────────────────────
  console.log('keep-alive:');
  await begin();
  await say('the first sentence');
  const before = await page.evaluate(() => window.__engines);
  // An end nobody asked for: WebKit's own silence timeout, from inside.
  await page.evaluate(() => window.__sr.onend());
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__engines);
  ok('a fresh engine came up behind the silence', after > before, `${before} -> ${after}`);
  ok('and the mic still reads as recording, which is the only readout there is',
    await page.evaluate(() => {
      const b = document.querySelector('button:has(i.ph-microphone)');
      return !!b && b.className.includes('btn-error');
    }));
  await say('the sentence after the pause');
  ok('both sides of the pause are in one buffer',
    /first sentence/.test(await buffer()) && /after the pause/.test(await buffer()),
    await buffer());

  // ── 3. Corrections reach the buffer ──────────────────────────────────
  console.log('corrections:');
  await say('we load it from js deliver every time');
  const withFix = await buffer();
  ok('a correction fires on a whole phrase', /jsDelivr/.test(withFix), withFix);
  ok('and the words it replaced are gone', !/js deliver/.test(withFix), withFix);
  await say('Web tools is the hub');
  const cased = await buffer();
  ok('a correction at the head of a sentence keeps its capital',
    /Web-tools is the hub/.test(cased), cased);

  // ── 3b. The two gestures the composer port exists for ────────────────
  console.log('the cursor pad and the double tap:');
  const caretAt = () => page.evaluate(() => {
    const el = document.querySelector('[x-data="dictate"]');
    return el?._x_dataStack?.[0]?.d?.range?.start ?? null;
  });
  // The pad is pressed and dragged. The caret starts at the end (a null
  // range), so the first drag has to place one; dragging LEFT walks it back
  // through the buffer, which is the whole of what the control does.
  const padBox = await page.locator('button:has(i.ph-crosshair)').boundingBox();
  await page.mouse.move(padBox.x + padBox.width / 2, padBox.y + padBox.height / 2);
  await page.mouse.down();
  for (let i = 0; i < 14; i++) {
    await page.mouse.move(padBox.x + padBox.width / 2 - 8 * (i + 1), padBox.y + padBox.height / 2);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(150);
  const moved = await caretAt();
  const len = await page.evaluate(() => document.querySelector('[x-ref="body"]').textContent.length);
  ok('a pad drag places the caret inside the buffer', moved != null && moved < len,
    `caret=${moved} length=${len}`);
  ok('and it did not have to touch the words to do it',
    await page.evaluate(() => !!document.querySelector('[data-d="caret"]')));

  // THE TARGET'S TAP HALF. Tap it and the caret becomes one end of a
  // selection; the next tap in the text is the other end. Two taps for an
  // arbitrary range, where the long press gives only a word.
  const target = page.locator('button:has(i.ph-crosshair)');
  const anchored = () => page.evaluate(() =>
    document.querySelector('[x-data="dictate"]')._x_dataStack[0].anchoring);
  const sel = () => page.evaluate(() => {
    const d = document.querySelector('[x-data="dictate"]')._x_dataStack[0].d;
    const r = d.range;
    return r && r.start !== r.end ? { ...r, text: d.text.slice(r.start, r.end) } : null;
  });
  const anchorAt = await caretAt();
  await target.click();
  await page.waitForTimeout(150);
  ok('a tap on the target arms an anchor rather than dragging', await anchored());
  ok('and the button says so, in the ring an armed pin wears',
    await target.evaluate(el => el.className.includes('btn-error')));

  const words = await page.locator('[x-ref="body"] [data-d="text"]').first().boundingBox();
  await page.mouse.click(words.x + 40, words.y + 12);
  await page.waitForTimeout(250);
  const range = await sel();
  ok('the next tap in the text completes the selection', !!range, JSON.stringify(range));
  ok('it runs from the caret that was there to the word that was tapped',
    !!range && (range.start === anchorAt || range.end === anchorAt),
    `anchor=${anchorAt} range=${JSON.stringify(range)}`);
  ok('the anchor disarms once it is spent', !(await anchored()));
  ok('and the edge that moved is armed, so the pad can refine it',
    !!(await page.evaluate(() => document.querySelector('[x-data="dictate"]')._x_dataStack[0].armed)));

  // Tapping it again while armed is the way out, since an armed control with
  // no cancel is a mode the reader cannot leave.
  await page.evaluate(() => { const c = document.querySelector('[x-data="dictate"]')._x_dataStack[0]; c.d.clearRange(); c.armed = null; c.paint(); });
  await target.click();
  await page.waitForTimeout(120);
  ok('tapping the armed target again cancels it', await anchored());
  await target.click();
  await page.waitForTimeout(120);
  ok('...and a second tap puts it away', !(await anchored()));

  // A double tap on the words opens the keyboard, with the caret where it
  // landed. The pencil is retired, so this is the only way in.
  const line = await page.locator('[x-ref="body"] [data-d="text"]').first().boundingBox();
  await page.mouse.dblclick(line.x + 60, line.y + 12);
  await page.waitForTimeout(300);
  ok('a double tap opens the keyboard', await page.locator('textarea').isVisible());
  ok('there is no pencil to have opened it instead',
    !(await page.evaluate(() => !!document.querySelector('button[title*="Type instead"]'))));
  await page.evaluate(() => document.querySelector('textarea').blur());
  await page.waitForTimeout(300);
  ok('and blurring is the way out', !(await page.locator('textarea').isVisible()));

  // ── 4. The draft survives, and a filed note does not ─────────────────
  console.log('persistence:');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const back = await buffer();
  ok('an interrupted session comes back after a reload', /first sentence/.test(back), back);
  ok('and says so rather than pretending it was always there',
    /Picked up where you left off/.test(await page.locator('body').innerText()));

  await stub();
  writes.length = 0;
  await page.locator('button:has-text("Save")').click();
  await page.waitForTimeout(200);
  // A NAMED CHECK because the failure has no error in it. `:disabled` was
  // bound to `!token || saving`, and `saving` is a string: with a token in
  // hand the expression is '', which Alpine's bind() writes rather than
  // removes, because it drops an attribute only for null, undefined and
  // false. Both writing destinations were dead, with a token present, and
  // nothing anywhere said why.
  ok('Drop is live when a token is present',
    await page.locator('button:has-text("Drop")').isEnabled());
  await page.locator('button:has-text("Drop")').click();
  await page.waitForTimeout(600);
  ok('Drop wrote one file', writes.length === 1, JSON.stringify(writes.map(w => w.url)));
  ok('into the dated tray', /chron%2Fdump|chron\/dump/.test(writes[0]?.url || ''), writes[0]?.url);
  ok('carrying the words', /first sentence/.test(writes[0]?.text || ''), writes[0]?.text);
  ok('and the page went blank behind it', !(await buffer()).trim(), await buffer());

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  ok('a note that was FILED does not come back', !(await buffer()).trim(), await buffer());
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s): ${failures.join(', ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
