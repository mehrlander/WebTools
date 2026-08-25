// Holds kits/text-diff.js and pages/diff-tool.html to their contracts.
//
// The engine is the part with no visual tell when it goes wrong: a mis-anchored
// diff still renders as a clean grid. So the ops sequence is checked
// structurally (it must reconstruct both sides exactly and stay monotone) and
// its edit count is compared against a brute-force LCS, which is optimal by
// construction. Patience diff is allowed to be non-minimal, since anchoring on
// unique lines is the point, but it must stay within a stated factor.
//
// Two subjects, loaded the way each is written. The kit is a plain IIFE that
// attaches window.textDiff, so it is evaluated against a global stub. The
// page's component factory is lifted out of the HTML and evaluated directly: it
// touches `this.$watch` only inside init(), so its normalization, patch and
// state methods run against a bare object with no Alpine and no DOM.
//
// The kit is shared with the stage's Diff lens (lib/alpineComponents/stage.js),
// so these tests cover both consumers' engine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

// htmlToText() is the one method that needs a DOM. jsdom supplies the parser
// rather than the engine being changed to accommodate the test.
globalThis.DOMParser = new JSDOM('').window.DOMParser;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The kit: a plain IIFE that attaches window.textDiff.
const kitSrc = await readFile(path.join(repoRoot, 'lib', 'kits', 'text-diff.js'), 'utf8');
const win = globalThis;
new Function('window', kitSrc)(win);
const textDiff = win.textDiff;
assert.ok(textDiff && textDiff.lines, 'kits/text-diff.js did not attach window.textDiff');

// The page component, for the layers above the engine.
const html = await readFile(path.join(repoRoot, 'pages', 'diff-tool.html'), 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const src = blocks.find(b => b.includes('function diffApp()'));
assert.ok(src, 'diffApp() factory not found in pages/diff-tool.html');
const app = new Function(src + '\nreturn diffApp();')();

// ── helpers ────────────────────────────────────────────────────────────────

// Walk the ops back into both inputs. Any mis-indexed or dropped op shows up
// here, which is the property that actually matters for rendering.
function reconstruct(ops, a, b) {
  const left = [], right = [];
  for (const op of ops) {
    if (op.type === 'eq') { left.push(a[op.a]); right.push(b[op.b]); }
    else if (op.type === 'del') left.push(a[op.a]);
    else right.push(b[op.b]);
  }
  return { left, right };
}

// Ops must also be monotone in both indices, or the rendered line numbers run
// backwards even when the reconstruction happens to pass.
function assertMonotone(ops) {
  let lastA = -1, lastB = -1;
  for (const op of ops) {
    if (op.type === 'eq' || op.type === 'del') {
      assert.ok(op.a > lastA, `a index went backwards at ${JSON.stringify(op)}`);
      lastA = op.a;
    }
    if (op.type === 'eq' || op.type === 'add') {
      assert.ok(op.b > lastB, `b index went backwards at ${JSON.stringify(op)}`);
      lastB = op.b;
    }
  }
}

function editCount(ops) {
  return ops.filter(o => o.type !== 'eq').length;
}

// Optimal edit distance by full DP. Only used on inputs small enough for it.
function optimalEdits(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  return (n - dp[0][0]) + (m - dp[0][0]);
}

function check(a, b, label, slack = 2) {
  const ops = app.diffLines(a, b);
  const { left, right } = reconstruct(ops, a, b);
  assert.deepEqual(left, a, `${label}: ops do not reconstruct A`);
  assert.deepEqual(right, b, `${label}: ops do not reconstruct B`);
  assertMonotone(ops);
  const got = editCount(ops), best = optimalEdits(a, b);
  assert.ok(got >= best, `${label}: ${got} edits beats the optimum ${best}, which is impossible`);
  assert.ok(got <= best * slack + 4,
    `${label}: ${got} edits against an optimum of ${best} is worse than the allowed factor`);
  return ops;
}

const lines = s => s.split('\n');

// ── the shapes a version comparison actually takes ─────────────────────────

test('identical input yields only equalities', () => {
  const a = lines('one\ntwo\nthree');
  const ops = check(a, a.slice(), 'identical');
  assert.equal(editCount(ops), 0);
  assert.ok(ops.every(o => o.type === 'eq'));
});

test('empty against empty', () => {
  const ops = app.diffLines([''], ['']);
  assert.deepEqual(reconstruct(ops, [''], ['']).left, ['']);
  assert.equal(editCount(ops), 0);
});

test('one side empty is all insertions', () => {
  const b = lines('a\nb\nc');
  const ops = check([], b, 'empty A');
  assert.equal(editCount(ops), 3);
  assert.ok(ops.every(o => o.type === 'add'));
});

test('a single changed line in the middle', () => {
  const a = lines('a\nb\nc\nd\ne');
  const b = lines('a\nb\nCHANGED\nd\ne');
  const ops = check(a, b, 'one changed line');
  assert.equal(editCount(ops), 2);   // one delete plus one insert
});

test('insertion at the head keeps the tail aligned', () => {
  const a = lines('a\nb\nc');
  const b = lines('new\na\nb\nc');
  const ops = check(a, b, 'head insertion');
  assert.equal(editCount(ops), 1);
});

test('a moved block does not smear across the file', () => {
  const a = lines('h1\nx\ny\nz\nh2\np\nq');
  const b = lines('h1\nh2\np\nq\nx\ny\nz');
  check(a, b, 'moved block', 3);
});

test('repeated lines do not mis-anchor', () => {
  // Every line is duplicated, so nothing is a unique anchor and the block
  // falls through to Myers. This is the case patience alone cannot handle.
  const a = lines('x\nx\nx\nx\nA\nx\nx\nx\nx');
  const b = lines('x\nx\nx\nx\nB\nx\nx\nx\nx');
  const ops = check(a, b, 'all duplicates');
  assert.equal(editCount(ops), 2);
});

test('a realistic two-version document', () => {
  const base = Array.from({ length: 400 }, (_, i) => `Sec. ${i}. The provision reads as written.`);
  const edited = base.slice();
  edited[10] = 'Sec. 10. The provision reads as amended.';
  edited.splice(200, 0, 'Sec. 200a. A new section.');
  edited.splice(300, 3);
  const ops = check(base, edited, 'two versions');
  // Trimming plus anchoring should leave the edit count near the true change,
  // not proportional to the document.
  assert.ok(editCount(ops) < 20, `expected a small edit count, got ${editCount(ops)}`);
});

test('long inputs stay bounded: two 6000-line files', () => {
  // The predecessor engine allocated an n*m Int32Array here (144 million
  // entries, ~576 MB) and could not finish. This is the regression guard.
  const a = Array.from({ length: 6000 }, (_, i) => `line ${i}`);
  const b = a.slice();
  b[2500] = 'line 2500 changed';
  b.splice(4000, 0, 'inserted');
  const t0 = process.hrtime.bigint();
  const ops = app.diffLines(a, b);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.deepEqual(reconstruct(ops, a, b).left, a);
  assert.deepEqual(reconstruct(ops, a, b).right, b);
  assert.equal(editCount(ops), 3);
  assert.ok(ms < 2000, `took ${ms.toFixed(0)}ms, which is too slow to be interactive`);
});

test('two unrelated large texts degrade to a replacement, and say so', () => {
  // No shared line at all, and far past MYERS_CAP: the block must come back as
  // one delete run plus one insert run, with the warning set.
  const a = Array.from({ length: 3000 }, (_, i) => `alpha ${i}`);
  const b = Array.from({ length: 3000 }, (_, i) => `beta ${i}`);
  const ops = app.diffLines(a, b);
  assert.deepEqual(reconstruct(ops, a, b).left, a);
  assert.deepEqual(reconstruct(ops, a, b).right, b);
  assert.match(textDiff.lastWarning, /too different to align/);
  assert.equal(editCount(ops), 6000);
});

test('the warning clears on the next clean diff', () => {
  app.diffLines(['x'], ['y']);
  assert.equal(textDiff.lastWarning, '', 'a small diff should leave no warning behind');
  assert.equal(app._diffWarn, '', 'the page mirrors the kit rather than keeping its own');
});

test('randomised inputs always reconstruct', () => {
  // Deterministic PRNG so a failure is reproducible from the seed.
  let seed = 20260729;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let trial = 0; trial < 200; trial++) {
    const n = 1 + Math.floor(rnd() * 40);
    const a = Array.from({ length: n }, () => 'L' + Math.floor(rnd() * 12));
    const b = a.filter(() => rnd() > 0.25);
    for (let i = 0; i < 6; i++) if (rnd() > 0.5) b.splice(Math.floor(rnd() * (b.length + 1)), 0, 'N' + Math.floor(rnd() * 12));
    check(a, b, `random trial ${trial} (seed ${seed})`, 3);
  }
});

// ── word-level diff inside a changed line ──────────────────────────────────

test('word diff marks only what moved', () => {
  const { lh, rh } = app.wordDiff('the quick brown fox', 'the slow brown fox');
  assert.match(lh, /<span class="w-del">quick<\/span>/);
  assert.match(rh, /<span class="w-add">slow<\/span>/);
  assert.ok(!lh.includes('>the<'), 'unchanged words should not be marked');
});

test('word diff escapes markup rather than emitting it', () => {
  const { lh, rh } = app.wordDiff('<b>x</b>', '<i>x</i>');
  assert.ok(!/<b>/.test(lh), 'source markup must be escaped');
  assert.ok(lh.includes('&lt;b&gt;'));
  assert.ok(rh.includes('&lt;i&gt;'));
});

test('word diff bails out on a pathological line instead of hanging', () => {
  const long = Array.from({ length: 5000 }, (_, i) => 'w' + i).join(' ');
  const t0 = process.hrtime.bigint();
  const { lh } = app.wordDiff(long, long + ' tail');
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(!lh.includes('w-del'), 'over the cap the line is returned plain');
  assert.ok(ms < 300, `took ${ms.toFixed(0)}ms; the cap is not doing its job`);
});

// ── patch round trip ───────────────────────────────────────────────────────

test('a generated patch applies back to the modified text', () => {
  const A = 'alpha\nbravo\ncharlie\ndelta\necho\nfoxtrot\n';
  const B = 'alpha\nbravo\nCHARLIE\ndelta\nnew line\necho\n';
  app.slots.A = { src: 'text', value: '', name: 'a.txt', content: A, loading: false, error: '' };
  app.slots.B = { src: 'text', value: '', name: 'b.txt', content: B, loading: false, error: '' };
  app.rules = [];
  app.stripHtml = false;
  app._opsCache = null;

  for (const ctx of [1, 3, 8, 999]) {
    app.patchContext = ctx;
    app.genPatch();
    assert.ok(app.patch.includes('@@'), `context ${ctx}: no hunk emitted`);
    const applied = app.applyPatch(A.replace(/\n$/, ''), app.patch);
    assert.equal(applied, B.replace(/\n$/, ''), `context ${ctx}: patch did not round trip`);
  }
});

test('identical sides produce no patch', () => {
  const same = 'one\ntwo\n';
  app.slots.A.content = same;
  app.slots.B.content = same;
  app._opsCache = null;
  app.genPatch();
  assert.equal(app.patch, '');
  assert.match(app.patchLines[0].text, /identical/);
});

test('applying a patch with no hunks is an error, not silence', () => {
  assert.throws(() => app.applyPatch('a\nb', 'not a patch at all'), /No hunks/);
});

test('a malformed hunk header names its line', () => {
  assert.throws(() => app.applyPatch('a\nb', '@@ garbage @@\n+x'), /Malformed hunk header on line 1/);
});

// ── normalization ──────────────────────────────────────────────────────────

test('the prose preset breaks on sentence ends', () => {
  app.rules = [{ find: '([.!?][")’”]?)\\s+', replace: '$1\\n', on: true }];
  app.stripHtml = false;
  app.validateRules();
  const out = app.normalize('One thing. Then another! A third? Done.');
  assert.deepEqual(out.split('\n'), ['One thing.', 'Then another!', 'A third?', 'Done.']);
});

test('a rule that is not valid regex is flagged and skipped, not thrown', () => {
  app.rules = [{ find: '([unclosed', replace: 'x', on: true }];
  app.validateRules();
  assert.equal(app.rules[0].bad, true);
  assert.equal(app.normalize('keep me'), 'keep me');
});

test('stripping HTML keeps block boundaries as line breaks', () => {
  app.rules = [];
  app.stripHtml = true;
  const out = app.normalize('<div><p>First para</p><p>Second para</p></div>');
  const kept = out.split('\n').map(s => s.trim()).filter(Boolean);
  assert.deepEqual(kept, ['First para', 'Second para']);
});

test('script and style content does not survive the strip', () => {
  app.stripHtml = true;
  app.rules = [];
  const out = app.normalize('<p>keep</p><script>var secret = 1;</script><style>.x{}</style>');
  assert.ok(!out.includes('secret'));
  assert.ok(!out.includes('.x{}'));
  assert.ok(out.includes('keep'));
});

test('normalization is off by default and leaves text alone', () => {
  app.stripHtml = false;
  app.rules = [];
  assert.equal(app.normalize('  <b>as is</b>  '), '<b>as is</b>');
});

// ── state round trip ───────────────────────────────────────────────────────

test('state survives a save and load', () => {
  app.slots.A = { src: 'gh', value: 'o/r@main:p', name: 'left', content: 'a\nb', loading: false, error: '' };
  app.slots.B = { src: 'url', value: 'https://x', name: 'right', content: 'a\nc', loading: false, error: '' };
  app.rules = [{ find: 'x', replace: 'y', on: true }];
  app.stripHtml = true;
  app.ignoreCase = true;
  app.view = 'unified';

  const saved = JSON.parse(JSON.stringify(app.state()));
  Object.assign(app, { rules: [], stripHtml: false, ignoreCase: false, view: 'split' });
  app.slots.A.content = '';
  app.slots.B.content = '';

  app.loadState(saved);
  assert.equal(app.slots.A.content, 'a\nb');
  assert.equal(app.slots.B.name, 'right');
  assert.equal(app.stripHtml, true);
  assert.equal(app.ignoreCase, true);
  assert.equal(app.view, 'unified');
  assert.deepEqual(app.rules, [{ find: 'x', replace: 'y', on: true, bad: false }]);
});

test('a v1 file from the previous page still opens', () => {
  app.loadState({ v: 1, filename: 'fetchUser.js', original: 'old\n', modified: 'new\n' });
  assert.equal(app.slots.A.content, 'old\n');
  assert.equal(app.slots.B.content, 'new\n');
  assert.equal(app.slots.A.name, 'fetchUser.js');
});

test('an unknown state version is refused', () => {
  assert.throws(() => app.loadState({ v: 99 }), /Unsupported file version/);
});

// ── the kit's own surface, which the stage's Diff lens uses ─────────────────

test('the page and the kit are the same engine, not two copies', () => {
  const a = ['x', 'y', 'z'], b = ['x', 'Y', 'z'];
  assert.deepEqual(app.diffLines(a, b), textDiff.lines(a, b));
  assert.deepEqual(app.wordDiff('a b', 'a c'), textDiff.words('a b', 'a c'));
  assert.equal(app.esc('<x>'), textDiff.esc('<x>'));
});

test('rows() flattens ops to the stage lens shape, with full context', () => {
  const a = ['keep', 'old', 'tail'], b = ['keep', 'new', 'tail'];
  const rows = textDiff.rows(textDiff.lines(a, b), a, b);
  assert.deepEqual(rows, [
    { t: 'ctx', line: 'keep' },
    { t: 'del', line: 'old' },
    { t: 'add', line: 'new' },
    { t: 'ctx', line: 'tail' },
  ]);
});

test('rows() reconstructs both sides too, so a copied dump is faithful', () => {
  const a = Array.from({ length: 300 }, (_, i) => 'a' + i);
  const b = a.slice();
  b.splice(50, 5);
  b.splice(120, 0, 'inserted one', 'inserted two');
  b[200] = 'changed';
  const rows = textDiff.rows(textDiff.lines(a, b), a, b);
  assert.deepEqual(rows.filter(r => r.t !== 'add').map(r => r.line), a);
  assert.deepEqual(rows.filter(r => r.t !== 'del').map(r => r.line), b);
});

test('the pair the stage used to refuse now diffs', () => {
  // stage.js capped its old LCS table at n*m > 4,000,000 and threw "files too
  // large to diff". This pair is 25 million cells.
  const a = Array.from({ length: 5000 }, (_, i) => 'line ' + i);
  const b = a.slice();
  b[4999] = 'line 4999 changed';
  const rows = textDiff.rows(textDiff.lines(a, b), a, b);
  assert.equal(rows.filter(r => r.t === 'add').length, 1);
  assert.equal(rows.filter(r => r.t === 'del').length, 1);
});

test('words() handles a null or empty side without throwing', () => {
  assert.deepEqual(textDiff.words('', ''), { lh: '', rh: '' });
  const { lh, rh } = textDiff.words(null, 'added');
  assert.equal(lh, '');
  assert.match(rh, /w-add/);
});

test('an indented changed line emits no empty highlight spans', () => {
  // '  x'.split(/(\s+)/) leads with an empty token; wrapping it produced a
  // zero-width colored span on every indented line the diff touched.
  const { lh, rh } = textDiff.words('    return old;', '    return next;');
  for (const html of [lh, rh]) {
    assert.ok(!/<span class="w-(add|del)"><\/span>/.test(html), `empty span in ${html}`);
  }
  assert.match(lh, /w-del/);
  assert.match(rh, /w-add/);
});
