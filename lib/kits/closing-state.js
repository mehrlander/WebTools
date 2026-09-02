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
//   MARK, GLYPH      glyph <-> key, both directions
//   GLOSS[key]       what the state claims, in the convention's own words
//   RAIL[key]        the CSS colour for a rail, or '' where the glyph has none
//   ROUTINE          the two states that are the ordinary rhythm; see below
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

  // ── The rail colours ──────────────────────────────────────────────────────
  // SEVEN OF THESE ARE NOT A CHOICE. The marker is a coloured disc and the rail
  // is that disc drawn as a line, so the legend is the chat the reader has
  // already read rather than anything to learn here. That is the same argument
  // estate.js makes for drawing the glyph, and the reason it draws a glyph
  // instead of a colour there does not apply: that row already spends its
  // colour twice, on the outcome rail and the failures fill.
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
  const RAIL = {
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

  // ── Routine, which is a threshold and therefore a decision ────────────────
  // Measured 2026-09-02 over the last 60 records and 1,165 exchanges: 73% carry
  // a state at all, and 🟢 alone is 57% of those, 🟢 and ⚪ together 74%. So a
  // rail that fires on every state marks three rows in four and is mostly one
  // green, which is a background rather than a signal. The other nine states
  // come to about 21% of exchanges, which is the density a scan wants.
  //
  // NAMED HERE AND NOT DECIDED HERE. A consumer passes its own set or none at
  // all, because the whole question is what a 2px hairline at 73% actually
  // reads like, and that is settled by looking rather than by this number. The
  // set is the default a caller opts into, not a filter this kit imposes.
  const ROUTINE = ['ready', 'clean'];

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

  window.ClosingState = { RE, MARK, GLYPH, GLOSS, RAIL, ROUTINE, marks };
})();
