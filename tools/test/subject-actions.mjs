#!/usr/bin/env node
// The drawer's subject-side actions, proved in a real browser at depth 2.
//
//   node tools/test/subject-actions.mjs
//
// tools/test/fab-subject-actions.test.mjs pins the collection and attribution
// shape in jsdom. Three of the claims here are not shapes, and jsdom cannot
// hold them: whether a closure belonging to the frame's window can be INVOKED
// from a click in the drawer, whether the string it puts on the clipboard is
// well formed, and whether a nested toss shows the subject's actions at all.
// Each was reasoned about wrongly at least once before it was measured.
//
// The arrangement is the self-toss the whole task is about: main's deployed
// shell renders toss-render, which renders a page. Here both come off the
// working tree through tools/render/cdn.mjs, so the branch's code is what runs.
// The FAB the test touches is the OUTER one, which is the one a reader touches.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REF = 'main';
const ADDR = `gh=mehrlander/web-tools@${REF}:pages/toss-render.html` +
             `#gh=mehrlander/web-tools@${REF}:pages/word-select.html`;

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
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] });
const context = await browser.newContext();
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
const page = await context.newPage();

// Same-origin (loopback) goes to the static server above; everything else is
// classified by the shared resolver, so lib/ comes off the working tree.
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  const r = resolveCdn(url, root, null);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});
page.on('pageerror', e => console.log(`  [pageerror] ${e.message}`));

try {
  await page.goto(`${origin}/pages/toss-render.html#${ADDR}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Depth 2 rendered at all, which everything below depends on.
  const rendered = await page.evaluate(() => {
    const d1 = document.getElementById('frame')?.contentDocument;
    const d2 = d1?.getElementById('frame')?.contentDocument;
    return { innerHash: d1 ? d1.defaultView.location.hash : null, depth2: d2 ? d2.title : null };
  });
  ok('the nested subject renders two frames deep', rendered.depth2 === 'Word Select', String(rendered.depth2));
  ok('the inner shell reads a real address bar, not a shim',
     rendered.innerHash === `#gh=mehrlander/web-tools@${REF}:pages/word-select.html`, String(rendered.innerHash));

  // Open the drawer with a real click, so activation and focus land where a
  // reader's would: on the shell, not in the frame that fills the viewport.
  await page.click('[aria-label="Web-tools panel"]');
  await page.waitForTimeout(1200);

  const grid = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').startsWith('fab'));
    const d = window.Alpine.$data(el);
    d.detect();
    return {
      viaToss: d.viaToss,
      subjectPath: d.path,
      actions: d.pageActions.map(a => ({ label: a.label, side: a.side, from: a.from })),
      gridCopy: (d.takeGrid.find(g => g.kind === 'Copy')?.items || [])
        .filter(i => i.kind === 'page').map(i => ({ label: i.label, side: i.side, desc: i.desc })),
    };
  });

  const subjectActions = grid.actions.filter(a => a.side === 'subject');
  const shellActions = grid.actions.filter(a => a.side === 'shell');
  ok('the drawer is in a toss and adopted the inner shell',
     grid.viaToss && grid.subjectPath === 'pages/toss-render.html', grid.subjectPath);
  ok('the SUBJECT toss-render contributes its actions (the whole point)',
     subjectActions.length > 0, JSON.stringify(grid.actions));
  ok('the shell\'s own actions are still there, not swapped out', shellActions.length > 0);
  ok('the two sides are distinguishable despite sharing a label',
     grid.gridCopy.some(i => i.side === 'subject') && grid.gridCopy.some(i => i.side === 'shell'),
     JSON.stringify(grid.gridCopy.map(i => i.label + ':' + i.side)));
  ok('the shell row says it belongs to the renderer, not the viewed page',
     /this renderer/.test(grid.gridCopy.find(i => i.side === 'shell')?.desc || ''));

  // The invocation. Clicking the row runs a closure that lives in the frame's
  // window; without the focus fix this rejects NotAllowedError, "Document is
  // not focused", which is what made toss-render's Link un-runnable from here.
  const run = await page.evaluate(async () => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').startsWith('fab'));
    const d = window.Alpine.$data(el);
    const a = d.takeGrid.flatMap(g => g.items).find(i => i.kind === 'page' && i.side === 'subject');
    if (!a) return { found: false };
    await d.runGridItem(a);
    return { found: true, msg: d.outMsg, err: d.outError,
             clipboard: await navigator.clipboard.readText().catch(e => 'unreadable: ' + e.message) };
  });
  ok('a subject action invoked from the drawer actually runs', run.found && !run.err, run.err);
  // Non-empty matters: a failed write leaves the clipboard untouched, which an
  // "is not an error string" check would wave through.
  ok('its clipboard write succeeds across the window boundary',
     !!run.clipboard && !/unreadable|NotAllowed/.test(run.clipboard), JSON.stringify(run.clipboard));

  // The link it produced. Nested, the inner shell sits at a blob: URL whose
  // pathname already contains the origin, so origin + pathname doubled it.
  const link = run.clipboard || '';
  const originCount = (link.match(/https?:\/\//g) || []).length;
  ok('the copied link carries exactly one origin', originCount === 1, `${originCount} in ${link}`);
  ok('the copied link names toss-render, not a blob',
     link.includes('/pages/toss-render.html') && !link.startsWith('blob:'), link);
  ok('the copied link round-trips the subject address',
     link.includes('word-select.html'), link);
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s)` : '\nall passed');
process.exit(failures.length ? 1 : 0);
