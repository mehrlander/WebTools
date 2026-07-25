// docs/routes.json: the manifest of how content moves and renders (address
// grammar, delivery modes, toss routes), rendered by show-repo's Map view in
// its Transport tab. This test is what lets the routes live in two places
// without drifting: the manifest owns the table, toss-render.html keeps an
// inlined literal so its critical render path takes no fetch, and adding a
// route to one without the other fails here.
//
// Also checks the two claims a reader would otherwise have to trust: every
// renderer and doc the manifest names exists on disk, and every delivery mode
// it describes is a parameter toss-render actually reads.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'docs', 'routes.json'), 'utf8'));
const tossRender = readFileSync(path.join(repoRoot, manifest.renderer), 'utf8');

// Pull the TOSS_ROUTES literal out of the page source. Deliberately strict
// about the one-line-per-route shape: if the literal is reformatted past what
// this reads, the parse comes back short and the comparison below fails loudly
// rather than silently passing on a partial read.
function inlinedRoutes(src) {
  const block = src.match(/const TOSS_ROUTES = \{([\s\S]*?)\n {2}\};/);
  assert.ok(block, 'TOSS_ROUTES literal not found in ' + manifest.renderer);
  const out = {};
  const row = /'([^']+)':\s*\{\s*repo:\s*'([^']+)',\s*ref:\s*'([^']+)',\s*path:\s*'([^']+)'\s*\}/g;
  for (const [, key, repo, ref, p] of block[1].matchAll(row)) out[key] = { repo, ref, path: p };
  const declared = (block[1].match(/^\s*'[^']+':/gm) || []).length;
  assert.equal(Object.keys(out).length, declared, 'a route line did not parse; check the literal shape');
  return out;
}

test('manifest shape: renderer, grammar, modes, and typed routes', () => {
  assert.equal(manifest.hub, 'mehrlander/web-tools');
  assert.ok(existsSync(path.join(repoRoot, manifest.renderer)), 'renderer missing: ' + manifest.renderer);
  assert.match(manifest.grammar.form, /owner\/repo\[@ref\]:path/);
  assert.ok(manifest.grammar.usedBy.length > 1, 'the grammar is shared, so name where');
  assert.match(manifest.precedence, /fragment first/, 'the read order is the contract; state it');
  assert.ok(manifest.modes.length > 1);
  assert.ok(manifest.routes.length > 0);
  for (const m of manifest.modes) {
    assert.ok(m.param && m.form && m.note, m.param + ': param/form/note');
    assert.ok(['inline', 'reference'].includes(m.carries), m.param + ': carries');
  }
  for (const r of manifest.routes) {
    assert.ok(r.key && r.repo && r.ref && r.path && r.renders, r.key + ': fields');
  }
});

test('the manifest routes and the inlined TOSS_ROUTES literal agree', () => {
  const inlined = inlinedRoutes(tossRender);
  const fromManifest = Object.fromEntries(
    manifest.routes.map(r => [r.key, { repo: r.repo, ref: r.ref, path: r.path }]),
  );
  assert.deepEqual(inlined, fromManifest,
    'docs/routes.json and the TOSS_ROUTES literal have drifted; the manifest is the owner');
});

test('every renderer and doc the manifest names exists in the repo', () => {
  for (const r of manifest.routes) {
    if (r.repo === manifest.hub) {
      assert.ok(existsSync(path.join(repoRoot, r.path)), 'renderer missing on disk: ' + r.path);
    }
    if (r.doc) assert.ok(existsSync(path.join(repoRoot, r.doc)), 'doc missing on disk: ' + r.doc);
  }
  for (const u of manifest.grammar.usedBy) {
    assert.ok(existsSync(path.join(repoRoot, u.path)), 'grammar reference missing: ' + u.path);
  }
});

test('every described delivery mode is a parameter toss-render reads', () => {
  for (const m of manifest.modes) {
    if (m.param === '<route>') continue;          // the route keys, covered above
    if (m.param === 'src') {                       // the renderer side, not a toss-render param
      assert.match(tossRender, /\?src=\$\{encodeURIComponent\(env\)\}/, 'the ?src= handoff is gone');
      continue;
    }
    assert.ok(tossRender.includes(`param('${m.param}')`), 'not read by toss-render: ' + m.param);
  }
});
