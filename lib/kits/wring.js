// wring.js — single-document template induction: give it one document with
// repeated structure (a log, an HTML page) and it returns the recurring
// templates (fixed boilerplate with variable slots) plus the values filling
// each slot. Lossless: templates + slot values reconstruct the original
// exactly.
//
// Load via gh.load('kits/wring.js'); exposes window.wring.
//   const run  = wring.induce(logText, { group: 'align' });   // text → templates
//   const sigs = wring.extractSignaturesFromNodes(document);  // DOM → signatures
//   const res  = wring.groupByTemplate(sigs);                 //   → templates
//
// The pipeline runs Stage 1 (segment) → Stage 2 (grammar) → Stages 3-4 (group
// and select) → Stage 5 (reconstruct); the stage sections below are in that
// order. Edit this file directly: it is the live copy. It began as a
// concatenation of the modules in mehrlander/wring (archived read-only;
// reference snapshot under archive/wring/, design notes in
// archive/wring/ARCHITECTURE.md), and stopped being generated on 2026-09-06.
// Documented in lib/kits/README.md.
(() => {
'use strict';

// --- Stage 1, text: tokenize ---------------------------------------------

/**
 * @param {string} text
 * @param {'punct'|'word'|'char'|'line'} [mode='punct']
 *   - 'punct': runs of letters, runs of digits, runs of whitespace, and each
 *     other character individually. Balanced default: fields stay whole, but
 *     punctuation becomes its own boundary. Recommended for logs/structured text.
 *   - 'word':  runs of non-whitespace and runs of whitespace.
 *   - 'char':  every character.
 *   - 'line':  each line including its trailing newline.
 * @returns {string[]} Tokens; concatenating them reproduces `text` exactly.
 */
function tokenize(text, mode = 'punct') {
  switch (mode) {
    case 'char':
      return [...text];
    case 'word':
      return text.match(/\S+|\s+/g) || [];
    case 'line':
      return text.match(/[^\n]*\n|[^\n]+$/g) || [];
    case 'punct':
    default:
      return text.match(/[A-Za-z]+|[0-9]+|\s+|[^A-Za-z0-9\s]/g) || [];
  }
}

// --- Stage 1, DOM: element signatures ------------------------------------

// ─── Public API ─────────────────────────────────────────────────────────────

const DEFAULT_SKIP_TAGS = new Set([
  'script', 'style', 'head', 'meta', 'link', 'title', 'base', 'noscript',
]);

/**
 * Extract DOM signatures from a raw HTML string.
 *
 * @param {string} html - Raw HTML source.
 * @param {Object} [options]
 * @param {boolean}       [options.requireClassOrId=true] - Skip elements with no class or id.
 * @param {boolean}       [options.includeId=true]        - Include `#id` in the signature.
 * @param {boolean}       [options.dedupe=false]          - Collapse identical signatures (first-seen order).
 * @param {Set<string>|string[]} [options.skipTags]       - Tag names to ignore (lowercased).
 * @param {Set<string>|string[]} [options.onlyTags]       - If set, only these tag names are emitted.
 * @returns {string[]} Signatures in document order.
 */
function extractSignatures(html, options = {}) {
  const {
    requireClassOrId = true,
    includeId = true,
    dedupe = false,
    skipTags = DEFAULT_SKIP_TAGS,
    onlyTags = null,
  } = options;

  const skip = skipTags instanceof Set ? skipTags : new Set(skipTags);
  const only = onlyTags ? (onlyTags instanceof Set ? onlyTags : new Set(onlyTags)) : null;

  const out = [];
  const seen = dedupe ? new Set() : null;

  for (const el of scanStartTags(html)) {
    const tag = el.tag;
    if (skip.has(tag)) continue;
    if (only && !only.has(tag)) continue;

    const id = includeId ? getAttr(el.attrs, 'id') : null;
    const classes = splitClasses(getAttr(el.attrs, 'class'));

    if (requireClassOrId && !id && classes.length === 0) continue;

    const sig = buildSignature(tag, id, classes);
    if (seen) {
      if (seen.has(sig)) continue;
      seen.add(sig);
    }
    out.push(sig);
  }

  return out;
}

/**
 * Extract signatures from a live DOM tree (browser / DOMParser). Exact parsing,
 * no regex. Walks `root` and all descendant elements.
 *
 * @param {Element|Document} root - A DOM element or document to walk.
 * @param {Object} [options] - Same shape as {@link extractSignatures}.
 * @returns {string[]} Signatures in document order.
 */
function extractSignaturesFromNodes(root, options = {}) {
  const {
    requireClassOrId = true,
    includeId = true,
    dedupe = false,
    skipTags = DEFAULT_SKIP_TAGS,
    onlyTags = null,
  } = options;

  const skip = skipTags instanceof Set ? skipTags : new Set(skipTags);
  const only = onlyTags ? (onlyTags instanceof Set ? onlyTags : new Set(onlyTags)) : null;

  const out = [];
  const seen = dedupe ? new Set() : null;
  const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];

  for (const node of elements) {
    const tag = node.tagName.toLowerCase();
    if (skip.has(tag)) continue;
    if (only && !only.has(tag)) continue;

    const id = includeId && node.id ? node.id : null;
    // classList preserves source order; className may be an SVGAnimatedString.
    const classes = node.classList
      ? [...node.classList]
      : splitClasses(typeof node.className === 'string' ? node.className : '');

    if (requireClassOrId && !id && classes.length === 0) continue;

    const sig = buildSignature(tag, id, classes);
    if (seen) {
      if (seen.has(sig)) continue;
      seen.add(sig);
    }
    out.push(sig);
  }

  return out;
}

/**
 * Tally identical signatures into frequency counts, most frequent first.
 *
 * @param {string[]} signatures
 * @returns {{ signature: string, count: number }[]}
 */
function countSignatures(signatures) {
  const counts = new Map();
  for (const s of signatures) counts.set(s, (counts.get(s) || 0) + 1);
  return [...counts.entries()]
    .map(([signature, count]) => ({ signature, count }))
    .sort((a, b) => b.count - a.count);
}

// ─── Tag scanning ───────────────────────────────────────────────────────────

// Matches a start tag, capturing the tag name and its raw attribute region.
// The attribute alternation `[^>"']` | "..." | '...' lets quoted attribute
// values legally contain ">" without prematurely ending the tag. Closing tags
// (</x>), comments (<!-- -->) and doctypes (<!...>) are not matched because the
// char after "<" must be a letter.
const START_TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

/**
 * Iterate start tags in an HTML string, yielding { tag, attrs }.
 * @param {string} html
 * @returns {Generator<{ tag: string, attrs: string }>}
 */
function* scanStartTags(html) {
  START_TAG_RE.lastIndex = 0;
  let m;
  while ((m = START_TAG_RE.exec(html)) !== null) {
    yield { tag: m[1].toLowerCase(), attrs: m[2] };
  }
}

/**
 * Read a named attribute's value from a tag's raw attribute region.
 * Handles double-quoted, single-quoted, and unquoted values.
 * @returns {string|null}
 */
function getAttr(attrText, name) {
  if (!attrText) return null;
  const re = new RegExp(
    '(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))',
    'i',
  );
  const m = re.exec(attrText);
  if (!m) return null;
  return m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
}

/** Split a class attribute value into ordered class tokens. */
function splitClasses(classAttr) {
  if (!classAttr) return [];
  return classAttr.trim().split(/\s+/).filter(Boolean);
}

/** Assemble a signature string from its parts. */
function buildSignature(tag, id, classes) {
  let sig = tag;
  if (id) sig += '#' + id;
  for (const c of classes) sig += '.' + c;
  return sig;
}

// --- Stage 2: grammar induction (Re-Pair) --------------------------------

// ─── Re-Pair ──────────────────────────────────────────────────────────────

const symKey = (s) => (s.rule !== undefined ? 'r' + s.rule : 't' + s.t);
const pairKey = (a, b) => symKey(a) + '\u0000' + symKey(b);

/** Greedy left-to-right count of NON-overlapping occurrences of one pair. */
function nonOverlapCount(seq, key) {
  let count = 0;
  for (let i = 0; i + 1 < seq.length; ) {
    if (pairKey(seq[i], seq[i + 1]) === key) { count++; i += 2; }
    else i++;
  }
  return count;
}

/** Replace every non-overlapping occurrence of `key` with a {rule:id} symbol. */
function replacePair(seq, key, id) {
  const out = [];
  for (let i = 0; i < seq.length; ) {
    if (i + 1 < seq.length && pairKey(seq[i], seq[i + 1]) === key) {
      out.push({ rule: id });
      i += 2;
    } else {
      out.push(seq[i]);
      i++;
    }
  }
  return out;
}

/**
 * Induce a grammar from a token array via Re-Pair.
 *
 * @param {Array<string|number>} tokens
 * @param {Object} [options]
 * @param {number} [options.minPairCount=2] - Stop when no digram occurs this often.
 * @returns {{ start: number, rules: Map<number, object[]>, ruleUses: Map<number, number> }}
 */
function induceGrammar(tokens, options = {}) {
  const { minPairCount = 2 } = options;
  let seq = tokens.map((t) => ({ t }));
  const rules = new Map();
  let nextId = 1; // 0 is reserved for the start rule

  for (;;) {
    // Count overlapping digram occurrences; remember a representative pair.
    const counts = new Map(); // key -> { count, a, b }
    for (let i = 0; i + 1 < seq.length; i++) {
      const k = pairKey(seq[i], seq[i + 1]);
      const e = counts.get(k);
      if (e) e.count++;
      else counts.set(k, { count: 1, a: seq[i], b: seq[i + 1] });
    }

    // Candidates sorted by frequency; verify true non-overlapping count.
    const candidates = [...counts.entries()]
      .filter(([, e]) => e.count >= minPairCount)
      .sort((x, y) => y[1].count - x[1].count);

    let chosen = null;
    for (const [k, e] of candidates) {
      if (nonOverlapCount(seq, k) >= minPairCount) { chosen = { k, e }; break; }
    }
    if (!chosen) break;

    const id = nextId++;
    rules.set(id, [
      chosen.e.a.rule !== undefined ? { rule: chosen.e.a.rule } : { t: chosen.e.a.t },
      chosen.e.b.rule !== undefined ? { rule: chosen.e.b.rule } : { t: chosen.e.b.t },
    ]);
    seq = replacePair(seq, chosen.k, id);
  }

  rules.set(0, seq);

  // Rule utility: Re-Pair can leave a rule referenced only once after a later
  // replacement absorbs its occurrences (e.g. "abcabc" → R1=ab, R2=R1·c leaves
  // R1 used once). Inline every such single-use rule into its lone call site.
  pruneSingleUseRules(rules);

  // Reference counts across all bodies.
  const ruleUses = computeUses(rules);

  return { start: 0, rules, ruleUses };
}

/** Tally how many times each rule id is referenced across all rule bodies. */
function computeUses(rules) {
  const uses = new Map();
  for (const [, body] of rules) {
    for (const sym of body) {
      if (sym.rule !== undefined) uses.set(sym.rule, (uses.get(sym.rule) || 0) + 1);
    }
  }
  return uses;
}

/** Inline (and remove) any non-start rule referenced fewer than twice. */
function pruneSingleUseRules(rules, start = 0) {
  for (;;) {
    const uses = computeUses(rules);
    let victim = null;
    for (const id of rules.keys()) {
      if (id === start) continue;
      if ((uses.get(id) || 0) < 2) { victim = id; break; }
    }
    if (victim === null) return;

    const victimBody = rules.get(victim);
    rules.delete(victim);
    // Splice the victim's body into wherever it is referenced (at most once).
    for (const [, body] of rules) {
      for (let i = 0; i < body.length; i++) {
        if (body[i].rule === victim) {
          body.splice(i, 1, ...victimBody.map((s) => ({ ...s })));
          break;
        }
      }
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Fully expand a rule (by id) into its terminal token sequence.
 * @returns {Array<string|number>}
 */
function expandRule(grammar, ruleId) {
  const out = [];
  const walk = (id) => {
    for (const sym of grammar.rules.get(id)) {
      if (sym.rule !== undefined) walk(sym.rule);
      else out.push(sym.t);
    }
  };
  walk(ruleId);
  return out;
}

/** Reconstruct the original token stream (expands the start rule). */
function reconstructTokens(grammar) {
  return expandRule(grammar, grammar.start);
}

// --- Stages 3-4: Bookend Merge grouping ----------------------------------

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Groups an array of strings by discovering shared templates with interpolation slots.
 *
 * @param {string[]} strings - Input strings to group
 * @param {Object}   [options]
 * @param {number}   [options.maxSlots=1]         - Maximum interpolation slots per template
 * @param {number}   [options.minLiteralChars=3]  - Minimum total literal characters for a valid template
 * @param {number}   [options.minGroupSize=2]     - Minimum members per group
 * @param {string}   [options.delimiter='.']      - Token delimiter
 * @param {boolean}  [options.refineSlots=true]   - Apply character-level slot boundary refinement
 * @param {'compress'|'specific'} [options.strategy='compress']
 *   - 'compress': maximize total compression gain (MDL-optimal, prefers broad groups)
 *   - 'specific': prefer most-specific templates first (finer-grained sub-groups)
 * @returns {{ groups: TemplateGroup[], ungrouped: string[] }}
 *
 * @typedef {Object} TemplateGroup
 * @property {string}   template  - Template string with ${N} markers
 * @property {Member[]} members   - Grouped strings with their slot bindings
 * @property {number}   score     - MDL compression gain
 *
 * @typedef {Object} Member
 * @property {string}   original  - The original input string
 * @property {string[]} slots     - Value bound to each slot
 */
function groupByTemplate(strings, options = {}) {
  const {
    maxSlots = 1,
    minLiteralChars = 3,
    minGroupSize = 2,
    delimiter = '.',
    refineSlots = true,
    strategy = 'compress',
  } = options;

  const entries = strings.map((s, i) => ({
    original: s,
    index: i,
    segs: s.split(delimiter),
  }));

  // Phase 1: Discover candidate templates via pairwise Bookend Merge
  const candidates = discoverTemplates(entries);

  // Phase 2: For each template, find ALL matching strings (not just the originating pair)
  for (const tmpl of candidates.values()) {
    tmpl.members = findAllMatches(entries, tmpl.prefix, tmpl.suffix, delimiter);
  }

  // Phase 3: Filter by quality thresholds and score
  const ranked = [...candidates.values()]
    .filter(t => t.members.length >= minGroupSize)
    .filter(t => litChars(t.prefix, t.suffix, delimiter) >= minLiteralChars)
    .map(t => ({
      ...t,
      score: (t.members.length - 1) * litChars(t.prefix, t.suffix, delimiter),
    }));

  if (strategy === 'specific') {
    // Most specific first: longest literal content wins, break ties by group size
    ranked.sort((a, b) => {
      const la = litChars(a.prefix, a.suffix, delimiter);
      const lb = litChars(b.prefix, b.suffix, delimiter);
      return lb - la || b.members.length - a.members.length;
    });
  } else {
    // Compress (default): highest MDL compression gain first
    ranked.sort((a, b) => b.score - a.score);
  }

  // Phase 4: Greedy assignment, most valuable template first
  const assigned = new Set();
  const groups = [];

  for (const tmpl of ranked) {
    const available = tmpl.members.filter(m => !assigned.has(m.index));
    if (available.length < minGroupSize) continue;

    for (const m of available) assigned.add(m.index);

    const group = {
      template: renderBookend(tmpl.prefix, tmpl.suffix, delimiter),
      members: available.map(m => ({
        original: m.original,
        slots: [m.slotSegs.join(delimiter)],
      })),
      score: (available.length - 1) * litChars(tmpl.prefix, tmpl.suffix, delimiter),
    };

    groups.push(group);
  }

  // Phase 5: Character-level slot boundary refinement
  if (refineSlots) {
    for (const group of groups) {
      refineCharBoundaries(group);
    }
  }

  // Phase 6: Multi-slot refinement via LCS internal anchors
  if (maxSlots > 1) {
    for (const group of groups) {
      refineMultiSlot(group, maxSlots, delimiter);
    }
  }

  const ungrouped = entries
    .filter(e => !assigned.has(e.index))
    .map(e => e.original);

  return { groups, ungrouped };
}

/**
 * Pretty-print a groupByTemplate result.
 * @param {{ groups: TemplateGroup[], ungrouped: string[] }} result
 * @returns {string}
 */
function summarize(result) {
  const lines = [];

  for (let i = 0; i < result.groups.length; i++) {
    const g = result.groups[i];
    lines.push(`Group ${i + 1}  (${g.members.length} members, score ${g.score})`);
    lines.push(`  Template: ${g.template}`);

    const slotCount = g.members[0].slots.length;
    for (let s = 0; s < slotCount; s++) {
      const vals = g.members.map(m => m.slots[s]);
      const label = slotCount === 1 ? 'Slot values' : `Slot ${s}`;
      // Show up to 6 values, abbreviate if more
      const shown = vals.length <= 6 ? vals : [...vals.slice(0, 5), `… +${vals.length - 5} more`];
      lines.push(`  ${label}: ${shown.map(v => v === '' ? '(empty)' : `"${v}"`).join(', ')}`);
    }
    lines.push('');
  }

  if (result.ungrouped.length > 0) {
    lines.push(`Ungrouped  (${result.ungrouped.length} strings)`);
    for (const s of result.ungrouped) {
      lines.push(`  ${s}`);
    }
  }

  return lines.join('\n');
}

/**
 * Reconstruct the original string from a template and slot values.
 * Handles empty slots by collapsing adjacent delimiters.
 *
 * @param {string}   template  - Template with ${N} markers
 * @param {string[]} slots     - Slot values
 * @param {string}   [delimiter='.']
 * @returns {string}
 */
function reconstruct(template, slots, delimiter = '.') {
  let result = template;
  // Process in reverse to handle multi-digit indices correctly.
  // Replacements use a function so that "$&", "$$" etc. in slot values are
  // inserted verbatim instead of being treated as replacement patterns.
  for (let i = slots.length - 1; i >= 0; i--) {
    const marker = '${' + i + '}';
    const val = slots[i];
    if (val === '') {
      // Remove marker and collapse one adjacent delimiter
      if (result.includes(delimiter + marker + delimiter)) {
        result = result.replace(delimiter + marker + delimiter, () => delimiter);
      } else if (result.includes(delimiter + marker)) {
        result = result.replace(delimiter + marker, '');
      } else if (result.includes(marker + delimiter)) {
        result = result.replace(marker + delimiter, '');
      } else {
        result = result.replace(marker, '');
      }
    } else {
      result = result.replace(marker, () => val);
    }
  }
  return result;
}

// ─── Bookend Merge ──────────────────────────────────────────────────────────

/**
 * For a pair of segment arrays, compute the shared prefix and suffix.
 * Returns { prefix: string[], suffix: string[] } or null if trivial.
 */
function computeBookend(segsA, segsB) {
  let prefixLen = 0;
  const maxPrefix = Math.min(segsA.length, segsB.length);
  while (prefixLen < maxPrefix && segsA[prefixLen] === segsB[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  const maxSuffix = Math.min(segsA.length - prefixLen, segsB.length - prefixLen);
  while (
    suffixLen < maxSuffix &&
    segsA[segsA.length - 1 - suffixLen] === segsB[segsB.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const prefix = segsA.slice(0, prefixLen);
  const suffix = suffixLen > 0 ? segsA.slice(segsA.length - suffixLen) : [];

  return { prefix, suffix };
}

/**
 * Check if a segment array matches a bookend template (prefix + slot + suffix).
 */
function matchesBookend(segs, prefix, suffix) {
  if (segs.length < prefix.length + suffix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (segs[i] !== prefix[i]) return false;
  }
  for (let i = 0; i < suffix.length; i++) {
    if (segs[segs.length - 1 - i] !== suffix[suffix.length - 1 - i]) return false;
  }
  return true;
}

/**
 * Extract the slot segments (the middle between prefix and suffix).
 */
function extractSlotSegs(segs, prefix, suffix) {
  return segs.slice(prefix.length, segs.length - suffix.length);
}

// ─── Template Discovery ─────────────────────────────────────────────────────

/**
 * Enumerate candidate templates by computing bookends for all pairs.
 * Deduplicates by (prefix, suffix) key.
 * Returns Map<string, { prefix: string[], suffix: string[] }>
 */
function discoverTemplates(entries) {
  const map = new Map();

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const bookend = computeBookend(entries[i].segs, entries[j].segs);
      if (bookend.prefix.length + bookend.suffix.length === 0) continue; // trivial

      const key = templateKey(bookend.prefix, bookend.suffix);
      if (!map.has(key)) {
        map.set(key, { prefix: bookend.prefix, suffix: bookend.suffix });
      }
    }
  }

  return map;
}

/**
 * Find all entries matching a bookend template. Returns array of match objects.
 */
function findAllMatches(entries, prefix, suffix, delimiter) {
  const matches = [];
  for (const e of entries) {
    if (matchesBookend(e.segs, prefix, suffix)) {
      matches.push({
        index: e.index,
        original: e.original,
        slotSegs: extractSlotSegs(e.segs, prefix, suffix),
      });
    }
  }
  return matches;
}

// ─── Scoring & Rendering ────────────────────────────────────────────────────

function templateKey(prefix, suffix) {
  return prefix.join('\x00') + '\x01' + suffix.join('\x00');
}

function litChars(prefix, suffix, delimiter) {
  const parts = [];
  if (prefix.length > 0) parts.push(prefix.join(delimiter));
  if (suffix.length > 0) parts.push(suffix.join(delimiter));
  return parts.join(delimiter).length;
}

function renderBookend(prefix, suffix, delimiter) {
  const parts = [];
  if (prefix.length > 0) parts.push(prefix.join(delimiter));
  parts.push('${0}');
  if (suffix.length > 0) parts.push(suffix.join(delimiter));
  return parts.join(delimiter);
}

// ─── Character-level Slot Refinement ────────────────────────────────────────

/**
 * Within a group, find common character-level prefix/suffix of all slot values
 * and absorb them into the template literals. Mutates group in place.
 *
 * Example: slot values ["h3#_r_14a_", "h3#_r_14k_", "h3#_r_d1_"]
 *   -> common prefix "h3#_r_", common suffix "_"
 *   -> template absorbs these, slot values become ["14a", "14k", "d1"]
 */
function refineCharBoundaries(group, minCharLen = 2) {
  const slotValues = group.members.map(m => m.slots[0]);

  // Skip if any slot is empty (nothing to refine)
  if (slotValues.some(v => v === '')) return;

  let cpre = longestCommonPrefix(slotValues);
  let csuf = longestCommonSuffix(slotValues);

  // Only absorb if the common prefix/suffix meets minimum length
  if (cpre.length < minCharLen) cpre = '';
  if (csuf.length < minCharLen) csuf = '';

  // Ensure prefix + suffix don't overlap within the shortest slot value
  const minLen = Math.min(...slotValues.map(v => v.length));
  if (cpre.length + csuf.length > minLen) {
    csuf = csuf.slice(0, Math.max(0, minLen - cpre.length));
    if (csuf.length < minCharLen) csuf = '';
  }

  if (cpre.length === 0 && csuf.length === 0) return;

  // Update template string (function replacer: cpre/csuf are data and may
  // contain "$" replacement patterns)
  group.template = group.template.replace('${0}', () => cpre + '${0}' + csuf);

  // Update slot values
  for (const m of group.members) {
    const v = m.slots[0];
    m.slots[0] = v.slice(cpre.length, csuf.length > 0 ? -csuf.length : undefined);
  }
}

function longestCommonPrefix(strings) {
  if (strings.length === 0) return '';
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    let j = 0;
    while (j < prefix.length && j < strings[i].length && prefix[j] === strings[i][j]) j++;
    prefix = prefix.slice(0, j);
    if (prefix.length === 0) return '';
  }
  return prefix;
}

function longestCommonSuffix(strings) {
  if (strings.length === 0) return '';
  const reversed = strings.map(s => [...s].reverse().join(''));
  const rp = longestCommonPrefix(reversed);
  return [...rp].reverse().join('');
}

// ─── Multi-slot Refinement via LCS ──────────────────────────────────────────

/**
 * Refine a single-slot group into a multi-slot template by finding
 * common internal anchors within the slot values. Mutates group in place.
 *
 * Uses Longest Common Subsequence of slot-value tokens to discover anchors.
 * Each anchor becomes a literal; gaps between anchors become additional slots.
 */
function refineMultiSlot(group, maxSlots, delimiter) {
  if (maxSlots <= 1) return;

  const slotValues = group.members.map(m => m.slots[0]);

  // Skip if any slot is empty
  if (slotValues.some(v => v === '')) return;

  const segArrays = slotValues.map(v => v.split(delimiter));

  // Find common subsequence across all members
  const anchors = multiLCS(segArrays);
  if (anchors.length === 0) return;

  // Align each member's slot value to the anchors, counting resulting slots
  const alignments = [];
  for (let i = 0; i < segArrays.length; i++) {
    const aligned = alignToAnchors(segArrays[i], anchors);
    if (!aligned) return; // alignment failed, abort refinement
    alignments.push(aligned);
  }

  // The alignment produces anchors.length + 1 gap regions (sub-slots).
  // If that exceeds maxSlots, prune the least valuable anchors.
  let effectiveAnchors = anchors;
  while (effectiveAnchors.length + 1 > maxSlots && effectiveAnchors.length > 0) {
    // Remove the shortest anchor (least literal content)
    let minIdx = 0;
    for (let i = 1; i < effectiveAnchors.length; i++) {
      if (effectiveAnchors[i].length < effectiveAnchors[minIdx].length) minIdx = i;
    }
    effectiveAnchors = [
      ...effectiveAnchors.slice(0, minIdx),
      ...effectiveAnchors.slice(minIdx + 1),
    ];
  }

  // Re-align with pruned anchors
  const finalAlignments = [];
  for (const segs of segArrays) {
    const aligned = alignToAnchors(segs, effectiveAnchors);
    if (!aligned) return;
    finalAlignments.push(aligned);
  }

  // Build the refined template string
  // Current template: "prefix.${0}.suffix"  or  "prefix.${0}"  etc.
  // We replace ${0} with: ${0}.anchor0.${1}.anchor1.${2}...
  const innerParts = [];
  for (let i = 0; i <= effectiveAnchors.length; i++) {
    innerParts.push('${' + i + '}');
    if (i < effectiveAnchors.length) {
      innerParts.push(effectiveAnchors[i]);
    }
  }
  const innerTemplate = innerParts.join(delimiter);
  // Function replacer: anchors are data and may contain "$" patterns.
  group.template = group.template.replace('${0}', () => innerTemplate);

  // Update member slot values
  for (let m = 0; m < group.members.length; m++) {
    group.members[m].slots = finalAlignments[m].gaps.map(g => g.join(delimiter));
  }
}

/**
 * Standard pairwise LCS on string arrays (token-level).
 */
function pairLCS(a, b) {
  const m = a.length, n = b.length;
  // DP table
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = new Uint16Array(n + 1); // fits segments up to 65535 long
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  // Backtrack
  const result = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

/**
 * Incremental LCS across multiple arrays.
 */
function multiLCS(arrays) {
  if (arrays.length === 0) return [];
  let common = arrays[0];
  for (let i = 1; i < arrays.length; i++) {
    common = pairLCS(common, arrays[i]);
    if (common.length === 0) return [];
  }
  return common;
}

/**
 * Align a segment array to a sequence of anchor tokens.
 * Returns { gaps: string[][] } where gaps[i] is the segments between anchor i-1 and anchor i.
 * gaps has anchors.length + 1 entries (before first anchor, between each pair, after last).
 */
function alignToAnchors(segs, anchors) {
  const gaps = [];
  let searchFrom = 0;

  for (const anchor of anchors) {
    const pos = segs.indexOf(anchor, searchFrom);
    if (pos === -1) return null; // anchor not found, alignment fails
    gaps.push(segs.slice(searchFrom, pos));
    searchFrom = pos + 1;
  }
  gaps.push(segs.slice(searchFrom)); // trailing gap

  return { gaps };
}

// --- Stage 3, alternative: positional alignment --------------------------

const SLOT = null; // sentinel marking a divergent (slot) position in a template

/**
 * @param {string[][]} records - each record is an array of tokens
 * @param {Object} [options]
 * @param {number} [options.threshold=0.5]   - min fraction of positions that must
 *                                              agree for a record to join a template
 * @param {number} [options.minGroupSize=2]  - templates with fewer members are ungrouped
 * @returns {{ groups: AlignGroup[], ungrouped: string[] }}
 *
 * @typedef {Object} AlignGroup
 * @property {string}   template  - template string with ${N} slot markers
 * @property {Member[]} members
 * @property {number}   score     - MDL-style gain: (members-1) * literalChars
 * @typedef {Object} Member
 * @property {string}   original
 * @property {string[]} slots
 */
function groupByAlignment(records, options = {}) {
  const { threshold = 0.5, minGroupSize = 2 } = options;

  // 1. Bucket by token count.
  const buckets = new Map();
  records.forEach((toks, idx) => {
    const k = toks.length;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push({ toks, idx });
  });

  // 2. Sequential agreement clustering within each bucket.
  const rawTemplates = [];
  for (const [len, recs] of buckets) {
    const temps = [];
    for (const rec of recs) {
      let best = null, bestSim = -1;
      for (const t of temps) {
        let match = 0;
        for (let i = 0; i < len; i++) {
          if (t.tokens[i] !== SLOT && t.tokens[i] === rec.toks[i]) match++;
        }
        const sim = len === 0 ? 1 : match / len;
        if (sim >= threshold && sim > bestSim) { best = t; bestSim = sim; }
      }
      if (best) {
        for (let i = 0; i < len; i++) {
          if (best.tokens[i] !== SLOT && best.tokens[i] !== rec.toks[i]) best.tokens[i] = SLOT;
        }
        best.members.push(rec);
      } else {
        temps.push({ tokens: rec.toks.slice(), members: [rec] });
      }
    }
    rawTemplates.push(...temps);
  }

  // 3. Build output groups: merge adjacent slot positions, extract slot values.
  const groups = [];
  const grouped = new Set();
  for (const t of rawTemplates) {
    if (t.members.length < minGroupSize) continue;
    const segs = segments(t.tokens);
    const litChars = segs.reduce((n, s) => n + (s.type === 'lit' ? s.tokens.join('').length : 0), 0);

    const members = t.members.map((m) => {
      const slots = [];
      for (const s of segs) if (s.type === 'slot') slots.push(m.toks.slice(s.from, s.to).join(''));
      grouped.add(m.idx);
      return { original: m.toks.join(''), slots };
    });

    groups.push({
      template: renderTemplate(segs),
      members,
      score: (members.length - 1) * litChars,
    });
  }
  groups.sort((a, b) => b.score - a.score);

  const ungrouped = records
    .map((toks, idx) => ({ toks, idx }))
    .filter((r) => !grouped.has(r.idx))
    .map((r) => r.toks.join(''));

  return { groups, ungrouped };
}

/** Reconstruct a record from an alignment template and its slot values. */
function reconstructAlign(template, slots) {
  let k = 0;
  return template.replace(/\$\{\d+\}/g, () => slots[k++]);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

// Partition a template's token array into contiguous literal / slot segments.
function segments(tokens) {
  const segs = [];
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i] === SLOT) {
      let j = i; while (j < tokens.length && tokens[j] === SLOT) j++;
      segs.push({ type: 'slot', from: i, to: j });
      i = j;
    } else {
      let j = i; while (j < tokens.length && tokens[j] !== SLOT) j++;
      segs.push({ type: 'lit', tokens: tokens.slice(i, j) });
      i = j;
    }
  }
  return segs;
}

function renderTemplate(segs) {
  let k = 0;
  let out = '';
  for (const s of segs) out += s.type === 'lit' ? s.tokens.join('') : '${' + (k++) + '}';
  return out;
}

// --- Stage 4: MDL selection ----------------------------------------------

/**
 * @typedef {Object} Template
 * @property {string|number} id
 * @property {number} dictBytes   - Cost to store this template in the dictionary
 *                                  (literal bytes + slot overhead).
 * @typedef {Object} Instance
 * @property {string|number} templateId
 * @property {number} start       - Inclusive start offset in the document.
 * @property {number} end         - Exclusive end offset. Covers [start, end).
 * @property {number} encBytes    - Cost to encode this instance (ref + slot values).
 */

// ─── Weighted interval scheduling ─────────────────────────────────────────────

/**
 * Select the maximum-weight subset of non-overlapping intervals.
 * Intervals are half-open [start, end); two are compatible when one's end is
 * ≤ the other's start. Non-positive-weight intervals are never selected.
 *
 * @param {Array<{start:number,end:number,weight:number}>} intervals
 * @returns {{ selected: object[], totalWeight: number }}
 */
function weightedIntervalSchedule(intervals) {
  const items = intervals.filter((x) => x.weight > 0).slice()
    .sort((a, b) => a.end - b.end);
  const n = items.length;
  if (n === 0) return { selected: [], totalWeight: 0 };

  // P[i] = index of the rightmost interval that ends ≤ items[i].start, else -1.
  const P = new Array(n);
  for (let i = 0; i < n; i++) {
    let lo = 0, hi = i - 1, res = -1;
    const s = items[i].start;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (items[mid].end <= s) { res = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    P[i] = res;
  }

  const dp = new Array(n).fill(0);
  const take = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const incl = items[i].weight + (P[i] >= 0 ? dp[P[i]] : 0);
    const excl = i > 0 ? dp[i - 1] : 0;
    if (incl >= excl) { dp[i] = incl; take[i] = true; }
    else { dp[i] = excl; take[i] = false; }
  }

  const selected = [];
  for (let i = n - 1; i >= 0; ) {
    if (take[i]) { selected.push(items[i]); i = P[i]; }
    else i--;
  }
  selected.reverse();
  return { selected, totalWeight: dp[n - 1] };
}

// ─── MDL cost accounting ──────────────────────────────────────────────────────

/**
 * Total description length for a given selection.
 *
 * @param {object[]} selectedInstances - chosen, non-overlapping instances
 * @param {Map<string|number, Template>} templateById
 * @param {number} docLength    - total characters in the document
 * @param {number} [residualRate=1] - cost per uncovered character
 * @returns {{ total:number, dictionaryCost:number, dataCost:number, residualCost:number, covered:number }}
 */
function mdlCost(selectedInstances, templateById, docLength, residualRate = 1) {
  const used = new Set();
  let dataCost = 0;
  let covered = 0;
  for (const inst of selectedInstances) {
    used.add(inst.templateId);
    dataCost += inst.encBytes;
    covered += inst.end - inst.start;
  }
  let dictionaryCost = 0;
  for (const id of used) dictionaryCost += templateById.get(id).dictBytes;
  const residualCost = (docLength - covered) * residualRate;
  return {
    total: dictionaryCost + dataCost + residualCost,
    dictionaryCost, dataCost, residualCost, covered,
  };
}

// ─── Selection driver ─────────────────────────────────────────────────────────

/**
 * Select templates + instances to minimize total description length.
 *
 * @param {Object} input
 * @param {Template[]} input.templates
 * @param {Instance[]} input.instances
 * @param {number} input.docLength
 * @param {number} [input.residualRate=1]
 * @returns {{
 *   templates: Template[],          // templates kept (used by ≥1 instance)
 *   instances: object[],            // chosen, non-overlapping instances
 *   cost: object,                   // mdlCost breakdown for the selection
 *   baselineCost: number,           // cost of encoding everything as residual
 *   saved: number,                  // baselineCost - cost.total
 * }}
 */
function selectTemplates(input) {
  const { templates, instances, docLength, residualRate = 1 } = input;
  const templateById = new Map(templates.map((t) => [t.id, t]));

  // Each instance's scheduling weight is the residual it removes minus its
  // encoding cost: (end - start) * residualRate - encBytes.
  const weightOf = (inst) => (inst.end - inst.start) * residualRate - inst.encBytes;
  const byTemplate = new Map();
  for (const inst of instances) {
    if (!byTemplate.has(inst.templateId)) byTemplate.set(inst.templateId, []);
    byTemplate.get(inst.templateId).push({ ...inst, weight: weightOf(inst) });
  }

  const baselineCost = docLength * residualRate;
  const chosen = new Set();

  const evaluate = (templateSet) => {
    const pool = [];
    for (const id of templateSet) pool.push(...(byTemplate.get(id) || []));
    const { selected } = weightedIntervalSchedule(pool);
    const cost = mdlCost(selected, templateById, docLength, residualRate);
    return { selected, cost };
  };

  let best = evaluate(chosen); // empty selection → all residual
  for (;;) {
    let bestAdd = null;
    for (const t of templates) {
      if (chosen.has(t.id)) continue;
      const trial = new Set(chosen).add(t.id);
      const res = evaluate(trial);
      if (res.cost.total < best.cost.total &&
          (!bestAdd || res.cost.total < bestAdd.res.cost.total)) {
        bestAdd = { id: t.id, res };
      }
    }
    if (!bestAdd) break;
    chosen.add(bestAdd.id);
    best = bestAdd.res;
  }

  // Report only templates that actually have a selected instance.
  const usedIds = new Set(best.selected.map((i) => i.templateId));
  return {
    templates: templates.filter((t) => usedIds.has(t.id)),
    instances: best.selected,
    cost: best.cost,
    baselineCost,
    saved: baselineCost - best.cost.total,
  };
}

// --- Driver: grammar → records → templates, end to end -------------------

// Internal token separator for feeding token arrays to groupByTemplate as
// strings. NUL never appears in normal text (and we strip it from input), so
// splitting a joined record by NUL recovers exactly the original tokens.
const NUL = '\u0000';

// ─── Bridge: grammar → records (token arrays) ─────────────────────────────────

/** Split a token array into records at newline-bearing tokens (newline kept). */
function recordsByLines(tokens) {
  const records = [];
  let cur = [];
  for (const tok of tokens) {
    cur.push(tok);
    if (tok.includes('\n')) { records.push(cur); cur = []; }
  }
  if (cur.length) records.push(cur);
  return records.filter((r) => r.length > 0);
}

/**
 * Grammar-driven records: find the most frequently referenced rule at the top
 * level of the start rule and treat each of its occurrences as the start of a
 * record. Returns null if no rule repeats at the top level (caller falls back).
 */
function recordsByAnchor(grammar) {
  const startBody = grammar.rules.get(grammar.start);
  const freq = new Map();
  for (const sym of startBody) {
    if (sym.rule !== undefined) freq.set(sym.rule, (freq.get(sym.rule) || 0) + 1);
  }
  let anchor = null, best = 1;
  for (const [id, c] of freq) if (c > best) { best = c; anchor = id; }
  if (anchor === null) return null;

  const records = [];
  let cur = null;
  for (const sym of startBody) {
    const isAnchor = sym.rule === anchor;
    if (isAnchor) {
      if (cur) records.push(cur);
      cur = [];
    } else if (cur === null) {
      cur = []; // leading material before the first anchor
    }
    // Expand this symbol to terminal tokens and append.
    const toks = sym.rule !== undefined ? expandRule(grammar, sym.rule) : [sym.t];
    cur.push(...toks);
  }
  if (cur && cur.length) records.push(cur);
  return records.filter((r) => r.length > 0);
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

/**
 * Run the full pipeline on a document:
 *
 *   Tokenize (Stage 1) → Grammar (Stage 2) → Bookend Merge or structural
 *   alignment + MDL (Stages 3-4) → reconstruction check (Stage 5)
 *
 * @param {string} text
 * @param {Object} [options]
 * @param {'punct'|'word'|'char'|'line'} [options.tokens='punct']
 * @param {'lines'|'anchor'} [options.records='lines']
 * @param {'bookend'|'align'} [options.group='bookend'] - Stage 3 strategy
 * @param {number} [options.maxSlots=1]
 * @param {'compress'|'specific'} [options.strategy='compress']
 * @param {number} [options.minGroupSize=2]
 * @param {number} [options.threshold=0.5] - positional-agreement threshold (align)
 * @returns {{ tokens, grammar, records, result, strategy, group, fidelity }}
 */
function induce(text, options = {}) {
  const {
    tokens: tokMode = 'punct',
    records: recordMode = 'lines',
    group = 'bookend',   // Stage 3 strategy: 'bookend' (literal anchors) or 'align' (positional)
    maxSlots = 1,
    strategy = 'compress',
    minGroupSize = 2,
    threshold = 0.5,
  } = options;

  const clean = text.split(NUL).join(''); // guarantee NUL is purely a separator
  const tokens = tokenize(clean, tokMode);
  const grammar = induceGrammar(tokens);

  let records, usedStrategy = recordMode;
  if (recordMode === 'anchor') {
    records = recordsByAnchor(grammar);
    if (!records || records.length < 2) { records = recordsByLines(tokens); usedStrategy = 'lines (anchor fallback)'; }
  } else {
    records = recordsByLines(tokens);
  }

  let result, fidelity;
  if (group === 'align') {
    // Stage 3 by positional agreement, on token arrays directly.
    result = groupByAlignment(records, { threshold, minGroupSize });
    let pass = 0, total = 0;
    for (const g of result.groups) {
      for (const m of g.members) {
        total++;
        if (reconstructAlign(g.template, m.slots) === m.original) pass++;
      }
    }
    fidelity = { pass, total };
  } else {
    // Stage 3 by Bookend Merge, on NUL-joined records (token granularity).
    const recordStrings = records.map((r) => r.join(NUL));
    result = groupByTemplate(recordStrings, { maxSlots, strategy, minGroupSize, delimiter: NUL });
    let pass = 0, total = 0;
    for (const g of result.groups) {
      for (const m of g.members) {
        total++;
        if (reconstruct(g.template, m.slots, NUL) === m.original) pass++;
      }
    }
    fidelity = { pass, total };
  }

  return {
    tokens, grammar, records, result,
    strategy: usedStrategy, group, fidelity,
  };
}

// ─── Public surface ──────────────────────────────────────────────────────────

window.wring = {
  // Stage 1: segmenters
  tokenize,
  extractSignatures,
  extractSignaturesFromNodes,
  countSignatures,
  // Stage 2: grammar induction (Re-Pair)
  induceGrammar,
  expandRule,
  reconstructTokens,
  // Stages 3-4: grouping + reconstruction
  groupByTemplate,
  summarize,
  reconstruct,
  groupByAlignment,
  reconstructAlign,
  // Stage 4: full MDL selection
  weightedIntervalSchedule,
  mdlCost,
  selectTemplates,
  // Bridge + end-to-end pipeline
  NUL,
  recordsByLines,
  recordsByAnchor,
  induce,
};
})();
