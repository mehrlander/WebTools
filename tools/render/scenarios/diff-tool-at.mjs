// The address field driving the browse panel, end to end: real keystrokes, and
// now the real network path too.
//
// Nothing on the page is replaced. Two GitHub API URLs are routed to captured
// fixtures (see ../fixtures/README.md), which registers after the harness's
// catch-all and therefore wins, so the page's own gh.repos() -> gh.req() ->
// fetch -> grabRoots() -> pathPicker chain runs unmodified. An earlier version
// of this script stubbed gh.repos and GH.prototype.req instead, which tested
// everything below the call and asserted nothing about the call: the response
// shape was whatever this file imagined. The fixtures are the real shapes.
//
// Still unverified, and not verifiable in this sandbox: the wire and the
// browser-local token. There is no ghToken here and api.github.com is
// unreachable, which is exactly why the route exists.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = name => readFile(path.join(here, '..', 'fixtures', name), 'utf8');

export default async function (page) {
  // One tree fixture answers every tree call, so the descent below deliberately
  // targets web-tools: the rows on screen are then the repo the fixture came
  // from, and the committed address is a path that really exists there.
  const [userRepos, treeFixture] = await Promise.all([
    fixture('user-repos.json'),
    fixture('tree-web-tools.json'),
  ]);
  const REPO_COUNT = JSON.parse(userRepos).length;
  const FIRST_REPO = JSON.parse(userRepos)[0].full_name;

  // Both listing endpoints, because gh.repos() picks between them on whether a
  // token is present: /user/repos when authenticated, /users/<owner>/repos when
  // not. The sandbox has no token, so it is the second one that fires here, and
  // matching only the first is how the first run of this route came back 404 and
  // left the picker on its one-repo fallback. Worth keeping both matched and the
  // choice logged: a token-less viewer gets a PUBLIC listing, which is a
  // narrower list than "every repo you can see", and that is real behavior
  // rather than a test artifact.
  const served = [];
  await page.route('https://api.github.com/**', route => {
    const url = route.request().url();
    served.push(url.replace('https://api.github.com', ''));
    const body = /\/user\/repos|\/users\/[^/]+\/repos/.test(url) ? userRepos
      : /\/git\/trees\//.test(url) ? treeFixture
      : null;
    if (body === null) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body });
  });

  await page.waitForFunction(() => window.Alpine && document.body._x_dataStack, null, { timeout: 15000 });
  await page.evaluate(() => {
    const app = Alpine.$data(document.body);
    app.slots.A.src = 'gh';
    app.tab = 'sources';
  });
  await page.waitForTimeout(400);

  const input = await page.$('section input[placeholder*="or @ to browse"]');
  if (!input) throw new Error('the GitHub address field was not found');
  const read = () => page.evaluate(() => {
    const p = document.getElementById('grab-A').__pathPicker;
    return {
      open: !!p.open, query: p.query, active: p.active, error: p.error,
      rows: p.matches().map(n => n.name),
      scope: p.scope.map(n => n.name),
      field: Alpine.$data(document.body).slots.A.value,
      chars: Alpine.$data(document.body).slots.A.content.length,
    };
  });

  // ── @ opens the panel, off the page's own listing call ────────────────────
  await input.click();
  await input.type('@');
  await page.waitForTimeout(1400);
  let st = await read();
  console.log('OPEN ' + JSON.stringify({ open: st.open, count: st.rows.length, first: st.rows[0], error: st.error }));
  console.log('SERVED ' + JSON.stringify(served));
  if (!st.open) throw new Error('typing @ did not open the panel');
  const listingCall = served.find(u => /^\/user\/repos|^\/users\/[^/]+\/repos/.test(u));
  if (!listingCall) throw new Error('the page never asked for the listing, so the real call was not exercised');
  console.log('LISTING_ENDPOINT ' + listingCall
    + (listingCall.startsWith('/user/repos') ? '  (authenticated)' : '  (public: no token in this sandbox)'));
  if (!/sort=updated/.test(listingCall)) {
    throw new Error('the listing should ask for update order: ' + listingCall);
  }
  if (st.rows.length !== REPO_COUNT) {
    throw new Error(`expected all ${REPO_COUNT} repos from the fixture, got ${st.rows.length}`);
  }
  if (st.rows[0] !== FIRST_REPO) {
    throw new Error(`the listing's own order must survive unreordered; expected ${FIRST_REPO}, got ${st.rows[0]}`);
  }

  // ── typing filters, top match pre-selected ────────────────────────────────
  // 'web-tools' matches two repos: it is an exact match for one and a prefix of
  // the other, so this also checks that exact beats prefix and that the exact
  // match is what the pre-selected row points at.
  await input.type('web-tools');
  await page.waitForTimeout(300);
  st = await read();
  console.log('FILTER ' + JSON.stringify({ query: st.query, rows: st.rows, active: st.active }));
  if (st.rows.length !== 2) throw new Error('expected both web-tools repos: ' + JSON.stringify(st.rows));
  if (st.rows[0] !== 'mehrlander/web-tools') throw new Error('the exact match should rank first');
  if (st.active !== 0) throw new Error('the top match should be pre-selected');

  // ── Tab takes the highlighted row: for a repo that means descending ───────
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1400);
  st = await read();
  console.log('TAB_DESCEND ' + JSON.stringify({ scope: st.scope, field: st.field, top: st.rows.slice(0, 5) }));
  if (st.scope[0] !== 'mehrlander/web-tools') throw new Error('Tab did not descend into the repo');
  if (st.field !== '@') throw new Error('the field should reset to a bare @ on descend, got ' + JSON.stringify(st.field));
  if (st.query !== '') throw new Error('a new level should start unfiltered');
  if (!st.rows.length) throw new Error('the repo tree did not load');
  if (!served.some(u => u.includes('/git/trees/'))) throw new Error('loadRepo never made its tree call');

  // ── arrows move the highlight ─────────────────────────────────────────────
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  if ((await read()).active !== 1) throw new Error('ArrowDown did not move the highlight');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  if ((await read()).active !== 0) throw new Error('ArrowUp did not move the highlight back');

  // ── filter inside the repo, then Enter a FILE to commit it ────────────────
  await input.type('claude.md');
  await page.waitForTimeout(300);
  st = await read();
  if (!st.rows.length) throw new Error('no match for a file that is in the fixture tree');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1400);
  st = await read();
  console.log('COMMIT ' + JSON.stringify({ field: st.field, open: st.open }));
  if (st.field !== 'mehrlander/web-tools:CLAUDE.md') {
    throw new Error('committing a file should write its exact address into the field, got ' + JSON.stringify(st.field));
  }
  if (st.open) throw new Error('committing a file should leave browse mode');

  // ── reopening resumes where you were ─────────────────────────────────────
  // Committing a file closes browse mode but keeps the scope, so the next '@'
  // reopens inside the repo just used rather than back at the repo list. That is
  // pathPicker's file mode staying "open in place for the next grab", and the
  // crumb bar is what makes it legible. Pinned here because the first version of
  // this test assumed the opposite and passed for the wrong reason.
  await page.evaluate(() => { Alpine.$data(document.body).slots.A.value = ''; });
  await input.click();
  await input.type('@');
  await page.waitForTimeout(500);
  st = await read();
  console.log('RESUME ' + JSON.stringify({ open: st.open, scope: st.scope }));
  if (!st.open) throw new Error('reopening with @ did not open the panel');
  if (st.scope.length !== 1 || st.scope[0] !== 'mehrlander/web-tools') {
    throw new Error('expected to resume inside the last repo, got ' + JSON.stringify(st.scope));
  }

  // ── Backspace at a bare @ walks up; Escape backs out ─────────────────────
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);
  st = await read();
  console.log('BACKSPACE_UP ' + JSON.stringify({ open: st.open, scope: st.scope, count: st.rows.length }));
  if (st.scope.length !== 0) throw new Error('Backspace at a bare @ should walk up a level');
  if (!st.open) throw new Error('walking up should not close the panel');
  if (st.rows.length !== REPO_COUNT) throw new Error('walking up should land back on the full repo list');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  st = await read();
  if (st.open) throw new Error('Escape did not close the panel');
  if (st.field !== '') throw new Error('Escape should clear the field');

  // ── the case that must NOT fire: a real address's @ sits in the middle ────
  await input.type('mehrlander/web-tools@main:README.md');
  await page.waitForTimeout(400);
  st = await read();
  console.log('REAL_ADDRESS ' + JSON.stringify({ open: st.open, field: st.field }));
  if (st.open) throw new Error('a real address must not open the panel');
  if (st.field !== 'mehrlander/web-tools@main:README.md') throw new Error('the address was mangled');

  // Leave a filtered panel on screen for the shot.
  await page.evaluate(() => { Alpine.$data(document.body).slots.A.value = ''; });
  await input.click();
  await input.type('@web');
  await page.waitForTimeout(900);
}
