#!/usr/bin/env node
// pages/shortcut-log.html — the reader both sides use.
//
//   node tools/test/shortcut-log-page.mjs
//
// The GitHub API is stubbed, so what is checked is the part that actually broke
// before: whether both payload shapes render. Installs write JSON; runs write a
// `verb key=value` header line with a free payload, because a result full of
// quotes broke the JSON form it replaced. A reader that handles one and not the
// other shows the useful half as untyped text, which is exactly what the
// terminal reader did until it was fixed.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const failures = [];
const ok = (n, c, d = '') => {
  if (c) console.log(`  ok    ${n}`);
  else { console.log(`  FAIL  ${n}${d ? ' — ' + d : ''}`); failures.push(n); }
};

const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
  try {
    res.writeHead(200, { 'content-type': typeFor(rel) });
    res.end(await readFile(path.join(root, rel)));
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

// Shaped like the real thing: one enormous base64 field beside the few small
// ones that actually answer anything. Rendering that raw is what buried every
// row under it on 2026-08-29.
const B64 = 'eyJvcCI6ImltcG9ydCIsIm5hbWUiOiJSdW4tUGljayJ9'.repeat(20);
const RUN = 'run name=Run-Pick build=b07361d chose=Get-FileInfo\n'
          + JSON.stringify({ Base64: B64, Type: 'Text', 'File Size': 165,
                             caption: 'a "quoted" thing' });
const IMPORT = JSON.stringify({ op: 'import', name: 'Run-Pick',
  from: 'https://raw.githubusercontent.com/mehrlander/shortcut-tools/1136303175657' +
        '0f309858118c8562681161eaef6/plists/Run-Pick.plist' });

// Dated at load time, since the recency chip is the point of the freshest row:
// a fixture with a hard-coded date would age out of it and stop testing it.
const stampOf = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate()]
  .map((n, i) => String(n).padStart(i ? 2 : 4, '0')).join('-') + '-'
  + [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join('');
const RUN_STEM = stampOf(new Date(Date.now() - 20_000));
const OLD_STEM = '2026-08-29-095546';

// Swapped per case below: the run logs build=b07361d, so this decides whether
// the page should call it current, stale, or nothing at all.
let manifest = { 'Run-Pick': 'b07361d' };

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { try { localStorage.setItem('ghToken', 'stub'); } catch {} });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

const cdn = new Map();
await page.route('**/*', async route => {
  const url = route.request().url();
  if (url.includes('api.github.com')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { name: RUN_STEM + '.json', download_url: origin + '/__log/run' },
      { name: '2026-08-29-095546.json', download_url: origin + '/__log/import' },
    ]) });
  }
  if (url.endsWith('/__log/run')) return route.fulfill({ status: 200, body: RUN });
  if (url.endsWith('/__log/import')) return route.fulfill({ status: 200, body: IMPORT });
  if (url.includes('plists/builds.json'))
    return manifest === null
      ? route.fulfill({ status: 404, body: 'nope' })
      : route.fulfill({ status: 200, contentType: 'application/json',
                        body: JSON.stringify(manifest) });
  if (url.startsWith('https://cdn.jsdelivr.net')) {
    if (!cdn.has(url)) {
      const r = await fetch(url);
      cdn.set(url, { status: r.status, body: Buffer.from(await r.arrayBuffer()),
                     type: r.headers.get('content-type') || 'application/javascript' });
    }
    const c = cdn.get(url);
    return route.fulfill({ status: c.status, body: c.body, contentType: c.type });
  }
  return route.continue();
});

await page.goto(`${origin}/pages/shortcut-log.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelectorAll('#rows > div').length > 0, { timeout: 8000 });

const r = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('#rows > div')];
  const read = c => ({
    badges: [...c.querySelectorAll('.badge')].map(b => b.textContent),
    bold: (c.querySelector('.font-bold') || {}).textContent || '',
    pre: (c.querySelector('pre') || {}).textContent || '',
    clipped: !!c.querySelector('pre.max-h-24.overflow-hidden'),
    btns: [...c.querySelectorAll('button')].map(b => b.textContent),
    ringed: c.className.includes('ring-primary'),
  });
  return { count: cards.length, run: read(cards[0]), imp: read(cards[1]),
           status: document.getElementById('status').textContent,
           signinHidden: document.getElementById('signin').classList.contains('hidden') };
});

console.log('shortcut-log.html');
ok('page boots with no error', errors.length === 0, errors[0]);
ok('a stored token skips the sign-in form', r.signinHidden);
ok('both entries render', r.count === 2, String(r.count));
ok('a run is typed as a run', r.run.badges.includes('run'), r.run.badges.join(','));
ok('the run names the shortcut', r.run.bold === 'Run-Pick', r.run.bold);
// The whole point: the build id is legible without scrolling or guessing.
ok('the build id is a chip', r.run.badges.includes('build=b07361d'), r.run.badges.join(','));
ok('the choice is a chip', r.run.badges.includes('chose=Get-FileInfo'), r.run.badges.join(','));
// The half Show Result clipped away, and the reason a reader is worth having:
// the small fields that answer something are legible without hunting for them.
ok('the result shows its structure', r.run.pre.includes('"File Size": 165'),
   r.run.pre.slice(0, 80));
// The base64 is the noise. Keeping its head and its length says what it is
// without spending the screen on it; a raw copy is still one tap away below.
ok('a huge field is elided with its length',
   /"Base64": "eyJ\S*\u2026\[\d+\]"/.test(r.run.pre), r.run.pre.slice(0, 200));
ok('the payload is collapsed, not dominating', r.run.clipped);
ok('more and raw are both offered', r.run.btns.includes('more') && r.run.btns.includes('raw'),
   r.run.btns.join(','));

// Raw has to be the exact bytes, escapes intact: the pretty view is a reading of
// the payload and the raw view is the payload. Losing the second makes the first
// unfalsifiable.
const raw = await page.evaluate(async () => {
  const c = document.querySelector('#rows > div');
  [...c.querySelectorAll('button')].find(b => b.textContent === 'raw').click();
  [...c.querySelectorAll('button')].find(b => b.textContent === 'more').click();
  return { pre: c.querySelector('pre').textContent,
           scrolls: !!c.querySelector('pre.overflow-y-auto') };
});
ok('raw restores the exact payload', raw.pre.includes('"File Size":165')
   && raw.pre.includes('\\"quoted\\"'), raw.pre.slice(0, 80));
ok('and opened, it scrolls rather than clipping', raw.scrolls);
ok('an install is typed as an import', r.imp.badges.includes('import'), r.imp.badges.join(','));
// The whole URL is noise; the ref is the only part that answers the question.
ok('an install shows the ref, not the URL', r.imp.badges.includes('from=1136303'),
   r.imp.badges.join(','));
ok('status reports the count', /2 entries/.test(r.status), r.status);

// "Did mine land" is what the page is opened to answer, seconds after a tap.
ok('an entry logged seconds ago says so', r.run.badges.includes('just now'),
   r.run.badges.join(','));
ok('and it is ringed', r.run.ringed);
// The claim is recency, not ownership: an older entry makes neither.
ok('an older entry claims nothing', !r.imp.badges.some(b => /just now|min ago/.test(b)),
   r.imp.badges.join(','));
ok('and is not ringed', !r.imp.ringed);

// THE VERDICT. A build id alone says which copy ran; scoring it against the
// published manifest is what says whether that copy is the current one, which
// is the question the stamp was added to answer and could not answer alone.
const badges = async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#rows > div').length > 0,
                             { timeout: 8000 });
  return page.evaluate(() =>
    [...document.querySelectorAll('#rows > div')[0].querySelectorAll('.badge')]
      .map(b => b.textContent));
};

const same = await badges();
ok('a run matching the manifest is marked current', same.includes('current'), same.join(','));

manifest = { 'Run-Pick': 'ccb6cfc' };
const moved = await badges();
ok('a run behind the manifest is marked stale, and names the current id',
   moved.includes('stale \u2192 ccb6cfc'), moved.join(','));
ok('and it is not also called current', !moved.includes('current'), moved.join(','));

// The failure that would make this worse than no verdict: an unfetched
// manifest rendering as a good answer.
manifest = null;
const blank = await badges();
ok('an unreachable manifest yields no verdict at all',
   !blank.includes('current') && !blank.some(b => b.startsWith('stale')), blank.join(','));
ok('and the row still renders', blank.includes('build=b07361d'), blank.join(','));

await browser.close(); server.close();
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
