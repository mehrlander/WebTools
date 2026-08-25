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
    if (url.includes('autocorrect.json')) {
      const list = { items: [{ from: 'js deliver', to: 'jsDelivr' },
                             { from: 'web tools', to: 'web-tools' }] };
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ content: Buffer.from(JSON.stringify(list)).toString('base64'),
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
      back: r(document.querySelector('button:has(i.ph-backspace)')),
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
  ok('the target is on the viewport centre line',
    !!boxes.pad && Math.abs((boxes.pad.left + boxes.pad.right) / 2 - boxes.w / 2) < 4,
    `centre=${boxes.pad && (boxes.pad.left + boxes.pad.right) / 2} of ${boxes.w}`);
  ok('backspace joined the header', !!boxes.back && boxes.back.top < 60, JSON.stringify(boxes.back));
  ok('Save is a thumb-sized target', !!boxes.save && boxes.save.height >= 44 && boxes.save.width >= 100,
    JSON.stringify(boxes.save));
  ok('and it has the bottom row to itself', !!boxes.save && boxes.save.bottom > boxes.h - 24
    && boxes.save.width > boxes.w * 0.9, JSON.stringify(boxes.save));
  ok('the shell does not scroll the document', boxes.docH <= boxes.h + 1,
    `body=${boxes.docH} viewport=${boxes.h}`);
  ok('the painter is asked for no arrow cluster',
    !(await page.evaluate(() => !!document.querySelector('[data-d="nudge"]'))));

  // ── 1c. The menu overlays; it does not shove the words down ──────────
  // It was a band inserted between the header and the text, so opening it
  // pushed the words down the screen to show four controls that are not about
  // the words at all. The measurement is the text pane's own top edge.
  console.log('the menu and the dictionary:');
  const topOf = () => page.evaluate(() =>
    document.querySelector('[x-ref="view"]').getBoundingClientRect().top);
  const shut = await topOf();
  await page.locator('button[title="More"]').click();
  await page.waitForTimeout(200);
  ok('the menu opens', await page.locator('button:has-text("Breaks")').isVisible());
  ok('and the text has not moved', Math.abs((await topOf()) - shut) < 1,
    `closed=${shut} open=${await topOf()}`);
  await page.mouse.click(200, 500);
  await page.waitForTimeout(200);
  ok('a tap outside closes it', !(await page.locator('button:has-text("Breaks")').isVisible()));

  // Autocorrect is one sheet holding the list AND the way to add to it, and
  // it is reached from the menu: the dictionary button in the header is gone,
  // since a control that opens a sheet the menu also opens is two doors.
  ok('no dictionary button survives in the header',
    !(await page.evaluate(() => !!document.querySelector('button:has(i.ph-book-open):not([class*=hover])'))) ||
    await page.evaluate(() => {
      const b = document.querySelector('button:has(i.ph-book-open)');
      return !b || b.closest('[x-show="menu"]') !== null;
    }));
  await page.locator('button[title="More"]').click();
  await page.waitForTimeout(200);
  await page.locator('button:has-text("Autocorrect")').click();
  await page.waitForTimeout(300);
  ok('the menu row opens the sheet', await page.locator('input[placeholder="heard"]').isVisible());
  ok('and the sheet carries the list, not a link out to GitHub',
    (await page.locator('text=web-tools').count()) > 0
    && !(await page.evaluate(() => !!document.querySelector('a[href*="autocorrect.json"]'))));
  // Scoped to the row list, since every sheet on this page has a close ✕ of
  // its own and an unscoped :has(i.ph-x) finds the hidden one first.
  const rowX = page.locator('.divide-y > div button');
  const rows = await rowX.count();
  ok('every row can be removed', rows >= 2, String(rows));
  await page.locator('[x-show="autoOpen"] button:has(i.ph-x)').first().click();
  await page.waitForTimeout(200);
  // Removing one is checked at the very END of this run: it writes a shorter
  // list into the page's own state, and the correction assertions further
  // down need both entries still in it.

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
  // The text pane is the one exception, and a deliberate one: it gives the
  // browser the vertical axis so it can scroll, keeps pinch so small type
  // stays readable, and takes the horizontal axis for drag-to-select.
  const wants = { view: 'pan-y pinch-zoom' };
  for (const [name, v] of Object.entries(locks)) {
    if (name === 'pad') continue;
    ok(`${name} refuses the browser its own selection`, v && v.sel === 'none', JSON.stringify(v));
    ok(`${name} refuses double-tap zoom`, v && v.touch === (wants[name] || 'manipulation'),
      JSON.stringify(v));
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
  console.log('autocorrect:');
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
  const armed = () => page.evaluate(() =>
    document.querySelector('[x-data="dictate"]')._x_dataStack[0].armed);
  const targetRed = () => target.evaluate(el => el.className.includes('btn-error'));
  const sel = () => page.evaluate(() => {
    const d = document.querySelector('[x-data="dictate"]')._x_dataStack[0].d;
    const r = d.range;
    return r && r.start !== r.end ? { ...r, text: d.text.slice(r.start, r.end) } : null;
  });
  const anchorAt = await caretAt();
  await target.click();
  await page.waitForTimeout(150);
  ok('a tap on the target arms an anchor rather than dragging',
    await armed() === 'anchor', String(await armed()));
  ok('and the button says so, in the ring an armed pin wears', await targetRed());

  const words = await page.locator('[x-ref="body"] [data-d="text"]').first().boundingBox();
  await page.mouse.click(words.x + 40, words.y + 12);
  await page.waitForTimeout(250);
  const range = await sel();
  ok('the next tap in the text completes the selection', !!range, JSON.stringify(range));
  ok('it runs from the caret that was there to the word that was tapped',
    !!range && (range.start === anchorAt || range.end === anchorAt),
    `anchor=${anchorAt} range=${JSON.stringify(range)}`);
  // THE MANEUVER SETS, IT DOES NOT LEAVE A PIN LIT. Leaving one armed meant a
  // third tap to close a selection that was already made, on a 12px pinhead,
  // with a near miss clearing it. Refining an edge afterwards is still one tap.
  ok('and the maneuver finishes disarmed', (await armed()) === null, String(await armed()));
  ok('so the target goes dark with it', !(await targetRed()));

  // ONE ARMED STATE, NOT TWO. A pinhead and the target are two ways into the
  // same fact, so the target is red whenever a pin is, and tapping it is the
  // full-size way to put that pin down.
  // The pins are hidden once a mouse has been seen (drag and shift-click do
  // the extending there), and this harness is all mouse, so ask for them back.
  await page.evaluate(() => { const c = document.querySelector('[x-data="dictate"]')._x_dataStack[0]; c.precise = false; c.paint(); });
  await page.waitForTimeout(120);
  await page.locator('[x-ref="layer"] [data-edge="end"]').click();
  await page.waitForTimeout(150);
  ok('arming a pinhead arms the page', (await armed()) === 'end', String(await armed()));
  ok('and the target is red for it, having not been tapped', await targetRed());
  ok('the selection survived the arming', !!(await sel()));
  // Tapping the target ADVANCES the cycle rather than always disarming, once
  // there is a selection to cycle. The safe exit the pinhead lacked survives:
  // no tap here can lose the selection, and off is at most two taps away.
  await target.click();
  await page.waitForTimeout(150);
  ok('tapping the target hands the arming to the other pin',
    (await armed()) === 'start', String(await armed()));
  await target.click();
  await page.waitForTimeout(150);
  ok('and once more puts it down', (await armed()) === null, String(await armed()));
  ok('...without ever disturbing the selection', !!(await sel()));

  // ── DRAGGING A PINHEAD DIRECTLY ──────────────────────────────────────
  // Tap-then-pad is still there; this is the gesture every reader already
  // expects of a handle. The finger sits on the BALL, which is off the line,
  // so the objection that made this surface tap-first never applied to it.
  await page.evaluate(() => { const c = document.querySelector('[x-data="dictate"]')._x_dataStack[0]; c.precise = false; c.d.select(4, 20); c.armed = null; c.paint(); });
  await page.waitForTimeout(150);
  const endPin = await page.locator('[x-ref="layer"] [data-edge="end"]').boundingBox();
  const wasSel = await sel();
  await page.mouse.move(endPin.x + endPin.width / 2, endPin.y + endPin.height - 4);
  await page.mouse.down();
  await page.waitForTimeout(60);
  ok('a pinhead arms itself on the way down', (await armed()) === 'end', String(await armed()));
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(endPin.x + endPin.width / 2 + 12 * (i + 1), endPin.y + endPin.height - 4);
    await page.waitForTimeout(25);
  }
  const during = await sel();
  ok('dragging it moves that edge', !!during && during.end > wasSel.end,
    `${JSON.stringify(wasSel)} -> ${JSON.stringify(during)}`);
  ok('and leaves the other edge alone', !!during && during.start === wasSel.start);
  await page.mouse.up();
  await page.waitForTimeout(150);
  ok('the release keeps the edge armed, so the pad can refine it',
    (await armed()) === 'end', String(await armed()));
  ok('and does not fall through to place a caret in the text', !!(await sel()));

  // THE VERTICAL DEADBAND. A short downward drag must not change the line, so
  // the thumb can clear the text before anything moves and a wandering slide
  // along a line does not step off it. A long one must.
  const lineH = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('[x-ref="view"]')).lineHeight));
  const dragPin = async (edge, dy) => {
    await page.evaluate(() => { const c = document.querySelector('[x-data="dictate"]')._x_dataStack[0]; c.precise = false; c.d.select(34, 60); c.armed = null; c.paint(); });
    await page.waitForTimeout(150);
    const box = await page.locator(`[x-ref="layer"] [data-edge="${edge}"]`).boundingBox();
    // Grab the ball, which hangs above the line on start and below it on end.
    const y0 = edge === 'end' ? box.y + box.height - 4 : box.y + 4;
    await page.mouse.move(box.x + box.width / 2, y0);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(box.x + box.width / 2, y0 + (dy * i) / 10);
      await page.waitForTimeout(20);
    }
    const r = await sel();
    await page.mouse.up();
    await page.waitForTimeout(120);
    return r;
  };
  const base = await dragPin('end', 0);
  const nudged = await dragPin('end', lineH * 1.2);
  ok('a drag of one line down does not move the edge off its line',
    nudged && base && nudged.end === base.end, `${base?.end} -> ${nudged?.end}`);
  const pushed = await dragPin('end', lineH * 2.6);
  ok('but past the deadband it steps, so the line is still reachable',
    pushed && base && pushed.end > base.end, `${base?.end} -> ${pushed?.end}`);

  // THE BUFFER IS DOWNWARD FOR BOTH, and LONGER for the start pin. Its ball
  // hangs above the line, so its thumb begins on the wrong side and the buffer
  // has to carry it down across the line before it starts clearing. Upward is
  // immediate for both, since that direction is clearance for neither.
  const endUp = await dragPin('end', -lineH * 1.2);
  ok('the end pin answers a short drag UP at once', endUp && base && endUp.end < base.end,
    `${base?.end} -> ${endUp?.end}`);

  const sBase = await dragPin('start', 0);
  const startShort = await dragPin('start', lineH * 1.8);
  ok('the start pin absorbs a drag that would already have moved the end one',
    startShort && sBase && startShort.start === sBase.start,
    `${sBase?.start} -> ${startShort?.start}`);
  const startLong = await dragPin('start', lineH * 4);
  ok('and moves once that longer buffer is spent',
    startLong && sBase && startLong.start > sBase.start, `${sBase?.start} -> ${startLong?.start}`);
  const startUp = await dragPin('start', -lineH * 1.2);
  ok('while up moves it at once, as on the other pin',
    startUp && sBase && startUp.start < sBase.start, `${sBase?.start} -> ${startUp?.start}`);

  // The geometry the two buffers are derived from, which is why they differ.
  ok('the start ball sits above its line and the end ball below', await page.evaluate(() => {
    const c = document.querySelector('[x-data="dictate"]')._x_dataStack[0];
    c.precise = false; c.d.select(34, 60); c.armed = null; c.paint();
    const lead = (e) => {
      const pin = document.querySelector(`[x-ref="layer"] [data-edge="${e}"]`);
      const bar = pin.firstElementChild.getBoundingClientRect();
      const dot = pin.lastElementChild.getBoundingClientRect();
      return (dot.top + dot.height / 2) - (bar.top + bar.height / 2);
    };
    return lead('start') < 0 && lead('end') > 0;
  }));

  // The pins have to vanish from hit testing while one is being dragged, or
  // caret-from-point answers with the pin the aim point is tracking.
  await page.evaluate(() => {
    const c = document.querySelector('[x-data="dictate"]')._x_dataStack[0];
    c.pinDrag = 'end'; c.armed = 'end'; c.paint();
  });
  await page.waitForTimeout(150);
  ok('a pin is transparent to hit testing while a pin drag is live',
    await page.evaluate(() => {
      const pin = document.querySelector('[x-ref="layer"] [data-edge]');
      return pin ? getComputedStyle(pin).pointerEvents === 'none' : false;
    }));
  await page.evaluate(() => { const c = document.querySelector('[x-data="dictate"]')._x_dataStack[0]; c.pinDrag = null; c.paint(); });
  await page.waitForTimeout(120);

  // ── A LONG PRESS THAT KEEPS GOING ────────────────────────────────────
  // The press takes a word; carrying on extends from it in one gesture, the
  // way the platform does, rather than making the reader lift and start again.
  await page.evaluate(() => { const c = document.querySelector('[x-data="dictate"]')._x_dataStack[0]; c.precise = false; c.d.clearRange(); c.armed = null; c.paint(); });
  await page.waitForTimeout(150);
  const line1 = await page.locator('[x-ref="body"] [data-d="text"]').first().boundingBox();
  await page.mouse.move(line1.x + 60, line1.y + 12);
  await page.mouse.down();
  await page.waitForTimeout(600);          // past the 450ms press
  const held = await sel();
  ok('a long press takes the word under the finger', !!held, JSON.stringify(held));
  ok('and arms nothing yet, since the gesture may end here', (await armed()) === null);

  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(line1.x + 60 + 14 * i, line1.y + 12);
    await page.waitForTimeout(25);
  }
  const grown = await sel();
  ok('dragging on extends the selection', grown && held && grown.end > held.end,
    `${JSON.stringify(held)} -> ${JSON.stringify(grown)}`);
  ok('from the WORD\'s edge, not from the character pressed',
    grown && held && grown.start === held.start,
    `start ${held?.start} -> ${grown?.start}`);
  ok('and the edge under the finger arms as it goes', (await armed()) === 'end');
  await page.mouse.up();
  await page.waitForTimeout(150);
  ok('the release leaves it armed, so the pad continues the same gesture',
    (await armed()) === 'end');
  ok('and does not fall through to place a caret', !!(await sel()));
  ok('nor leave the pins transparent afterwards',
    await page.evaluate(() => document.querySelector('[x-data="dictate"]')._x_dataStack[0].pinDrag) === null);

  // A PLAIN DRAG SELECTS, no long press. Sideways is the qualifier on a touch
  // screen, since the pane must keep the vertical axis to scroll.
  await page.evaluate(() => { const c = document.querySelector('[x-data="dictate"]')._x_dataStack[0]; c.precise = false; c.d.clearRange(); c.armed = null; c.paint(); });
  await page.waitForTimeout(150);
  await page.mouse.move(line1.x + 40, line1.y + 12);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(line1.x + 40 + 16 * i, line1.y + 12);
    await page.waitForTimeout(20);
  }
  const swiped = await sel();
  ok('a drag across the words selects without a long press', !!swiped, JSON.stringify(swiped));
  ok('and arms the edge it is moving', (await armed()) === 'end', String(await armed()));
  await page.mouse.up();
  await page.waitForTimeout(150);
  ok('the release leaves that edge armed too', (await armed()) === 'end');

  ok('the pane keeps the vertical axis and the pinch, giving up only sideways',
    await page.evaluate(() =>
      getComputedStyle(document.querySelector('[data-dictate-view]')).touchAction === 'pan-y pinch-zoom'));

  // TAPPING THE HEADER'S BACKGROUND PUTS ANY PIN DOWN, which is the way of
  // simply ending the arming rather than changing which edge is live. Its
  // buttons must keep their own taps.
  await page.evaluate(() => {
    const c = document.querySelector('[x-data="dictate"]')._x_dataStack[0];
    c.precise = false; c.d.select(4, 20); c.armed = 'end'; c.paint();
  });
  await page.waitForTimeout(150);
  const header = await page.locator('[x-data="dictate"] > div').first().boundingBox();
  await page.mouse.click(header.x + header.width / 2 - 62, header.y + header.height / 2);
  await page.waitForTimeout(150);
  ok('a tap on the header background disarms', (await armed()) === null, String(await armed()));
  ok('and leaves the selection alone', !!(await sel()));
  await target.click();
  await page.waitForTimeout(150);
  ok('the header tap did not eat the target\'s own tap', (await armed()) === 'end');
  await page.evaluate(() => { const c = document.querySelector('[x-data="dictate"]')._x_dataStack[0]; c.armed = null; c.paint(); });

  // AND IT HOLDS THE iOS SHEET for the length of the extension. The pane has
  // to keep scrolling, so this cannot be touch-action; it is a cancelled
  // touchmove (variant E), gated so an ordinary swipe still scrolls. The
  // listener lives on the node the touch started on, since paint() rebuilds
  // every span and a touch keeps its original, now detached, target.
  const holdProbe = async () => page.evaluate(() => {
    const ev = new Event('touchmove', { bubbles: true, cancelable: true });
    window.__pressed.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  await page.evaluate(({ x, y }) => { window.__pressed = document.elementFromPoint(x, y); },
    { x: line1.x + 60, y: line1.y + 12 });
  await page.mouse.move(line1.x + 60, line1.y + 12);
  await page.mouse.down();
  await page.waitForTimeout(120);          // inside the press, before it fires
  ok('an ordinary touch is left alone, so the pane still scrolls',
    (await holdProbe()) === false);
  await page.waitForTimeout(500);          // past 450ms: the press has taken
  ok('but once the long press takes, the sheet is held', (await holdProbe()) === true);
  await page.mouse.up();
  await page.waitForTimeout(150);
  ok('and the hold is released with the finger', (await holdProbe()) === false);

  // Dragging BACK inside the word restores it rather than cutting into it: the
  // word is the floor of this gesture, as it is on the platform.
  await page.mouse.move(line1.x + 60, line1.y + 12);
  await page.mouse.down();
  await page.waitForTimeout(600);
  const held2 = await sel();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(line1.x + 60 + 12 * i, line1.y + 12);
    await page.waitForTimeout(20);
  }
  await page.mouse.move(line1.x + 62, line1.y + 12);
  await page.waitForTimeout(80);
  const shrunk = await sel();
  await page.mouse.up();
  await page.waitForTimeout(120);
  ok('coming back inside the word restores it whole',
    shrunk && held2 && shrunk.start === held2.start && shrunk.end === held2.end,
    `${JSON.stringify(held2)} -> ${JSON.stringify(shrunk)}`);

  // NO STALK, DELIBERATELY. Arming used to push the ball out to clear the
  // thumb; the drag's vertical deadband above does that instead, from the
  // gesture rather than from the geometry. This holds the decision: the ball
  // marks the edge and does not move for being armed.
  const ballY = () => page.evaluate(() => {
    const dot = document.querySelector('[x-ref="layer"] [data-edge="start"]')?.lastElementChild;
    const r = dot?.getBoundingClientRect?.();
    return r ? r.top + r.height / 2 : null;
  });
  await page.evaluate(() => {
    const c = document.querySelector('[x-data="dictate"]')._x_dataStack[0];
    c.precise = false; c.d.select(4, 30); c.armed = null; c.paint();
  });
  await page.waitForTimeout(150);
  const rest = await ballY();
  await page.evaluate(() => { const c = document.querySelector('[x-data="dictate"]')._x_dataStack[0]; c.armed = 'start'; c.paint(); });
  await page.waitForTimeout(200);
  const lit = await ballY();
  ok('arming lights the pin without moving it', rest != null && Math.abs(rest - lit) < 1,
    `${rest} -> ${lit}`);
  ok('and the page asks the painter for no reach at all',
    await page.evaluate(() => {
      const dot = document.querySelector('[x-ref="layer"] [data-edge="start"]').lastElementChild;
      return !/transition/.test(dot.getAttribute('style'));
    }));

  // VARIANT D against the iOS sheet: touch-action alone was measured on device
  // to let the sheet go, so both touch events must be cancellable and cancelled
  // on the pad and on every pin, and the pins are rebuilt on every paint.
  const holds = await page.evaluate(() => {
    const probe = (el) => {
      if (!el) return null;
      const seen = {};
      for (const type of ['touchstart', 'touchmove']) {
        const ev = new Event(type, { bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
        seen[type] = ev.defaultPrevented;
      }
      return seen;
    };
    return {
      pad: probe(document.querySelector('button:has(i.ph-crosshair)')),
      pin: probe(document.querySelector('[x-ref="layer"] [data-edge]')),
    };
  });
  ok('the pad cancels touchstart, which touch-action cannot do', !!holds.pad?.touchstart);
  ok('the pad cancels touchmove, the half that holds the sheet', !!holds.pad?.touchmove);
  ok('a repainted pin carries the same hold', !!holds.pin?.touchstart && !!holds.pin?.touchmove);

  // WITH A SELECTION THE TARGET CYCLES THE PINS, since which edge am I about
  // to move is the only question left. Without one there are no pins to cycle,
  // so it arms an anchor instead and the next tap in the text is the far end.
  await page.evaluate(() => { const c = document.querySelector('[x-data="dictate"]')._x_dataStack[0]; c.d.select(4, 20); c.armed = null; c.paint(); });
  await page.waitForTimeout(150);
  await target.click(); await page.waitForTimeout(120);
  ok('with a selection, the target arms the end first', (await armed()) === 'end', String(await armed()));
  await target.click(); await page.waitForTimeout(120);
  ok('again and it hands over to the start', (await armed()) === 'start', String(await armed()));
  await target.click(); await page.waitForTimeout(120);
  ok('again and neither is armed', (await armed()) === null, String(await armed()));
  ok('and the selection survived the whole cycle', !!(await sel()));

  // And the target's own armed state has the same way out.
  await page.evaluate(() => { const c = document.querySelector('[x-data="dictate"]')._x_dataStack[0]; c.d.clearRange(); c.armed = null; c.paint(); });
  await target.click();
  await page.waitForTimeout(120);
  ok('with no selection it arms an anchor instead', (await armed()) === 'anchor');
  await target.click();
  await page.waitForTimeout(120);
  ok('...and a second tap puts it away', (await armed()) === null);

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

  // ── 5. Removing an autocorrect row ───────────────────────────────────
  // Last, because it writes a shorter list into the page's own state and the
  // correction assertions above need both entries still in it.
  console.log('removing a correction:');
  await page.locator('button[title="More"]').click();
  await page.waitForTimeout(200);
  await page.locator('button:has-text("Autocorrect")').click();
  await page.waitForTimeout(300);
  writes.length = 0;
  await page.locator('.divide-y > div button').first().click();
  await page.waitForTimeout(600);
  ok('it writes the shorter list', writes.length === 1
    && !JSON.parse(writes[0].text).items.some(c => c.from === 'web tools'),
    writes[0]?.text);
  ok('and the sheet stays open, since the list under it is the confirmation',
    await page.locator('input[placeholder="heard"]').isVisible());
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s): ${failures.join(', ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
