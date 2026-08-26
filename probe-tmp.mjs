import { chromium } from 'playwright';
const url = process.argv[2];
const b = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] });
const p = await (await b.newContext()).newPage();
const log = [];
p.on('console', m => log.push(`console.${m.type()}: ${m.text().slice(0, 300)}`));
p.on('pageerror', e => log.push(`pageerror: ${e.message.slice(0, 300)}`));
p.on('requestfailed', r => log.push(`FAILED ${r.url().slice(0, 140)} :: ${r.failure()?.errorText}`));
p.on('response', r => { if (r.status() >= 400) log.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`); });
await p.goto(url, { waitUntil: 'load', timeout: 60000 }).catch(e => log.push('goto: ' + e.message));
await p.waitForTimeout(9000);
const state = await p.evaluate(() => ({
  alpine: typeof window.Alpine,
  fflate: typeof window.fflate,
  scripts: [...document.querySelectorAll('script[src]')].map(s => s.src.slice(0, 90)),
  skeleton: !!document.querySelector('.skeleton') && getComputedStyle(document.querySelector('.skeleton')).display,
  err: document.querySelector('.alert')?.textContent?.trim().slice(0, 200) || null,
  canvasSize: (c => c ? [c.clientWidth, c.clientHeight] : null)(document.querySelector('canvas')),
  bodyLen: document.body.innerHTML.length,
}));
console.log(JSON.stringify(state, null, 1));
console.log('--- events ---\n' + log.join('\n'));
await b.close();
