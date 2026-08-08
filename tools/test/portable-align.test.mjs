// lib/kits/portable-align.js — logic tests for the pure alignment assessment: the
// marketplace-subscription read (object and string source shapes), the
// enabled-plugin filter, the CLAUDE.md wiring heuristic, and the verdict
// ladder (source / registry / optout / aligned / partial / unaligned).
// Plain-realm: the module only assigns onto window.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const window = {};
new Function('window', readFileSync(path.join(repoRoot, 'lib', 'kits/portable-align.js'), 'utf8'))(window);
const PA = window.PortableAlign;

const HUB = 'mehrlander/web-tools';

// The real settings shape a subscribed repo carries (home's settings.json).
const SUBSCRIBED = {
  extraKnownMarketplaces: { 'web-tools': { source: { source: 'github', repo: HUB } } },
  enabledPlugins: { 'portable@web-tools': true, 'daisy-alpine@web-tools': true },
  hooks: { SessionStart: [] },
};

test('marketplaceSubscribed reads the nested source.repo shape, and a string source', () => {
  assert.equal(PA.marketplaceSubscribed(SUBSCRIBED), true);
  assert.equal(PA.marketplaceSubscribed({ extraKnownMarketplaces: { x: { source: 'github:' + HUB } } }), true);
  assert.equal(PA.marketplaceSubscribed({ extraKnownMarketplaces: { x: { source: { repo: 'other/repo' } } } }), false);
  assert.equal(PA.marketplaceSubscribed({}), false);
  assert.equal(PA.marketplaceSubscribed(null), false);
});

test('enabledHubPlugins keeps only true @web-tools entries, bare names', () => {
  assert.deepEqual(PA.enabledHubPlugins(SUBSCRIBED), ['portable', 'daisy-alpine']);
  assert.deepEqual(PA.enabledHubPlugins({ enabledPlugins: { 'portable@web-tools': false, 'other@else': true } }), []);
  assert.deepEqual(PA.enabledHubPlugins(null), []);
});

test('conventionsWired accepts the known wiring phrasings, rejects unrelated text', () => {
  assert.equal(PA.conventionsWired('Run /web-tools at session start.'), true);
  assert.equal(PA.conventionsWired('loads docs/CONVENTIONS.md by import'), true);
  assert.equal(PA.conventionsWired('enabledPlugins names portable@web-tools'), true);
  assert.equal(PA.conventionsWired('A repo about something else entirely.'), false);
  assert.equal(PA.conventionsWired(null), false);
});

test('verdict: fully wired repo is aligned', () => {
  const a = PA.assess({ repo: 'me/consumer', settings: SUBSCRIBED, claudeMd: 'Run /web-tools first.', config: { estate: true } });
  assert.equal(a.verdict, 'aligned');
  assert.equal(a.marketplace, true);
  assert.deepEqual(a.plugins, ['portable', 'daisy-alpine']);
  assert.equal(a.conventionsWired, true);
  assert.equal(a.estate, true);
  assert.deepEqual(a.hookEvents, ['SessionStart']);
});

test('verdict: any single signal without the full set is partial', () => {
  assert.equal(PA.assess({ repo: 'me/x', config: { estate: true } }).verdict, 'partial');            // config only
  assert.equal(PA.assess({ repo: 'me/x', claudeMd: 'see CONVENTIONS.md' }).verdict, 'partial');      // wiring only
  assert.equal(PA.assess({ repo: 'me/x', settings: SUBSCRIBED }).verdict, 'partial');                // settings only, no wiring
});

test('verdict: nothing present is unaligned; CLAUDE.md without wiring does not count', () => {
  const a = PA.assess({ repo: 'me/plain', claudeMd: 'Build instructions.' });
  assert.equal(a.verdict, 'unaligned');
  assert.equal(a.hasClaudeMd, true);
  assert.equal(a.conventionsWired, false);
});

test('verdict: conventions "optout" in config wins over other signals', () => {
  const a = PA.assess({ repo: 'me/opted', settings: SUBSCRIBED, claudeMd: '/web-tools', config: { conventions: 'optout' } });
  assert.equal(a.verdict, 'optout');
});

test('verdict: the hub and the registry get role verdicts, not grades', () => {
  assert.equal(PA.assess({ repo: HUB, role: 'hub', settings: { enabledPlugins: { 'portable@web-tools': false } } }).verdict, 'source');
  assert.equal(PA.assess({ repo: 'mehrlander/web-tools-private', role: 'registry' }).verdict, 'registry');
});
