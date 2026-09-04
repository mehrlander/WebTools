// ops.test.mjs — every op in lib/ops/ is a value a caller can evaluate, and
// session-menu.js answers correctly for the three things a clipboard can hold.
//
// The op runs on a phone inside a data: page that is coerced to text and never
// shown, so nothing about it can be inspected there. It is exercised here the
// way the phone runs it: the file's text is evaluated, the function is called
// with an input object, and a fake synchronous XMLHttpRequest stands in for
// the GitHub API.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OPS = path.join(root, 'lib', 'ops');
const files = readdirSync(OPS).filter(f => f.endsWith('.js'));

// Evaluate an op the way Run-Op does: the file is text, eval yields the value.
function load(name, { status = 200, body = {} } = {}) {
  const src = readFileSync(path.join(OPS, name), 'utf8');
  const sent = [];
  const ctx = vm.createContext({
    Date, JSON, Math, RegExp, Error, isFinite, sent,
    XMLHttpRequest: function () {
      this.open = (method, url, async) => sent.push({ method, url, async });
      this.setRequestHeader = (k, v) => sent.push([k, v]);
      this.send = () => { this.status = status; this.responseText = JSON.stringify(body); };
    },
  });
  const value = vm.runInContext(src, ctx);
  // A result crosses back out of the vm realm as JSON, which is the contract
  // anyway: an op's result must serialise, since the phone reads it as text.
  const fn = typeof value === 'function' ? (input) => JSON.parse(JSON.stringify(value(input))) : value;
  return { fn, value, sent };
}

test('every op evaluates to one function and reaches neither window nor document', () => {
  assert.ok(files.length > 0, 'lib/ops/ has at least one op');
  for (const f of files) {
    const { value } = load(f);
    assert.equal(typeof value, 'function', `${f} should evaluate to a function`);
    const src = readFileSync(path.join(OPS, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\b(?:window|document)\b/, `${f} must not reach the page`);
  }
});

// Styling is a presentation layer over the same words: undo it to assert on content.
const plainText = (s) => Array.from(s).map(ch => {
  const c = ch.codePointAt(0);
  if (c >= 0x1D5D4 && c <= 0x1D5ED) return String.fromCharCode(65 + c - 0x1D5D4);
  if (c >= 0x1D5EE && c <= 0x1D607) return String.fromCharCode(97 + c - 0x1D5EE);
  if (c >= 0x1D7EC && c <= 0x1D7F5) return String.fromCharCode(48 + c - 0x1D7EC);
  return ch;
}).join('').replace(/^[\u{1F33F}\u{1F558}] /u, '').replace(/ {2}/g, ' · ');

// ONE CLOCK for every row. Read per call, two rows meant to tie ("the repeat
// earns its id" below) landed a millisecond apart whenever the runner was slow
// between the two calls, the later one sorted first, and the check on which
// row carries the id failed on CI while passing here. Fixed once at load, the
// tie is a tie.
const NOW = Date.now();
const stamp = (minsAgo) => new Date(NOW - minsAgo * 60000).toISOString();
// `endedMinsAgo` is omitted by most callers on purpose: a row without `ended` is
// exactly what the op's fallback is for, so leaving it off keeps that path under
// test everywhere the ordering itself is not the subject.
const row = (id, minsAgo, ask, branches = [], repos = [], endedMinsAgo = null) => {
  const r = { id, started: stamp(minsAgo), ask, branches, repos };
  if (endedMinsAgo !== null) r.ended = stamp(endedMinsAgo);
  return r;
};

test('session-menu reads the index once, synchronously, raw, with the token as given', () => {
  const { fn, sent } = load('session-menu.js', { body: { rows: [] } });
  fn({ input: 'claude/x', token: 'ghp_x' });
  const open = sent.find(s => s.method);
  assert.equal(open.async, false, 'an async read returns after the coercion has captured the page');
  assert.match(open.url, /web-tools-private\/contents\/state\/sessions\.json\?ref=main$/);
  assert.deepEqual(sent.find(s => s[0] === 'Authorization'), ['Authorization', 'Bearer ghp_x']);
  assert.deepEqual(sent.find(s => s[0] === 'Accept'), ['Accept', 'application/vnd.github.raw']);
  assert.equal(sent.filter(s => s.method).length, 1, 'no probe on the happy path');
});

test('session-menu: no token is an ERROR result, and the index is never read without one', () => {
  const { fn, sent } = load('session-menu.js');
  const r = fn({ input: 'claude/x' });
  assert.equal(r.caption, 'ERROR no token reached the op at start');
  assert.deepEqual(r.rows, []);
  assert.equal(sent.filter(s => s.method && /sessions\.json/.test(s.url) && !/zen/.test(s.url)).length, 1,
    'only the probe touches the index address, once, with the token alone');
  assert.deepEqual(Object.keys(r.probe), ['zen plain', 'zen auth', 'index auth only']);
});

test('session-menu: a failed read is an ERROR result naming the status, the stage, and a network probe', () => {
  const { fn } = load('session-menu.js', { status: 401 });
  const r = fn({ input: 'claude/x', token: 't' });
  assert.equal(r.caption, 'ERROR HTTP 401 reading state/sessions.json at status 401');
  assert.equal(r.error, r.caption);
  assert.deepEqual(Object.keys(r.probe), ['zen plain', 'zen auth', 'index auth only']);
});

test('session-menu: the clipboard shapes all reduce to the branch', () => {
  const want = 'claude/double-tap-read-aloud-shortcut-wb6uh9';
  const body = { rows: [row('aaaaaaaa', 30, 'On the branch', [want])] };
  for (const clip of [
    want, 'origin/' + want, 'refs/heads/' + want, '  ' + want + '\n',
    'https://github.com/mehrlander/web-tools/tree/' + want,
    'https://github.com/mehrlander/web-tools/compare/' + want + '?expand=1',
    'https://mehrlander.github.io/web-tools/pages/branch.html#gh=mehrlander/web-tools@' + want,
    want + '\nsecond line of a caption',
  ]) {
    const { fn } = load('session-menu.js', { body });
    assert.equal(plainText(fn({ input: clip, token: 't' }).caption), 'This branch · double-tap-read-aloud-shortcut', JSON.stringify(clip));
  }
});

test('session-menu: the caption names each case in words, by branch slug, and stamps the index age', () => {
  const here = row('aaaaaaaa', 30, 'Ask', ['claude/x']);
  const other = row('bbbbbbbb', 90, 'Ask', ['claude/y']);
  const fresh = new Date(Date.now() - 3 * 3600000).toISOString();
  const stale = new Date(Date.now() - 16 * 3600000).toISOString();
  const run = (rows, input, at) => load('session-menu.js', { body: { rows, generatedAt: at } }).fn({ input, token: 't' }).caption;
  assert.equal(plainText(run([here, other], 'claude/x', fresh)), 'This branch · x');
  assert.equal(plainText(run([other], 'not a branch', fresh)), 'Recent · no branch on the clipboard');
  // A branch that matched NOTHING carries the age however fresh the index is,
  // because there the age is the difference between "no such session" and "the
  // crawl has not run since it started". Three hours, and five minutes:
  assert.equal(plainText(run([other], 'claude/x', fresh)), 'Recent · none yet on x · index 3h old');
  assert.equal(plainText(run([other], 'claude/x', stamp(5))), 'Recent · none yet on x · index 5m old');
  // A branch that DID match keeps the six-hour threshold: there the age only
  // warns that a newer session may be missing.
  assert.equal(plainText(run([here, other], 'claude/x', stale)), 'This branch · x · index 16h old');
  assert.equal(plainText(run([other], 'claude/x', stale)), 'Recent · none yet on x · index 16h old');
  assert.match(run([here], 'claude/x', fresh), /^\u{1F33F} /u, 'the branch header carries the branch glyph');
  assert.match(run([other], 'claude/x', fresh), /^\u{1F558} /u, 'the recent header carries the recent glyph');
});

test('session-menu: branch rows lead and are marked, recent rows fill, nothing repeats, every label maps to its page', () => {
  const body = { rows: [
    row('aaaaaaaa', 600, 'Older, on the branch', ['claude/x']),
    row('bbbbbbbb', 30, 'Newest, elsewhere', ['claude/y']),
    row('cccccccc', 60, 'On the branch too', [], [{ name: 'home', branch: 'claude/x' }]),
  ] };
  const r = load('session-menu.js', { body }).fn({ input: 'claude/x', token: 't' });
  const ids = r.rows.map(l => r.urls[l].slice(-8));
  assert.deepEqual(ids, ['cccccccc', 'aaaaaaaa', 'bbbbbbbb']);
  assert.equal(plainText(r.rows[0]), '1h · On the branch too');
  assert.match(r.rows[0], /^\u{1F33F} /u, 'a branch row carries the branch glyph');
  assert.match(r.rows[2], /^\u{1F558} /u, 'a recent row carries the recent glyph');
  for (const l of r.rows) assert.doesNotMatch(l, /[0-9a-f]{8}$/, 'no id on a row that is already distinct');
  for (const l of r.rows) assert.match(r.urls[l], /^https:\/\/mehrlander\.github\.io\/web-tools\/pages\/session\.html#id=[0-9a-f]{8}$/);
  assert.equal(Object.keys(r.urls).length, 3);
  assert.equal(r.count, 3);
});

test('session-menu: rows order by last activity, not by when the session started', () => {
  const body = { rows: [
    // Picked up ten hours ago and STILL RUNNING: the one a reader means.
    row('aaaaaaaa', 600, 'Long one, still going', ['claude/x'], [], 5),
    // Started later and finished long ago, so `started` alone puts it first.
    row('bbbbbbbb', 120, 'Short one, done', ['claude/x'], [], 110),
  ] };
  const r = load('session-menu.js', { body }).fn({ input: 'claude/x', token: 't' });
  assert.deepEqual(r.rows.map(l => r.urls[l].slice(-8)), ['aaaaaaaa', 'bbbbbbbb']);
  // And the age on the row is the same value the sort used, so a reader can
  // check the order against what the rows say rather than taking it on faith.
  assert.equal(plainText(r.rows[0]), '5m · Long one, still going');
  assert.equal(plainText(r.rows[1]), '2h · Short one, done');
});

test('session-menu: a row with no `ended` falls back to `started` and sorts against one that has it', () => {
  const body = { rows: [
    row('aaaaaaaa', 30, 'No ended field'), // ordered on `started`, 30m
    row('bbbbbbbb', 600, 'Ended ten minutes ago', [], [], 10),
  ] };
  const r = load('session-menu.js', { body }).fn({ input: '', token: 't' });
  assert.deepEqual(r.rows.map(l => r.urls[l].slice(-8)), ['bbbbbbbb', 'aaaaaaaa']);
});

test('session-menu: an ask is plain and bounded, and a duplicate ask still yields distinct labels', () => {
  const long = '**Bold** and `code` and [label](https://x.y/z) ' + 'word '.repeat(60);
  const body = { rows: [row('aaaaaaaa', 5, long), row('bbbbbbbb', 5, long)] };
  const r = load('session-menu.js', { body }).fn({ input: '', token: 't' });
  assert.ok(r.rows[0].length < 70, 'row was ' + r.rows[0].length);
  assert.doesNotMatch(r.rows[0], /[*`\[\]]/);
  assert.match(r.rows[0], /…/);
  assert.notEqual(r.rows[0], r.rows[1], 'the repeat earns its id');
  assert.match(r.rows[1], / · bbbbbbbb$/);
  assert.match(r.rows[0], /^\u{1F558} \u{1D7F1}\u{1D5FA}  /u, 'the age is set in mathematical sans-serif bold');
  assert.equal(Object.keys(r.urls).length, 2);
});
