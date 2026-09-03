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

const row = (id, minsAgo, ask, branches = [], repos = []) =>
  ({ id, started: new Date(Date.now() - minsAgo * 60000).toISOString(), ask, branches, repos });

test('session-menu reads the index once, synchronously, raw, with the token as given', () => {
  const { fn, sent } = load('session-menu.js', { body: { rows: [] } });
  fn({ input: 'claude/x', token: 'ghp_x' });
  const open = sent.find(s => s.method);
  assert.equal(open.async, false, 'an async read returns after the coercion has captured the page');
  assert.match(open.url, /web-tools-private\/contents\/state\/sessions\.json\?ref=main$/);
  assert.deepEqual(sent.find(s => s[0] === 'Authorization'), ['Authorization', 'Bearer ghp_x']);
  assert.deepEqual(sent.find(s => s[0] === 'Accept'), ['Accept', 'application/vnd.github.raw']);
  assert.equal(sent.filter(s => s.method).length, 1);
});

test('session-menu: no token is an ERROR result, not a request', () => {
  const { fn, sent } = load('session-menu.js');
  const r = fn({ input: 'claude/x' });
  assert.match(r.caption, /^ERROR no token/);
  assert.deepEqual(r.rows, []);
  assert.equal(sent.length, 0);
});

test('session-menu: a failed read is an ERROR result carrying the status', () => {
  const { fn } = load('session-menu.js', { status: 401 });
  const r = fn({ input: 'claude/x', token: 't' });
  assert.equal(r.caption, 'ERROR HTTP 401 reading state/sessions.json');
  assert.equal(r.error, 'HTTP 401 reading state/sessions.json');
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
    assert.equal(fn({ input: clip, token: 't' }).caption, '1 on ' + want, JSON.stringify(clip));
  }
});

test('session-menu: the caption names each case in words, and stamps the index age', () => {
  const here = row('aaaaaaaa', 30, 'Ask', ['claude/x']);
  const other = row('bbbbbbbb', 90, 'Ask', ['claude/y']);
  const at = new Date(Date.now() - 3 * 3600000).toISOString();
  const run = (rows, input) => load('session-menu.js', { body: { rows, generatedAt: at } }).fn({ input, token: 't' }).caption;
  assert.equal(run([here, other], 'claude/x'), '1 on claude/x · index 3h');
  assert.equal(run([other], 'claude/x'), 'No session on claude/x yet, showing recent · index 3h');
  assert.equal(run([other], 'not a branch'), 'No branch on the clipboard, showing recent · index 3h');
});

test('session-menu: branch rows lead and are marked, recent rows fill, nothing repeats, every label maps to its page', () => {
  const body = { rows: [
    row('aaaaaaaa', 600, 'Older, on the branch', ['claude/x']),
    row('bbbbbbbb', 30, 'Newest, elsewhere', ['claude/y']),
    row('cccccccc', 60, 'On the branch too', [], [{ name: 'home', branch: 'claude/x' }]),
  ] };
  const r = load('session-menu.js', { body }).fn({ input: 'claude/x', token: 't' });
  assert.deepEqual(r.rows.map(l => l.slice(-8)), ['cccccccc', 'aaaaaaaa', 'bbbbbbbb']);
  assert.equal(r.rows[0], 'this branch · 1h · On the branch too · cccccccc');
  assert.ok(!r.rows[2].includes('this branch'));
  for (const l of r.rows) assert.equal(r.urls[l], 'https://mehrlander.github.io/web-tools/pages/session.html#id=' + l.slice(-8));
  assert.equal(Object.keys(r.urls).length, 3);
  assert.equal(r.count, 3);
});

test('session-menu: an ask is plain and bounded, and a duplicate ask still yields distinct labels', () => {
  const long = '**Bold** and `code` and [label](https://x.y/z) ' + 'word '.repeat(60);
  const body = { rows: [row('aaaaaaaa', 5, long), row('bbbbbbbb', 5, long)] };
  const r = load('session-menu.js', { body }).fn({ input: '', token: 't' });
  assert.ok(r.rows[0].length < 100, 'row was ' + r.rows[0].length);
  assert.doesNotMatch(r.rows[0], /[*`\[\]]/);
  assert.match(r.rows[0], /…/);
  assert.notEqual(r.rows[0], r.rows[1]);
  assert.equal(Object.keys(r.urls).length, 2);
});
