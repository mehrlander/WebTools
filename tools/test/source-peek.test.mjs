// lib/kits/source-peek.js — the source peek behind an exact-file GitHub jump-over.
//
// The module splits cleanly: a render half that decides what a peek SHOWS for a
// given path and text (pure, and all of it asserted here) and a DOM half that
// positions a card (not asserted here; the headless shot in
// tools/render/scenarios/map-showing-peek.mjs is what covers that). Plain-realm:
// the file only assigns onto window, and its self-install is guarded on
// `document`, which does not exist here.
//
// The cases that carry real risk are the ones where a peek could mislead: a
// truncated excerpt that does not say it is truncated, a JSON shape read off
// bytes that do not parse, and an address built with a ref the caller did not
// name. Each has a test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const window = {};
const run = rel => new Function('window', readFileSync(path.join(repoRoot, rel), 'utf8'))(window);
run('lib/kits/repo-address.js');   // the address grammar source-peek reads with
run('lib/kits/source-peek.js');
const SP = window.SourcePeek;

test('the rendition is chosen by extension, and code is the default', () => {
  assert.equal(SP.kindOf('docs/CONVENTIONS.md'), 'markdown');
  assert.equal(SP.kindOf('README.markdown'), 'markdown');
  assert.equal(SP.kindOf('docs/routes.json'), 'json');
  assert.equal(SP.kindOf('lib/gh-api.js'), 'source');
  assert.equal(SP.kindOf('pages/toss-render.html'), 'source');
  // Case and a dotted path must not change the answer, and a file with no
  // extension is code rather than an error.
  assert.equal(SP.kindOf('docs/NOTES.MD'), 'markdown');
  assert.equal(SP.kindOf('.claude/settings.json'), 'json');
  assert.equal(SP.kindOf('scripts/Makefile'), 'source');
});

test('an excerpt reports what it left behind', () => {
  const text = Array.from({ length: 50 }, (_, i) => 'line ' + (i + 1)).join('\n');
  const ex = SP.excerpt(text, 5);
  assert.equal(ex.text, 'line 1\nline 2\nline 3\nline 4\nline 5');
  assert.equal(ex.shown, 5);
  assert.equal(ex.total, 50);
  assert.equal(ex.truncated, true);
});

test('a file shorter than the window is not reported as truncated', () => {
  const ex = SP.excerpt('one\ntwo', 20);
  assert.equal(ex.truncated, false);
  assert.equal(ex.total, 2);
});

test('trailing blank lines do not inflate the count', () => {
  // A file ending in a newline would otherwise read as one line longer than it
  // is, which is the sort of quiet wrongness a footer should never carry.
  assert.equal(SP.excerpt('a\nb\n').total, 2);
  assert.equal(SP.excerpt('a\r\nb\r\n').total, 2);
  assert.equal(SP.excerpt('').total, 0);
});

test('JSON is pretty-printed and its top level named', () => {
  const raw = '{"routes":[1,2,3],"hub":"me/web-tools"}';
  assert.equal(SP.shape(raw), 'object · 2 keys');
  assert.equal(SP.shape('[1,2,3]'), 'array · 3 items');
  assert.equal(SP.shape('[1]'), 'array · 1 item');
  assert.match(SP.jsonText(raw), /^\{\n {2}"routes"/);
});

test('unparseable JSON is left alone and says so', () => {
  const broken = '{ "a": 1,,, }';
  assert.equal(SP.shape(broken), 'not valid JSON');
  assert.equal(SP.jsonText(broken), broken);   // shown as written, not mangled
});

test('a long file peeks; only the reformat is skipped when it is huge', () => {
  // The first draft refused to peek above 64 KB, which was backwards: a short
  // excerpt is most useful for a file too long to open casually. A peek at an
  // 86 KB doc must render, and a JSON too large to reformat must still show its
  // head rather than an error.
  const big = '# Title\n' + 'prose line\n'.repeat(20000);
  const out = SP.body('docs/show-repo.md', big);
  assert.equal(out.kind, 'markdown');
  assert.equal(out.text.split('\n')[0], '# Title');
  assert.equal(out.note, `first ${SP.LINES} of 20001 lines`);

  const hugeJson = '{"a":[' + '1,'.repeat(400000) + '1]}';
  assert.ok(hugeJson.length > 512 * 1024);
  assert.equal(SP.jsonText(hugeJson), hugeJson);          // shown as written
  assert.equal(SP.body('big.json', hugeJson).kind, 'json'); // and still peeks
});

test('the body pulls the three decisions together', () => {
  const md = SP.body('docs/x.md', '# Title\n\nSome prose.');
  assert.equal(md.kind, 'markdown');
  assert.equal(md.note, '3 lines');

  const json = SP.body('docs/routes.json', '{"a":1,"b":2}');
  assert.equal(json.kind, 'json');
  assert.equal(json.text.split('\n')[0], '{');       // pretty-printed, not raw
  assert.match(json.note, /^object · 2 keys/);

  const long = SP.body('lib/big.js', Array.from({ length: 80 }, (_, i) => 'x' + i).join('\n'));
  assert.equal(long.kind, 'source');
  assert.equal(long.truncated, true);
  assert.equal(long.note, `first ${SP.LINES} of 80 lines`);
});

test('markdown frontmatter is fenced, not left to render as prose', () => {
  // Every skill and every tracker task in this estate opens with frontmatter,
  // and marked renders a bare `---` block as a paragraph, so the peek used to
  // open on "id: … status: …" run together as though it were the document.
  const md = '---\nid: x-123\nstatus: backlog\n---\n# Title\n\nProse.';
  const out = SP.body('tracker/tasks/x.md', md);
  assert.equal(out.text.split('\n').slice(0, 4).join('\n'),
               '```\nid: x-123\nstatus: backlog\n```');
  assert.match(out.text, /# Title/);
});

test('only leading frontmatter is fenced', () => {
  // A `---` rule in the middle of a document is a horizontal rule, not metadata.
  const md = '# Title\n\n---\n\nmore';
  assert.equal(SP.fenceFrontmatter(md), md);
  // …and a file that is nothing but frontmatter still fences cleanly.
  assert.equal(SP.fenceFrontmatter('---\na: 1\n---\n'), '```\na: 1\n```\n');
});

test('an address omits a ref it was not given', () => {
  // '' means "the repo's default branch", which the contents API resolves. A
  // peek must not guess 'main' there: RepoAddress.parse would then report a ref
  // the caller never named.
  assert.equal(SP.addr('me/web-tools', '', 'docs/x.md'), 'me/web-tools:docs/x.md');
  assert.equal(SP.addr('me/web-tools', 'main', 'docs/x.md'), 'me/web-tools@main:docs/x.md');
  assert.equal(SP.addr('me/web-tools', 'claude/a-b', 'lib/x.js'), 'me/web-tools@claude/a-b:lib/x.js');
  assert.equal(SP.addr('', 'main', 'docs/x.md'), '');
  assert.equal(SP.addr('me/web-tools', 'main', ''), '');
});

test('every address a peek builds parses back to its parts', () => {
  // The round trip is the contract between the call sites and the reader: they
  // build with addr(), the card splits with RepoAddress.parse().
  for (const [repo, ref, p] of [['me/web-tools', 'main', 'docs/routes.json'],
                                ['me/web-tools', '', 'a/b/c.md'],
                                ['me/repo-x', 'claude/feat/x', 'pages/p.html']]) {
    const parsed = window.RepoAddress.parse(SP.addr(repo, ref, p));
    assert.deepEqual(parsed, { repo, ref, path: p });
  }
});

test('a seeded address is served from the cache, not refetched', () => {
  // The Map view holds its two manifests already; seeding is what keeps a peek
  // at the file a view projects from being a second round trip. window.GH is
  // absent in this realm, so a read that tried the network would throw.
  const addr = SP.addr('me/web-tools', 'main', 'docs/routes.json');
  assert.equal(SP.cached(addr), null);
  SP.seed(addr, '{"routes":[]}');
  assert.equal(SP.cached(addr), '{"routes":[]}');
});

test('seeding ignores a non-string, so a failed load cannot poison the cache', () => {
  const addr = SP.addr('me/web-tools', 'main', 'docs/none.json');
  SP.seed(addr, undefined);
  SP.seed(addr, null);
  assert.equal(SP.cached(addr), null);
});
