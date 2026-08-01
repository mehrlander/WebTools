// toss-routed-subject.test.mjs — under a routed toss, WHICH FILE is the subject.
//
// #data=mehrlander/home:CLAUDE.md resolves onto address mode by fetching
// pages/data-view.html and handing it the envelope, so showAddress stamps the
// renderer as the subject. That is true of the document it mounted and false of
// what the viewer is looking at, and the drawer around the frame duly reported
// "mehrlander/web-tools · pages/data-view.html" over a markdown file from
// another repo. showRoute now re-stamps with the envelope's own address.
//
// splitAddr is the piece that has to be right for that, and it is lifted from
// the page rather than re-implemented: a rewrite here would agree with itself
// while the page kept its own behavior. The re-stamp itself is pinned by shape
// (the call is present, and it names the envelope rather than the route entry),
// since the surrounding function is half a page of async fetch.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const PAGE = 'pages/toss-render.html';
const src = readFileSync(path.join(repoRoot, PAGE), 'utf8');

const block = src.match(/\n {2}function splitAddr\(addr\) \{[\s\S]*?\n {2}\}\n/);
assert.ok(block, 'splitAddr not found in ' + PAGE);
const splitAddr = new Function(block[0] + '\n  return splitAddr;')();

test('an envelope address comes apart into repo, ref, and path', () => {
  assert.deepEqual(splitAddr('mehrlander/home:CLAUDE.md'),
    { repo: 'mehrlander/home', ref: '', path: 'CLAUDE.md' });
  assert.deepEqual(splitAddr('mehrlander/web-tools@main:docs/show-repo.md'),
    { repo: 'mehrlander/web-tools', ref: 'main', path: 'docs/show-repo.md' });
});

test('a slashed ref survives, since every session branch has one', () => {
  assert.deepEqual(splitAddr('mehrlander/web-tools@claude/a-b-c:tracker/board.md'),
    { repo: 'mehrlander/web-tools', ref: 'claude/a-b-c', path: 'tracker/board.md' });
});

test('a query or frag on the address belongs to the renderer, not the path', () => {
  assert.equal(splitAddr('o/r@br:data/rows.csv?view=table').path, 'data/rows.csv');
  assert.equal(splitAddr('o/r@br:data/rows.csv#item=2').path, 'data/rows.csv');
});

test('anything that is not an address reads as null rather than half-parsing', () => {
  assert.equal(splitAddr('not-an-address'), null);
  assert.equal(splitAddr('owner/repo'), null, 'no path is no address');
  assert.equal(splitAddr(''), null);
  assert.equal(splitAddr(null), null);
});

test('showRoute re-stamps the subject with the envelope, keeping the app as via', () => {
  const fn = src.match(/\n {2}async function showRoute\(key, raw\) \{[\s\S]*?\n {2}\}\n/);
  assert.ok(fn, 'showRoute not found in ' + PAGE);
  const body = fn[0];
  assert.match(body, /const a = splitAddr\(env\)/,
    'the ENVELOPE is what gets parsed, not the route entry');
  assert.match(body, /setSubject\(\{ repo: a\.repo, ref: a\.ref, path: a\.path, route: key,/,
    'the file is the subject and the route key rides with it');
  assert.match(body, /via: \{ repo: r\.repo, ref: r\.ref, path: r\.path \}/,
    'the renderer stays named: the take actions reach into ITS dom');
  // Order matters and is easy to lose in an edit: showAddress stamps the
  // renderer on its way out, so a re-stamp above it would be overwritten.
  assert.ok(body.indexOf('await showAddress(') < body.indexOf('setSubject('),
    'the re-stamp has to come after showAddress, which stamps the renderer');
});
