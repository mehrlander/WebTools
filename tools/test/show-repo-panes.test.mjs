// show-repo's swipe carousel: the two lists that have to agree.
//
// A dashboard view is swipeable only if its container carries data-pane, since
// that attribute is what the pager's element lookup keys on. estateNav is the
// other list, the ordered set of stops the gesture walks. They drifted: the
// lookup answered 'estate' and 'stage' alone while the nav had already grown
// Tools, Map, and Proposals, so a swipe could page INTO one of those (the
// commit runs the tab's own go()) and then found no pane and no-op'd. The
// carousel was a one-way trip, and nothing reported it, because a pane lookup
// that returns null is also the correct answer on a repo view.
//
// So this asserts the join rather than either side: for every nav stop, the
// pane key the shell computes exists in the markup. The shell's app() lives
// inline in show-repo.html, hence the show-repo-shell.mjs harness.

import test from 'node:test';
import assert from 'node:assert/strict';
import { page, makeShell } from './show-repo-shell.mjs';

// The estate's sub-views share one container, so they all name it; every other
// stop names itself.
const ESTATE_VIEWS = ['activity', 'todo', 'jots', 'estate', 'surfaces'];

// Literal attributes only: the pager's own lookup builds the selector from a
// template, and matching that string back would be circular.
const paneKeys = (src = page) =>
  new Set([...src.matchAll(/data-pane="([a-z][a-z-]*)"/g)].map(m => m[1]));

test('every estateNav stop resolves to a pane that exists in the markup', () => {
  const { shell } = makeShell();
  shell.proposalCount = 1;           // the one conditional stop, made visible
  const panes = paneKeys();
  const nav = shell.estateNav;
  assert.ok(nav.length >= 6, 'the nav carries the dashboard set');
  for (const v of nav) {
    shell.view = v.view;
    const key = shell._paneKey;
    assert.ok(panes.has(key),
      `nav stop "${v.view}" wants data-pane="${key}", which no element carries`);
  }
});

test('the estate sub-views all resolve to the one estate pane', () => {
  const { shell } = makeShell();
  for (const view of ESTATE_VIEWS) {
    shell.view = view;
    assert.equal(shell._paneKey, 'estate', view);
  }
});

test('a repo view is not a carousel stop', () => {
  const { shell } = makeShell();
  const panes = paneKeys();
  for (const view of ['landing', 'files', 'branches', 'config', 'atlas', 'app', 'public']) {
    shell.view = view;
    assert.equal(panes.has(shell._paneKey), false,
      `${view} must not carry a pane: an iframe or repo view owns its own gestures`);
  }
});

test('no pane is declared that the nav cannot reach', () => {
  const { shell } = makeShell();
  shell.proposalCount = 1;
  // A nav entry reaches every view it declares, not just its primary one:
  // `views` is what navOn() highlights on, so it is what "reachable" means.
  // Activity has covered three sub-views this way for a while; Surfaces now
  // covers two (the shelf and the working surface), and the second of those
  // owns a pane, which is what made the narrower walk here start lying.
  const reachable = new Set(shell.estateNav.flatMap(v => (v.views || [v.view]).map(view => {
    shell.view = view;
    return shell._paneKey;
  })));
  for (const key of paneKeys()) {
    assert.ok(reachable.has(key), `data-pane="${key}" is unreachable from estateNav`);
  }
});
