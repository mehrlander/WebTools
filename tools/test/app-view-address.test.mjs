// The app view's address: `?app=`, and the namespace split behind its deep link.
//
// An app view is a page some repo promotes to an estate-level entry. It was
// addressed as five query keys naming the page's location; it now also answers
// to `?app=<slug>`, a name the promoting repo declares, which is short because
// a path is most of an address and none of the meaning.
//
// The deep link into such a page is the part with a real design in it, and the
// rule is stated in lib/kits/url-params.js and pinned in url-params.test.mjs:
// THE SHELL OWNS THE QUERY, THE FRAGMENT IS THE SUBJECT'S. What is left for
// this file is the wiring the kit cannot see, and one measurement that is the
// entire reason the split exists rather than a reserved-name convention.
//
// Source assertions rather than a mounted shell, following app-routes.test.mjs:
// the shell's component is a 3,000-line inline literal with no export, and the
// logic worth executing has been moved to the kit where it can be.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const shell = readFileSync(path.join(repoRoot, 'app/index.html'), 'utf8');
const kit = readFileSync(path.join(repoRoot, 'lib/kits/url-params.js'), 'utf8');

// The `app` row of the VIEWS table, sliced from its key to the next row's.
const appRoute = (() => {
  const at = shell.indexOf("{ key: 'app',");
  assert.ok(at > 0, "the VIEWS row { key: 'app', ... } was not found");
  const end = shell.indexOf('\n  ],', at);
  assert.ok(end > at, 'the VIEWS table did not close after the app row');
  return shell.slice(at, end);
})();

test('the short form opens the route, and the five-key form still does', () => {
  // `when` is the gate: both spellings have to pass it, or one of them is a
  // link that resolves to nothing.
  assert.match(appRoute, /when: u => !!\(u\.app \|\| \(u\.appRepo && u\.appPath\)\)/,
    'the app route must accept ?app= and the five-key form alike');
});

test('?app= implies its own view, or it would never dispatch', () => {
  // routeFromUrl keys on url.view. A short address names no view, so parseUrl
  // supplies it; without this the whole form is inert and lands on the estate.
  assert.match(shell, /view: p\.get\('view'\) \|\| \(p\.has\('app'\) \? 'app' : null\)/,
    'parseUrl must read ?app= as view=app');
  // And the gate that decides an address is an address at all.
  assert.match(shell, /!p\.has\('repo'\) && !p\.has\('file'\) && !p\.has\('view'\) && !p\.has\('app'\)/,
    'parseUrl must not return null for a bare ?app=');
});

test('a slug waits for the crawl it can only be resolved against', () => {
  // A slug carries no repo and no path, so the collected list is the only thing
  // that knows where the page is, and that list is a crawl. The wait is inside
  // the slug branch on purpose: every other address still routes at first
  // paint. A test that only checked "await appViewsReady appears somewhere"
  // would pass if the wait were hoisted to the top and slowed every open.
  const slugBranch = appViewFromUrlSource().match(/if \(!addr\) \{([\s\S]*?)\n {6}\}/);
  assert.ok(slugBranch, 'the slug branch of appViewFromUrl was not found');
  assert.match(slugBranch[1], /await this\.appViewsReady/,
    'the slug lookup must await the crawl');
  assert.match(slugBranch[1], /this\.appViews\.find\(v => v\.slug === url\.app\)/,
    'the slug resolves against the collected app views');
  // And the promise has to be held, not dropped, or the await never settles
  // against anything real.
  assert.match(shell, /this\.appViewsReady = this\.loadEstateSidebar\(\)/,
    'loadEstateSidebar must be held as appViewsReady');
  assert.match(shell, /appViewsReady: Promise\.resolve\(\)/,
    'appViewsReady needs a resolved default so a pre-init caller awaits nothing');
});

test('a slug naming nothing lands somewhere real', () => {
  // A link that silently resolves to an empty frame is worse than one that
  // resolves to the front door.
  assert.match(appRoute, /if \(v\) this\.goAppView\(v\); else this\.goDashboard\(\);/,
    'an unresolved app view must fall back to the estate');
});

test('the slug is what gets written back, when there is one', () => {
  // A short link that is only ever READ becomes the long one the moment the
  // reader touches anything, which is not an address anybody can keep.
  assert.match(appRoute, /if \(this\.appView\.slug\) \{ p\.set\('app', this\.appView\.slug\); return; \}/,
    'stamp must emit ?app=<slug> and stop there');
});

test('the promoting repo is where a slug is declared', () => {
  assert.match(shell, /slug: typeof pg\.slug === 'string' \? pg\.slug\.trim\(\) : ''/,
    'a pages entry carries the slug into the collected app view');
});

test('the subject query rides the toss address, and v.query still wins', () => {
  // v.query is set programmatically for an ACTION (the Links pencil opens the
  // board in edit mode). An action beats an address, and is deliberately not
  // stamped, so a reload lands on the reading view.
  assert.match(shell, /const q = v\.query \|\| this\.subjectParams;/,
    'appViewUrl must prefer an explicit query and fall back to the subject params');
  assert.match(shell, /\(q \? '\?' \+ q : ''\)/,
    'the subject params ride as a ?query on the addressed path');
});

test('the shell claims exactly three keys in the subject\'s fragment', () => {
  assert.match(shell, /SHELL_FRAGMENT_KEYS: \['stage', 'prompts', 'mode'\]/,
    'the fragment exception set is the stage link\'s three keys');
  // Held to what StageLink actually reads there, so the exception cannot drift
  // into a general-purpose reservation.
  const stage = readFileSync(path.join(repoRoot, 'lib/alpineComponents/stage.js'), 'utf8');
  for (const k of ['stage', 'prompts', 'mode']) {
    assert.ok(stage.includes("'" + k + "'") || stage.includes(k + '='),
      `stage.js does not appear to read '${k}', so the shell should not reserve it`);
  }
});

test('?on= is read and never written, so the address self-heals', () => {
  // The fallback exists for a context that eats the '#'. It is inbound only:
  // being in VIEW_KEYS means the next stamp drops it, and the fragment form is
  // what the reader ends up holding.
  assert.match(shell, /'app', 'on', 'appRepo'/,
    'app and on belong to VIEW_KEYS, which is the delete list');
  assert.ok(!/p\.set\('on'/.test(shell), '?on= must never be stamped back');
  assert.match(kit, /const subject = \(reserved, loc, fallbackKey\) =>/,
    'the kit owns the fragment-first read that ?on= is the fallback for');
});

// ── The measurement the design rests on ─────────────────────────────────────
//
// The alternative to splitting the namespaces was to keep one and agree on
// non-conflicting names. This is what makes that a bad bet, stated as numbers
// rather than an opinion.
//
// The query has TWO classes of claimant, and that is the finding. VIEW_KEYS is
// the route table's set, which someone adding a route would plausibly check.
// The other class is any component that writes its own state onto the same
// query string (the pages gallery writes ?q= and ?filter= from its own
// syncUrl), which nobody adding a route would think to check, and which is
// where `q` comes from. A reserved-name convention would have to be honored by
// both, in this repo and in every repo that promotes a page, forever.
//
// Under a shared namespace each collision is a deep link that opens the wrong
// screen, which is the worst failure shape available because it looks like it
// worked.
test('the shell and a framed app already collide in the query, two ways', () => {
  const viewKeys = shell.match(/\n {2}VIEW_KEYS: \[([\s\S]*?)\],\n/);
  assert.ok(viewKeys, 'VIEW_KEYS not found');
  const routeKeys = new Set([...viewKeys[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
  // Everything any component in the shell writes to the query, route table or
  // not. This is the set a convention would actually have to cover.
  const written = new Set([...shell.matchAll(/p\.set\('([a-zA-Z]+)'/g)].map(m => m[1]));

  // budget-drs (mehrlander/home), the first promoted app view to want a deep
  // link. Named here rather than read, since that repo is private and this
  // suite is public and hermetic.
  const framed = ['view', 'tab', 'data', 'load', 'col', 'find', 'q', 'dock'];

  const byRoute = framed.filter(k => routeKeys.has(k)).sort();
  const byOther = framed.filter(k => !routeKeys.has(k) && written.has(k)).sort();

  assert.deepEqual(byRoute, ['tab', 'view'],
    'the route table\'s own collisions moved; re-read the rule in url-params.js ' +
    'before concluding that non-conflicting names would have been fine');
  assert.deepEqual(byOther, ['q'],
    'a component outside the route table claims a different key now; this is the ' +
    'class a reserved-name convention cannot see, which is why the namespaces are split');
});

// appViewFromUrl's body, for the branch assertions above.
function appViewFromUrlSource() {
  const at = shell.indexOf('  async appViewFromUrl(url){');
  assert.ok(at > 0, 'appViewFromUrl was not found');
  const end = shell.indexOf('\n  },', at);
  assert.ok(end > at, 'appViewFromUrl did not close');
  return shell.slice(at, end);
}
