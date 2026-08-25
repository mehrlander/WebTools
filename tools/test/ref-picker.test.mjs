// alpineComponents/ref-picker.js — pick a ref of a GIVEN repo: the repo is
// read fresh on every access (a host's scope moves under a mounted picker), the
// scan runs once per repo and re-runs when the repo changes, a GraphQL
// failure degrades to the REST list and says so rather than reporting an error,
// the default branch is handed back as '' rather than by name, and a typed
// value is offered only when the list does not already hold it. GH is stubbed;
// no network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

const { window } = makeWindow({
  html: `<!doctype html><html><body></body></html>`,
});

let DATED_FAILS = false;
let CALLS = [];
class FakeGH {
  constructor(conf = {}) { this.token = conf.token; this.repo = conf.repo || ''; this.ref = 'main'; }
  async branchesDated() {
    CALLS.push(['dated', this.repo]);
    if (DATED_FAILS) throw new Error('graphql down');
    return [
      { name: 'claude/newer', ago: '2h', subject: 'newest work' },
      { name: 'main', ago: '3d', subject: 'the default' },
      { name: 'claude/older', ago: '9d', subject: 'older work' },
    ];
  }
  async branches() {
    CALLS.push(['rest', this.repo]);
    return [{ name: 'claude/older' }, { name: 'claude/newer' }, { name: 'main' }];
  }
}

// The host stands in for the Search view: it owns the scope and takes the pick.
window.__host = { repo: 'me/tools', ref: '', defaultRef: 'main', picked: [] };
const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/alpineComponents/ref-picker.js',
]);
Alpine.store('browser').gh = new FakeGH({ token: 't', repo: 'me/tools' });

const host = window.__host;
const el = window.document.createElement('div');
el.setAttribute('x-data', `refPicker({ repo: () => window.__host.repo, ref: () => window.__host.ref,
                                       defaultRef: () => window.__host.defaultRef,
                                       onPick: (r) => window.__host.picked.push(r) })`);
window.document.body.appendChild(el);
Alpine.initTree(el);
const tick = () => new Promise(r => setTimeout(r, 10));
await tick();
const p = Alpine.$data(el);

test('the scope is read fresh, so a host switching repos moves the picker with it', async () => {
  assert.equal(p.repo, 'me/tools');
  host.repo = 'me/home';
  assert.equal(p.repo, 'me/home', 'a value captured at mount would still say me/tools');
  host.repo = 'me/tools';
});

test('an unset ref reads as what unset MEANS, and off-default is marked', () => {
  assert.equal(p.label, 'main', "'' is the default branch, so the trigger says which one that is");
  assert.equal(p.offDefault, false);
  host.ref = 'claude/newer';
  assert.equal(p.label, 'claude/newer');
  assert.equal(p.offDefault, true);
  host.ref = '';
});

test('the scan runs once per repo, and again when the repo changes', async () => {
  CALLS = [];
  await p.load();
  await p.load();
  assert.deepEqual([...CALLS], [['dated', 'me/tools']], 'a second load on the same repo is free');
  host.repo = 'me/home';
  await p.load();
  assert.deepEqual([...CALLS.at(-1)], ['dated', 'me/home']);
  host.repo = 'me/tools';
});

test('the default branch is not repeated in the list; it has its own row', async () => {
  p.loadedFor = ''; await p.load();
  assert.deepEqual([...p.matches.map(b => b.name)], ['claude/newer', 'claude/older']);
  assert.ok(p.rows.some(b => b.name === 'main'), 'the scan still carries it');
});

test('the filter narrows the list; a name it holds is not also offered as typed', async () => {
  p.typed = 'newer';
  assert.deepEqual([...p.matches.map(b => b.name)], ['claude/newer']);
  assert.equal(p.typedIsNew, false, 'offering "Use claude/newer" one line above the row itself is noise');
  p.typed = 'v2.1.0';
  assert.equal(p.matches.length, 0);
  assert.equal(p.typedIsNew, true, 'a tag the scan cannot see is exactly what the box is for');
  p.typed = '';
});

test('the default branch is handed back as an empty ref, never by name', () => {
  host.picked = [];
  p.pick('');
  assert.deepEqual([...host.picked], ['']);
  // Picking it BY NAME resolves to the same empty, so a scope meaning "whatever
  // this repo calls its default" keeps meaning that when the repo changes.
  p.pick('main');
  assert.equal(host.picked.at(-1), '');
  p.pick('claude/newer');
  assert.equal(host.picked.at(-1), 'claude/newer');
  assert.equal(p.open, false, 'picking closes');
});

test('a GraphQL failure degrades to the REST list and says so, rather than erroring', async () => {
  DATED_FAILS = true;
  p.loadedFor = ''; CALLS = [];
  await p.load();
  assert.equal(p.error, '', 'a poorer list is not a failure to report');
  assert.equal(p.dated, false, 'but it is a fact the panel states under the rows');
  assert.deepEqual([...CALLS.map(c => c[0])], ['dated', 'rest']);
  assert.ok(p.matches.length);
  DATED_FAILS = false;
});

test('a branch prefix is dimmed rather than dropped, since two can share a tail', () => {
  assert.equal(p.prefix('claude/newer'), 'claude/');
  assert.equal(p.tail('claude/newer'), 'newer');
  assert.equal(p.prefix('main'), '');
  assert.equal(p.tail('main'), 'main');
});

test('no repo means no list, and the trigger says so instead of offering one', async () => {
  host.repo = '';
  CALLS = [];
  await p.load();
  assert.deepEqual([...CALLS], [], 'there is no branch list for "no repo"');
  p.toggle();
  assert.equal(p.open, false);
  host.repo = 'me/tools';
});
