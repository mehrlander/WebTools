#!/usr/bin/env node
// Generate the index at the top of docs/SNAGS.md, and warn about likely repeats.
//
//   node tools/build/snags-index.mjs [--check]
//
// The log's own rule is that recurrence is the signal: an entry tracks how
// often it bit, and the third sighting earns a tracker task. That rule needs
// two things nothing was supplying.
//
// FIRST, the set has to be visible at the moment of appending. A session that
// trips over something opens this file, reads the header, and writes a new
// entry at the top; it does not read 400 lines of entries first. So the index
// sits between the header and the newest entry, in the one place the append
// path already passes through, sorted by sighting count so the repeat
// offenders lead and the "third time earns a task" line has something to point
// at.
//
// SECOND, a near-repeat has to be caught mechanically, because a session that
// knew the entry existed would have edited it instead. Measured 2026-08-14:
// one session wrote `headless-prose-unstyled` for a trip `headless-shot-prose-flat`
// already owned, and the collision surfaced days later as a merge conflict.
// Slug equality would not have caught that; shared TOKENS would ("headless",
// "prose"). So the generator reports every pair of entries sharing two or more
// significant slug tokens, as a warning printed at commit time, when the entry
// is being written and can still be folded into the one that exists.
//
// The warning does NOT fail the run, here or under --check. Overlap is a
// heuristic: `headless-shot-prose-flat` and `headless-prose-unstyled` really
// are the same snag, while two genuinely different loader snags would both
// carry "loader" and be fine. A gate on a guess teaches people to route around
// it. This reports, and a human decides, which is the same posture as the
// repo's other surveys.
//
// --check compares instead of writing, the idiom every generator here shares,
// so tools/test/artifacts-lockstep.test.mjs can hold the file to its source.

import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE = path.join(root, 'docs/SNAGS.md');
const OPEN = '[//]: # (snags-index)';
const CLOSE = '[//]: # (/snags-index)';

// Words that carry no distinguishing weight in a slug. Kept short on purpose:
// over-filtering hides real overlaps, and the cost of a false pair is one
// glance.
const STOP = new Set(['a', 'an', 'the', 'is', 'it', 'in', 'on', 'of', 'to', 'and',
                      'not', 'no', 'as', 'at', 'by', 'for', 'with', 'that', 'this']);

export const tokens = (slug) => slug.split('-').filter(t => t.length > 2 && !STOP.has(t));

// One entry per `### slug: title`, with every date its *(seen: …)* line names.
// An entry runs to the next heading or the next `---`, whichever comes first,
// and a bold sub-paragraph inside it is part of it: several entries carry a
// dated correction or a "corrected move" paragraph, and each of those dates is
// another sighting of the SAME snag, which is what the recurrence rule counts.
//
// That boundary is only safe because every block in the file now leads with a
// slug. It did not: until 2026-08-14 the tail held older bold-lead blocks with
// no heading, and a rule this simple absorbed them, reporting
// `screenshot-hides-overflow` as seen fourteen times when it was seen once.
// Eleven of them were migrated rather than parsed around, which is why the
// generator can be this plain.
//
// The guard that replaces the workaround is narrower and aimed at the way an
// entry actually gets added: newest on top, so an unslugged block would land
// between the index and the first heading. Any sighting there is counted as
// orphaned and reported. A block appended with no slug lower down would be
// absorbed by the entry above it, which this cannot see; the header's rule
// that every entry leads with a slug is what keeps that from happening.
export function parse(md) {
  const body = md.slice(md.indexOf(CLOSE) === -1 ? 0 : md.indexOf(CLOSE));
  const heads = [...body.matchAll(/^### ([a-z0-9-]+): (.+)$/gm)]
    .map(m => ({ slug: m[1], title: m[2], at: m.index }));
  const seenAt = [...body.matchAll(/\*\(seen: ([^)]+)\)\*/g)].map(m => ({ at: m.index, raw: m[1] }));
  const first = heads.length ? heads[0].at : body.length;
  const out = heads.map((h, i) => {
    const nextHead = i + 1 < heads.length ? heads[i + 1].at : body.length;
    const rule = body.indexOf('\n---\n', h.at);
    const end = Math.min(nextHead, rule === -1 ? body.length : rule);
    const seen = seenAt.filter(sa => sa.at > h.at && sa.at < end)
      .flatMap(sa => sa.raw.split(',').map(d => d.trim()).filter(Boolean));
    return { ...h, seen };
  });
  return { entries: out, orphanSightings: seenAt.filter(sa => sa.at < first).length };
}

export function render(entries) {
  const rows = [...entries].sort((a, b) =>
    (b.seen.length - a.seen.length) || (b.seen[0] || '').localeCompare(a.seen[0] || '') ||
    a.slug.localeCompare(b.slug));
  const lines = rows.map(e => {
    const n = e.seen.length;
    const when = n ? e.seen[e.seen.length - 1] : 'undated';
    const mark = n > 1 ? ` **×${n}**` : '';
    return `| \`${e.slug}\`${mark} | ${when} | ${e.title} |`;
  });
  return [
    OPEN,
    '',
    `**${entries.length} snags**, repeats first. Read this before adding one: a trip that is`,
    'already here belongs in the entry that owns it, as another date on its `seen`',
    'line, not as a second entry. Generated by `npm run snags-index`.',
    '',
    '| snag | last seen | what it was |',
    '| --- | --- | --- |',
    ...lines,
    '',
    CLOSE,
  ].join('\n');
}

// Pairs sharing two or more slug tokens: the cheapest signal that a new entry
// is a repeat of one already here.
export function suspects(entries) {
  const pairs = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = new Set(tokens(entries[i].slug));
      const shared = tokens(entries[j].slug).filter(t => a.has(t));
      if (shared.length >= 2) pairs.push({ a: entries[i].slug, b: entries[j].slug, shared });
    }
  }
  return pairs;
}

// The CLI. Everything above is pure and importable, so the thresholds this
// tool turns on (two shared tokens, the stop list, the three-character floor)
// can be held by tools/test/snags-index.test.mjs rather than by whoever last
// read the output. A detector that quietly stops detecting looks exactly like
// a log with no repeats in it.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const md = await readFile(FILE, 'utf8');
  const { entries, orphanSightings } = parse(md);
  const block = render(entries);

  let next;
  if (md.includes(OPEN) && md.includes(CLOSE)) {
    next = md.slice(0, md.indexOf(OPEN)) + block + md.slice(md.indexOf(CLOSE) + CLOSE.length);
  } else {
    // First run: insert after the header's rule, above the newest entry.
    const rule = md.indexOf('\n---\n');
    if (rule === -1) { console.error('snags-index: no `---` after the header to insert below'); process.exit(1); }
    const cut = rule + '\n---\n'.length;
    next = md.slice(0, cut) + '\n' + block + '\n' + md.slice(cut);
  }

  if (process.argv.includes('--check')) {
    if (next !== md) {
      console.error('snags-index: docs/SNAGS.md is stale — run `npm run snags-index`.');
      process.exit(1);
    }
  } else if (next !== md) {
    await writeFile(FILE, next);
  }

  const repeats = entries.filter(e => e.seen.length > 1).length;
  console.log(`snags-index: ${entries.length} snags, ${repeats} seen more than once` +
    (orphanSightings ? `; ${orphanSightings} sighting(s) above the first entry, in no slugged entry` : ''));

  const pairs = suspects(entries);
  if (pairs.length) {
    console.log(`  ${pairs.length} possible repeat(s) — same snag under two slugs? fold one in if so:`);
    for (const p of pairs) console.log(`    ${p.a}  ~  ${p.b}   (${p.shared.join(', ')})`);
  }
}
