// closing-state.js — the conventions' CLOSING STATE, as one vocabulary.
//
// SURFACING.md closes a reply with exactly one state: a marker glyph at the
// start of a line, a bold lead, and the sentences that say what it means here.
// It is the session's own claim about where it arrived, and it is the one thing
// a reader can scan for without opening anything.
//
// This kit exists because that vocabulary was in two places and about to be in
// three. repo-sessions-cache.js owned the pattern and the glyph-to-key table,
// because it was the first to need them; alpineComponents/estate.js owned the
// glyph-to-gloss table, because it was the first to draw one. Each is correct
// about its own half and neither can see the other, so a marker added to the
// conventions would have to be added twice and would be found once. The cache
// kit's own note already argued for this ("One parser, one answer"), so this is
// that argument taken the rest of the way rather than a new opinion.
//
//   marks(md)        the keys a passage closes on, in order, dupes and all
//   closings(md)     the same, each carrying its own text: {key, glyph, text}
//   MARK, GLYPH      glyph <-> key, both directions
//   GLOSS[key]       what the state claims, in the convention's own words
//   HUE[key]         the CSS colour a mark for this state is drawn in
//
// ── The pattern, and why it is this strict ─────────────────────────────────
// Line start and a bold lead, which is what keeps a session that EDITED the
// conventions from reading its own quotation as its state: the vocabulary is
// published as a bulleted list, and a list marker fails this pattern. The
// variation-selector pairs (⚪/⚪️, ✴️/✴, ❇️/❇) are two spellings of one state
// that only a table can settle, which is why the keys exist at all.
(() => {
  const RE = /^[ \t>]*(🟢|❇️?|🟡|🆚|✴️?|🟠|⚪️?|🟣|🔴|🔵|⚫)[ \t]*\*\*/gm;

  const MARK = {
    '🟢': 'ready', '❇️': 'assess', '❇': 'assess', '🟡': 'pending',
    '🆚': 'choice', '✴️': 'needs', '✴': 'needs', '🟠': 'attention',
    '⚪️': 'clean', '⚪': 'clean', '🟣': 'merged', '🔴': 'closed',
    '🔵': 'short', '⚫': 'retired',
  };

  const GLYPH = {
    ready: '🟢', assess: '❇️', pending: '🟡', choice: '🆚', needs: '✴️',
    attention: '🟠', clean: '⚪', merged: '🟣', closed: '🔴', short: '🔵',
    retired: '⚫',
  };

  const GLOSS = {
    ready:     'Ready to continue: work was named and available on "go"',
    assess:    'Ready to assess: a question was named, ready to investigate',
    pending:   'Pending: something was waiting on another action or an answer',
    choice:    'Choice needed: the assessment was given and the decision left open',
    needs:     'Needs you: something only you can supply blocked the next step',
    attention: 'Attention: a concrete problem to address before going further',
    clean:     'Clean exit: the work here was done',
    merged:    'Merged: the branch this session was working merged',
    closed:    'Closed: the branch this session was working closed unmerged',
    short:     'Short answer: answered, with no work proposed',
    retired:   'A marker retired from the vocabulary; the reply predates it',
  };

  // ── The hues ──────────────────────────────────────────────────────────────
  // SEVEN OF THESE ARE NOT A CHOICE. The marker IS a coloured disc, so a mark
  // drawn in its hue has for a legend the chat the reader has already read,
  // rather than anything to learn here. That is the same argument estate.js
  // makes for drawing the glyph, and the reason it draws a glyph instead of a
  // colour there does not apply: that row already spends its colour twice, on
  // the outcome rail and the failures fill.
  //
  // FOUR ARE, and they are the states whose glyph is not a disc: 🆚, ✴️, ❇️ and
  // ⚫. Two of those four (choice, needs) are the states that most want finding,
  // so leaving them uncoloured would drop the signal at exactly the moment it
  // matters. They take hues no disc uses, which is the whole constraint: fuchsia
  // is not the purple of 🟣, teal is not the green of 🟢.
  //
  // Literal values, not theme tokens, for the same reason kits/claude-mark.js
  // keeps clay literal: these are the emoji's own colours and they must not
  // move when the theme does. Only `clean` reads the theme, because ⚪ is white
  // on white and what it has to be is one step off the page.
  const HUE = {
    ready:     '#3fb950',
    pending:   '#e3b341',
    attention: '#f0883e',
    merged:    '#a371f7',
    closed:    '#f85149',
    short:     '#4493f8',
    clean:     'var(--color-base-300, #d9dee3)',
    choice:    '#d2599f',
    needs:     '#2bb1a8',
    assess:    '#7ec46e',
    retired:   'var(--color-base-content, #1c1e21)',
  };

  // The keys a passage closes on, in the order they appear, duplicates kept: an
  // exchange that closed twice on the same state did close twice, and a caller
  // that wants the distinct set can take one.
  function marks(md) {
    const out = [];
    for (const m of String(md || '').matchAll(RE)) {
      const key = MARK[m[1]];
      if (key) out.push(key);
    }
    return out;
  }

  // The same passages, carried whole: the bold lead and the sentences after it,
  // to the end of the markdown paragraph. `marks` says WHERE a reply arrived
  // and this says what it arrived AT, which is the half worth printing on a
  // row: every 🟢 lead reads "Ready to continue", and what differs is the work
  // named after it.
  //
  // The glyph is dropped and the `**` kept, because the consumer reduces this
  // through readAloud.speechText, which is the estate's one markdown-to-prose
  // pass and takes emphasis off along with the link targets and the fences.
  function closings(md) {
    const src = String(md || '');
    const out = [];
    for (const m of src.matchAll(RE)) {
      const key = MARK[m[1]];
      if (!key) continue;
      const rest = src.slice(m.index + m[0].length - 2);
      const end = rest.search(/\n[ \t]*\n/);
      out.push({ key, glyph: GLYPH[key], text: (end === -1 ? rest : rest.slice(0, end)).trim() });
    }
    return out;
  }

  window.ClosingState = { RE, MARK, GLYPH, GLOSS, HUE, marks, closings };
})();
