// screenshot.mjs interaction scenario: the Map view's Injection tab.
//
//   node tools/render/screenshot.mjs app/index.html \
//     --script tools/render/scenarios/map-injection.mjs --out tools/.preview/map-injection.png
//
// The sandbox blocks api.github.com, so the scenario serves the REAL committed
// docs/injection.json (fetched relative, same origin) rather than a fixture:
// the tab's whole claim is that these are measured figures, and a made-up
// reading would make the shot a picture of a session nobody had.
//
// The Observed block reads the private registry's sessions cache, which needs a
// token the sandbox does not have, so the scenario stubs BOTH the token check
// and that one read. The rows it serves are folded here from the real session
// store next door, by the same summarizer the crawl uses, so the shot is still
// a picture of sessions that happened; SESSIONS_STORE points elsewhere, and an
// absent store leaves the block on its honest empty line.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const STORE = process.env.SESSIONS_STORE
  || path.join(ROOT, '..', 'web-tools-private', 'sessions');

function sessionsCache() {
  let files = [];
  try {
    const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(path.join(d, e.name))
        : e.name.endsWith('.json') ? [path.join(d, e.name)] : []);
    files = walk(path.join(STORE, '2026'));
  } catch { return null; }

  const win = {};
  new Function('window', readFileSync(path.join(ROOT, 'lib/kits/csv.js'), 'utf8'))(win);
  new Function('window', readFileSync(path.join(ROOT, 'lib/kits/repo-sessions-cache.js'), 'utf8'))(win);
  const S = win.RepoSessionsCache;

  const rows = [];
  for (const f of files) {
    let rec; try { rec = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
    rows.push({ day: rec.day || (rec.started || '').slice(0, 10), started: rec.started,
                startup: S.startupOf(rec) });
  }
  return rows.length ? JSON.stringify({ count: rows.length, rows }) : null;
}

export default async function (page) {
  const injection = await page.evaluate(() => fetch('../../docs/injection.json').then(r => r.text()));
  const sessions = sessionsCache();
  const ok = await page.evaluate(({ injectionText, sessionsText }) => {
    if (!window.Alpine || !window.__shell || !window.GH) return 'no shell';
    if (sessionsText) window.__shell.hasToken = () => true;
    const origGet = window.GH.prototype.get;
    window.GH.prototype.get = async function (name) {
      if (name === 'docs/injection.json') return { text: injectionText };
      if (name === 'state/sessions.json' && sessionsText) return { text: sessionsText };
      if (name === '.claude/settings.json' || name === 'CLAUDE.md' || name === '.web-tools.json'
          || name === 'state/activity.json' || name === 'state/sessions.json'
          || name === 'lists/todo.json' || name === 'lists/jots.json')
        throw Object.assign(new Error('404'), { status: 404 });
      return origGet.call(this, name);
    };
    window.__shell.goMap();
    return true;
  }, { injectionText: injection, sessionsText: sessions });
  if (ok !== true) throw new Error('map-injection scenario: ' + ok);

  const host = () => [...document.querySelectorAll('[x-data]')]
    .find(e => (e.getAttribute('x-data') || '').includes('map('));

  await page.waitForFunction(() => [...document.querySelectorAll('[x-data]')]
    .some(el => (el.getAttribute('x-data') || '').includes('map(')), { timeout: 20000 });

  await page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = window.Alpine.$data(el);
    d.mapTab = 'injection';
    d.loadInjection();
  });

  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('[x-data]')]
      .find(e => (e.getAttribute('x-data') || '').includes('map('));
    const d = el && window.Alpine.$data(el);
    return d && d.injection && !d.injectionLoading
      && (d.injObserved || d.injObservedErr);
  }, { timeout: 20000 });

  // INJ_SEG opens the tooltip on one segment. Hover is gated on
  // (hover: hover) and (pointer: fine); headless may not match it, so the shot
  // drives the tap path, which is the same tipShow and exercises the toggle.
  if (process.env.INJ_SEG) {
    const i = Number(process.env.INJ_SEG);
    const segs = await page.$$('[data-inj-seg]');
    if (!segs[i]) throw new Error('map-injection: no segment ' + i + ' of ' + segs.length);
    await segs[i].click();
    await page.waitForFunction(() => {
      const el = [...document.querySelectorAll('[x-data]')]
        .find(e => (e.getAttribute('x-data') || '').includes('map('));
      return !!window.Alpine.$data(el).tip.seg;
    }, { timeout: 5000 });
  }
}
