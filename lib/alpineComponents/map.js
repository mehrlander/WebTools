document.addEventListener('alpine:init', function() {
  Alpine.data('map', function() {
    // The Map view: the estate's coordination layer made inspectable. It is the
    // operational face of the constellation doctrine (home's
    // created/2026-06-27-constellation-architecture.md, kernel at the hub's
    // docs/CONSTELLATION.md), in two parts across two tabs.
    //   Portable    the to-go bag from the hub's committed manifest
    //               (docs/portable.csv, prose parent docs/PORTABLE.md): plugin
    //               skills, docs, scripts, each opening in the shell's own
    //               viewer. The doctrine kernel rides here as a doc, so the
    //               theory of what-goes-where sits beside the conventions it
    //               governs. Labelled "The set" until 2026-08-07; renamed to
    //               the word the estate already uses (PORTABLE.md, the
    //               portable plugin). The URL key stays `set`, so old
    //               ?tab=set links keep resolving.
    //   Surfacing   the primitives that make session work visible in chat,
    //               indexed from docs/surfacing.csv. Ownership runs the other
    //               way from every other tab: SURFACING.md is authoritative
    //               (sessions load and follow the prose) and the manifest is
    //               its gated index (membership two-way,
    //               surfacing-manifest.test.mjs). Surfacing decides what to
    //               hand over; Showing is what makes it openable.
    //   Showing     how content moves, renders, and gets looked at, read from
    //               four hub carriers: the Showing table (which link
    //               reaches which kind of change), the shared
    //               owner/repo[@ref]:path address grammar, the delivery modes
    //               toss-render accepts (inline payload versus fetched
    //               reference, and the trust posture each one buys), and the
    //               toss routes mapping a content type to its renderer page.
    //               Named Transport until 2026-08-04; renamed because
    //               SURFACING.md already uses "transport" for the stage link,
    //               and the lead section here was titled Showing all along.
    //   Owners      who owns a statement that lives in several places, read
    //               from docs/owners.csv + docs/repetitions.csv. Its own file since 2026-08-09;
    //               ?tab=claims still resolves here.
    //   Growth      a corpus as a moving picture: pages/doc-growth.html framed,
    //               every markdown file a bubble over the repo's history. Docs
    //               answers "is this document growing", one row at a time; this
    //               answers "what is the whole corpus doing". FEDERATED: the
    //               repo is a control, fed by each repo's own `growth` key, and
    //               the chart is one instrument pointed at whichever corpus is
    //               selected. It was two top-level app views until 2026-08-28,
    //               one per repo, which rendered as the word "Doc Growth" twice
    //               in the nav with nothing to tell them apart.
    //   Docs        the documentation registry, read from the hub's
    //               docs/docs.csv: every doc's subject, status (living claims
    //               current truth, record preserves a moment, measured carries
    //               dated observations and is corrected by re-probing), reach,
    //               and maintenance, plus the shared-claims table (each
    //               ALSO the only tab reading a second carrier: the doc-growth
    //               payload turns its `words` snapshot into a trend, per row and
    //               per folder. Optional by construction, since that payload is
    //               refreshed on demand rather than by a hook; without it the
    //               tab renders exactly as it did before.
    //               repeated statement's one authoritative carrier, its
    //               repetitions, and the check that holds each or the honest
    //               absence of one). Laid out as a folder rail beside the
    //               selected folder's files (2026-08-07); the flat
    //               directory-grid it replaced rendered docs/envelopes/schemas
    //               as a peer of docs and hid the hierarchy. A row's title
    //               opens the document in the house swipe deck, paging the
    //               selected folder's files, rather than navigating to the
    //               files view; its GitHub icon, inline with the badges,
    //               carries the source peek for the desktop glance, and the
    //               rendition helpers are SourcePeek's own exports so deck
    //               and peek cannot drift. A details toggle on the reach
    //               strip shows every row's maintenance at once. Reach is the one field here that is
    //               DERIVED rather than authored: tools/build/docs-reach.mjs
    //               reads the skills and the app to see what names each doc,
    //               and docs-registry.test.mjs holds the registry's copy to it.
    //               It is the tab's headline because it is the number that
    //               moves when the estate improves, and it has already moved
    //               twice from being looked at: stripping comments from the app
    //               corpus (a mention is not a channel) and then adding the
    //               CLAUDE.md channel, which showed twelve docs the repo's own
    //               instructions name and the first cut had called orphans.
    //               Beside reach, each row carries its READERSHIP: the distinct
    //               sessions that opened the file, folded in the private
    //               registry's sessions cache (docAttention) and read here with
    //               the viewer's token, absent without one. Reach says who can
    //               get to a doc and this says who did, which is the pair worth
    //               reading together: an orphan nobody opens and an orphan
    //               opened in nine sessions are different problems. The column
    //               carries its caveats in the strip above it, because they are
    //               load-bearing rather than decorative: the two injected docs
    //               are the most-read files in the estate and are precisely the
    //               two no file tool can count. From 2026-08-27 the column
    //               shows TWO numbers, presence and access, from two rollups
    //               that are never summed: `startupAttention` (what was in
    //               context before the conversation began, from the record's
    //               startup_context) beside `docAttention` (what a file tool
    //               opened). The word "injected" survives only as the fallback
    //               for a cache older than that field, which is the whole
    //               difference: the exception used to be the mechanism.
    // Scope and adoption were a third tab here until 2026-08-03. They are facts
    // about a REPO, and the estate's Repos cards are where a repo is described,
    // so a second grid of the same repos with different columns was a copy of
    // the roster. They moved onto the card (alpineComponents/estate.js), which
    // also ended the drift this view suffered from keeping its own roster: a
    // repo joined the estate and never reached the Map's list.
    //
    // WHAT IS LEFT HERE IS WHAT NO SINGLE REPO OWNS, which is not the same as
    // what mentions no single repo. The line used to read that second way, and
    // Skills crossed it on 2026-08-20 and Growth on 2026-08-28: both render
    // per-repo rows, and both are collections no repo owns, assembled from
    // declarations each repo makes in its own manifest. A FEDERATED TAB is the
    // shape that keeps the charter true: the hub aggregates what repos
    // declare, never going and reading their trees, and the repo is a control
    // on the tab rather than a duplicate of the tab. A fact about ONE repo
    // still belongs on that repo's card, which is what moved in August.
    // The hub's own halves are public (the hub repo is public); the federated
    // ones read the private registry's crawl and are token-gated.
    const KIND = {
      skill:  { icon: 'ph-lightning',  label: 'In the plugin' },
      doc:    { icon: 'ph-book-open',  label: 'Docs' },
      dir:    { icon: 'ph-folder',     label: 'Docs' },
      script: { icon: 'ph-file-code',  label: 'Scripts' },
    };
    const USE_LABEL = {
      plugin: 'in the plugin', live: 'fetched live', adopt: 'fetch to adopt',
      'on-demand': 'fetch on demand', reference: 'reference',
    };
    // Delivery-mode rows lead with their trust posture: a sandboxed payload cannot
    // reach this origin's token, an address-mode fetch is same-origin and can,
    // which is why one is allowlisted and the other is not.
    const MODE_ICON = {
      untrusted: 'ph-shield-check',
      trusted:   'ph-key',
      'n/a':     'ph-arrow-bend-down-right',
    };
    // Which ref this view's MANIFESTS are read at. ?use= pins the code a page
    // loads; these two files are the code's committed data, and they version
    // with it, so a preview has to read them at the same ref. Pinned to 'main'
    // they lie in both directions: a branch that edits a manifest shows main's
    // copy, and a branch that ADDS one 404s (which is how this was found, on
    // docs/routes.json, from a ?use= link handed over before it was opened).
    // No ?use= is the deployed case and stays on main.
    const useRef = () => {
      try { return new URLSearchParams(location.search).get('use') || 'main'; }
      catch { return 'main'; }
    };
    // The doctrine's portable kernel, opened in the shell viewer from the set
    // header. The full home-specific doctrine is linked from that doc.
    const DOCTRINE_PATH = 'docs/CONSTELLATION.md';
    // The two manifests this view is a projection of. Named rather than inlined
    // because each is now said three times in a header (the link, its peek, its
    // tooltip), and a header that disagrees with itself about which file it
    // opens is the exact confusion this pass is fixing.
    // The Aims tab. The mission the estate's material serves and the goals it
    // is held to. Not a registry: the suite holds a carrier to being a CSV, and
    // five goals classify nothing, so this reads like routes.json rather than
    // like the eight manifests the other tabs render.
    const AIMS_MANIFEST = 'docs/aims.json';

    const SET_MANIFEST = 'docs/portable.csv';
    // Six carriers, assembled into the one object the Showing tab renders.
    // The three tables are their own CSV registries; routes.json keeps only
    // what is not a table (the grammar, the precedence, the showing frame), so
    // the header's curate link still has one file to open.
    const ROUTES_MANIFEST = 'docs/routes.json';
    const ROUTES_MODES = 'docs/routes-modes.csv';
    const ROUTES_ROUTES = 'docs/routes-routes.csv';
    const SHOWING_MECHANISMS = 'docs/showing-mechanisms.csv';
    // What the subject IS, which is the axis above read one level down. Added
    // 2026-08-31, when three pieces of code were found each answering it
    // privately and disagreeing.
    const ROUTES_KINDS = 'docs/routes-kinds.csv';
    const ROUTES_PASTE = 'docs/routes-paste.csv';
    const DOCS_MANIFEST = 'docs/docs.csv';
    // The Docs tab reads `words` as a snapshot. This is the same measure over
    // time, so a row can say whether a document is growing rather than only how
    // big it is now. Generated by scripts/doc-growth.py and rendered whole by
    // pages/doc-growth.html; here it is a second column on a table that already
    // exists. Optional by construction: it is refreshed on demand, not by a
    // hook, so the tab must render without it.
    const GROWTH_PAYLOAD = 'data/doc-growth/web-tools.json';
    // The Owners tab. Its own carrier since 2026-08-09: the table used to be a
    // second `claims` block inside docs/docs.csv, which the registry model
    // forbids (a registry does not live inside another registry's carrier), and
    // "claim" was spending a word the estate already uses three other ways. The
    // ?tab=claims URL key is unchanged, the way ?tab=set outlived "The set".
    // Two files since 2026-08-16: a repetition is a different target from the
    // statement it repeats, so it is its own registry. The tab rejoins them.
    const OWNERS_MANIFEST = 'docs/owners.csv';
    const OWNERS_REPS = 'docs/repetitions.csv';
    const THEMES_GRAPH = 'docs/themes.json';
    // The Showing tab's prose frame: the argument behind the manifest, linked
    // from the tab header the way the set header links the doctrine.
    const SHOWING_FRAME = 'docs/showing.md';
    // Surfacing inverts the ownership: SURFACING.md is authoritative (it is
    // what sessions load and follow) and the manifest is its gated index, so
    // the header leads with the doc and the Curate link edits the index.
    const SURF_MANIFEST = 'docs/surfacing.csv';
    // The Injection tab. A DATED READING, not a registry, which is why it has
    // no row in docs/registries.csv and gets no chip: two of its figures are
    // environment-dependent (the sibling session-*.sh scripts print different
    // amounts on different days; project_instructions depends on which repos
    // the session opened with), so no commit hook can restamp it and no test
    // can hold it. Same standing as docs/routes.json on the Showing tab: real
    // structure, but not one row per thing. Regenerate with
    // `node tools/build/injection-measure.mjs --write`.
    const INJECTION = 'docs/injection.json';
    const SURF_DOC = 'docs/SURFACING.md';
    // THE REST OF THE DOC, and when each part arrives. The cards below index
    // one of its regions, the primitives, which is also the injector's floor
    // (inject-conventions.sh drops the course first and the opening second).
    // The other regions are read off the doc's own h2 headings at load, so a
    // heading that moves or goes takes its door with it; this map only says
    // WHEN a region reaches a session, keyed by the heading and gated against
    // the doc (tools/test/map-view.test.mjs), so a renamed heading fails a
    // test rather than orphaning a gloss.
    const SURF_REGION_GLOSS = {
      'The surfacing course': 'arrives when a pull request is created',
    };
    const surfRegions = (md) =>
      [...String(md || '').matchAll(/^## (.+?)\s*$/gm)].map(m => m[1])
        .filter(h => h !== 'Surfacing primitives')
        .map(heading => ({ heading, gloss: SURF_REGION_GLOSS[heading] || '' }));
    // The Docs tab's reach dimension, derived in the registry by
    // tools/build/docs-reach.mjs and gated against it. Ordered strongest first,
    // which is also worst-last: the orphan count is the number this tab exists
    // to make impossible to ignore, so it carries the only warning tone.
    const REACH = {
      injected: { label: 'injected', tone: 'badge-success', hint:
        'In every session\'s context without being asked for: the session-start hook fetches these and CLAUDE.md imports them.' },
      project: { label: 'in context', tone: 'badge-secondary', hint:
        'Named by a document already in every session\'s context: the repo\'s own CLAUDE.md, or one of the injected two. One hop away, no invocation.' },
      skill: { label: 'by a skill', tone: 'badge-info', hint:
        'Named by a skill, so invoking that skill pulls the doc into context.' },
      app: { label: 'by the app', tone: 'badge-primary', hint:
        'Named in lib/ or pages/ code, so a page loads it at runtime or opens it in the viewer. A mention in a comment does not count.' },
      orphan: { label: 'orphan', tone: 'badge-warning', hint:
        'Nothing points here. Not dead: the generated docs index lists it, and that index is the only thing reaching it.' },
    };
    const REACH_ORDER = ['injected', 'project', 'skill', 'app', 'orphan'];
    const REACH_BUILDER = 'tools/build/docs-reach.mjs';
    // The Tests tab. Same shape as Docs one axis over: the registry says what
    // each check is and what it protects, and the counts are derived.
    const TESTS_MANIFEST = 'docs/tests.csv';
    const TESTS_BUILDER = 'tools/build/tests-index.mjs';
    // Ordered by how much a passing assertion is worth, strongest first. A
    // gate failing means a committed claim is false; a boot
    // smoke check passing means the component still mounts. Both are worth
    // having and they are not the same evidence, which is the whole reason
    // this tab cuts the total by kind instead of reporting it.
    const KIND_ORDER = ['gate', 'behavior'];
    // The Harness tab. (Not "Tools": that word is the curated gallery of
    // utility PAGES, show-repo's Tools view and docs/tools.csv, and the tab
    // must not collide with it.) The registry the lib-kits migration argued for:
    // docs/code-layers.md names tools/ and scripts/ as layers but could not
    // account for the files below them; docs/harness.csv is the accounting
    // (docs/tools.csv was taken: the curated Tools gallery manifest).
    // `role` and the layer glossary are authored, everything else is stamped
    // by the builder, and tools/test/ is absent on purpose (docs/tests.csv
    // owns that folder; one file must not answer to two registries).
    const TOOLS_MANIFEST = 'docs/harness.csv';
    // The Registries tab. The other seven each render ONE manifest; this one
    // renders the table that says what a manifest is, so it is the index the
    // rack hangs off rather than an eighth peer. Added 2026-08-10, once the
    // reconciliation had made it worth reading: each registry with a target
    // grain, a scope, a gate, and two enforcement layers behind it. (No count
    // here on purpose: two prose copies of the count sat one behind the table
    // within a week of being written, so the total is this tab's to derive.)
    // Each row also shows WHERE THE REGISTRY RENDERS: `renders_in`, the app
    // files that name its path, derived by registries-reach.mjs. A registry
    // with none wears the warning badge, because the registry audits keep
    // finding the same law (an authored claim nothing reads goes wrong), and a
    // registry no surface renders is that exposure one level up. Same
    // instrument as the Docs tab's reach column, which improved the estate
    // twice just by being looked at.
    // The registry pair. One file per registry since 2026-08-16: CSV cannot hold
    // two tables, which is what makes "a registry is a file" true by construction
    // and what retired the carrier/rows/format trio for a single `path`.
    const PROPS_MANIFEST = 'docs/registries.csv';
    const PROPS_DECLS = 'docs/properties.csv';
    // The third file of the pair's own family: what each value of a closed
    // domain means, which the domain column can only list. Read here so the tab
    // can define its own columns from data rather than from a paragraph above
    // them. That is the whole reason the legend exists: registries.md carried a
    // vocabulary table whose rows glossed columns already glossed here, and a
    // second copy of a definition is a definition that will disagree with
    // itself.
    const PROPS_VOCAB = 'docs/vocabularies.csv';
    // The prose-field vocabulary. Joined onto a property so a column name says
    // which KIND of prose it holds, collapsing 127 column names to 13 kinds.
    // NOT a lint: text-vocabulary-conformance.test.mjs gates only the unclaimed
    // class and passes an alias deliberately, because the vocabulary stating
    // what an old name means is what lets a carrier conform without a rename
    // across the estate. Eighteen names here are aliases, and every one of them
    // is conforming; rendering them as warnings would invent 18 defects.
    const TEXT_FIELDS = 'docs/text-fields.csv';
    // The on-demand skill library, and NOT the plugin's skills: the two sets
    // are disjoint. .claude/skills/ holds the 16 that travel in the portable
    // plugin and show on the Portable tab; skills/ holds a separate library
    // fetched by /load-skill, which had no surface anywhere. skills/README.md
    // says the split is deliberate (anything under .claude/skills/ registers
    // as auto-fire in every session, which the library model exists to avoid),
    // so covering one and calling the other covered was the mistake this tab
    // corrects.
    const SKILLS_MANIFEST = 'skills/manifest.csv';
    const PROPS_DOC = 'docs/registries.md';
    // The span column's own document: what the hub knows about the rest of the
    // estate, the three shapes a governed area takes, and the measurement. It
    // hangs here rather than in CLAUDE.md because the tab is where a reader
    // meets the column, and because CLAUDE.md is at its word ceiling and the
    // fix for that is extraction rather than shaving.
    const SPAN_DOC = 'docs/estate-span.md';
    const TOOLS_BUILDER = 'tools/build/tools-index.mjs';
    // How a harness file gets run. The axis decides whether "nothing names
    // it" matters: a driver is passed by path to npm run shot --script, so no
    // other route will ever name one, while "none found" is a file with no
    // visible way to run at all, which is the warning state.
    const INVOKE_TONE = {
      npm: 'badge-success', driver: 'badge-info', imported: 'badge-secondary',
      argv: 'badge-primary', 'none found': 'badge-warning',
    };
    const KIND_TONE = { gate: 'badge-success', behavior: 'badge-secondary' };
    // How a check reaches its subject, which decides how much its pass proves.
    const METHOD_HINT = {
      kit: 'the kit runs in the Node realm',
      alpine: 'booted in jsdom and driven',
      spawn: 'run as a process, output asserted',
      read: 'the file is read and asserted on',
      pure: 'the function is called directly',
    };
    const METHOD_ORDER = ['kit', 'alpine', 'spawn', 'read', 'pure'];
    // The three closed vocabularies a row belongs to, each a separate question,
    // each filtering on its own axis and composing with the others. They are
    // labeled in the strip because they were not, and a reader had no way to
    // tell whether two pills competed or combined.
    //
    // Only `kind` carries tone, and the asymmetry is deliberate rather than
    // left over: the kind badge repeats on every row, so a color lets a chip be
    // matched to the rows it selects. Method is the section heading and runner
    // is the row icon; coloring either would invent a mapping the rows do not
    // show.
    //
    // What is NOT here is boot smoke. It was a chip until 2026-08-10 and did
    // not belong: a kind, a method, and a runner are each exactly one value per
    // file, while a boot check is a property of an individual assertion. The
    // chip had to pick a level to count and could not say which it picked, and
    // both readings happened to be 19. It is marked in the assertion list now,
    // on the one line it is true of.
    const RUNNER_HINT = {
      suite: 'globbed by node --test, so CI runs it on every pull request',
      browser: 'driven by a real browser, so it is named without .test. and node --test never globs it. It asserts in its own harness, which is why it reports no assertion count and why the suite\'s pass total does not speak for it',
    };
    // Each dimension asks its question; each VALUE explains itself. The
    // per-value gloss is the one the reader wants (what is a `gate`?), and the
    // kind vocabulary's copy is the registry's own, read live rather than
    // restated here.
    //
    // Tone in the strip is a small marker, kind only, and both halves of that
    // are deliberate. It was a tinted badge around the file count until
    // 2026-08-10, which made one dimension's chips a different SHAPE from the
    // other two and read as arbitrary. A dot separates the colour from the
    // number: the colour keys the row badges below, the number is just a count.
    // And it stays kind-only because tinting method and runner was tried and is
    // worse: those colours decode to nothing, since no row anywhere wears them.
    const DIMENSIONS = [
      // `dot` opts this dimension into the tone marker, and only this one can
      // have it: colour decodes to a kind because the per-row badge is tinted by
      // kind and nothing else. It stays a dimension-level opt-in rather than a
      // lookup per value, which is the shape that survives a domain gaining a
      // value another dimension already spends. The collision that forced it is
      // gone, since `kit` was a kind and a method at once until the kinds closed
      // on two, and a per-value KIND_TONE hit would have tinted the method chip
      // with a meaning it did not have.
      { key: 'kind', label: 'kind', question: 'what does this check claim', dot: true,
        values: KIND_ORDER, of: t => t.kind, hint: (v, reg) => reg?.kinds?.[v] || '' },
      { key: 'method', label: 'method', question: 'how does it reach its subject',
        values: METHOD_ORDER, of: t => t.method, hint: v => METHOD_HINT[v] || '' },
      { key: 'runner', label: 'runner', question: 'what runs the file',
        values: ['suite', 'browser'], of: t => (t.runner === 'suite' ? 'suite' : 'browser'),
        hint: v => RUNNER_HINT[v] || '' },
    ];
    // Files and words are both shown because on this folder they disagree, and
    // the disagreement is the finding. Orphans are 40% of the files and 17% of
    // the words; one reachable document is 22% on its own. A strip carrying
    // only counts sends every reader to the tail.
    const kw = n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);

    // ── The doc deck's rendition ─────────────────────────────────────────
    // Full-length sibling of the peek's excerpt: same kind decision, same
    // frontmatter fencing, same JSON pretty-print, through SourcePeek's
    // exported pure helpers so the two can never disagree about what a file
    // looks like, with plain fallbacks for a page that never loaded the peek.
    const docCache = new Map();  // ref:path -> raw text
    // Escaping is window.esc from vanilla-bundle.js, first in the boot chain.
    const esc = s => window.esc(s);
    let sheetMarkedP = null;
    const sheetMarked = () => sheetMarkedP ||= window.marked ? Promise.resolve() :
      new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js';
        s.onload = res; s.onerror = () => rej(new Error('marked failed to load'));
        document.head.appendChild(s);
      });
    // kits/md-doc.js, lazily and once, beside marked: it is what puts a wide
    // table in its own scroller and a copy control on every heading, and a
    // deck that never opens a markdown file should not pay for it.
    let mdDocP = null;
    const sheetMdDoc = () => mdDocP ||= window.mdDoc ? Promise.resolve()
      : (window.gh?.load
          ? window.gh.load('kits/src-doc.js')
              .then(() => window.gh.load('kits/md-doc.js')).catch(() => {})
          : Promise.resolve());

    // A registry as a markdown table. The estate's CSVs are one record per line
    // by construction (kits/csv.js says so, and every carrier keeps its prose
    // single-line to hold that), which is what makes a line-oriented conversion
    // safe: no cell can carry the newline that would break a row in half.
    //
    // A CELL IS DATA, so its markdown is escaped rather than run. The pipe has
    // to move because it is the table's own delimiter; the rest move because a
    // registry that describes markdown is full of markdown, and the first
    // rendering turned surfacing.csv's own `[caption](url)` into a link reading
    // "caption". A reader looking at the file has to be able to see the
    // brackets. Backslash escapes render as the bare character, so nothing is
    // added to what is on screen, and emoji are untouched.
    //
    // Ragged rows are PADDED to the widest, never truncated to the header: a
    // row with an extra field is a file that has drifted from its header, and
    // dropping the field would hide exactly the thing worth seeing.
    const csvToMarkdown = (text) => {
      const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return null;
      const rows = lines.map(l => window.Csv.parseLine(l));
      const cols = Math.max(...rows.map(r => r.length));
      if (cols < 2) return null;
      const cell = (v) => String(v ?? '').trim()
        .replace(/[\\`*_[\]|]/g, (c) => '\\' + c) || ' ';
      const line = (r) => '| ' + Array.from({ length: cols }, (_, i) => cell(r[i])).join(' | ') + ' |';
      return [line(rows[0]), '|' + ' --- |'.repeat(cols), ...rows.slice(1).map(line)].join('\n');
    };

    // MOUNTED, not returned as a string. The section controls are listeners on
    // real nodes, and a string handed to innerHTML would drop them; the deck's
    // slide renderer therefore hands this the box to fill rather than asking it
    // for markup. The non-markdown branches still build a node, so the two
    // paths have one shape.
    async function renderDoc(host, path, text, addr){
      const sp = window.SourcePeek;
      let kind = sp?.kindOf ? sp.kindOf(path)
        : (/\.(md|markdown)$/i.test(path) ? 'markdown' : /\.json$/i.test(path) ? 'json' : 'source');
      // A CSV IS A TABLE, and until 2026-09-04 every one of them arrived here as
      // wrapped raw text: SourcePeek.kindOf answers markdown / json / source,
      // which is the right set for a 28-line hover excerpt and the wrong one for
      // a full read. The Docs tab's deck pages docs/, which holds a dozen
      // registries, so the wall was the ordinary case rather than an edge.
      //
      // Converted to a MARKDOWN table rather than built as one. Everything the
      // rendition needs already rides the markdown path: md-doc puts a wide
      // table in its own scroller, the house prose styling applies, and the
      // section controls work. A table built here would be a second table
      // treatment to keep in step with that one.
      //
      // kindOf is left alone deliberately. Widening it would change the PEEK
      // too, and a hover card is a glance at the head of a file where the raw
      // line is what a reader recognizes. The extension test lives here because
      // the decision does.
      const asCsv = kind === 'source' && /\.csv$/i.test(path) && window.Csv?.parseLine;
      if (asCsv) { text = csvToMarkdown(text); kind = 'markdown'; }
      if (kind === 'markdown') {
        try {
          await sheetMarked();
          await sheetMdDoc();
          // Fenced FIRST, and the split runs on the fenced text, so the
          // sections the controls cut and the headings the reader sees come
          // from one parse. Fencing swaps `---` for ``` and keeps the block's
          // line count, so the line numbers in a copied reference still point
          // at the file the reader would open.
          const fenced = sp?.fenceFrontmatter ? sp.fenceFrontmatter(text) : text;
          if (window.mdDoc) { window.mdDoc.render(host, fenced, { addr }); return; }
          host.innerHTML = '<div class="prose prose-sm !max-w-none break-words prose-pre:bg-base-200 prose-pre:text-base-content">'
            + window.marked.parse(fenced) + '</div>';
          return;
        } catch { /* marked unavailable: fall through to source */ }
      }
      const body = (kind === 'json' && sp?.jsonText) ? sp.jsonText(text) : text;
      host.innerHTML = '<pre class="text-sm font-mono whitespace-pre-wrap m-0">' + esc(body) + '</pre>';
    }

    // ── The registry chip ─────────────────────────────────────────────────
    // One mark, one meaning: THIS TAB RENDERS THAT REGISTRY FILE. The glyph is
    // ph-stack, the Registries tab's own icon, so the mark and the tab that
    // lists every registry read as the same thing without a word of
    // explanation; the filename is the link and carries the source peek.
    //
    // It replaced a "Curate" button (2026-08-26). Two things were wrong with
    // that button and only one of them was the word. The word named an act
    // nobody performs, since the link opens a GitHub blob and edits nothing.
    // And a button says what you may DO, where the thing worth showing is what
    // the tab IS a rendering of, which is why the chip leads with the filename
    // and the four tabs that already led with theirs (Docs, Tests, Harness,
    // Registries) needed only their uppercase word dropped.
    // Every tab names the file it reads, and until 2026-08-31 it did so three
    // different ways: a bordered chip for a registry, an 11px 40%-opacity link
    // for anything else, and on two tabs an uppercase word in front of it. The
    // distinction those carried, registry against measurement, is real and worth
    // keeping; carrying it as SIZE was not, since it made a measurement look
    // like a footnote and put the actual meaning in a title attribute, which the
    // house style reserves for labels nothing depends on.
    //
    // One shape, three flavours, the flavour in the icon:
    //   registry  a committed inventory, one row per thing (docs/registries.csv)
    //   measured  a derived or dated reading; no rule decides its membership
    //   renders   the page this tab describes, rather than a file it reads
    const CARRIER = {
      registry: ['ph-stack', 'The registry this tab renders'],
      measured: ['ph-ruler', 'A measurement, not a registry'],
      renders: ['ph-app-window', 'The page this tab describes'],
    };
    const chip = (expr, kind = 'registry') => {
      const [icon, title] = CARRIER[kind];
      return `
              <a x-blob="peek(${expr})"
                 class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-base-300 bg-base-200/50 font-mono text-sm text-base-content/70 hover:text-primary hover:border-primary/50 hover:bg-base-200 transition-colors"
                 :title="'${title} (' + ${expr} + ')'">
                <i class="ph ${icon} text-base opacity-50"></i><span x-text="${expr}"></span><i class="ph ph-github-logo opacity-40"></i></a>`;
    };
    const regChip = (expr) => chip(expr, 'registry');

    return {
      description: 'Map view: the coordination layer made inspectable, in twelve tabs. Aims (docs/aims.json): the mission the estate\'s material serves and the five goals it is held to. Portable (docs/portable.csv, the to-go set; a row\'s title opens the file in the same swipe deck the Docs tab uses, paging the whole set, while a `dir` row still opens its folder and every row\'s GitHub icon, inline with the badges, carries the source peek); Surfacing (docs/surfacing.csv, the gated index of SURFACING.md\'s primitives, the prose staying authoritative, with a door under the header to each of the doc\'s other regions and when it reaches a session; the header\'s Read opens the doc in the same swipe deck the Docs tab uses, so docked the prose reads beside the cards rather than replacing them); Showing (docs/routes.json): which link reaches which kind of change and what each one misses, then the address grammar, toss-render\'s delivery modes and their trust postures, and the toss routes; and Docs (docs/docs.csv): the documentation registry, every doc\'s subject, status (living, record, or measured), reach (injected, in context, by a skill, by the app, or orphan; derived from the repo and filterable from the strip at the top), size in words with its share of the folder, readership (distinct sessions that opened the file, from the private registry\'s sessions cache; token-gated, and an injected doc says so rather than reading the zero no file tool can avoid giving it), and maintenance behind one details toggle for the whole registry, all navigated from a folder rail whose rows roll up counts and words and carry their own GitHub links; a row\'s title opens the document in a fullscreen swipe deck paging the folder\'s files, while its GitHub icon, inline with the badges, carries the source peek. Themes (docs/themes.json and docs/owners.csv, ?tab=claims): what the estate says twice, from both ends. Four derived lenses over the duplication graph (clusters, an arc diagram, the repeated passages themselves, and a matrix ordered so a cluster is a block on the diagonal) share one weight threshold, because a cluster is what the dial makes: one blob at 3, isolated pairs at 30, and around 12 a set of clusters each of which is a theme a person would name. Beside them the Owners lens carries the curated registry, for a statement the coordination layer repeats: its one authoritative carrier, typed repetitions, and per-repetition checks, with an absent check in the warning tone rather than omitted. The accent means one thing throughout, that the registry names neither end of a pair, so the gap between what is measured and what is accounted for is the tab\'s default reading rather than a claim somebody has to make. Named Claims until 2026-08-09 and Owners until 2026-08-31; ?tab=claims still resolves here. Reach counts files and words weighs them, and the strip shows both because on this folder they disagree: the orphans are the larger count and the smaller mass; readership is the third of that set, since reach says who can get to a doc and readership says who did. And Tests (docs/tests.csv): the same registry pointed at the suite, every check\'s kind (gate or behavior) and what breaks if it is deleted, with assertions, method, runner and boot-smoke count derived from the files and gated against the registry. The strip cuts the total by kind, since a pass count cannot tell a boot check from an adversarial gate; a browser check reports no assertion count rather than zero, because test() is not its unit. And Harness (docs/harness.csv): the harness registry, one row per code file under tools/ and scripts/ (tools/test/ excluded; the Tests registry owns it), each row an authored role plus derived layer, lines, invocation route (npm script, scenario driver, imported helper, argv, or none found, the warning state), whether it writes files, whether prose names it and a test exercises it; navigated from the same folder rail as Docs (the tree as it exists on disk, counts and blank-role figures rolled up to ancestors), with the invocation pills as a separate filter layer that re-weights the rail. And Registries (docs/registries.csv): the declaration table the other seven tabs hang off, one card per registry (title, gloss, kind, carrier, gate, target grain, scope, per-declaration chips), grouped by area (files or names), with derived totals rather than prose-carried counts, and per row the derived renders_in list: the app files that name the carrier in code, each a peekable link, with a warning badge and a strip figure for carriers no app surface reads, since an unread claim is where the registry audits keep finding rot. Per-repo scope and adoption live on the Repos cards. And Injection (docs/injection.json): what actually reaches a session at start, the only tab reading a dated measurement rather than a registry, so it carries its date and takes no registry chip. Two channels on one byte scale, the capped session hook against its ceiling with the headroom left, and project_instructions beside it with no cap and nothing measuring it; then every document each carrier reports, with the pair that arrives down both marked as such; then the two caps and how each behaves when exceeded, one degrading and announcing, the other truncating in silence; then the three rungs the injector walks down and which one fired. Beside the container measurement sits Observed, folded live from the private registry\'s sessions cache: how many recorded sessions carry a startup receipt, what each carrier delivered in each of them, the sessions where the hook delivered nothing, and the sessions where a document arrived down both channels. That half is token-gated and can disagree with the half above, which is the point: a reading of this checkout sees every file present on disk and can never report a hook that went quiet. The operational face of the constellation doctrine.',

      template: `
        <div class="w-full">
          <!-- The tab strip. Who carries what is a property of each repo, so
               that lives on the Repos cards, not here. -->
          <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 mb-4 w-fit flex-wrap" role="tablist">
            <template x-for="t in TABS" :key="t.k">
              <button role="tab" @click="setTab(t.k)"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                      :class="mapTab === t.k ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                <i class="ph text-lg" :class="t.i"></i><span x-text="t.n"></span></button>
            </template>
          </div>
          <!-- NO text-balance. CSS text-wrap:balance evens the line lengths of
               a short block by NARROWING the measure, so a two-line lede sat in
               half the pane with the other half empty, and the tab that reads
               longest was the one that looked most cramped. The house rule is
               the opposite one: text takes the width it is given. -->
          <p class="text-base text-base-content/60 mb-6 leading-7" x-text="tabGloss"></p>
          <!-- ── Aims ───────────────────────────────────── -->
          <section x-show="mapTab==='aims'">
            <div class="flex items-center gap-2 flex-wrap mb-5">
              ${chip('AIMS_MANIFEST', 'measured')}
              <div class="grow"></div>
              <button type="button" @click="copyAimsMd()" :disabled="!aims"
                      class="flex items-center gap-1.5 text-base text-base-content/60 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors disabled:opacity-40">
                <i class="ph ph-clipboard-text text-lg"></i>Copy as Markdown</button>
            </div>
            <template x-if="aimsErr">
              <div class="text-error text-sm mb-4" x-text="aimsErr"></div>
            </template>
            <template x-if="aims">
              <div class="flex flex-col gap-10">
                <div class="grid gap-x-8 gap-y-3 lg:grid-cols-[7rem_1fr]">
                  <div class="text-sm uppercase tracking-widest text-base-content/40">Mission</div>
                  <p class="text-2xl leading-9 font-medium" x-text="aims.mission"></p>
                </div>
                <div class="grid gap-x-8 gap-y-3 lg:grid-cols-[7rem_1fr]">
                  <div class="text-sm uppercase tracking-widest text-base-content/40">Goals</div>
                  <ol class="flex flex-col gap-5">
                    <template x-for="(g, i) in aims.goals" :key="g.key">
                      <li class="grid grid-cols-[2rem_1fr] items-baseline">
                        <span class="text-sm tabular-nums text-base-content/40" x-text="i + 1"></span>
                        <div class="text-xl leading-8">
                          <span class="font-semibold" x-text="g.name + '.'"></span>
                          <span x-text="' ' + g.gloss"></span>
                        </div>
                      </li>
                    </template>
                  </ol>
                </div>
                <div class="grid gap-x-8 gap-y-3 lg:grid-cols-[7rem_1fr]">
                  <div class="text-sm uppercase tracking-widest text-base-content/40">Reading</div>
                  <div class="flex flex-col gap-3">
                    <template x-for="r in aims.reading" :key="r.path">
                      <div class="text-lg leading-7">
                        <a :href="readingUrl(r)" target="_blank" rel="noopener"
                           class="font-mono text-sm underline underline-offset-4 decoration-base-300 hover:text-primary"
                           x-text="(r.repo ? r.repo.split('/')[1] + ' ' : '') + r.path"></a>
                        <span x-show="r.private" class="text-sm uppercase tracking-widest text-base-content/40"> private</span>
                        <span class="text-base-content/70" x-text="' ' + r.gloss"></span>
                      </div>
                    </template>
                    <button type="button" @click="goEstate()"
                            class="self-start flex items-center gap-1.5 text-base text-base-content/60 hover:text-primary px-2 py-1 -ml-2 rounded-lg hover:bg-base-200 transition-colors"
                            title="Each repo's own scope statement, on its card">
                      <i class="ph ph-squares-four text-lg"></i>What each repo is for</button>
                  </div>
                </div>
              </div>
            </template>
          </section>
          <!-- ── Portable ────────────────────────────────────────────────── -->
          <section x-show="mapTab==='set'">
            <!-- No section title: the Portable tab already names this. -->
            <div class="flex items-center gap-2 mb-4 flex-wrap">
${regChip('SET_MANIFEST')}
              <code class="text-sm text-base-content/50">/plugin install portable@web-tools</code>
              <div class="grow"></div>
              <button type="button" @click="openDoctrine()"
                      class="flex items-center gap-1.5 text-base text-base-content/60 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors"
                      title="The constellation doctrine: what goes where, and why">
                <i class="ph ph-compass"></i><span>The theory</span>
              </button>
            </div>
            <div x-show="setLoading" class="flex justify-center py-10">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <!-- Container widths, not viewport ones: this grid has to answer to
                 the pane it is in, which the dock can make 416px wide while the
                 window stays 1440. See the @container note on <main>. -->
            <div class="grid gap-x-8 gap-y-6 @3xl:grid-cols-2 @5xl:grid-cols-3">
              <template x-for="sec in setSections" :key="sec.label">
                <div>
                  <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-2" x-text="sec.label"></h3>
                  <div class="flex flex-col gap-1">
                    <template x-for="it in sec.items" :key="it.path">
                      <div class="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-base-200/60 group">
                        <i class="ph mt-1 text-base-content/40 shrink-0" :class="kindIcon(it)"></i>
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-2 flex-wrap">
                            <button type="button" class="text-base font-medium hover:text-primary text-left"
                                    @click="openItem(it)" x-text="it.title"></button>
                            <code x-show="it.command" class="text-sm text-base-content/50" x-text="it.command"></code>
                            <span class="badge badge-ghost badge-sm" x-text="useLabel(it)"></span>
                            <!-- Inline with the badges, always visible, the way
                                 the Docs tab already carries it. Parked at the
                                 row's far edge under opacity-0 plus
                                 group-hover:opacity-100 it did not exist until
                                 hovered and then sat at 30%, so the peek behind
                                 it went undiscovered: reported 2026-08-20 as
                                 "the GitHub icon buttons are quite faint", by a
                                 reader who had not known the peek was there. A
                                 hover-only affordance also has no touch
                                 equivalent, which is the other half.
                                 NO BACKTICKS IN HERE: the template is itself a
                                 template literal, so a code span closes it. -->
                            <a :href="itemGh(it)" :data-peek="it.kind === 'dir' ? null : peek(it.path)"
                               target="_blank" rel="noopener" title="Open on GitHub"
                               class="text-base-content/30 hover:text-primary">
                              <i class="ph ph-github-logo"></i></a>
                          </div>
                          <p class="text-base text-base-content/60" x-text="setRole(it)"></p>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>
              </template>
            </div>
            <div x-show="setErr" class="text-base text-error font-mono" x-text="setErr"></div>
          </section>

          <!-- ── Surfacing: what to hand over, and how ────────────────────── -->
          <!-- Ownership runs the other way here: SURFACING.md is authoritative
               (sessions load and follow the prose) and the manifest is its
               gated index, so the header leads with the doc. Surfacing decides
               what to hand over; Showing is what makes it openable. -->
          <section x-show="mapTab==='surfacing'">
            <!-- "Primitives, indexed from", NOT "The doc (authoritative)". The
                 old label made the ownership claim (prose over index) in a
                 wording that read as a coverage claim, and the cards under it
                 are one region of four. The ownership survives in the comment
                 above; the label now says what the cards are. -->
            <div class="flex items-center gap-2 mb-2 flex-wrap">
              <span class="text-sm font-semibold uppercase tracking-wide text-base-content/40">Primitives, indexed from</span>
              <code class="text-sm text-base-content/50" x-text="SURF_DOC"></code>
              <a x-blob="peek(SURF_DOC)"
                 class="text-base-content/40 hover:text-primary" :title="SURF_DOC + ' on GitHub'">
                <i class="ph ph-github-logo"></i></a>
              <!-- THE HOUSE DECK DOOR, not a button of this tab's own. It was
                   a book glyph beside the word "Read", which named the act
                   twice and matched nothing else in the estate; every other
                   surface with a reader (branch-brief, session-brief,
                   search-view, the viewer's records) wears swipeDeck.entry's
                   one glyph, one wording, one hit target. The classes and the
                   title are that function's, held to it by test
                   (tools/test/deck-entry-parity.test.mjs), because the kit
                   loads on demand and is not on the page at first paint.
                   Ghost, since the cards below are what this tab is: the deck
                   is one lens, the way it is in the shared viewer's header. -->
              <button type="button" @click="openSurfDeck()"
                      class="btn btn-square btn-sm max-sm:h-11 max-sm:w-11 btn-ghost hover:text-primary"
                      :title="'Read ' + plural(surfDeckFiles.length, 'file') + ' one at a time'">
                <i class="ph ph-cards-three text-lg max-sm:text-xl"></i></button>
${regChip('SURF_MANIFEST')}
              <div class="grow"></div>
            </div>
            <!-- THE DOC'S OTHER REGIONS, as doors rather than as a second block
                 type: the course is a template and the handoff a closing line,
                 neither one row per thing, so neither is a card. A door opens
                 the deck at that heading, the way a card's title opens it at
                 the bullet, and the gloss says when the region reaches a
                 session. The rungs themselves are the Injection tab's. -->
            <div x-show="surf && surf.regions.length"
                 class="flex items-baseline gap-x-3 gap-y-1 mb-5 flex-wrap text-sm text-base-content/50">
              <span>Also in the doc:</span>
              <template x-for="r in (surf ? surf.regions : [])" :key="r.heading">
                <span class="inline-flex items-baseline gap-1">
                  <button type="button" class="font-semibold text-left text-base-content/70 hover:text-primary"
                          :title="'Show ' + r.heading + ' in ' + SURF_DOC"
                          @click="showRegion(r)" x-text="r.heading"></button>
                  <span x-show="r.gloss" x-text="'· ' + r.gloss"></span>
                </span>
              </template>
              <button type="button" class="link link-hover" @click="setTab('injection')"
                      title="Which rung fired at session start and what it withheld">Injection tab: what session start delivered</button>
            </div>
            <div x-show="surfLoading" class="flex justify-center py-10">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <div x-show="surfErr" class="text-base text-error font-mono" x-text="surfErr"></div>
            <template x-if="surf">
              <div class="grid gap-2 lg:grid-cols-2 max-w-6xl">
                <template x-for="p in surf.primitives" :key="p.key">
                  <div class="border border-base-300 rounded-lg p-3 bg-base-100">
                    <div class="flex items-baseline gap-2 flex-wrap">
                      <span x-show="p.glyph" x-text="p.glyph"></span>
                      <!-- THE TITLE IS THE DOOR, which is the idiom this view
                           already runs: a Docs row's title opens the deck on
                           that file, and a card's title opens it on the bullet
                           this card paraphrases. The whole card was the other
                           candidate and it takes the reader's text selection
                           away from the form and boundary lines, which are the
                           two things anyone copies out of here. -->
                      <button type="button" class="font-semibold text-left hover:text-primary"
                              :title="'Show ' + p.title + ' in ' + SURF_DOC"
                              @click="showPrimitive(p, $event.currentTarget.closest('div.border'))"
                              x-text="p.title"></button>
                    </div>
                    <p class="text-base text-base-content/70 mt-1" x-text="p.use"></p>
                    <code x-show="p.form" class="text-sm text-primary break-all block mt-1" x-text="p.form"></code>
                    <p x-show="p.boundary" class="text-sm text-base-content/50 mt-1" x-text="p.boundary"></p>
                  </div>
                </template>
              </div>
            </template>
          </section>

          <!-- ── Showing: how content moves, renders, and gets looked at ──── -->
          <section x-show="mapTab==='showing'">
            <!-- Four files meet in this header and the reader has to be able
                 to tell them apart. The RENDERER is the runtime the tab
                 describes, under its own label. The three registry chips are
                 the rows: showing-mechanisms, routes-modes, routes-routes.
                 And docs/routes.json, faint at the end, is what was left when
                 those three became CSVs of their own on 2026-08-18: the address
                 grammar, the parameter precedence, and the showing frame (the
                 three axes and the picker rules). Its showing block is
                 structured, so this is not "prose versus data"; it is that no
                 part of it is one row per thing, which is why it has no row in
                 docs/registries.csv and gets no chip. docs/showing.md is the
                 other half of that frame, behind The frame button, and the two
                 do not overlap: routes.json holds the reference layer,
                 showing.md holds why the boundaries sit where they do.
                 routes-manifest.test.mjs gates the split in both directions.
                 routes.json carried the lone Curate button until 2026-08-26, so
                 the one file the button opened held none of the rows. -->
            <div class="flex items-center gap-2 mb-5 flex-wrap">
${chip('rendererPath', 'renders')}${regChip('SHOWING_MECHANISMS')}${regChip('ROUTES_MODES')}${regChip('ROUTES_ROUTES')}${regChip('ROUTES_PASTE')}${chip('ROUTES_MANIFEST', 'measured')}
              <div class="grow"></div>
              <button type="button" @click="openHubFile(SHOWING_FRAME)"
                      class="flex items-center gap-1.5 text-base text-base-content/60 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors"
                      :title="'Why the boundaries sit where they are (' + SHOWING_FRAME + ')'">
                <i class="ph ph-book-open"></i><span>The frame</span>
              </button>
            </div>
            <div x-show="routesLoading" class="flex justify-center py-10">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <div x-show="routesErr" class="text-base text-error font-mono" x-text="routesErr"></div>
            <template x-if="routes">
              <div class="flex flex-col gap-8">

                <!-- Showing: which mechanism gets a subject in front of a
                     viewer. This leads Transport because it is the question
                     everything below serves, and it is the one that used to be
                     answered by 1,589 words in CLAUDE.md that were in context
                     during the session that still handed over the wrong link.
                     A rule nobody can hold is a rule the app should hold: the
                     rows are read from docs/showing-mechanisms.csv, so the
                     reference and the router cannot drift, and the doc points
                     here rather than restating it. -->
                <div x-show="routes.showing">
                  <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-2">Showing</h3>
                  <p class="text-base text-base-content/60 mb-3" x-text="routes.showing?.note"></p>

                  <!-- The three axes, since the mechanism table below is a
                       lookup over them and reads as an arbitrary list without
                       them stated first. -->
                  <div class="grid gap-2 sm:grid-cols-3 mb-4">
                    <template x-for="[axis, vals] in Object.entries(routes.showing?.axes || {})" :key="axis">
                      <div class="border border-base-300 rounded-lg p-2.5 bg-base-100">
                        <div class="text-base font-semibold uppercase tracking-wide text-base-content/40" x-text="axis"></div>
                        <ul class="mt-1 flex flex-col gap-0.5">
                          <template x-for="v in vals" :key="v">
                            <li class="text-base text-base-content/60" x-text="v"></li>
                          </template>
                        </ul>
                      </div>
                    </template>
                  </div>

                  <div class="flex flex-col gap-2">
                    <template x-for="m in (routes.showing?.mechanisms || [])" :key="m.key">
                      <div class="border border-base-300 rounded-lg p-3 bg-base-100"
                           :class="m.key === 'none' && 'border-dashed'">
                        <div class="flex items-baseline gap-2 flex-wrap">
                          <span class="font-semibold" x-text="m.label"></span>
                          <code x-show="m.form" class="text-base text-primary break-all" x-text="m.form"></code>
                        </div>
                        <p class="text-base text-base-content/70 mt-1.5" x-text="m.use"></p>
                        <div class="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 mt-2">
                          <p x-show="m.reaches" class="text-base text-success/80">
                            <span class="font-semibold">reaches</span> <span x-text="m.reaches"></span></p>
                          <p x-show="m.misses" class="text-base text-error/70">
                            <span class="font-semibold">misses</span> <span x-text="m.misses"></span></p>
                        </div>
                        <p x-show="m.trap" class="text-base text-warning mt-1.5 flex items-start gap-1.5">
                          <i class="ph ph-warning shrink-0 mt-0.5"></i><span x-text="m.trap"></span></p>
                        <div class="flex flex-wrap gap-1.5 mt-2">
                          <span class="badge badge-ghost badge-sm" x-text="'subject: ' + m.subject"></span>
                          <span class="badge badge-ghost badge-sm" x-text="'version: ' + m.version"></span>
                          <span class="badge badge-ghost badge-sm" x-text="'viewer: ' + m.viewer"></span>
                        </div>
                      </div>
                    </template>
                  </div>

                  <!-- The picker: the choice follows from a branch's changed
                       files, so it is derivable rather than remembered. -->
                  <div x-show="routes.showing?.picker" class="mt-3 border border-base-300 rounded-lg p-3 bg-base-200/40">
                    <p class="text-base text-base-content/60 mb-2" x-text="routes.showing?.picker?.note"></p>
                    <template x-for="r in (routes.showing?.picker?.rules || [])" :key="r.when">
                      <div class="text-base flex items-baseline gap-2">
                        <span class="text-base-content/50 shrink-0">if</span>
                        <span x-text="r.when"></span>
                        <span class="text-base-content/30">&rarr;</span>
                        <code class="text-primary" x-text="r.then"></code>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- Kinds: the subject axis above, one level down. The axis
                     says a file needs a renderer; this says which file, which
                     renderer, and what you can do once it is open. It sits here
                     rather than on a tab of its own because it is the same
                     question the axes ask: three pieces of code were answering
                     it privately (ViewRegistry.READ_MODE, the toss routes, and
                     md-doc's declaration) and the row is what joins them. The
                     subject and shown_by cells are checked against the two
                     tables above by routes-manifest.test.mjs, so the columns are
                     a join rather than a resemblance. -->
                <div x-show="routes.kinds?.length">
                  <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-2">Kinds</h3>
                  <p class="text-base text-base-content/60 mb-3">What the subject IS, one level under the axis above: how it is recognized, which viewer mode it opens in, and what a note can be pinned to inside it. An empty aim cell means the universal three (page, element, region) and nothing more.</p>
                  <div class="grid gap-2 sm:grid-cols-2">
                    <template x-for="k in routes.kinds" :key="k.kind">
                      <div class="border border-base-300 rounded-lg p-2.5 bg-base-100 flex flex-col gap-1.5">
                        <div class="flex items-baseline gap-2 flex-wrap">
                          <span class="text-base font-semibold" x-text="k.label"></span>
                          <code class="text-[11px] text-base-content/40" x-text="k.kind"></code>
                          <div class="grow"></div>
                          <span class="badge badge-ghost badge-sm" x-text="k.subject"></span>
                        </div>
                        <div class="text-base text-base-content/60">
                          <span class="text-base-content/40">recognized by</span>
                          <span x-text="k.detect"></span>
                          <span x-show="k.exclusive" class="text-base-content/40" title="An exclusive module: it outranks any default mode a host sets."> (exclusive)</span>
                        </div>
                        <div class="flex flex-wrap items-center gap-1">
                          <span x-show="k.view" class="badge badge-sm badge-outline" :title="'Opens in the ' + k.view + ' viewer mode'" x-text="'view: ' + k.view"></span>
                          <span x-show="k.route" class="badge badge-sm badge-outline" :title="'Addressed by the ' + k.route + ' toss route'" x-text="'#' + k.route + '='"></span>
                          <template x-for="m in (k.shown_by || '').split(';').filter(Boolean)" :key="m">
                            <span class="badge badge-sm badge-ghost" title="A showing mechanism from the table above" x-text="m"></span>
                          </template>
                        </div>
                        <div x-show="k.unit" class="text-base text-base-content/60">
                          <span class="text-base-content/40">unit</span>
                          <span x-text="k.unit"></span>
                          <span x-show="k.address" class="text-base-content/40">, reads as</span>
                          <code x-show="k.address" class="text-primary" x-text="k.address"></code>
                        </div>
                        <div x-show="k.kit" class="text-base">
                          <a x-blob="peek(k.kit)"
                             class="font-mono text-[11px] opacity-50 hover:opacity-90 hover:text-primary"
                             title="The kit that defines this kind's units" x-text="k.kit"></a>
                        </div>
                        <div x-show="k.aim" class="border-t border-base-200 pt-1.5">
                          <span class="badge badge-sm badge-primary badge-outline" x-text="k.aim_label"></span>
                          <span class="text-base text-base-content/60" x-text="k.aim_hint"></span>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- The shared address: one way to name a file in any repo. -->
                <div>
                  <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-2">Address grammar</h3>
                  <code class="text-base text-primary break-all" x-text="routes.grammar.form"></code>
                  <p class="text-base text-base-content/60 mt-1" x-text="routes.grammar.role"></p>
                  <div class="flex flex-wrap gap-1.5 mt-2.5">
                    <template x-for="u in routes.grammar.usedBy" :key="u.where">
                      <button type="button" @click="openHubFile(u.path)" :title="u.path"
                              class="badge badge-ghost badge-sm hover:badge-primary transition-colors"
                              x-text="u.where"></button>
                    </template>
                  </div>
                </div>

                <!-- What each delivery mode carries, and the trust it buys. -->
                <div>
                  <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-2">Delivery modes</h3>
                  <p x-show="routes.precedence" class="text-base text-base-content/60 mb-2.5" x-text="routes.precedence"></p>
                  <div class="flex flex-col gap-1">
                    <template x-for="m in routes.modes" :key="m.form">
                      <div class="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-base-200/60">
                        <i class="ph mt-1 text-base-content/40 shrink-0" :class="modeIcon(m)" :title="m.trust"></i>
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-2 flex-wrap">
                            <code class="text-base font-medium break-all" x-text="m.form"></code>
                            <span class="badge badge-ghost badge-sm" x-text="m.carries"></span>
                          </div>
                          <p class="text-base text-base-content/60" x-text="m.note"></p>
                          <p class="text-sm text-base-content/40" x-text="m.sandbox + ' · ' + m.reach"></p>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- The typed tosses: a content type to the page that renders it. -->
                <div>
                  <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-2">Toss routes</h3>
                  <div class="flex flex-col gap-1">
                    <template x-for="r in routes.routes" :key="r.key">
                      <div class="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-base-200/60 group">
                        <i class="ph ph-disc mt-1 text-base-content/40 shrink-0"></i>
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-2 flex-wrap">
                            <code class="text-base font-medium text-primary" x-text="'#' + r.key + '='"></code>
                            <i class="ph ph-arrow-right text-base-content/30"></i>
                            <button type="button" class="text-base font-medium hover:text-primary text-left"
                                    @click="openRouteRenderer(r)" x-text="r.path"></button>
                            <span x-show="r.ref !== 'main'" class="badge badge-ghost badge-sm" x-text="r.ref"></span>
                          </div>
                          <p class="text-base text-base-content/60" x-text="r.renders"></p>
                          <div class="flex items-center gap-3 flex-wrap mt-0.5">
                            <code class="text-sm text-base-content/40 break-all" x-text="r.example"></code>
                            <button type="button" x-show="r.doc" @click="openHubFile(r.doc)"
                                    class="text-sm text-primary/70 hover:text-primary inline-flex items-center gap-1 shrink-0">
                              <i class="ph ph-book-open"></i><span x-text="r.doc"></span></button>
                          </div>
                        </div>
                        <a :href="routeGh(r)" :data-peek="routePeek(r)"
                           target="_blank" rel="noopener" title="Open the renderer on GitHub"
                           class="opacity-0 group-hover:opacity-100 focus:opacity-100 text-base-content/30 hover:text-primary transition-opacity shrink-0 mt-1">
                          <i class="ph ph-github-logo"></i></a>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- Paste: the address grammar read backwards. Every section
                     above is about MINTING a link; this is the one place the
                     estate reads one back, and it is the half nobody had
                     written down. Three surfaces took a paste and each answered
                     differently, which is fine, but nothing said so, so the
                     estate app's answer (everything is content) went unexamined
                     until 2026-08-28 while toss-render two clicks away had been
                     routing by shape since it was written. What a paste becomes
                     is a property of the surface, so one row per surface, and
                     the declines_to column is the load-bearing one: a surface
                     that recognizes an address has to say what happens to
                     everything it does not. -->
                <div x-show="routes.paste?.length">
                  <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-2">Paste</h3>
                  <p class="text-base text-base-content/60 mb-2.5">
                    Where the grammar is read rather than written: what a pasted thing becomes,
                    per surface, and what each one declines to.</p>
                  <div class="flex flex-col gap-1">
                    <template x-for="p in routes.paste" :key="p.surface">
                      <div class="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-base-200/60 group">
                        <i class="ph ph-clipboard-text mt-1 text-base-content/40 shrink-0"></i>
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-base font-medium" x-text="p.surface"></span>
                            <code x-show="p.path" class="text-sm text-base-content/40 break-all" x-text="p.path"></code>
                          </div>
                          <p class="text-base text-base-content/60" x-text="p.recognizes"></p>
                          <p class="text-base text-base-content/70 mt-0.5">
                            <i class="ph ph-arrow-right align-[-1px] text-base-content/30"></i>
                            <span x-text="p.becomes"></span></p>
                          <p x-show="p.declines_to" class="text-sm text-base-content/40 mt-0.5">
                            declines to <span x-text="p.declines_to"></span></p>
                        </div>
                        <button type="button" x-show="p.gate" @click="openHubFile(p.gate)"
                                :title="'The check that holds this (' + p.gate + ')'"
                                class="opacity-0 group-hover:opacity-100 focus:opacity-100 text-base-content/30 hover:text-primary transition-opacity shrink-0 mt-1">
                          <i class="ph ph-shield-check"></i></button>
                        <a x-show="p.path" x-blob="peek(p.path)" title="Open the surface on GitHub"
                           class="opacity-0 group-hover:opacity-100 focus:opacity-100 text-base-content/30 hover:text-primary transition-opacity shrink-0 mt-1">
                          <i class="ph ph-github-logo"></i></a>
                      </div>
                    </template>
                  </div>
                </div>

              </div>
            </template>
          </section>

          <!-- ── Growth: a corpus as a moving picture ────────────────────────
               The chart is a page, not a component, so this frames it rather
               than porting it. Docs shows the trend per row, one file at a
               time; this shows every file at once, moving.

               The corpus is a CONTROL, not a tab of its own: every repo that
               declares a growth payload is a subject this one instrument can
               be pointed at. One repo declaring one is the ordinary case and
               renders no control, which is why the strip is conditional rather
               than always present. -->
          <section x-show="mapTab==='growth'" class="flex flex-col gap-3">
            <div class="flex items-center gap-2 flex-wrap">
              <!-- The corpus strip, in the shape the Skills tab uses for its
                   sets: this is the same question one axis over, which of
                   several declared collections you are reading. -->
              <template x-if="estateGrowth && estateGrowth.length > 1">
                <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 w-fit flex-wrap">
                  <template x-for="g in estateGrowth" :key="g.repo">
                    <button @click="selectGrowthRepo(g.repo)"
                            class="px-3 py-1 rounded-md text-base font-medium transition-colors"
                            :class="growthSubject && growthSubject.repo === g.repo
                                    ? 'bg-base-100 text-primary shadow-sm'
                                    : 'text-base-content/60 hover:text-base-content'"
                            :title="g.repo + ': ' + g.path">
                      <span x-text="g.short"></span></button>
                  </template>
                </div>
              </template>
              <span class="text-sm font-semibold uppercase tracking-wide text-base-content/40">Payload</span>
              <a :href="growthPayloadUrl" target="_blank" rel="noopener"
                 class="inline-flex items-center gap-1.5 font-mono text-sm text-base-content/60 hover:text-primary"
                 title="The payload this chart reads">
                <span x-text="growthPayloadLabel"></span><i class="ph ph-github-logo"></i></a>
              <div class="grow"></div>
              <a :href="growthUrl" target="_blank" rel="noopener"
                 class="inline-flex items-center gap-1.5 text-sm text-base-content/50 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200"
                 title="Open the chart full-page">
                <i class="ph ph-arrow-square-out"></i><span>full page</span></a>
            </div>
            <!-- One x-for doing two jobs, neither of which x-show can do.
                 Zero items until the tab is opened, so arriving at the Map on
                 another tab never fetches a payload nobody asked to see. And
                 keyed on the ADDRESS, so switching corpus destroys the frame
                 and builds a new one: a new iframe's first load replaces,
                 where re-pointing a live one pushes, and the reader would owe
                 the browser a back tap for every corpus they looked at. -->
            <template x-for="u in (growthSeen ? [growthUrl] : [])" :key="u">
              <iframe :src="u" loading="lazy"
                      class="w-full rounded-xl border border-base-300 bg-base-100"
                      style="height:clamp(460px,74vh,900px)"
                      sandbox="allow-scripts allow-same-origin allow-popups"></iframe>
            </template>
          </section>

          <!-- ── Docs: the documentation registry ───────────────────────────── -->
          <!-- The documents table from docs/docs.csv: what each file under
               docs/ is (subject, living/record, maintenance), complete by
               construction (the registry test), laid out as a folder rail
               beside the selected folder's files so the hierarchy reads as
               one. The registry's other table renders on the Claims tab. -->
          <section x-show="mapTab==='docs'">
            <div class="flex items-center gap-2 mb-5 flex-wrap">
              ${regChip('DOCS_MANIFEST')}
              <a x-blob="peek(REACH_BUILDER)"
                 class="text-base-content/30 hover:text-primary"
                 title="tools/build/docs-reach.mjs stamps reach and words; every other field is authored">
                <i class="ph ph-function"></i></a>
              <template x-if="docGrowth">
                <a :href="hubUrl(GROWTH_PAYLOAD)" target="_blank" rel="noopener"
                   class="inline-flex items-center gap-1.5 text-sm text-base-content/40 hover:text-primary"
                   title="The trend behind each row, from scripts/doc-growth.py. The whole picture is the Doc Growth view.">
                  <i class="ph ph-chart-line"></i><span>trend</span></a>
              </template>
            </div>
            <div x-show="docsLoading" class="flex justify-center py-10">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <div x-show="docsErr" class="text-base text-error font-mono" x-text="docsErr"></div>
            <template x-if="docsReg">
              <!-- A CONTAINER, so this tab reflows on the width it actually
                   has rather than on the window's. The two are the same thing
                   until the deck docks, and then they are not: docking narrows
                   the app's content pane through --deck-dock-left while the
                   window stays 1280 wide, so every lg: and xl: rule below went
                   on believing it had a desktop. The rail kept its 20rem side
                   column, the files column was pushed under the deck and
                   clipped, and the pane scrolled sideways to reach content it
                   could simply have stacked. A viewport breakpoint cannot see a
                   pane; a container query is the only thing that can. -->
              <div class="@container flex flex-col gap-8">

                <!-- Reach strip: the five channels with their counts, each a
                     filter. The registry answers what a doc is; this answers
                     whether anyone can get to it, which is the axis that moves
                     when the estate improves.
                     No standing paragraph under it, deliberately. The labels
                     already say what the counts mean, so a sentence saying "how
                     a reader reaches each file" only restates the controls, and
                     a caveat on the word "orphan" sitting permanently under all
                     five is filed where nobody reading about the other four
                     needs it. The gloss appears on selection instead: tap a
                     channel and that channel explains itself. A title attribute
                     would not do, since it never fires on a phone. -->
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <template x-for="r in docReachCounts" :key="r.key">
                      <button type="button" @click="toggleReach(r.key)" :title="r.hint"
                              class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors"
                              :class="docReach === r.key ? 'border-primary bg-primary/10' : 'border-base-300 hover:bg-base-200'">
                        <span class="badge badge-sm" :class="r.tone" x-text="r.n"></span>
                        <span class="text-base" x-text="r.label"></span>
                        <span class="text-sm text-base-content/40 tabular-nums" x-text="r.share + '%'"></span>
                      </button>
                    </template>
                    <button type="button" x-show="docReach" @click="docReach = ''"
                            class="text-sm text-base-content/50 hover:text-primary px-2 py-1">show all</button>
                    <div class="grow"></div>
                    <span class="text-sm text-base-content/40 tabular-nums"
                          :title="'Every file under docs/, counted as whitespace-delimited tokens'"
                          x-text="docWordTotal.toLocaleString() + ' words'"></span>
                    <!-- The same measure over time. Absent rather than zeroed
                         when the payload is missing, since "no movement" and
                         "no data" are different answers. -->
                    <template x-if="docGrowthTotal">
                      <span class="text-sm font-medium tabular-nums text-base-content/70"
                            :title="docGrowthTotal.n + ' of these files are in the growth payload, which starts ' + docGrowthTotal.from"
                            x-text="(docGrowthTotal.delta > 0 ? '+' : '\u2212') + Math.abs(docGrowthTotal.delta).toLocaleString() + ' since ' + docGrowthTotal.from"></span>
                    </template>
                    <!-- One toggle for the whole registry, not a per-row
                         disclosure: maintenance is either the question you are
                         asking (show it everywhere) or noise (show it nowhere). -->
                    <button type="button" @click="docDetails = !docDetails"
                            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors text-base"
                            :class="docDetails ? 'border-primary bg-primary/10' : 'border-base-300 hover:bg-base-200'"
                            title="Show each row's maintenance: who regenerates or edits the file">
                      <i class="ph ph-info"></i><span>details</span></button>
                    <!-- Only where the readership it sorts on is actually
                         loaded: a sort control over a column a tokenless reader
                         cannot see would reorder rows by nothing. -->
                    <button type="button" x-show="docReads" @click="cycleDocSort()"
                            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors text-base"
                            :class="docSort ? 'border-primary bg-primary/10' : 'border-base-300 hover:bg-base-200'"
                            title="Order the file list by how many sessions opened each file. An injected doc sorts on its presence count, since no file tool reads one.">
                      <i class="ph" :class="docSort === 'cold' ? 'ph-sort-ascending' : 'ph-sort-descending'"></i>
                      <span x-text="docSortLabel()"></span></button>
                  </div>
                  <p x-show="docReach" class="text-sm text-base-content/50 mt-2"
                     x-text="reachMeta(docReach).hint"></p>
                  <!-- Reads that hit nothing. Sits under the strip because it is
                       a fact about the whole folder rather than about any row,
                       and there is no row it could hang off: the path is not in
                       the registry, which is what makes it worth showing. -->
                  <template x-if="docPhantoms.length">
                    <div class="mt-2 text-sm">
                      <button type="button" @click="docPhantomsOpen = !docPhantomsOpen"
                              class="flex items-center gap-1.5 text-base-content/50 hover:text-base-content/80"
                              title="Paths a session opened under docs/ that no registry row has ever carried: a doc since deleted, or a name someone guessed wrong. A misspelling here is a document that could not be found by the name a reader reached for.">
                        <i class="ph" :class="docPhantomsOpen ? 'ph-caret-down' : 'ph-caret-right'"></i>
                        <span x-text="docPhantoms.length + ' unresolved ' + (docPhantoms.length === 1 ? 'read' : 'reads')"></span>
                      </button>
                      <div x-show="docPhantomsOpen" class="mt-1 ml-5 flex flex-col gap-0.5">
                        <template x-for="p in docPhantoms" :key="p.path">
                          <div class="flex items-baseline gap-2 flex-wrap">
                            <code class="text-sm text-base-content/70" x-text="p.path"></code>
                            <span class="text-sm text-base-content/40 tabular-nums"
                                  x-text="p.sessions + (p.sessions === 1 ? ' session' : ' sessions')
                                          + ', last ' + (p.last || '').slice(0, 10)"></span>
                          </div>
                        </template>
                      </div>
                    </div>
                  </template>
                      </div>
                    </div>
                  </template>
                </div>

                <!-- @2xl (42rem) is the rail's 20rem plus the 2rem gap plus
                     room for a filename and its subject; below it the rail
                     stacks above the files rather than squeezing beside them. -->
                <div class="flex flex-col @2xl:flex-row gap-x-8 gap-y-4">
                  <!-- Folder rail: the registry's directories as a tree, rolled
                       up (a folder's count and words include everything below
                       it). Always expanded: seven folders do not earn collapse
                       state. The GitHub icon stays visible rather than
                       hover-revealed, because hover drops on touch and the
                       folder link is a first-class destination here. -->
                  <nav class="@2xl:w-80 shrink-0" aria-label="docs folders">
                    <div class="flex flex-col gap-0.5">
                      <template x-for="f in docFolders" :key="f.dir">
                        <div class="flex items-center gap-1" :style="'margin-left:' + f.depth + 'rem'">
                          <button type="button" @click="docDir = f.dir"
                                  class="flex items-center gap-2 px-2 py-1.5 rounded-lg flex-1 min-w-0 text-left transition-colors"
                                  :class="docDir === f.dir ? 'bg-primary/10 text-primary' : (f.n ? 'hover:bg-base-200' : 'opacity-40 hover:bg-base-200')">
                            <i class="ph shrink-0" :class="docDir === f.dir ? 'ph-folder-open' : 'ph-folder'"></i>
                            <span class="text-base font-medium truncate" x-text="f.name"></span>
                            <span class="ml-auto text-sm tabular-nums shrink-0"
                                  :class="docDir === f.dir ? 'text-primary/70' : 'text-base-content/40'"
                                  x-text="f.n"></span>
                            <span class="text-sm text-base-content/30 tabular-nums shrink-0 w-10 text-right"
                                  :title="f.words.toLocaleString() + ' words at or below this folder'"
                                  x-text="fmtWords(f.words)"></span>
                            <span class="text-sm tabular-nums shrink-0 w-10 text-right"
                                  x-show="folderGrowth(f.dir)"
                                  :class="folderGrowth(f.dir) > 0 ? 'text-base-content/60' : 'text-success'"
                                  :title="'net change at or below this folder, over the span the payload covers'"
                                  x-text="(folderGrowth(f.dir) > 0 ? '+' : '\u2212') + fmtWords(Math.abs(folderGrowth(f.dir)))"></span>
                          </button>
                          <a :href="folderGh(f.dir)" target="_blank" rel="noopener"
                             :title="'Open ' + f.dir + ' on GitHub'"
                             class="text-base-content/30 hover:text-primary shrink-0 px-1">
                            <i class="ph ph-github-logo"></i></a>
                        </div>
                      </template>
                    </div>
                  </nav>

                  <!-- The selected folder: its README's registry subject as the
                       gloss (read unfiltered, so the description survives a
                       reach filter that hides the README itself), then its own
                       direct files; subfolders are one tap away in the rail.
                       Maintenance sits behind the info toggle: it is the
                       least-read field and was most of every row's height. -->
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap mb-1">
                      <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40" x-text="docDir + '/'"></h3>
                      <a :href="folderGh(docDir)" target="_blank" rel="noopener"
                         :title="'Open ' + docDir + ' on GitHub'"
                         class="text-base-content/30 hover:text-primary"><i class="ph ph-github-logo"></i></a>
                      <!-- The door into the whole folder. Every row's title has
                           opened the deck since the deck existed, which is a
                           GESTURE: it works, and a reader who has not tried it
                           is never told the folder can be read one file at a
                           time. swipeDeck.entry's own note names that the case
                           it exists for, and this header had no visible way in.
                           Opens at the first row, in the order and under the
                           filters on screen, so the deck pages what the reader
                           is looking at. -->
                      <button type="button" x-show="docDirFiles.length"
                              @click="openDocDeck(docDirFiles[0])"
                              class="btn btn-square btn-sm max-sm:h-11 max-sm:w-11 btn-ghost hover:text-primary"
                              :title="'Read ' + plural(docDirFiles.length, 'file') + ' one at a time'">
                        <i class="ph ph-cards-three text-lg max-sm:text-xl"></i></button>
                    </div>
                    <p x-show="docDirGloss" class="text-base text-base-content/60 mb-3" x-text="docDirGloss"></p>
                    <!-- Two columns above @5xl (64rem) so a wide PANE is used
                         rather than left as a gutter; one column below it. Read
                         off the container for the same reason as the row above,
                         and 64rem is the rail plus two readable file columns. -->
                    <div class="grid grid-cols-1 @5xl:grid-cols-2 gap-x-8 gap-y-1">
                      <template x-for="d in docDirFiles" :key="d.path">
                        <div class="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-base-200/60">
                          <i class="ph mt-1 text-base-content/40 shrink-0"
                             :class="d.status === 'record' ? 'ph-archive' : 'ph-file-text'" :title="d.status"></i>
                          <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2 flex-wrap">
                              <button type="button" class="text-base font-medium hover:text-primary text-left"
                                      :title="'Read ' + d.path + ' here'"
                                      @click="openDocDeck(d)" x-text="docTitle(d)"></button>
                              <span class="badge badge-ghost badge-sm" x-text="d.status"></span>
                              <span class="badge badge-sm badge-outline" :class="reachMeta(d.reach).tone"
                                    :title="reachMeta(d.reach).hint" x-text="reachMeta(d.reach).label"></span>
                              <!-- Size and trend break together or not at all:
                                   a sparkline that wraps away from the number
                                   it qualifies reads as a mark about the row
                                   below it. -->
                              <span class="inline-flex items-center gap-2 shrink-0">
                              <span class="text-sm tabular-nums"
                                    :class="docShare(d) >= 5 ? 'text-warning' : 'text-base-content/40'"
                                    :title="d.words.toLocaleString() + ' words, ' + docShare(d) + '% of docs/'"
                                    x-text="docSize(d)"></span>
                              <!-- Shape, then the number. The sparkline is
                                   normalized to this file's own range, so it
                                   says grew / held / was cut and never how big
                                   the file is; the size beside it already
                                   answers that. -->
                              <template x-if="growthOf(d.path)">
                                <span class="inline-flex items-center gap-1" :title="growthHint(d.path)">
                                  <svg viewBox="0 0 44 12" width="44" height="12" class="shrink-0 overflow-visible"
                                       aria-hidden="true">
                                    <polyline :points="spark(d.path)" fill="none" stroke="currentColor"
                                              stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"
                                              :class="growthOf(d.path).delta > 0 ? 'text-warning' : 'text-success'"></polyline>
                                  </svg>
                                  <span class="text-sm tabular-nums"
                                        :class="growthOf(d.path).delta > 0 ? 'text-base-content/70' : 'text-success'"
                                        x-text="growthDelta(d.path)"></span>
                                </span>
                              </template>
                              </span>
                              <!-- Inline with the badges, always visible: this
                                   icon carries the source peek, and parked at
                                   the row's far edge it read as furniture. -->
                              <a x-blob="peek(d.path)" title="Open on GitHub"
                                 class="text-base-content/30 hover:text-primary">
                                <i class="ph ph-github-logo"></i></a>
                            </div>
                            <!-- Readership rides the subject line as an italic
                                 tail ("9 reads"), not an eye icon in the badge
                                 row and not a standing paragraph of caveats:
                                 the words say what the number is, and the
                                 title carries the caveats for whoever asks.
                                 Absent entirely without a token, since the
                                 count lives in the private registry and an
                                 empty column would read as "nobody opened
                                 it". -->
                            <p class="text-base text-base-content/60">
                              <span x-text="d.subject"></span><em x-show="docReads && docReadLabel(d)"
                                 class="text-sm text-base-content/40 ml-1.5"
                                 :title="docReadHint(d)" x-text="docReadLabel(d)"></em>
                            </p>
                            <p x-show="docDetails" class="text-sm text-base-content/40" x-text="d.maintenance"></p>
                          </div>
                        </div>
                      </template>
                    </div>
                    <p x-show="!docDirFiles.length" class="text-base text-base-content/50 py-4">
                      No files in this folder match the selected reach filter.</p>
                  </div>
                </div>

              </div>
            </template>

            <!-- Reading a row happens in the house swipe deck (swipe-deck.js,
                 loaded on demand from the pre-build cache), built imperatively
                 by openDocDeck, so there is no markup for it here. An earlier
                 cut used a sheetModal with the content slotted in; the deck
                 replaced it because paging the folder beats one doc per open,
                 and because it sidesteps the moved-slot hazard recorded in
                 sheet-modal.js's header. -->
          </section>

          <!-- ── Themes: what the estate says twice, and who owns it ──────── -->
          <!-- Its own tab (2026-08-07) as Owners, because it keys on STATEMENTS
               rather than files. Renamed Themes on 2026-08-31 and given the
               derived half it never had; ?tab=claims still resolves here, the
               way ?tab=set outlived "The set".

               THE TWO HALVES ANSWER THE SAME QUESTION FROM OPPOSITE ENDS. The
               registry (the Owners lens) knows WHY a repetition exists and what
               holds it, and its coverage is curated, so it can never say what it
               has missed. The graph knows EVERY repetition and nothing about
               why. Measured the day the graph landed: 48 pairs across 119
               markdown files, of which the registry named both ends of 2 of the
               20 heaviest, and not the largest in the repo. Putting them on one
               tab makes that the default reading rather than a claim somebody
               has to make.

               THE THRESHOLD IS THE FIRST CONTROL because a cluster is what it
               makes: at 3 the graph is one blob of 32 files, at 30 it is
               isolated pairs, and around 12 it resolves into clusters that are
               each a theme a person would name. No sentence conveys that;
               dragging it does, which is the whole argument for a dial over a
               paragraph.

               The accent means one thing everywhere here: the owners registry
               names neither end of this pair. The filter's two segments carry
               their own counts so the second one defines itself, and the legend
               names the carrier rather than a word for it. -->
          <section x-show="mapTab==='claims'">
            <div class="flex items-center gap-2 mb-4 flex-wrap">
              <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 flex-wrap" role="tablist">
                <template x-for="l in THEME_LENSES" :key="l.k">
                  <button role="tab" @click="lens = l.k"
                          class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-base font-medium transition-colors"
                          :class="lens === l.k ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                    <i class="ph text-lg" :class="l.i"></i><span x-text="l.n"></span>
                  </button>
                </template>
              </div>
              <div class="grow"></div>
              <template x-if="lens === 'owners'">
                <div class="flex items-center gap-2 flex-wrap">${regChip('OWNERS_MANIFEST')}${regChip('OWNERS_REPS')}</div>
              </template>
              <template x-if="lens !== 'owners'">
                <div>${chip('THEMES_GRAPH', 'measured')}</div>
              </template>
            </div>

            <!-- The dial and the filter, above every derived lens because all
                 four read the same two. -->
            <!-- x-if, not x-show: an <input type=range> created while :max is
                 still 1 has its DOM value clamped by the browser, and x-model
                 then writes the clamp back, so the thumb and the readout part
                 company for the life of the page. Create it once the graph is
                 in hand and it is born with the right range. -->
            <template x-if="themeGraph && lens !== 'owners'">
            <div class="flex items-center gap-3 mb-4 min-w-0 flex-wrap">
              <span class="text-base text-base-content/50 shrink-0 tabular-nums">
                <span class="text-base-content font-semibold" x-text="themeTh"></span>+ shared
              </span>
              <input type="range" class="range range-xs range-primary w-full min-w-0 grow"
                     min="3" :max="themeMaxW" step="1" x-model.number="themeTh"
                     aria-label="minimum shared word-windows for a pair to count"/>
              <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 shrink-0">
                <button @click="themeConcern = 'review'"
                        class="px-2.5 py-1 rounded-md text-base transition-colors tabular-nums"
                        :class="themeConcern === 'review' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60'">
                  <span class="font-semibold" x-text="themeTally.review"></span> to review</button>
                <button @click="themeConcern = 'unlisted'"
                        class="px-2.5 py-1 rounded-md text-base transition-colors tabular-nums"
                        :class="themeConcern === 'unlisted' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60'">
                  <span class="font-semibold" x-text="themeTally.unlisted"></span> not in owners.csv</button>
              </div>
            </div>
            </template>

            <div x-show="themesLoading || ownersLoading" class="flex justify-center py-10">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <div x-show="themesErr" class="text-base text-error font-mono" x-text="themesErr"></div>
            <div x-show="ownersErr" class="text-base text-error font-mono" x-text="ownersErr"></div>

            <!-- Clusters: what the dial makes -->
            <section x-show="lens === 'clusters' && themeGraph" class="flex flex-col gap-2">
              <template x-for="(c, ci) in themeClusters" :key="ci">
                <div class="border border-base-300 rounded-lg p-3 bg-base-100">
                  <div class="flex items-baseline gap-2 flex-wrap mb-2">
                    <template x-for="(f, fi) in c.files" :key="f">
                      <span class="text-base">
                        <span x-show="fi" class="text-base-content/20">·</span>
                        <a x-blob="peek(f)"
                           class="hover:text-primary">
                          <span class="text-base-content/40" x-text="themeDir(f)"></span><span class="font-medium" x-text="themeBase(f)"></span></a>
                      </span>
                    </template>
                  </div>
                  <template x-for="e in c.edges" :key="e.a + e.b">
                    <div class="flex items-baseline gap-2 py-0.5">
                      <span class="tabular-nums text-sm shrink-0 w-7 text-right"
                            :class="themeMarked(e) ? 'text-primary font-semibold' : 'text-base-content/30'" x-text="e.w"></span>
                      <span class="text-base text-base-content/70 leading-6">&ldquo;<span x-text="e.quoted[0]"></span>&rdquo;</span>
                    </div>
                  </template>
                </div>
              </template>
              <div x-show="themeGraph && !themeClusters.length" class="text-base text-base-content/40 py-10 text-center">
                nothing shares that much
              </div>
            </section>

            <!-- Arcs: the graph itself, files down and shared prose across -->
            <section x-show="lens === 'arcs' && themeGraph" class="">
              <div class="flex items-stretch gap-2">
                <div class="shrink-0 text-base-content" x-html="themeArcs()"></div>
                <div class="grow min-w-0">
                  <template x-for="f in themeOrdered" :key="f">
                    <div class="flex items-center gap-2" style="height:30px">
                      <span class="w-1.5 h-1.5 rounded-full shrink-0"
                            :class="themeEdges.some(e => themeMarked(e) && (e.a === f || e.b === f))
                                    ? 'bg-primary' : 'bg-base-content/20'"></span>
                      <a x-blob="peek(f)"
                         class="text-base truncate min-w-0 hover:text-primary">
                        <span class="text-base-content/40" x-text="themeDir(f)"></span><span x-text="themeBase(f)"></span></a>
                    </div>
                  </template>
                </div>
              </div>
            </section>

            <!-- Atoms: the repeated passages themselves -->
            <section x-show="lens === 'atoms' && themeGraph" class="flex flex-col gap-3">
              <template x-for="e in themeEdges" :key="e.a + e.b">
                <div class="border-l-2 pl-3" :class="themeMarked(e) ? 'border-primary' : 'border-base-300'">
                  <div class="flex items-baseline gap-2 flex-wrap">
                    <span class="tabular-nums text-sm shrink-0"
                          :class="themeMarked(e) ? 'text-primary font-semibold' : 'text-base-content/30'" x-text="e.w"></span>
                    <span class="text-base"><span class="text-base-content/40" x-text="themeDir(e.a)"></span><span x-text="themeBase(e.a)"></span></span>
                    <i class="ph ph-arrows-left-right text-base-content/20"></i>
                    <span class="text-base"><span class="text-base-content/40" x-text="themeDir(e.b)"></span><span x-text="themeBase(e.b)"></span></span>
                  </div>
                  <template x-for="(a, ai) in e.quoted" :key="ai">
                    <p class="text-base text-base-content/70 leading-7 mt-1">&ldquo;<span x-text="a"></span>&rdquo;</p>
                  </template>
                </div>
              </template>
            </section>

            <!-- Matrix: the same graph with no layout choices, ordered so a
                 cluster is a block on the diagonal. The readout above it is
                 never empty and the rows are labelled, because an unlabelled
                 grid of coloured squares says nothing about what a cell is. -->
            <section x-show="lens === 'matrix' && themeGraph" class="">
              <div class="border-l-2 pl-3 mb-4 min-h-14"
                   :class="themeShown && themeMarked(themeShown) ? 'border-primary' : 'border-base-300'">
                <template x-if="themeShown">
                  <div>
                    <div class="flex items-baseline gap-2 flex-wrap">
                      <span class="tabular-nums text-sm shrink-0"
                            :class="themeMarked(themeShown) ? 'text-primary font-semibold' : 'text-base-content/30'"
                            x-text="themeShown.w"></span>
                      <span class="text-base" x-text="themeBase(themeShown.a)"></span>
                      <i class="ph ph-arrows-left-right text-base-content/20"></i>
                      <span class="text-base" x-text="themeBase(themeShown.b)"></span>
                      <span class="text-sm text-base-content/40" x-show="!themePick">heaviest pair; tap a cell</span>
                    </div>
                    <p class="text-base text-base-content/70 leading-7 mt-1">&ldquo;<span x-text="themeShown.quoted[0]"></span>&rdquo;</p>
                  </div>
                </template>
              </div>
              <div class="overflow-x-auto">
                <div class="flex items-start gap-2 w-fit">
                  <div class="shrink-0">
                    <template x-for="f in themeOrdered" :key="f">
                      <div class="text-sm text-base-content/60 text-right truncate max-w-[9rem]"
                           style="height:15px;line-height:15px" x-text="themeBase(f)"></div>
                    </template>
                  </div>
                  <div class="inline-grid gap-px shrink-0"
                       :style="'grid-template-columns: repeat(' + themeOrdered.length + ', 14px)'">
                    <template x-for="(cell, ci) in themeCells" :key="ci">
                      <button type="button" @click="themePick = cell.e"
                              @pointerenter="noteEnter(cell, $event)" @pointerleave="noteLeave()"
                              class="w-[14px] h-[14px] rounded-[2px]"
                              :class="cell.e ? (themeMarked(cell.e) ? 'bg-primary' : 'bg-base-content')
                                             : (cell.diag ? 'bg-base-300' : 'bg-base-200/50')"
                              :style="cell.e ? 'opacity:' + (0.3 + 0.7 * cell.e.w / themeMaxW) : ''"
                              :aria-label="cell.e ? themeBase(cell.e.a) + ' and ' + themeBase(cell.e.b) + ', ' + cell.e.w + ' shared'
                                                 : themeBase(cell.row) + ' and ' + themeBase(cell.col) + ', nothing shared'"></button>
                    </template>
                  </div>
                </div>
              </div>
            </section>

            <!-- Owners: the curated half, unchanged in what it says -->
            <section x-show="lens === 'owners'" class="">
              <template x-if="ownersReg">
                <div class="flex flex-col gap-2">
                  <template x-for="c in (ownersReg.owners || [])" :key="c.subject">
                    <div class="border border-base-300 rounded-lg p-3 bg-base-100">
                      <div class="flex items-baseline gap-2 flex-wrap">
                        <span class="font-semibold" x-text="c.subject"></span>
                        <span x-show="c.kind === 'family'" class="badge badge-ghost badge-sm" :title="c.applies_to">family rule</span>
                      </div>
                      <p class="text-base text-base-content/70 mt-1">
                        <span class="font-semibold text-base-content/50">owner</span> <span x-text="c.authoritative"></span></p>
                      <div class="flex flex-col gap-1 mt-2">
                        <template x-for="r in c.repetitions" :key="r.where">
                          <div class="text-base flex items-start gap-2 flex-wrap">
                            <span class="badge badge-ghost badge-sm shrink-0" x-text="r.relation"></span>
                            <span class="text-base-content/70" x-text="r.where"></span>
                            <span :class="checkTone(r)" x-text="checkText(r)"></span>
                          </div>
                        </template>
                      </div>
                    </div>
                  </template>
                </div>
              </template>
            </section>

            <!-- The legend names the carrier, not a word for it: "unlisted" is
                 only meaningful if the reader can open the list. -->
            <div x-show="lens !== 'owners' && themeGraph"
                 class="flex items-center gap-4 flex-wrap mt-6 pt-3 border-t border-base-300 text-sm text-base-content/50">
              <!-- The legend is the label for the encoding, so it turns over with
                   it. Naming a carrier rather than a word for it: "unlisted" only
                   means something to a reader who can open the list. -->
              <span class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-sm bg-primary shrink-0"></span>
                <span x-show="themeConcern === 'review'">states a rule, and both files leave this repo
                  (<a :href="hubUrl('docs/portable.csv')" target="_blank" rel="noopener"
                     class="underline decoration-dotted hover:text-primary">portable.csv</a> or a skill)</span>
                <span x-show="themeConcern === 'unlisted'">in neither
                  <a :href="hubUrl(OWNERS_MANIFEST)" target="_blank" rel="noopener"
                     class="underline decoration-dotted hover:text-primary">owners.csv</a> nor
                  <a :href="hubUrl(OWNERS_REPS)" target="_blank" rel="noopener"
                     class="underline decoration-dotted hover:text-primary">repetitions.csv</a></span>
              </span>
              <span class="flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-sm bg-base-content/30 shrink-0"></span>
                <span x-show="themeConcern === 'review'">a description repeated, or repeated where one reader sees both</span>
                <span x-show="themeConcern === 'unlisted'">both files listed there</span>
              </span>
              <span class="tabular-nums" x-show="themeGraph">
                <span x-text="themeGraph?.scanned"></span> markdown files ·
                <span x-text="themeGraph?.shingle"></span>-word windows
              </span>
            </div>
          </section>

          <!-- ── Skills: every set a skill can reach a session from ──────────
               The one registry whose absence was mistaken for coverage: the
               plugin's 16 and a DISJOINT library of 35, so "the plugin section
               covers skills" was true of a set it does not contain.

               THREE SETS ON ONE AXIS since 2026-08-28, where the tab used to be
               the library, then the estate stacked under it, then a paragraph
               saying a third set lived on another tab. The sets differ in how a
               skill arrives (installed and auto-firing, loaded on request, or
               one repo's own), which decides what having one costs, so it is a
               control carrying a gloss rather than prose describing a layout.
               The search runs across all three whatever is selected, because a
               reader asking "is there a skill for X" does not care which set
               answers. Matching is on the name and the trigger description, the
               words of the task rather than the slug. -->
          <section x-show="mapTab==='skills'">
            <!-- The chip is absent on Estate, and that is the honest reading:
                 the other two sets each render one committed carrier, and the
                 estate is every repo's own manifest, which is not a file to
                 link. The gloss says where those rows come from. -->
            <div class="flex items-center gap-2 mb-4 flex-wrap" x-show="skillSet !== 'estate'">
              ${regChip('skillManifestPath')}
            </div>

            <div x-show="skillsLoading" class="flex justify-center py-10">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <div x-show="skillsErr" class="text-base text-error font-mono" x-text="skillsErr"></div>

            <template x-if="skillsReg">
              <div class="">
                <div class="flex items-center gap-3 flex-wrap mb-3">
                  <label class="input input-sm input-bordered flex items-center gap-2 grow max-w-md">
                    <i class="ph ph-magnifying-glass opacity-40"></i>
                    <!-- data-find-box: the Skills tab's own search, so a bare
                         keystroke narrows the skills rather than opening the
                         sidebar finder (the shell's wireAppTypeahead). -->
                    <input type="search" class="grow" placeholder="search name and trigger text"
                           data-find-box x-model="skillQ">
                  </label>
                  <span class="text-sm">
                    <span class="font-semibold text-lg" x-text="skillTally.shown"></span>
                    <span class="text-base-content/50"
                          x-text="skillTally.shown === skillTally.total ? ' skills' : ' of ' + skillTally.total + ' skills'"></span>
                  </span>
                </div>

                <!-- The set control: the primary axis, so it is a segmented
                     control rather than the badge strip the subject groups
                     use. Its gloss is the only prose on the tab, and it says
                     what the selected set costs a session. -->
                <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 mb-1 w-fit flex-wrap">
                  <button @click="skillSet = ''"
                          class="px-3 py-1 rounded-md text-base font-medium transition-colors"
                          :class="!skillSet ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                    All</button>
                  <template x-for="c in skillSetCounts" :key="c.key">
                    <button @click="skillSet = (skillSet === c.key ? '' : c.key)"
                            class="flex items-center gap-1.5 px-3 py-1 rounded-md text-base font-medium transition-colors"
                            :class="skillSet === c.key ? 'bg-base-100 text-primary shadow-sm'
                                    : (c.n ? 'text-base-content/60 hover:text-base-content' : 'text-base-content/30')"
                            :title="c.gloss">
                      <span x-text="c.label"></span>
                      <span class="opacity-50" x-text="c.n"></span></button>
                  </template>
                </div>
                <p class="text-sm text-base-content/50 mb-4" x-text="skillSetGloss(skillSet)"></p>

                <!-- The subject groups. They are the LIBRARY's axis, authored
                     on its manifest, so the strip goes away when the library is
                     out of view rather than sitting there cutting nothing.
                     Counts re-weight under the query, so a search shows WHERE
                     its matches live before you read one, and a group at nought
                     is dimmed rather than dropped: a disappearing strip is a
                     moving target to click at. -->
                <div class="flex flex-wrap items-center gap-1.5 mb-4" x-show="showSkillSet('library')">
                  <button @click="skillGroup = ''"
                          class="badge badge-sm cursor-pointer transition-colors"
                          :class="!skillGroup ? 'badge-primary' : 'badge-ghost hover:badge-neutral'">
                    All <span class="ml-1 opacity-60" x-text="(skillsReg || []).length"></span></button>
                  <template x-for="g in skillGroupCounts" :key="g.key">
                    <button @click="skillGroup = (skillGroup === g.key ? '' : g.key)"
                            class="badge badge-sm cursor-pointer transition-colors"
                            :class="skillGroup === g.key ? 'badge-primary'
                                    : (g.n ? 'badge-ghost hover:badge-neutral' : 'badge-ghost opacity-30')"
                            :title="g.gloss">
                      <span x-text="g.label"></span>
                      <span class="ml-1 opacity-60" x-text="g.n"></span></button>
                  </template>
                </div>

                <!-- One empty state, over whatever sets are in view. It used
                     to be two, split on whether the library or the estate had
                     answered, which was a way of saying "a miss in one set is
                     not a gap" before the sets were a control that says so. -->
                <div x-show="!skillTally.shown" class="text-base text-base-content/40 py-6">
                  Nothing matches<span x-show="skillSet" x-text="' in the ' + skillSetLabel(skillSet).toLowerCase()"></span>.
                  The trigger text is what a session reads, so a miss here is a real gap rather
                  than a naming problem.
                </div>

                <!-- Plugin. Rows come from the Portable tab's manifest, so the
                     command is the one a session actually types and the role is
                     that registry's one-liner rather than a second copy here. -->
                <div class="flex flex-col gap-2 mb-6"
                     x-show="showSkillSet('plugin') && pluginSkillRows.length">
                  <div class="flex items-baseline gap-2 flex-wrap">
                    <span class="text-sm font-semibold uppercase tracking-wide text-base-content/50">In the plugin</span>
                    <span class="text-sm text-base-content/30" x-text="pluginSkillRows.length"></span>
                    <span class="text-sm text-base-content/40 grow min-w-0 truncate">installed in every session, and firing on its own</span>
                  </div>
                  <template x-for="s in pluginSkillRows" :key="s.path">
                    <div class="border border-base-300 rounded-lg p-3 bg-base-100">
                      <div class="flex items-baseline gap-2 flex-wrap">
                        <a x-blob="peek(s.path)"
                           class="font-mono font-semibold hover:text-primary" x-text="s.title"></a>
                        <em x-show="skillUseLabel(s.command)" class="text-sm not-italic text-base-content/40"
                            :class="skillUse(s.command) ? '' : 'text-warning/70'"
                            :title="skillUseHint(s.command)" x-text="skillUseLabel(s.command)"></em>
                        <span class="grow"></span>
                        <code class="text-sm text-primary/80" x-text="s.command"></code>
                      </div>
                      <p class="text-base text-base-content/60 mt-1" x-text="setRole(s)"></p>
                    </div>
                  </template>
                </div>

                <div class="flex flex-col gap-6" x-show="showSkillSet('library')">
                  <template x-for="sec in skillSections" :key="sec.key">
                    <div>
                      <div class="flex items-baseline gap-2 flex-wrap mb-2">
                        <span class="text-sm font-semibold uppercase tracking-wide text-base-content/50"
                              x-text="sec.label"></span>
                        <span class="text-sm text-base-content/30" x-text="sec.rows.length"></span>
                        <span class="text-sm text-base-content/40 grow min-w-0 truncate" x-text="sec.gloss"></span>
                      </div>
                      <div class="flex flex-col gap-2">
                        <template x-for="s in sec.rows" :key="s.name">
                          <div class="border border-base-300 rounded-lg p-3 bg-base-100">
                            <div class="flex items-baseline gap-2 flex-wrap">
                              <a x-blob="peek('skills/' + s.name + '/SKILL.md')"
                                 class="font-mono font-semibold hover:text-primary" x-text="s.name"></a>
                              <em x-show="skillUseLabel(s.name)" class="text-sm not-italic text-base-content/40"
                                  :class="skillUse(s.name) ? '' : 'text-warning/70'"
                                  :title="skillUseHint(s.name)" x-text="skillUseLabel(s.name)"></em>
                              <span class="grow"></span>
                              <code class="text-sm text-primary/80" x-text="'/load-skill ' + s.name"></code>
                            </div>
                            <p class="text-base text-base-content/60 mt-1" x-text="s.description"></p>
                          </div>
                        </template>
                      </div>
                    </div>
                  </template>
                </div>

                <!-- The estate set. No description column, and not an
                     oversight: a trigger description lives in each SKILL.md,
                     and fetching a dozen files across the estate to fill a
                     column is the cost the manifest declaration exists to
                     avoid. The name links the file, which is one tap.

                     The empty estate is two different facts, and rendering
                     nothing said neither: the tab then read exactly as it did
                     before the estate existed, which is how a reader concludes
                     a change did not land. The gloss above already says where
                     these come from, so it is not repeated here. -->
                <div x-show="showSkillSet('estate') && !hasToken()" class="mt-8 text-sm text-base-content/40">
                  <span class="font-semibold uppercase tracking-wide text-base-content/40">In the estate</span>
                  <p class="mt-1">Sign in to read what other repos have committed. The plugin and the library
                  are public; the estate reads the private registry's crawl.</p>
                </div>
                <div x-show="showSkillSet('estate') && hasToken() && estateSkills && !estateSkills.length"
                     class="mt-8 text-sm text-base-content/40">
                  <span class="font-semibold uppercase tracking-wide text-base-content/40">In the estate</span>
                  <p class="mt-1">No repo declares a <code>skills</code> key in its .web-tools.json yet, so the
                  crawl has nothing to collect. Each repo declares its own, and the aggregate appears
                  here once the crawl next runs.</p>
                </div>

                <template x-if="showSkillSet('estate') && estateSkills && estateSkills.length">
                  <div class="mt-8">
                    <div class="flex items-center gap-3 flex-wrap mb-3">
                      <span class="text-sm font-semibold uppercase tracking-wide text-base-content/40">In the estate</span>
                      <span class="text-sm text-base-content/50">
                        <span class="font-semibold text-lg" x-text="estateSkillTotals.skills"></span>
                        <span x-text="' across ' + estateSkillTotals.repos +
                                      (estateSkillTotals.repos === 1 ? ' repo' : ' repos')"></span></span>
                      <span x-show="estateSkillTotals.forked" class="badge badge-warning badge-sm"
                            title="A copy of a hub skill. The plugin ships the current version to that repo already, so the committed copy is what fires and what ages.">
                        <span x-text="estateSkillTotals.forked"></span> forked</span>
                    </div>
                    <div class="flex flex-col gap-3">
                      <template x-for="g in estateSkillGroups" :key="g.repo">
                        <div>
                          <a :href="'https://github.com/' + g.repo + '/tree/main/.claude/skills'"
                             target="_blank" rel="noopener"
                             class="font-mono text-sm text-base-content/60 hover:text-primary inline-flex items-center gap-1.5">
                            <i class="ph ph-folder"></i><span x-text="g.short"></span>
                            <span class="opacity-40" x-text="g.skills.length"></span></a>
                          <div class="flex flex-wrap gap-1.5 mt-1">
                            <template x-for="s in g.skills" :key="s.name">
                              <a :href="'https://github.com/' + s.repo + '/blob/main/.claude/skills/' + s.name + '/SKILL.md'"
                                 target="_blank" rel="noopener"
                                 class="badge badge-sm font-mono hover:badge-primary transition-colors"
                                 :class="s.origin === 'forked' ? 'badge-warning' : 'badge-ghost'"
                                 :title="s.origin === 'forked'
                                   ? 'A copy of a hub skill, so it fires instead of the current version and ages against it.'
                                   : 'Grown in this repo. Its subject is local, so the hub does not ship it and should not.'"
                                 x-text="s.name"></a>
                            </template>
                          </div>
                        </div>
                      </template>
                      <p x-show="skillQ.trim() && !estateSkillGroups.length"
                         class="text-base text-base-content/40">No estate skill matches.</p>
                    </div>
                  </div>
                </template>
              </div>
            </template>
          </section>

          <!-- ── Registries: the table the other seven tabs hang off ───────
               Every other tab renders ONE manifest. This renders the table
               that says what a manifest IS: its file, target grain, scope,
               gate, and the two enforcement layers. It is the index, not an
               eighth peer, which is why it sits last and why each row links
               out to the tab that renders it where one exists.
               No backticks anywhere in this template: it is a JS template
               literal, and one would end it mid-markup. -->
          <section x-show="mapTab==='registries'">
            <div class="flex items-center gap-2 mb-5 flex-wrap">
              ${regChip('PROPS_MANIFEST')}
${regChip('PROPS_DECLS')}${regChip('PROPS_VOCAB')}
              <a x-blob="peek(PROPS_DOC)"
                 class="text-base-content/30 hover:text-primary"
                 title="docs/registries.md: the model, and what reconciliation found">
                <i class="ph ph-book-open-text"></i></a>
              <a x-blob="peek(SPAN_DOC)"
                 class="text-base-content/30 hover:text-primary"
                 title="docs/estate-span.md: what the hub knows about the rest of the estate, and the measurement behind the span column">
                <i class="ph ph-globe-hemisphere-west"></i></a>
            </div>
            <p class="text-sm text-base-content/50 mb-3">
              A registry is one committed file holding a row per thing it describes, and one
              property about one thing answers to exactly one registry. Every field defines
              itself: the index governs its own carriers, so what a column means and what it
              may hold are rows in it rather than prose somewhere else.
            </p>

            <!-- The legend, and the reason it is a component rather than a
                 paragraph: every line of it is committed data with a gate
                 behind it. A prose version was maintained in registries.md and
                 its rows duplicated glosses committed in the pair, which is the
                 copy that drifts. Closed by default on both grains, since a
                 reader who knows the model should meet the cards first. -->
            <div class="flex flex-col gap-1 mb-5">
              <template x-for="lg in [
                  { key: 'reg', label: 'What a registry row records', rows: registryLegend, file: PROPS_MANIFEST },
                  { key: 'prop', label: 'What a property chip records', rows: propertyLegend, file: PROPS_DECLS }
                ]" :key="lg.key">
                <details class="border border-base-300 rounded-lg bg-base-100/60">
                  <summary class="cursor-pointer px-3 py-2 text-sm text-base-content/60 hover:text-base-content flex items-baseline gap-2">
                    <span x-text="lg.label"></span>
                    <span class="badge badge-ghost badge-sm font-mono" x-text="lg.rows.length"></span>
                    <span class="grow"></span>
                    <span class="font-mono text-[11px] opacity-40" x-text="lg.file"></span>
                  </summary>
                  <div class="px-3 pb-3 flex flex-col gap-2">
                    <template x-for="d in lg.rows" :key="d.property">
                      <div class="text-sm">
                        <span class="font-mono font-semibold text-base-content/70" x-text="d.property"></span>
                        <span class="badge badge-ghost badge-sm ml-1.5" x-text="d.mode"></span>
                        <span class="badge badge-ghost badge-sm" x-text="d.required"></span>
                        <div class="text-base-content/60" x-text="d.gloss"></div>
                        <!-- A closed domain's values, each with the gloss the
                             domain column cannot carry. This is the layer that
                             was living in prose: what computed means against
                             curated, what value means against counted. -->
                        <div x-show="d.domain.length" class="mt-1 flex flex-col gap-0.5 pl-3 border-l border-base-300">
                          <template x-for="v in d.domain" :key="v.value">
                            <div>
                              <span class="font-mono text-sm text-primary/80" x-text="v.label"></span>
                              <span x-show="v.gloss" class="text-sm text-base-content/50" x-text="' ' + v.gloss"></span>
                            </div>
                          </template>
                        </div>
                      </div>
                    </template>
                  </div>
                </details>
              </template>
            </div>
            <div x-show="propsLoading" class="flex justify-center py-10">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <div x-show="propsErr" class="text-base text-error font-mono" x-text="propsErr"></div>
            <template x-if="propsReg">
              <div class="">
                <div class="flex items-center gap-4 flex-wrap mb-5 text-sm">
                  <span><span class="font-semibold text-lg" x-text="registryTotals.registries"></span> registries</span>
                  <span class="text-base-content/50"><span x-text="registryTotals.computed"></span> computed / <span x-text="registryTotals.curated"></span> curated</span>
                  <span x-show="registryTotals.inheriting" class="text-base-content/50"><span x-text="registryTotals.inheriting"></span> inheriting</span>
                  <span class="text-base-content/50"><span x-text="registryTotals.gated"></span> gated</span>
                  <span class="text-base-content/50"
                        title="Registries whose population extends past this repository, so this checkout is an aggregate rather than the whole set. The rest are bounded by this repo and say nothing about the estate.">
                    <span x-text="registryTotals.estate"></span> of <span x-text="registryTotals.registries"></span> span the estate</span>
                  <span class="text-base-content/50"><span x-text="registryTotals.decls"></span> properties, <span x-text="registryTotals.closed"></span> with a closed domain</span>
                  <span x-show="registryTotals.unrendered" class="text-warning"
                        title="Registry files no code under lib/, pages/ or app/ names: committed and gated, read by nobody. The number this tab exists to make impossible to ignore.">
                    <span x-text="registryTotals.unrendered"></span> with no app surface</span>
                </div>
                <template x-for="area in registryAreas" :key="area.key">
                  <div class="mb-6">
                    <div class="flex items-baseline gap-2 mb-1">
                      <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40" x-text="area.label"></h3>
                      <span class="badge badge-ghost badge-sm font-mono" x-text="area.rows.length"></span>
                    </div>
                    <p class="text-sm text-base-content/50 mb-3" x-text="area.rule"></p>
                    <div class="flex flex-col gap-3">
                      <template x-for="r in area.rows" :key="r.id">
                        <div class="border border-base-300 rounded-lg p-3 bg-base-100">
                          <div class="flex items-baseline gap-2 flex-wrap">
                            <span class="font-semibold" x-text="r.title"></span>
                            <span class="badge badge-sm" :class="r.membership === 'computed' ? 'badge-success' : 'badge-info'" x-text="r.membership"></span>
                            <span x-show="r.inherits" class="badge badge-sm badge-ghost"
                                  :title="'descriptions inherited from ' + r.inherits"
                                  x-text="'inherits ' + r.inherits"></span>
                            <!-- Only estate gets a badge. Hub is the default
                                 and eighteen of twenty-two, so badging it would
                                 be noise on every card; the strip above carries
                                 both counts, which is where a reader compares. -->
                            <span x-show="r.span === 'estate'" class="badge badge-sm badge-accent"
                                  title="The population extends past this repository, so this carrier is an aggregate and a complete enumeration needs the other repos read.">estate</span>
                            <span class="grow"></span>
                            <span x-show="!(r.renders_in || []).length" class="badge badge-warning badge-sm"
                                  title="No file under lib/, pages/ or app/ names this registry's file in code, so nothing in the app reads or shows it. A GitHub-rendered projection or a runtime-configured read does not count, and may be the honest answer; the badge asks the question rather than settling it.">no app surface</span>
                            <!-- The word none is a VALUE here, not an absence:
                                 CSV cannot tell a blank from an empty string, so
                                 the domain spells out checked-and-nothing-holds-
                                 it. A truthiness test reads that as a gate and
                                 links a file of that name; the totals strip had
                                 it right and this did not, which is the argument
                                 for one predicate over two readings of one
                                 column. -->
                            <a x-show="hasGate(r)" x-blob="peek(r.gate)"
                               class="text-base-content/30 hover:text-primary" :title="'Gated by ' + r.gate">
                              <i class="ph ph-shield-check text-lg"></i></a>
                            <span x-show="!hasGate(r)" class="badge badge-warning badge-sm"
                                  title="Nothing fails when this registry and the repo disagree">no gate</span>
                          </div>
                          <p class="text-base text-base-content/70 mt-1" x-text="r.gloss"></p>
                          <div class="flex items-baseline gap-2 flex-wrap mt-2">
                            <span class="font-mono text-sm text-base-content/30" x-text="r.id"></span>
                            <a x-blob="peek(r.file)"
                               class="font-mono text-sm text-base-content/60 hover:text-primary" x-text="r.file"></a>
                          </div>
                          <!-- The identity line: which column names a row, and
                               which name space that column resolves into. It is
                               here because the ownership rule is only checkable
                               with it (the same page is annotate.html to the
                               page gallery and pages/annotate.html to the Tools
                               gallery), and a card showing that rule's warnings
                               while hiding the field it runs on was asking the
                               reader to take the gate on faith. A blank identity
                               is a real answer, not a gap: an opaque key never
                               collides, so the row says so. -->
                          <div class="flex items-baseline gap-2 flex-wrap mt-1 text-sm">
                            <span class="font-semibold text-base-content/40">keyed by</span>
                            <span class="font-mono text-base-content/70" x-text="r.key"></span>
                            <span class="text-base-content/40" x-text="r.identity
                              ? 'in ' + r.identity
                              : 'opaque, comparable to nothing'"></span>
                            <span x-show="r.fields !== 'governed'" class="badge badge-warning badge-sm"
                                  :title="'fields: ' + r.fields" x-text="r.fields"></span>
                          </div>
                          <!-- Where the registry's contents reach a reader: the derived
                               renders_in list, each file a peekable GitHub jump. Short name
                               shown, full path in the title, because every app file's tail
                               is unique here and the row is already dense. -->
                          <div x-show="(r.renders_in || []).length" class="flex items-baseline gap-1.5 flex-wrap mt-1">
                            <span class="text-sm font-semibold text-base-content/40">renders in</span>
                            <template x-for="f in (r.renders_in || [])" :key="f">
                              <a x-blob="peek(f)"
                                 class="badge badge-ghost badge-sm font-mono hover:badge-primary transition-colors"
                                 :title="f" x-text="f.split('/').pop()"></a>
                            </template>
                          </div>
                          <p class="text-sm text-base-content/50 mt-1">
                            <span class="font-semibold text-base-content/40">asserts about</span> <span x-text="r.target"></span></p>
                          <p class="text-sm text-base-content/50 mt-0.5" x-text="r.scope"></p>
                          <div class="flex items-center gap-3 mt-2 text-sm text-base-content/50 flex-wrap">
                            <span><span class="font-semibold text-base-content/70" x-text="r.decls.length"></span> properties</span>
                            <span x-show="r.nValue"><span x-text="r.nValue"></span> required</span>
                            <span x-show="r.nCounted"><span x-text="r.nCounted"></span> counted</span>
                            <span x-show="r.nClosed"><span x-text="r.nClosed"></span> closed domain</span>
                            <span x-show="r.nComputed"><span x-text="r.nComputed"></span> computed</span>
                          </div>
                          <!-- The properties themselves, defined rather than
                               counted. They were chips carrying their gloss in a
                               title attribute, which is no affordance at all on
                               a touch device and one hover at a time on a
                               desktop: the definition was committed, rendered,
                               and unreachable. A median registry declares six
                               and the longest fourteen, so there was never a
                               room problem, only an assumption that a name is
                               enough. -->
                          <div class="flex flex-col gap-0.5 mt-2 pl-2 border-l border-base-300">
                            <template x-for="d in r.decls" :key="d.property">
                              <div class="text-sm leading-snug">
                                <span class="font-mono font-semibold text-base-content/70" x-text="d.property"></span>
                                <span x-show="d.mode === 'computed'"
                                      class="badge badge-success badge-xs align-middle ml-1">computed</span>
                                <span x-show="d.required === 'none'"
                                      class="badge badge-ghost badge-xs align-middle ml-1"
                                      title="optional, or filled by practice with no gate behind it">optional</span>
                                <!-- Which KIND of prose the column holds, from
                                     the text-field vocabulary. An alias resolves
                                     to its kind and is shown the same way,
                                     because an alias conforms: the tab has no
                                     business inventing a warning the gate
                                     deliberately does not raise. -->
                                <span x-show="d.textKind" class="badge badge-outline badge-xs align-middle ml-1"
                                      :title="'a ' + d.textKind + '-kind prose field (docs/text-fields.csv)'"
                                      x-text="d.textKind"></span>
                                <span class="text-base-content/50" x-text="' ' + d.gloss"></span>
                                <span x-show="d.values" class="text-primary/70 font-mono"
                                      x-text="d.values ? ' [' + d.values.join(' | ') + ']' : ''"></span>
                              </div>
                            </template>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>
                </template>
              </div>
            </template>
          </section>

          <!-- ── Tests ───────────────────────────────────────────────────────
               The documents registry pointed at the suite. The runner reports a
               pass total that cannot distinguish a boot-smoke check from an
               adversarial gate, so the count alone sends nobody anywhere. The
               strip cuts the same total by KIND, which is the axis that says
               what a pass is worth, and each count filters.
               Two figures are deliberately not summed into a headline: a
               browser check's assertions (null, not zero, since test() is not
               its unit) and boot smoke (reported beside the total rather than
               subtracted from it, because a boot check is cheap evidence, not
               no evidence).
               No backticks anywhere in this template: it is a JS template
               literal, and one would end it mid-markup. -->
          <section x-show="mapTab==='tests'">
            <div class="flex items-center gap-2 mb-5 flex-wrap">
              ${regChip('TESTS_MANIFEST')}
              <a x-blob="peek(TESTS_BUILDER)"
                 class="text-base-content/30 hover:text-primary"
                 title="tools/build/tests-index.mjs stamps assertions, method, runner and boot_smoke; kind and protects are authored">
                <i class="ph ph-function"></i></a>
              <!-- The door into the suite as the strip has cut it: the deck
                   pages what the filters left, in the order the groups render,
                   so a reader who has picked "gate" reads the gates. -->
              <button type="button" x-show="testShown.length"
                      @click="openTestDeck(testShown[0])"
                      class="btn btn-square btn-sm max-sm:h-11 max-sm:w-11 btn-ghost hover:text-primary"
                      :title="'Read ' + plural(testShown.length, 'check') + ' one at a time'">
                <i class="ph ph-cards-three text-lg max-sm:text-xl"></i></button>
            </div>
            <div x-show="testsLoading" class="flex justify-center py-10">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <div x-show="testsErr" class="text-base text-error font-mono" x-text="testsErr"></div>
            <template x-if="testsReg">
              <div class="flex flex-col gap-8">

                <div class="flex flex-col gap-2">
                  <!-- The header line: what is true of the whole registry. The
                       names toggle lives here, not in the filter block below,
                       because it does not narrow anything; it was read as a
                       third filter row when it sat among the chips and wrapped. -->
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm text-base-content/40 tabular-nums"
                          :title="'Top-level test() calls across the suite. Browser checks are excluded: they assert with their own harness, so test() is not their unit.'"
                          x-text="testTotals.files + ' files · ' + testTotals.assertions.toLocaleString() + ' assertions'"></span>
                    <div class="grow"></div>
                    <button type="button" x-show="testPicked.length" @click="clearDims()"
                            class="text-sm text-base-content/50 hover:text-primary px-2 py-1">clear filters</button>
                    <!-- One toggle for the whole registry, the same call the docs
                         registry makes about maintenance: the assertion list is
                         either the question you are asking or it is noise, and a
                         per-row disclosure would mean tapping 119 times. -->
                    <button type="button" @click="testNames = !testNames"
                            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors text-base"
                            :class="testNames ? 'border-primary bg-primary/10' : 'border-base-300 hover:bg-base-200'"
                            title="Show what each file's assertions are named, read from its test() calls">
                      <i class="ph ph-list-bullets"></i><span>names</span></button>
                  </div>

                  <!-- One labeled row per dimension. The label is the fix for
                       two strips of pills that looked like rivals: they are
                       different questions and they compose.
                       A block-level legend naming the two counts sat here until
                       2026-08-10 and was retired: it could sit beside neither
                       number, so it asked the reader to hold an order in their
                       head across a wrapping strip. Each number names itself on
                       hover instead. Not a slash either way: 13/69 reads as "13
                       of 69", a ratio between like things, and these are counts
                       of two different units. -->
                  <template x-for="d in testDimensions" :key="d.key">
                    <div class="flex items-baseline gap-2 flex-wrap">
                      <span class="text-sm uppercase tracking-wide text-base-content/30 w-16 shrink-0"
                            :title="d.question" x-text="d.label"></span>
                      <template x-for="c in d.chips" :key="c.value">
                        <button type="button" @click="toggleDim(d.key, c.value)" :title="c.hint"
                                class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors"
                                :class="testPick[d.key] === c.value ? 'border-primary bg-primary/10' : 'border-base-300 hover:bg-base-200'">
                          <!-- The tone marker, kind only. It reads as a colour
                               key rather than as a tinted number, which is what
                               the badge it replaced had become: the badge made
                               one dimension's chips a different shape from the
                               other two, for a colour the word beside it already
                               carried. -->
                          <span x-show="c.dot" class="w-2 h-2 rounded-full shrink-0" :class="c.dot"></span>
                          <span class="text-base" x-text="c.value"></span>
                          <!-- The two counts are different units, so they read as
                               one tight pair and each names itself on hover. That
                               is what retired the legend above the block: a label
                               naming both, once, could sit beside neither. They
                               sit at badge scale, a step below the value they
                               qualify, so the word being picked stays what the
                               chip leads with. -->
                          <span class="flex items-baseline gap-0.5">
                            <span class="text-xs tabular-nums text-base-content/50"
                                  :title="c.files + ' files'" x-text="c.files"></span>
                            <span class="text-xs text-base-content/40 px-0.5">|</span>
                            <span class="text-xs tabular-nums text-base-content/40"
                                  :title="c.counted ? c.assertions + ' assertions' : 'No assertion count: driven by a real browser and asserting in its own harness, so test() is not its unit'"
                                  x-text="c.counted ? c.assertions : 'n/a'"></span>
                          </span>
                        </button>
                      </template>
                    </div>
                  </template>

                  <template x-for="d in testPicked" :key="d.key">
                    <p class="text-sm text-base-content/50">
                      <span class="text-base-content/30" x-text="d.label + ' ' + testPick[d.key] + ': '"></span><span
                            x-text="d.hint(testPick[d.key], testsReg)"></span>
                    </p>
                  </template>
                </div>

                <div class="grid gap-x-8 gap-y-6 lg:grid-cols-2">
                  <template x-for="grp in testGroups" :key="grp.method">
                    <div>
                      <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-2">
<!-- Say which axis this is. The badge on every row below is a KIND,
                             and a bare "KIT" heading over a row badged "behavior"
                             reads as a contradiction rather than as two
                             orthogonal classifications. -->
                        <span class="font-normal text-base-content/30">method</span>
                        <span x-text="grp.method"></span>
                        <span class="font-normal normal-case text-base-content/30" x-text="'· ' + grp.hint"></span>
                      </h3>
                      <div class="flex flex-col gap-1">
                        <template x-for="t in grp.tests" :key="t.path">
                          <div class="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-base-200/60 group">
                            <i class="ph mt-1 text-base-content/40 shrink-0"
                               :class="t.runner === 'suite' ? 'ph-flask' : 'ph-browser'" :title="t.runner"></i>
                            <div class="min-w-0 flex-1">
                              <div class="flex items-center gap-2 flex-wrap">
                                <button type="button" class="text-base font-medium hover:text-primary text-left"
                                        :title="'Read ' + t.path + ' here'"
                                        @click="openTestDeck(t)" x-text="testTitle(t)"></button>
                                <span class="badge badge-sm badge-outline" :class="kindTone(t.kind)" x-text="t.kind"></span>
                                <span class="text-sm tabular-nums text-base-content/40"
                                      x-text="t.assertions === null ? 'browser' : t.assertions"></span>
                                <!-- Guard on length, not on the array: boot_smoke
                                     became a list of indices and an empty array
                                     is truthy, so a bare x-show would badge every
                                     row in the registry. -->
                                <span x-show="t.boot_smoke?.length" class="text-sm text-warning/70 tabular-nums"
                                      :title="'assertions that only check the component mounts; turn on names to see which'"
                                      x-text="t.boot_smoke?.length + ' smoke'"></span>
                              </div>
                              <p class="text-base text-base-content/60" x-text="t.protects"></p>
                              <!-- The file's own account of its coverage. Read
                                   from the test() calls rather than authored, so
                                   it cannot drift from the file the way the
                                   sentence above can. A name carrying a template
                                   interpolation stands for several runtime
                                   tests, which is why this row's count can read
                                   lower than what the runner reports. -->
                              <ol x-show="testNames && t.assertion_names"
                                  class="mt-1.5 flex flex-col gap-1 border-l border-base-300 pl-3">
                                <template x-for="(n, i) in (t.assertion_names || [])" :key="i">
                                  <li class="flex gap-2 text-sm"
                                      :class="smokeSet(t).has(i) ? 'text-base-content/40' : 'text-base-content/70'">
                                    <span class="tabular-nums text-base-content/20 shrink-0" x-text="i + 1"></span>
                                    <span x-text="n"></span>
                                    <!-- Marked on the line it is true of. A boot
                                         check is a property of THIS assertion,
                                         not of the file, and the file-level chip
                                         it replaced could not say whether its
                                         number counted files or assertions. -->
                                    <span x-show="smokeSet(t).has(i)"
                                          class="text-warning/70 shrink-0"
                                          title="A boot check: it proves the component mounted and logged nothing, and nothing more.">smoke</span>
                                  </li>
                                </template>
                              </ol>
                              <p x-show="t.runner !== 'suite'" class="text-sm text-base-content/40">
                                <code x-text="t.runner"></code></p>
                            </div>
                            <a x-blob="peek(t.path)" title="Open on GitHub"
                               class="opacity-0 group-hover:opacity-100 focus:opacity-100 text-base-content/30 hover:text-primary transition-opacity shrink-0 mt-1">
                              <i class="ph ph-github-logo"></i></a>
                          </div>
                        </template>
                      </div>
                    </div>
                  </template>
                </div>

              </div>
            </template>
          </section>

          <!-- ── Harness ────────────────────────────────────────────────────
               The harness registry. Same shape as Tests one tab over: role is
               the authored judgment, the counts are derived, and a blank role
               renders in the warning tone rather than being hidden, because
               the ledger of unaccounted files is the number this tab exists
               to show. No backticks anywhere in this template. -->
          <section x-show="mapTab==='harness'">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              ${regChip('TOOLS_MANIFEST')}
              <a x-blob="peek(TOOLS_BUILDER)"
                 class="text-base-content/30 hover:text-primary"
                 title="tools/build/tools-index.mjs stamps every field but role from the tree">
                <i class="ph ph-function"></i></a>
            </div>
            <p class="text-sm text-base-content/50 mb-5">
              The role line is authored in the registry; every badge and count is
              measured from the tree.
            </p>
            <div x-show="toolsLoading" class="flex justify-center py-10">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <div x-show="toolsErr" class="text-base text-error font-mono" x-text="toolsErr"></div>
            <template x-if="toolsReg">
              <div class="flex flex-col gap-6">

                <!-- The invocation pills are a FILTER layer, not the structure:
                     the structure is the folder rail below, which is the tree
                     as it exists on disk. Same split as the Docs tab, where
                     reach filters and folders orient. Picking a pill
                     re-weights the rail counts, so "where do the drivers
                     live" is one tap. -->
                <div class="flex items-center gap-2 flex-wrap">
                  <template x-for="r in harnessInvokeCounts" :key="r.key">
                    <button type="button" @click="toggleHarnessInvoke(r.key)" :title="r.gloss"
                            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors"
                            :class="harnessInvoke === r.key ? 'border-primary bg-primary/10' : 'border-base-300 hover:bg-base-200'">
                      <span class="badge badge-sm" :class="r.tone" x-text="r.n"></span>
                      <span class="text-base" x-text="r.key"></span>
                    </button>
                  </template>
                  <button type="button" x-show="harnessInvoke" @click="harnessInvoke = ''"
                          class="text-sm text-base-content/50 hover:text-primary px-2 py-1">show all</button>
                  <div class="grow"></div>
                  <span class="text-sm text-base-content/40 tabular-nums"
                        x-text="toolTotals.files + ' files · ' + toolTotals.named + ' named · ' + toolTotals.tested + ' tested' + (toolTotals.blank ? ' · ' + toolTotals.blank + ' roles unstated' : '')"></span>
                </div>

                <div class="flex flex-col lg:flex-row gap-6">
                  <!-- The folder rail: the tree as it exists on disk, scripts/
                       and tools/ as the two roots, counts rolled up to
                       ancestors. The amber number is the folder's unstated
                       roles, the registry's one warning figure. -->
                  <nav class="lg:w-80 shrink-0" aria-label="harness folders">
                    <div class="flex flex-col gap-0.5">
                      <template x-for="f in harnessFolders" :key="f.dir">
                        <div class="flex items-center gap-1" :style="'margin-left:' + f.depth + 'rem'">
                          <button type="button" @click="harnessDir = f.dir"
                                  class="flex items-center gap-2 px-2 py-1.5 rounded-lg flex-1 min-w-0 text-left transition-colors"
                                  :class="harnessDir === f.dir ? 'bg-primary/10 text-primary' : (f.n ? 'hover:bg-base-200' : 'opacity-40 hover:bg-base-200')">
                            <i class="ph shrink-0" :class="harnessDir === f.dir ? 'ph-folder-open' : 'ph-folder'"></i>
                            <span class="text-base font-medium truncate" x-text="f.name"></span>
                            <span class="ml-auto text-sm tabular-nums shrink-0"
                                  :class="harnessDir === f.dir ? 'text-primary/70' : 'text-base-content/40'"
                                  x-text="f.n"></span>
                            <span class="text-sm text-warning/70 tabular-nums shrink-0 w-6 text-right"
                                  :title="f.blank + ' file(s) at or below this folder with no authored role'"
                                  x-text="f.blank || ''"></span>
                          </button>
                          <a :href="folderGh(f.dir)" target="_blank" rel="noopener"
                             :title="'Open ' + f.dir + ' on GitHub'"
                             class="text-base-content/30 hover:text-primary shrink-0 px-1">
                            <i class="ph ph-github-logo"></i></a>
                        </div>
                      </template>
                    </div>
                  </nav>

                  <!-- The selected folder: its glossary line from the registry,
                       then its own direct files; subfolders are one tap away
                       in the rail. -->
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap mb-1">
                      <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40" x-text="harnessDir + '/'"></h3>
                      <a :href="folderGh(harnessDir)" target="_blank" rel="noopener"
                         :title="'Open ' + harnessDir + ' on GitHub'"
                         class="text-base-content/30 hover:text-primary"><i class="ph ph-github-logo"></i></a>
                      <!-- Same door as the Docs tab's, over the same shape: a
                           folder rail, a selected folder, its direct files. -->
                      <button type="button" x-show="harnessDirFiles.length"
                              @click="openHarnessDeck(harnessDirFiles[0])"
                              class="btn btn-square btn-sm max-sm:h-11 max-sm:w-11 btn-ghost hover:text-primary"
                              :title="'Read ' + plural(harnessDirFiles.length, 'file') + ' one at a time'">
                        <i class="ph ph-cards-three text-lg max-sm:text-xl"></i></button>
                    </div>
                    <p x-show="harnessDirGloss" class="text-base text-base-content/60 mb-3" x-text="harnessDirGloss"></p>
                    <div class="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-1">
                      <template x-for="t in harnessDirFiles" :key="t.path">
                        <div class="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-base-200/60 group">
                          <i class="ph ph-terminal mt-1 text-base-content/40 shrink-0"
                             :title="t.emits ? 'emits: writes a file' : 'reads only'"></i>
                          <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2 flex-wrap">
                              <button type="button" class="text-base font-medium hover:text-primary text-left"
                                      :title="'Read ' + t.path + ' here'"
                                      @click="openHarnessDeck(t)" x-text="toolTitle(t)"></button>
                              <span class="badge badge-sm badge-outline" :class="invokeTone(t.invocation)"
                                    x-text="t.invocation"></span>
                              <span x-show="!t.named && t.invocation !== 'driver'"
                                    class="text-sm text-warning/70" title="no prose names this file">unnamed</span>
                              <span x-show="t.tested" class="text-sm text-base-content/40"
                                    title="a file under tools/test/ exercises it">tested</span>
                            </div>
                            <p class="text-base" :class="t.role ? 'text-base-content/60' : 'text-warning/70'"
                               x-text="t.role || 'role unstated'"></p>
                          </div>
                          <a x-blob="peek(t.path)" title="Open on GitHub"
                             class="opacity-0 group-hover:opacity-100 focus:opacity-100 text-base-content/30 hover:text-primary transition-opacity shrink-0 mt-1">
                            <i class="ph ph-github-logo"></i></a>
                        </div>
                      </template>
                    </div>
                    <p x-show="!harnessDirFiles.length" class="text-sm text-base-content/40">
                      No direct files here under the current filter; the counts on the rail include subfolders.
                    </p>
                  </div>
                </div>

              </div>
            </template>
          </section>

          <!-- ── Injection: what reaches a session at start, and what caps it ─
               The only tab reading a DATED READING rather than a registry, so
               it carries its measurement date in the header and gets no
               registry chip. Two figures here move with the environment: the
               sibling session-*.sh scripts print different amounts on
               different days, and project_instructions depends on which repos
               the session opened with. The finding the tab exists to show is
               the one nobody was looking for: CONVENTIONS.md and SURFACING.md
               arrive down BOTH channels, because web-tools/CLAUDE.md opens
               with @-imports of them, so the capped channel spends its whole
               allowance on a trimmed copy of what the uncapped one already
               delivered whole. -->
          <section x-show="mapTab==='injection'">
            <div class="flex items-center gap-2 mb-5 flex-wrap">
              ${chip('INJECTION', 'measured')}
              <span class="text-base text-base-content/50" x-show="injection"
                    x-text="'measured ' + injection?.measured"></span>
              <div class="grow"></div>
              <a :href="deliveryUrl" target="_blank" rel="noopener"
                 class="flex items-center gap-1.5 text-base text-base-content/60 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors"
                 title="The routes behind these bytes, current and planned (pages/delivery.html)">
                <i class="ph ph-path"></i><span>The routes</span>
              </a>
              <button type="button" @click="openHubFile('.claude/skills/hooks/inject-conventions.sh')"
                      class="flex items-center gap-1.5 text-base text-base-content/60 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors"
                      title="The script that trims and sends (.claude/skills/hooks/inject-conventions.sh)">
                <i class="ph ph-syringe"></i><span>The injector</span>
              </button>
            </div>
            <div x-show="injectionLoading" class="flex justify-center py-10">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <div x-show="injectionErr" class="text-base text-error font-mono" x-text="injectionErr"></div>
            <template x-if="injection">
              <div class="flex flex-col gap-8">

                <!-- One byte scale across both bars. Drawn together because
                     the finding is proportional: the channel everyone rations
                     is the smaller one. -->
                <div>
                  <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-3">Channels</h3>
                  <template x-for="c in injection.channels" :key="c.id">
                    <div class="mb-4">
                      <div class="flex items-baseline gap-2 flex-wrap">
                        <span class="font-semibold" x-text="c.label"></span>
                        <code class="text-base text-primary" x-text="c.total.toLocaleString() + ' bytes'"></code>
                        <span x-show="c.cap" class="text-base text-error"
                              x-text="'cap ' + (c.cap || 0).toLocaleString()"></span>
                        <span x-show="c.headroom !== null" class="text-base text-warning"
                              x-text="(c.headroom || 0).toLocaleString() + ' spare'"></span>
                        <span x-show="!c.cap" class="text-base text-base-content/40">uncapped, and unmeasured</span>
                        <span x-show="c.rung" class="text-base text-base-content/50" x-text="'rung ' + c.rung"></span>
                      </div>
                      <!-- Stacked by what actually makes the bar up. The hook's
                           document segments are the DELIVERED bytes, cut from the
                           payload at each document's H1, not the receipt's source
                           size: the receipts total 34,076 and the bar is 27,653,
                           so drawing them would overflow the channel it sits in. -->
                      <div class="relative h-7 mt-1.5 rounded bg-base-200">
                        <div class="absolute inset-y-0 left-0 flex gap-px rounded overflow-hidden"
                             :style="'width:' + injPct(c.total) + '%'">
                          <template x-for="g in c.segments" :key="g.label">
                            <div class="h-full"
                                 :class="[c.id === 'session_hook' ? 'bg-primary' : 'bg-secondary',
                                          g.kind === 'overhead' && 'opacity-40',
                                          injDup(g.path) && 'ring-2 ring-inset ring-warning/70']"
                                 :style="'flex:' + g.bytes + ' 1 0px; min-width:3px'"
                                 data-inj-seg
                                 @pointerenter="tipEnter(g, c, $event)"
                                 @pointerleave="tipLeave()"
                                 @click="tipTap(g, c, $event)"></div>
                          </template>
                        </div>
                        <div x-show="c.cap" class="absolute inset-y-0 w-0.5 bg-error"
                             :style="'left:' + injPct(c.cap) + '%'"></div>
                      </div>
                    </div>
                  </template>
                </div>

                <!-- WHAT ACTUALLY HAPPENED, from the session store. Everything
                     above measures this container; this measures every recorded
                     session, which is the only thing that can answer whether the
                     injector delivers what it was built to deliver. It does not:
                     SURFACING.md has never once arrived at the full rung. -->
                <div x-show="injObserved">
                  <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-2">Observed</h3>
                  <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
                    <span class="text-base" x-text="injObserved?.sessions + ' recorded sessions'"></span>
                    <span class="text-base text-base-content/50"
                          x-text="injObserved?.from + ' to ' + injObserved?.to"></span>
                    <span class="text-base text-base-content/50"
                          x-text="'of ' + injObserved?.scanned + ' records'"></span>
                    <span class="text-base text-warning" x-show="injObserved?.unhealed"
                          x-text="injObserved?.unhealed + ' awaiting re-crawl'"></span>
                    <code class="text-[11px] font-mono opacity-40" x-text="injObserved?.store"></code>
                  </div>
                  <!-- Leads the panel, and is the only row here that reports a
                       LOSS rather than a delivery. Everything below it is the
                       injector's account of what it supplied; this is the
                       harness's account of what it passed along, and when a
                       payload is cut the receipts ride in the discarded half,
                       so every row below can be complete for a session that
                       received none of it. -->
                  <div class="flex flex-col gap-1.5 mb-3" x-show="injObserved?.measuredCut">
                    <div class="border rounded-lg px-3 py-2 bg-base-100 flex items-baseline gap-2 flex-wrap"
                         :class="injObserved?.cut ? 'border-error/60' : 'border-base-300'">
                      <i class="ph" :class="injObserved?.cut ? 'ph-scissors text-error' : 'ph-check text-success'"></i>
                      <span class="text-base" x-text="injObserved?.cut
                        ? 'the payload was cut before it reached the session'
                        : 'the payload reached the session whole'"></span>
                      <span class="text-base text-base-content/50"
                            x-show="injObserved && injObserved.measuredCut < injObserved.sessions"
                            x-text="'of ' + injObserved?.measuredCut + ' that can say'"></span>
                      <div class="grow"></div>
                      <span class="text-base font-mono" :class="injObserved?.cut ? 'text-error' : 'text-base-content/60'"
                            x-text="injObserved?.cut + ' of ' + injObserved?.measuredCut"></span>
                    </div>
                  </div>

                  <div class="flex flex-col gap-1.5">
                    <template x-for="o in (injObserved?.documents || [])" :key="o.via + o.path">
                      <div class="border border-base-300 rounded-lg px-3 py-2 bg-base-100 flex items-baseline gap-2 flex-wrap"
                           :class="o.delivered?.primitives_only && 'border-warning/60'">
                        <span class="w-2 h-2 rounded-sm shrink-0"
                              :class="o.via === 'session_hook' ? 'bg-primary' : 'bg-secondary'"></span>
                        <code class="text-base" x-text="o.path"></code>
                        <template x-for="[k, n] in Object.entries(o.delivered || {})" :key="k">
                          <span class="text-base" :class="k === 'primitives_only' ? 'text-warning' : 'text-base-content/50'"
                                x-text="k === 'n/a' ? '' : k"></span>
                        </template>
                        <div class="grow"></div>
                        <span class="text-base font-mono text-base-content/50" x-show="o.sentMax != null"
                              x-text="injSent(o)"></span>
                        <span class="text-base font-mono text-base-content/60"
                              x-text="o.sessions + ' of ' + injObserved?.sessions"></span>
                      </div>
                    </template>
                    <div class="border border-error/50 rounded-lg px-3 py-2 bg-base-100 flex items-baseline gap-2 flex-wrap"
                         x-show="injObserved?.hook_silent">
                      <i class="ph ph-warning text-error"></i>
                      <span class="text-base">the session hook delivered nothing</span>
                      <div class="grow"></div>
                      <span class="text-base font-mono text-base-content/60"
                            x-text="injObserved?.hook_silent + ' of ' + injObserved?.sessions"></span>
                    </div>
                    <div class="border border-warning/60 rounded-lg px-3 py-2 bg-base-100 flex items-baseline gap-2 flex-wrap">
                      <i class="ph ph-copy text-warning"></i>
                      <span class="text-base">a document arrived down both channels</span>
                      <div class="grow"></div>
                      <span class="text-base font-mono text-base-content/60"
                            x-text="injObserved?.both_channels + ' of ' + injObserved?.sessions"></span>
                    </div>
                    <!-- Bytes sent is a newer field than the receipts carrying
                         it, so a blank column would read as "nothing was sent"
                         rather than "nobody said yet". Only shown while that is
                         still true of some session. -->
                    <div class="border border-base-300 rounded-lg px-3 py-2 bg-base-100 flex items-baseline gap-2 flex-wrap"
                         x-show="injObserved && injObserved.sized < injObserved.sessions">
                      <i class="ph ph-clock-countdown text-base-content/40"></i>
                      <span class="text-base text-base-content/60">reported the bytes it sent</span>
                      <div class="grow"></div>
                      <span class="text-base font-mono text-base-content/60"
                            x-text="injObserved?.sized + ' of ' + injObserved?.sessions"></span>
                    </div>
                    <div class="border border-base-300 rounded-lg px-3 py-2 bg-base-100 flex items-baseline gap-2 flex-wrap"
                         x-show="injObserved && injObserved.measuredCut < injObserved.sessions">
                      <i class="ph ph-clock-countdown text-base-content/40"></i>
                      <span class="text-base text-base-content/60">could say whether the payload arrived</span>
                      <div class="grow"></div>
                      <span class="text-base font-mono text-base-content/60"
                            x-text="injObserved?.measuredCut + ' of ' + injObserved?.sessions"></span>
                    </div>
                  </div>
                </div>

                <!-- Every document the two carriers report, so the pair that
                     arrives twice is visible as a pair rather than asserted. -->
                <div>
                  <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-2">What arrives</h3>
                  <div class="flex flex-col gap-1.5">
                    <template x-for="d in injection.documents" :key="d.via + d.path">
                      <div class="border border-base-300 rounded-lg px-3 py-2 bg-base-100 flex items-baseline gap-2 flex-wrap"
                           :class="injDup(d.path) && 'border-warning/60'">
                        <span class="w-2 h-2 rounded-sm shrink-0"
                              :class="d.via === 'session_hook' ? 'bg-primary' : 'bg-secondary'"></span>
                        <code class="text-base" x-text="d.path"></code>
                        <span class="text-base text-base-content/50" x-text="d.delivered"></span>
                        <span x-show="injDup(d.path)" class="text-base text-warning flex items-center gap-1">
                          <i class="ph ph-copy"></i>also on the other channel</span>
                        <div class="grow"></div>
                        <span class="text-base font-mono text-base-content/60" x-text="d.bytes.toLocaleString()"></span>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- Two caps, and the asymmetry between them is the whole
                     reason a session can lose its conventions without a word:
                     one degrades and announces, the other truncates in
                     silence. -->
                <div>
                  <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-2">Caps</h3>
                  <div class="flex flex-col gap-1.5">
                    <template x-for="c in injection.caps" :key="c.id">
                      <div class="border border-base-300 rounded-lg p-3 bg-base-100"
                           :class="!c.graceful && 'border-error/50'">
                        <div class="flex items-baseline gap-2 flex-wrap">
                          <span class="font-semibold" x-text="c.label"></span>
                          <code class="text-base text-primary" x-text="c.bytes.toLocaleString()"></code>
                          <span class="text-base text-base-content/50" x-text="c.owner + ', ' + c.basis"></span>
                        </div>
                        <p class="text-base mt-1 flex items-start gap-1.5"
                           :class="c.graceful ? 'text-success/80' : 'text-error/70'">
                          <i class="ph shrink-0 mt-0.5" :class="c.graceful ? 'ph-check-circle' : 'ph-warning'"></i>
                          <span x-text="c.over"></span></p>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- The ladder the injector walks down. Cutting prose moves
                     the payload UP a rung rather than banking the space,
                     because the budget cannot see the sibling scripts. -->
                <div>
                  <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-2">Rungs</h3>
                  <div class="flex flex-col gap-1.5">
                    <template x-for="r in injection.rungs" :key="r.rung">
                      <div class="border border-base-300 rounded-lg px-3 py-2 bg-base-100 flex items-baseline gap-2 flex-wrap"
                           :class="r.rung === injection.channels[0].rung && 'border-primary/50'">
                        <span class="font-semibold" x-text="'Rung ' + r.rung"></span>
                        <span x-show="r.rung === injection.channels[0].rung"
                              class="text-base text-primary">fires today</span>
                        <span class="text-base text-base-content/60" x-text="'withholds ' + r.withholds"></span>
                        <div class="grow"></div>
                        <span class="text-base font-mono text-base-content/60" x-text="r.output.toLocaleString()"></span>
                      </div>
                    </template>
                  </div>
                </div>

              </div>
            </template>

            <!-- The tooltip. Built rather than borrowed: the house style forbids
                 cursor-help, daisyUI's tooltip and data-tip, and every fact in
                 here is already in the list above, so this is a convenience
                 over rendered text rather than a place facts are parked. -->
            <div x-show="note.cell" x-cloak
                 class="fixed z-50 pointer-events-none border border-base-300 rounded-lg bg-base-100 shadow-lg px-3 py-2 max-w-xs"
                 :style="'left:' + note.x + 'px; top:' + note.y + 'px'">
              <div class="text-base break-all">
                <span x-text="note.cell ? themeBase(note.cell.row) : ''"></span>
                <span class="text-base-content/40"> and </span>
                <span x-text="note.cell ? themeBase(note.cell.col) : ''"></span>
              </div>
              <div class="text-base text-base-content/60 mt-1">
                <span x-show="note.cell?.e" class="tabular-nums">
                  <span x-text="note.cell?.e?.w"></span> shared
                  <span x-text="themeGraph?.shingle"></span>-word windows</span>
                <span x-show="note.cell && !note.cell.e && !note.cell.diag">nothing shared</span>
                <span x-show="note.cell?.diag">the same file</span>
              </div>
              <div x-show="note.cell?.e?.rule" class="text-base mt-1"
                   :class="note.cell?.e && themeMarked(note.cell.e) ? 'text-primary' : 'text-base-content/50'">
                the shared text states a rule<span x-show="note.cell?.e && themeReview(note.cell.e)">, and both files travel</span>
              </div>
              <div x-show="note.cell?.e && !themeListedEdge(note.cell.e)" class="text-base text-base-content/50 mt-1">
                in neither owners.csv nor repetitions.csv
              </div>
            </div>
            <div x-show="tip.seg" x-cloak
                 class="fixed z-50 pointer-events-none border border-base-300 rounded-lg bg-base-100 shadow-lg px-3 py-2 max-w-xs"
                 :style="'left:' + tip.x + 'px; top:' + tip.y + 'px'">
              <div class="flex items-baseline gap-2">
                <span class="w-2 h-2 rounded-sm shrink-0"
                      :class="[tip.channel === 'session_hook' ? 'bg-primary' : 'bg-secondary',
                               tip.seg?.kind === 'overhead' && 'opacity-40']"></span>
                <code class="text-base break-all" x-text="tip.seg?.label"></code>
              </div>
              <div class="text-base text-base-content/60 mt-1">
                <span class="font-mono" x-text="(tip.seg?.bytes || 0).toLocaleString() + ' bytes'"></span>
                <span x-text="' on the ' + tip.channelLabel"></span>
              </div>
              <div x-show="tip.delivered" class="text-base text-base-content/60"
                   x-text="'delivered ' + tip.delivered"></div>
              <div x-show="tip.otherBytes" class="text-base text-warning mt-1">
                <span x-text="'also arrives on the other channel at ' + (tip.otherBytes || 0).toLocaleString()"></span>
                <span x-show="tip.otherBytes !== tip.seg?.bytes"> bytes, so this copy is the trimmed one</span>
              </div>
              <div x-show="tip.seg?.kind === 'overhead'" class="text-base text-base-content/50 mt-1">
                not a document: the payload's own framing
              </div>
            </div>
          </section>
        </div>
      `,

      AIMS_MANIFEST,
      INJECTION,
      THEMES_GRAPH,
      SET_MANIFEST,
      ROUTES_MANIFEST,
      ROUTES_MODES,
      ROUTES_ROUTES,
      SHOWING_MECHANISMS,
      ROUTES_PASTE,
      DOCS_MANIFEST,
      GROWTH_PAYLOAD,
      OWNERS_MANIFEST,
      OWNERS_REPS,
      PROPS_MANIFEST,
      PROPS_DECLS,
      PROPS_VOCAB,
      TEXT_FIELDS,
      SKILLS_MANIFEST,
      PROPS_DOC,
      SPAN_DOC,
      SHOWING_FRAME,
      SURF_MANIFEST,
      SURF_DOC,
      SURF_REGION_GLOSS,
      REACH_BUILDER,
      TESTS_MANIFEST,
      TESTS_BUILDER,
      TOOLS_MANIFEST,
      TOOLS_BUILDER,
      authed: false,
      // The open tab, rendered from here and OWNED by the shell (its `mapTab`,
      // stamped as ?tab=). This copy is seeded from the shell at mount so a deep
      // link opens on the tab it names, and re-seeded by the watch in init() so
      // back and forward walk the tabs.
      mapTab: (window.__shell?.mapTab || 'set'),
      manifest: null,
      harnessRoles: {},
      setLoading: false,
      setErr: '',
      routes: null,
      routesLoading: false,
      routesErr: '',
      injection: null,
      injectionLoading: false,
      injectionErr: '',
      propsReg: null,
      propsLoading: false,
      propsErr: '',
      docsReg: null,
      docsLoading: false,
      docGrowth: null,   // path -> {w, delta, from}; null while absent or unread
      growthSeen: false,  // the Growth tab has been opened at least once
      docsErr: '',
      ownersReg: null,
      ownersLoading: false,
      // The Themes half: a derived graph beside the curated registry, on one
      // tab because they answer the same question from opposite ends. The
      // registry knows why a repetition exists; the graph knows every
      // repetition. Neither is complete without the other and only one of
      // them can be.
      themeGraph: null,
      themesLoading: false,
      themesErr: '',
      lens: 'clusters',
      // The twelve tabs as data, which is what makes the lede below possible.
      // Every tab now opens with ONE SENTENCE saying what its rows ARE, and the
      // rule that keeps it a lede rather than a manual is that it never says
      // what the reader can do: no second person, no "use this to", no naming a
      // control. Eleven of twelve had nothing at all before 2026-08-31 and the
      // twelfth had three sentences, the last of which was mechanics.
      // map-tabs.test.mjs holds the shape; the strip is generated from here, so
      // a tab cannot be added without one.
      TABS: [
        { k: 'aims', n: 'Aims', i: 'ph-target',
          g: 'The mission this estate\'s material serves, and the five goals every piece of it is held to.' },
        { k: 'set', n: 'Portable', i: 'ph-package',
          g: 'The files curated to travel: what a session in any other repository gets when it installs this one.' },
        { k: 'surfacing', n: 'Surfacing', i: 'ph-megaphone',
          g: 'The primitives that make a session\'s work visible in chat, which is the only channel out of a sandbox.' },
        { k: 'showing', n: 'Showing', i: 'ph-paper-plane-tilt',
          g: 'Which link reaches which kind of change, what each one cannot show, and the address grammar behind all of them.' },
        { k: 'docs', n: 'Docs', i: 'ph-books',
          g: 'Every document in the folder: what it is about, whether it still claims to be true, and who can reach it.' },
        { k: 'growth', n: 'Growth', i: 'ph-chart-scatter',
          g: 'Every document\'s length across the repository\'s history, drawn as motion rather than left as a number.' },
        { k: 'claims', n: 'Themes', i: 'ph-graph',
          g: 'What this estate says more than once: every repetition its prose actually contains, and the few anyone has accounted for.' },
        { k: 'tests', n: 'Tests', i: 'ph-flask',
          g: 'Every check in the suite, what it holds to what, and what would go unnoticed if it were deleted.' },
        { k: 'harness', n: 'Harness', i: 'ph-wrench',
          g: 'Every script the repository runs on itself: what each one is for, how it gets invoked, and whether anything exercises it.' },
        { k: 'skills', n: 'Skills', i: 'ph-sparkle',
          g: 'Every skill a session can reach, across the three sets they arrive from, and what carrying each set costs.' },
        { k: 'registries', n: 'Registries', i: 'ph-stack',
          g: 'The declaration table the other tabs hang off: for each committed inventory, what it covers and what holds it to its subject.' },
        { k: 'injection', n: 'Injection', i: 'ph-syringe',
          g: 'What actually reached a session at startup on the day it was measured, against the two caps that decide what gets cut.' },
      ],
      get tabGloss(){ return this.TABS.find(t => t.k === this.mapTab)?.g || ''; },
      THEME_LENSES: [
        { k: 'clusters', n: 'Clusters', i: 'ph-graph' },
        { k: 'arcs',     n: 'Arcs',     i: 'ph-flow-arrow' },
        { k: 'atoms',    n: 'Atoms',    i: 'ph-quotes' },
        { k: 'matrix',   n: 'Matrix',   i: 'ph-grid-nine' },
        { k: 'owners',   n: 'Owners',   i: 'ph-key' },
      ],
      // The threshold is state, not a constant, because which clusters exist
      // is a function of it: at 3 the graph is one blob of 32 files, at 30 it
      // is isolated pairs. Twelve is where it reads.
      themeTh: 12,
      // The concern the accent marks. One accent, one meaning at a time, and
      // which meaning is the segment the reader picked: the alternative was a
      // second colour, which would have made the encoding unreadable the moment
      // a pair carried both. 'review' is the default because it is the one a
      // reader can act on.
      themeConcern: 'review',
      themePick: null,
      ownersErr: '',
      surf: null,
      surfLoading: false,
      surfErr: '',
      aims: null,
      aimsLoading: false,
      aimsErr: '',

      init(){
        this.$el.innerHTML = this.template;
        this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });
        this.load();
        // A deep-linked tab has to fetch its own manifest: load() covers the
        // set, and the other four were fetched by the click handler that no
        // longer runs when the URL picked the tab instead.
        this.loadTab(this.mapTab);
        this.$watch(() => window.__shell && window.__shell._authState, (s) => {
          if (s === 'auth') this.load();
        });
        // Back and forward: the shell rewrites its mapTab from the URL, and the
        // render follows. One-way, since setTab already pushed the other way.
        this.$watch(() => window.__shell?.mapTab, (t) => {
          if (t && t !== this.mapTab) { this.mapTab = t; this.loadTab(t); }
        });
      },

      // A tab tap: render it, fetch what it needs, and stamp the URL.
      setTab(tab){
        if (tab === this.mapTab) return;
        this.mapTab = tab;
        this.loadTab(tab);
        window.__shell?.goMapTab?.(tab);
      },
      // Each tab's manifest, fetched on first open. The loaders are idempotent
      // (each returns early once its manifest is in hand), so this is safe to
      // call on every arrival at a tab, whatever route brought the reader.
      loadTab(tab){
        if (tab === 'aims') this.loadAims();
        else if (tab === 'surfacing') this.loadSurf();
        else if (tab === 'showing') this.loadRoutes();
        else if (tab === 'injection') this.loadInjection();
        else if (tab === 'docs') this.loadDocsReg();
        else if (tab === 'growth') { this.growthSeen = true; this.loadEstateGrowth(); }
        else if (tab === 'claims') {
          this.loadOwnersReg(); this.loadThemes();
          // portable.csv answers which files leave the repo, which is half of
          // what makes a duplication worth reviewing.
          if (!this.manifest) this.loadManifest();
        }
        else if (tab === 'tests') this.loadTestsReg();
        else if (tab === 'harness') this.loadToolsReg();
        else if (tab === 'registries') this.loadPropsReg();
        // The plugin set reads the Portable tab's manifest. load() fetches it on
        // mount, so this is the cold-deep-link case, and loadManifest has no guard
        // of its own.
        else if (tab === 'skills') {
          this.loadSkillsReg(); this.loadEstateSkills();
          if (!this.manifest) this.loadManifest();
          // Invocation counts ride the same cache as the Docs tab's readership,
          // so the Skills tab pulls it too rather than keeping a second fetch.
          this.loadDocReads();
        }
      },

      hub(){ return window.PortableAlign?.HUB || 'mehrlander/web-tools'; },
      registry(){ return window.__shell?.REGISTRY_REPO || 'mehrlander/web-tools-private'; },
      hasToken(){ return !!window.__shell?.hasToken?.(); },
      // A hub link follows the ref the manifests were READ at, for the same
      // reason loadManifest does: under ?use= a jump-over pinned to main opens a
      // different file than the one on screen.
      hubUrl(path){ return 'https://github.com/' + this.hub() + '/blob/' + useRef() + '/' + path; },
      // The peek address for a hub file, and for a route's renderer in whatever
      // repo it lives (lib/kits/source-peek.js reads it off data-peek). Exact files
      // only: a `dir` item and every repo-level link stay peekless, which is
      // what keeps the glyph's two meanings apart.
      peek(path){ return path ? (window.SourcePeek?.addr(this.hub(), useRef(), path) || null) : null; },
      routePeek(r){ return window.SourcePeek?.addr(r.repo, r.ref || 'main', r.path) || null; },
      // The card gear opens the shell's repo dialog on that repo's Config tab, in
      // place (no navigation), the same call the estate Repos card makes with
      // { tab: 'settings' }. openDialog loads any repo's config, not just the
      // open one, so editing a repo's .web-tools.json is one tap from the Map.
      openConfig(repo){
        const el = document.getElementById('repo');
        el?.__repo?.openDialog(repo, { tab: 'config' });
      },

      load(){
        this.authed = this.hasToken();
        if (!this.manifest) this.loadManifest();
        // Auth resolves after boot, so a Docs or Skills tab opened tokenless
        // renders its registry and picks the usage column up here when the
        // token lands. One cache serves both.
        if (this.docsReg || this.skillsReg) this.loadDocReads();
      },

      // ── The set ──────────────────────────────────────────────────────────
      async loadManifest(){
        this.setLoading = true;
        this.setErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          // The set inherits: it curates WHICH files travel and how a
          // consumer takes each one, and leaves the description of a file to
          // whichever registry owns it. Nine scripts are described by the harness
          // registry, so their rows here are blank and the role is joined below.
          // Skills keep an authored role, because the skills catalog carries a
          // model-facing trigger description rather than a reader's one-liner.
          const [set, harness] = await Promise.all([
            gh.get(SET_MANIFEST),
            gh.get(TOOLS_MANIFEST).catch(() => null),   // the harness registry, for the joined role
          ]);
          // The header's own peek reads these bytes rather than fetching them
          // again: the view has them, and a peek at the file a view is a
          // projection of should not be a second round trip.
          window.SourcePeek?.seed(this.peek(SET_MANIFEST), set.text);
          this.manifest = { items: window.Csv.rows(set.text) };
          this.harnessRoles = harness ? Object.fromEntries(
            window.Csv.rows(harness.text).map(t => [t.path, t.role])) : {};
        } catch (e) {
          this.setErr = 'Manifest load failed: ' + (e?.message || e);
        } finally { this.setLoading = false; }
      },
      // A row's own role where it has one, the owning registry's where it does
      // not. Blank on both is the honest empty, not a hidden failure.
      setRole(it){ return it.role || this.harnessRoles?.[it.path] || ''; },
      get setSections(){
        const items = this.manifest?.items || [];
        const secs = [
          { label: 'In the plugin', items: items.filter(i => i.kind === 'skill') },
          { label: 'Docs',          items: items.filter(i => i.kind === 'doc' || i.kind === 'dir') },
          { label: 'Scripts',       items: items.filter(i => i.kind === 'script') },
        ];
        return secs.filter(s => s.items.length);
      },
      kindIcon(it){ return (KIND[it.kind] || KIND.doc).icon; },
      useLabel(it){ return USE_LABEL[it.use] || it.use || ''; },
      itemGh(it){
        return 'https://github.com/' + this.hub() + '/' + (it.kind === 'dir' ? 'tree' : 'blob') +
               '/' + useRef() + '/' + it.path;
      },
      // The set's readable rows, flattened in the order the sections render
      // them, so the deck pages the list the reader is looking at rather than
      // the manifest's own row order. `dir` rows are not files and keep the
      // folder route: there is nothing for a slide to render.
      get setFiles(){
        return this.setSections.flatMap(s => s.items).filter(i => i.kind !== 'dir');
      },
      async openItem(it){
        if (it.kind === 'dir') {
          if (!window.__shell) return;
          await window.__shell.ensureBrowser(this.hub(), '');
          return window.__shell.openFolder(it.path);
        }
        const files = this.setFiles;
        return this.openFileDeck(files, files.findIndex(f => f.path === it.path), {
          icon: 'ph-package', key: 'set', context: 'Portable',
          // The manifest names each row and says what it is for, which is a
          // better handle than a filename: half this set is SKILL.md.
          label: (it2) => ({ title: it2.title || this.docTitle(it2), subtitle: it2.role || '',
                             icon: this.kindIcon(it2) }),
        });
      },
      async openHubFile(path){
        if (!window.__shell || !path) return;
        await window.__shell.ensureBrowser(this.hub(), '');
        await window.__shell.openFile(path);
      },
      async openDoctrine(){ await this.openHubFile(DOCTRINE_PATH); },
      async openRepo(repo){ await window.__shell?.openPinned(repo); },

      // ── Showing ───────────────────────────────────────────────────────────
      // Loaded on first open of the tab rather than with the view: the set and
      // the adoption probe already run at mount, and this manifest is only
      // wanted by a reader who asks for it. Public, like the set half.
      async loadInjection(){
        if (this.injection || this.injectionLoading) return;
        this.injectionLoading = true;
        this.injectionErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          const raw = (await gh.get(INJECTION)).text;
          window.SourcePeek?.seed(this.peek(INJECTION), raw);
          const parsed = JSON.parse(raw);
          if (!parsed || !parsed.channels) throw new Error('no channels block');
          // One scale across both bars, so the capped channel reads as the
          // smaller thing it is. The cap sits above the larger total on the
          // hook row, so the axis has to clear it too or the marker falls off.
          parsed.scale = Math.max(...parsed.channels.map(c => Math.max(c.total, c.cap || 0)));
          this.injection = parsed;
        } catch (e) { this.injectionErr = String(e.message || e); }
        finally { this.injectionLoading = false; }
        this.loadObserved();
      },

      // ── Observed ──────────────────────────────────────────────────────────
      // The container measurement above says what this checkout WOULD supply.
      // This says what sessions actually got, folded live from the private
      // registry's sessions cache, and it is the half that can disagree: the
      // hook degrades quietly at its ceiling, so nothing on disk shows that
      // SURFACING.md has never once arrived at the full rung.
      //
      // Read live rather than baked into docs/injection.json, which is what it
      // was until this landed. A baked answer is a measurement of the store on
      // the day someone ran the script, published in a public repo, and stale
      // from the next session on. Same posture as the Docs tab's readership:
      // token-gated, after the public half lands, never blocking it, and silent
      // on failure, since a reader with no token still gets every other block
      // on this tab.
      injObserved: null,
      // NO MESSAGE WHEN THERE IS NOTHING TO SHOW. Three empty states used to
      // explain themselves in prose: no token, cache unreadable, cache older
      // than the fold. Every one of them told a reader about this app's own
      // plumbing in this app's own words, in the place a finding was supposed to
      // be. The section simply does not render now, which is the honest shape:
      // the reading is absent, and an absent reading is not a paragraph.
      injObservedDone: false,
      async loadObserved(){
        if (this.injObserved || this.injObservedDone) return;
        try {
          if (!this.hasToken()) return;
          const S = window.RepoSessionsCache;
          const path = S?.CACHE_PATH || 'state/sessions.json';
          const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
          const cache = JSON.parse((await reg.get(path)).text);
          const obs = S.injectionAcross(cache.rows || []);
          // A cache older than the widened fold carries no channel, so there is
          // no reading to draw. Nothing is rendered rather than a zero, which
          // would read as "no session ever received anything".
          if (!obs.sessions || obs.sessions === obs.unhealed) return;
          obs.store = this.registry() + ' sessions/';
          obs.scanned = cache.count || (cache.rows || []).length;
          obs.generatedAt = cache.generatedAt || '';
          this.injObserved = obs;
        } catch {
          // The registry is not this tab's subject, and the container reading
          // above stands on its own. Same posture as the Docs tab's readership.
        } finally { this.injObservedDone = true; }
      },
      injPct(n){ return this.injection ? (100 * n / this.injection.scale) : 0; },
      // Bytes actually put on the channel, which the receipt reports and the
      // container cannot. A range where the rungs differed across sessions, one
      // figure where they did not, and nothing at all for a carrier that never
      // said: an absent number stays absent rather than borrowing the file size,
      // since reading the two as one is what this field exists to stop.
      injSent(o){
        if (o.sentMax == null) return '';
        const n = v => v.toLocaleString();
        return o.sentMin === o.sentMax
          ? n(o.sentMax) + ' sent'
          : n(o.sentMin) + '–' + n(o.sentMax) + ' sent';
      },
      // The tooltip, to the spec in the mechanics reference: hover only
      // where a pointer is fine, 140ms in and 220ms out, tap toggles on actual
      // visibility, Escape and a capture-phase pointerdown dismiss. The panel
      // is pointer-events-none, so "leaving both the control and the tooltip"
      // collapses to leaving the control: the tooltip cannot be entered.
      tip: { seg: null, channel: '', channelLabel: '', delivered: null, otherBytes: 0, x: 0, y: 0 },
      _tipTimer: null,
      _tipBound: false,
      tipFine(){ return window.matchMedia('(hover: hover) and (pointer: fine)').matches; },
      tipShow(g, c, at){
        const docs = this.injection?.documents || [];
        const other = docs.find(d => d.path && d.path === g.path && d.via !== c.id);
        this.tip.seg = g;
        this.tip.channel = c.id;
        this.tip.channelLabel = c.label.toLowerCase();
        this.tip.delivered = docs.find(d => d.path && d.path === g.path && d.via === c.id)?.delivered || null;
        this.tip.otherBytes = other ? other.bytes : 0;
        // Clamp to the viewport rather than the container: the panel is fixed,
        // and a segment near the right edge would otherwise open off-screen.
        this.tip.x = Math.max(12, Math.min(at.x + 12, window.innerWidth - 300));
        this.tip.y = Math.max(12, Math.min(at.y + 12, window.innerHeight - 150));
        this.tipBind();
      },
      tipHide(){ clearTimeout(this._tipTimer); this.tip.seg = null; this.note.cell = null; },

      // The matrix cell tooltip. Its own state and body; tipFine and tipBind
      // are shared with the tooltip above, since the fine-pointer test and the
      // capture-phase dismissal are the parts that go subtly wrong, not the
      // markup. A cell with no edge still explains itself: "nothing shared" is
      // the answer to what an empty cell means, and it is most of the grid.
      note: { cell: null, x: 0, y: 0 },
      _noteTimer: null,
      noteShow(cell, at){
        this.note.cell = cell;
        this.note.x = Math.max(12, Math.min(at.x + 12, window.innerWidth - 280));
        this.note.y = Math.max(12, Math.min(at.y + 12, window.innerHeight - 120));
        this.tipBind();
      },
      noteEnter(cell, ev){
        if (!this.tipFine()) return;
        clearTimeout(this._noteTimer);
        const at = { x: ev.clientX, y: ev.clientY };
        this._noteTimer = setTimeout(() => this.noteShow(cell, at), 140);
      },
      noteLeave(){
        if (!this.tipFine()) return;
        clearTimeout(this._noteTimer);
        this._noteTimer = setTimeout(() => { this.note.cell = null; }, 220);
      },
      tipEnter(g, c, ev){
        if (!this.tipFine()) return;
        clearTimeout(this._tipTimer);
        // Read the coordinates now: the handler runs 140ms later and an event
        // object is not something to hold on to.
        const at = { x: ev.clientX, y: ev.clientY };
        this._tipTimer = setTimeout(() => this.tipShow(g, c, at), 140);
      },
      tipLeave(){
        if (!this.tipFine()) return;
        clearTimeout(this._tipTimer);
        this._tipTimer = setTimeout(() => { this.tip.seg = null; }, 220);
      },
      tipTap(g, c, ev){
        // Toggle on ACTUAL VISIBILITY. tip.seg is the visibility, so there is no
        // second flag that can fall out of step with what is on screen.
        clearTimeout(this._tipTimer);
        if (this.tip.seg === g) this.tip.seg = null;
        else this.tipShow(g, c, { x: ev.clientX, y: ev.clientY });
      },
      tipBind(){
        if (this._tipBound) return;
        this._tipBound = true;
        // Capture phase, so a segment handler that stops propagation cannot
        // strand the panel open.
        document.addEventListener('pointerdown', e => {
          if (this.tip.seg && !e.target.closest?.('[data-inj-seg]')) this.tipHide();
          if (this.note.cell) { clearTimeout(this._noteTimer); this.note.cell = null; }
        }, true);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') this.tipHide(); });
      },
      injDup(path){ return !!this.injection?.duplicated?.some(d => d.path === path); },
      async loadRoutes(){
        if (this.routes || this.routesLoading) return;
        this.routesLoading = true;
        this.routesErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          const [raw, modes, routes, mechanisms, kinds, paste] = await Promise.all(
            [ROUTES_MANIFEST, ROUTES_MODES, ROUTES_ROUTES, SHOWING_MECHANISMS,
             ROUTES_KINDS, ROUTES_PASTE]
              .map(p => gh.get(p).then(r => r.text)));
          const parsed = JSON.parse(raw);
          if (!parsed || !parsed.grammar) throw new Error('no grammar block');
          window.SourcePeek?.seed(this.peek(ROUTES_MANIFEST), raw);
          parsed.modes = window.Csv.rows(modes);
          parsed.routes = window.Csv.rows(routes);
          // `trap` is carried by one mechanism of seven, so a blank cell is the
          // absence of a trap rather than an empty one; the template tests the
          // string, so nothing further is needed to keep the six quiet.
          parsed.showing.mechanisms = window.Csv.rows(mechanisms);
          // Most cells here are blank on most rows, deliberately: aim is
          // carried by one kind of eleven and kit by three, so an empty cell
          // is "this kind has none" rather than a gap. Every x-show below tests
          // the string, so the blanks render as absence.
          parsed.kinds = window.Csv.rows(kinds);
          // `path` is blank on the form-field row, which names a browser
          // behavior rather than a file of ours; the template tests the string,
          // so the row renders without a link rather than with a broken one.
          parsed.paste = window.Csv.rows(paste);
          this.routes = parsed;
        } catch (e) {
          this.routesErr = 'Routes manifest load failed: ' + (e?.message || e);
        } finally { this.routesLoading = false; }
      },
      // The manifest names its own renderer; the fallback is what the header
      // shows before the fetch lands, and it is the same file either way.
      get rendererPath(){ return this.routes?.renderer || 'pages/toss-render.html'; },
      // The icon carries the trust posture, the badge carries the delivery:
      // whether a mode can read this origin is the consequential fact.
      modeIcon(m){ return MODE_ICON[m.trust] || MODE_ICON['n/a']; },
      // A route names its own repo, so a renderer living outside the hub opens
      // in its own repo rather than 404ing against this one.
      async openRouteRenderer(r){
        if (!window.__shell) return;
        await window.__shell.ensureBrowser(r.repo, r.ref === 'main' ? '' : r.ref);
        await window.__shell.openFile(r.path);
      },
      routeGh(r){ return 'https://github.com/' + r.repo + '/blob/' + (r.ref || 'main') + '/' + r.path; },

      // ── Surfacing ─────────────────────────────────────────────────────────
      // Same lazy shape as loadRoutes: fetched on first open of the tab.
      // Markdown from the manifest, not from the DOM: the page is one rendering
      // of docs/aims.json and this is another, so both move when the file does.
      readingUrl(r){
        return r.repo ? 'https://github.com/' + r.repo + '/blob/main/' + r.path : this.hubUrl(r.path);
      },
      goEstate(){ window.__shell?.goEstate?.(); },
      aimsMd(){
        const d = this.aims;
        if (!d) return '';
        return ['# Aims', '', '## Mission', '', d.mission, '', '## Goals', '']
          .concat(d.goals.map((g, i) => (i + 1) + '. **' + g.name + '.** ' + g.gloss))
          .concat(['', '## Reading', ''])
          .concat((d.reading || []).map(r => '- [' + (r.repo ? r.repo + ' ' : '') + r.path + '](' +
                  this.readingUrl(r) + ')' + (r.private ? ' (private)' : '') + ' ' + r.gloss))
          .concat(['']).join('\n');
      },
      copyAimsMd(){ return this.deckCopy(this.aimsMd(), 'Aims copied as Markdown'); },

      async loadAims(){
        if (this.aims || this.aimsLoading) return;
        this.aimsLoading = true;
        this.aimsErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          const raw = (await gh.get(AIMS_MANIFEST)).text;
          const parsed = JSON.parse(raw);
          if (!parsed.goals?.length) throw new Error('no goals in the manifest');
          window.SourcePeek?.seed(this.peek(AIMS_MANIFEST), raw);
          this.aims = parsed;
        } catch (e) {
          this.aimsErr = 'Aims manifest load failed: ' + (e?.message || e);
        } finally { this.aimsLoading = false; }
      },
      // Reading the primitives: the same deck the Docs and Portable tabs open,
      // paging the two files this tab's header already names. Docked (the app
      // installs window.__deckPane), the prose sits BESIDE the cards, which is
      // the reading this tab wants and the one the Files view could not give:
      // navigating there is a route change, so the cards the doc explains were
      // gone by the time it arrived.
      //
      // BOTH FILES, because the pair IS this tab: SURFACING.md is authoritative
      // and surfacing.csv is its gated index, membership held both ways by
      // tools/test/surfacing-manifest.test.mjs, and the cards below are that
      // index rendered. One swipe puts the two ends of that relation side by
      // side. It is also what makes the door honest: swipeDeck.entry's promise
      // is that a COLLECTION has a reader, and a counted title over one file
      // reads as a control that mis-describes itself.
      //
      // The manifest was left out on the first pass and the reason was the
      // rendition, not the relation: renderDoc had no CSV branch, so the index
      // arrived as wrapped raw text. It renders as a table now.
      get surfDeckFiles(){
        return [
          { path: SURF_DOC, title: 'SURFACING.md', subtitle: 'the whole document, every region' },
          { path: SURF_MANIFEST, title: 'surfacing.csv', subtitle: 'the gated index behind these cards' },
        ];
      },
      // ── A card, and the bullet it paraphrases ─────────────────────────────
      //
      // THE JOIN ALREADY EXISTED; nothing here invents it. docs/surfacing.csv's
      // `lead` IS the bold lead-in of the matching bullet in SURFACING.md, and
      // tools/test/surfacing-manifest.test.mjs holds that both ways: every
      // bullet has a row, every row points at a real bullet. So the card and
      // the paragraph are already two renderings of one key, and this is the
      // key being followed rather than a correspondence being guessed at.
      //
      // NORMALIZED THE WAY THE GATE NORMALIZES, one trailing colon or full stop
      // off each side. The manifest carries "Reference is a link" and the doc
      // renders "Reference is a link.", and a match that failed on the stop
      // would fail on exactly the rows the gate was written to protect.
      leadKey(s){ return String(s || '').replace(/[:.]\s*$/, '').trim(); },

      // THE LIST IS LOOSE, and that single fact decides the selector. The
      // primitives are separated by blank lines, so marked emits
      // <li><p><strong>Lead.</strong> …</p></li> rather than <li><strong>….
      // Measured against the real rendered doc: `li > strong:first-child`
      // matched 0 of 22 and looked like a broken join; `li > p > strong` matches
      // 22 of 22. The tight form is kept as a second selector because a doc
      // whose bullets carry no blank line between them is the same document
      // written another way, and this should not break on that edit.
      findLead(box, lead){
        const want = this.leadKey(lead);
        for (const el of box.querySelectorAll('li > p > strong:first-child, li > strong:first-child'))
          if (this.leadKey(el.textContent) === want) return el.closest('li');
        return null;
      },
      findHeading(box, heading){
        for (const el of box.querySelectorAll('h2'))
          if (el.textContent.trim() === heading) return el;
        return null;
      },

      // The mark is kits/land.js's, not this tab's. It began as a tint and a
      // left rule of its own, which was a third answer to a question the estate
      // had already answered twice: mehrlander/home's submittal view lands a
      // reader on a block of an office document and on a rectangle of a PDF,
      // both in the same yellow, and this arrived at the same scroller walk
      // independently. The kit is that concept lifted out; what stays here is
      // WHICH element, which is the only part this tab knows.
      markLead(el){
        window.Land?.clear(el.closest('[data-deck-content]'));
        if (!window.Land) return el.scrollIntoView({ block: 'center' });
        window.Land.mark(el);
      },

      // WAIT FOR THE DOCK TO STOP MOVING THINGS. There is no event for it: the
      // host flips an attribute, CSS transitions the content pane's width, and
      // both the doc's line wrapping and the card grid reflow inside the new
      // one. Scrolling to a target mid-transition puts it where it was rather
      // than where it lands, which is how the tapped card ended up 500px below
      // the fold beside its own marked paragraph. Two identical readings of
      // position and width is the signal, since neither an event nor a fixed
      // delay is available and a delay long enough to be safe is a delay the
      // reader feels on every tap.
      async settled(el, ms = 800){
        const at = () => { const r = el.getBoundingClientRect();
                           return Math.round(r.top) + 'x' + Math.round(r.width); };
        let last = null;
        for (let waited = 0; waited <= ms; waited += 60) {
          const now = at();
          if (now === last) return;
          last = now;
          await new Promise(r => setTimeout(r, 60));
        }
      },

      // The slide's box, once its three async steps have finished. Polled
      // rather than awaited directly, because the deck decides when it calls
      // render() and the first call can land after open() returns.
      async slideBox(path, ms = 4000){
        for (let waited = 0; waited <= ms; waited += 50) {
          const ready = this._slideReady?.get(path);
          if (ready) return ready;
          await new Promise(r => setTimeout(r, 50));
        }
        return null;
      },

      // DOCK IF THE HOST WILL, and open anyway if it will not. Docked, the card
      // and its paragraph sit side by side, which is the whole point. Below the
      // host's dock width there is no side by side to offer, and the honest
      // fallback is the deck over the cards, scrolled to the bullet: the reader
      // asked to be taken somewhere and is taken there.
      async openSurfAt(find, card){
        // Lazily, beside the deck: a tab whose cards are never tapped should
        // not pay for the landing.
        if (!window.Land && window.gh?.load) {
          try { await window.gh.load('kits/land.js'); } catch { /* fall through */ }
        }
        window.__deckPane?.('dock');
        await this.openSurfDeck();
        this._deck?.deck?.go?.(0);
        const box = await this.slideBox(SURF_DOC);
        if (!box) return;
        await this.settled(box);
        const el = find(box);
        if (el) this.markLead(el);
        else box.scrollTop = 0;   // the file is open and right; the anchor is not
        // AND BRING THE CARD BACK. Docking narrows the pane the cards are laid
        // out in, so they reflow under the reader and the one they just tapped
        // can end up below the fold, beside a paragraph it no longer faces.
        // `nearest` is the whole rule: it moves the page only when the card is
        // actually out of view, so a tap on a card already on screen scrolls
        // nothing.
        // The card gets the kit's scroll and NOT its tint: it is where the
        // reader already is, so lighting it would answer a question nobody
        // asked. `ifNeeded` keeps a card the reader can see from jumping under
        // the finger that tapped it.
        if (card) {
          await this.settled(card);
          window.Land?.mark(card, { ifNeeded: true, tint: false });
        }
      },
      // Two doors, one opener. A card's title lands on the bullet it
      // paraphrases; a region door lands on the h2 that opens that region.
      showPrimitive(p, card){ return this.openSurfAt(box => this.findLead(box, p.lead), card); },
      showRegion(r){ return this.openSurfAt(box => this.findHeading(box, r.heading)); },

      openSurfDeck(){
        const files = this.surfDeckFiles;
        return this.openFileDeck(files, 0, {
          icon: 'ph-megaphone', key: 'surfacing', context: 'Surfacing',
          label: (f) => ({ title: f.title, subtitle: f.subtitle, icon: 'ph-file-text' }),
        });
      },
      async loadSurf(){
        if (this.surf || this.surfLoading) return;
        this.surfLoading = true;
        this.surfErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          const raw = (await gh.get(SURF_MANIFEST)).text;
          const parsed = { primitives: window.Csv.rows(raw), regions: [] };
          if (!parsed.primitives.length) throw new Error('no primitives in the index');
          window.SourcePeek?.seed(this.peek(SURF_MANIFEST), raw);
          // The doors, off the doc itself. A failed fetch costs the doors and
          // not the cards, since the cards are the tab.
          try { parsed.regions = surfRegions((await gh.get(SURF_DOC)).text); }
          catch { /* no doors */ }
          this.surf = parsed;
        } catch (e) {
          this.surfErr = 'Surfacing manifest load failed: ' + (e?.message || e);
        } finally { this.surfLoading = false; }
      },

      // ── Docs ──────────────────────────────────────────────────────────────
      // Same lazy shape as loadRoutes: fetched on first open of the tab.
      // ── Doc growth: the trend behind the `words` column ───────────────────
      // A sparkline is normalized to the FILE's own range, not the registry's,
      // so it reports shape (did this document grow, hold, or get cut) and
      // never size. Size is already the number beside it, and one mark cannot
      // carry both without lying about one of them.
      growthOf(path){ return this.docGrowth?.get(path) || null; },
      spark(path){
        const g = this.growthOf(path);
        if (!g) return '';
        const lo = Math.min(...g.w), hi = Math.max(...g.w), span = hi - lo || 1;
        return g.w.map((v, i) =>
          (i / (g.w.length - 1) * 44).toFixed(1) + ',' +
          (11 - (v - lo) / span * 10).toFixed(1)).join(' ');
      },
      growthDelta(path){
        const g = this.growthOf(path);
        if (!g || !g.delta) return '';
        return (g.delta > 0 ? "+" : "\u2212") + kw(Math.abs(g.delta));
      },
      growthHint(path){
        const g = this.growthOf(path);
        if (!g) return '';
        const d = g.delta;
        return d === 0 ? 'unchanged since ' + g.from
          : (d > 0 ? 'grew ' : 'shrank ') + Math.abs(d).toLocaleString() +
            ' words since ' + g.from;
      },
      // Net movement across the docs the payload covers, which is the docs/
      // registry minus anything added since the payload was last regenerated.
      get docGrowthTotal(){
        if (!this.docGrowth || !this.docsReg) return null;
        let delta = 0, n = 0, from = '';
        for (const d of this.docsReg.documents) {
          const g = this.growthOf(d.path);
          if (!g) continue;
          delta += g.delta; n++;
          if (!from || g.from < from) from = g.from;
        }
        return n ? { delta, n, from } : null;
      },
      folderGrowth(dir){
        if (!this.docGrowth || !this.docsReg) return 0;
        let delta = 0;
        for (const d of this.docsReg.documents) {
          if (d.path !== dir && !d.path.startsWith(dir + '/')) continue;
          delta += this.growthOf(d.path)?.delta || 0;
        }
        return delta;
      },

      // ── Growth, federated ─────────────────────────────────────────────────
      // Every repo declaring a `growth` path in its own .web-tools.json, read
      // from the same crawled config cache the Skills tab's estate half uses.
      // The hub is INCLUDED, unlike there: skills excludes it because the hub's
      // committed set is the plugin and would double-count, while here the hub
      // is simply one more corpus with a payload.
      //
      // Federation is what retired the two app views. The page was promoted by
      // web-tools and by home, each carrying a different `?src=`, and the
      // sidebar renders a promoted page as label plus icon, so the estate's nav
      // said "Doc Growth" twice with nothing to choose between. Two corpora is
      // one instrument with a subject, which is a control on a tab.
      //
      // Token-gated and silent on failure, the same posture as the estate
      // skills: the hub's payload is a public fetch, so a reader with no token
      // still gets the chart, minus the selector.
      estateGrowth: null,
      growthRepo: '',
      async loadEstateGrowth(){
        if (this.estateGrowth || !this.hasToken()) return;
        try {
          const path = window.RepoConfigCache?.CACHE_PATH || 'state/configs.json';
          const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
          const cache = JSON.parse((await reg.get(path)).text);
          const rows = [];
          for (const [repo, e] of Object.entries(cache?.repos || {})) {
            const declared = e?.config?.growth;
            if (typeof declared !== 'string' || !declared.trim()) continue;
            rows.push({ repo, short: repo.split('/').pop(), path: declared.trim() });
          }
          // The hub first, then the rest by name: it is the corpus this view
          // opens on, so the control reads in the order it selects.
          rows.sort((a, b) => (a.repo === this.hub() ? -1 : b.repo === this.hub() ? 1 : 0)
                              || a.short.localeCompare(b.short));
          this.estateGrowth = rows;
        } catch { this.estateGrowth = null; }
      },
      // The selected corpus, or the hub when nothing is selected and whenever
      // the selection names a repo the cache no longer carries.
      get growthSubject(){
        const rows = this.estateGrowth || [];
        return rows.find(r => r.repo === this.growthRepo)
            || rows.find(r => r.repo === this.hub())
            || null;
      },
      // Under ?use= Pages still serves the page file from main, so a ref has to
      // go the long way round through the toss renderer. Without one the direct
      // path is cheaper. The hub's payload is the page's own built-in default,
      // so selecting it needs no ?src= and no token; every other corpus is
      // addressed, and the page reads it through the viewer's stored token.
      get growthUrl(){
        const ref = useRef();
        const sub = this.growthSubject;
        const q = sub && sub.repo !== this.hub() ? '?src=' + sub.repo + ':' + sub.path : '';
        return ref && ref !== 'main'
          ? '../pages/toss-render.html#gh=' + this.hub() + '@' + ref + ':pages/doc-growth.html' + q
          : '../pages/doc-growth.html' + q;
      },
      // The Injection tab measures BYTES against a cap. delivery.html reads the
      // same subject one axis over, as ROUTES: which copy each channel is
      // holding and how stale it can be, over dated snapshots including a
      // planned one. Same ?use= detour as growthUrl, and for the same reason.
      get deliveryUrl(){
        const ref = useRef();
        return ref && ref !== 'main'
          ? '../pages/toss-render.html#gh=' + this.hub() + '@' + ref + ':pages/delivery.html'
          : '../pages/delivery.html';
      },

      // The payload behind whatever is on screen, so the header's source link
      // moves with the selector instead of always naming the hub's.
      get growthPayloadUrl(){
        const sub = this.growthSubject;
        return sub
          ? 'https://github.com/' + sub.repo + '/blob/' +
            (sub.repo === this.hub() ? useRef() : 'main') + '/' + sub.path
          : this.hubUrl(GROWTH_PAYLOAD);
      },
      get growthPayloadLabel(){
        const sub = this.growthSubject;
        return sub && sub.repo !== this.hub() ? sub.short + ':' + sub.path
             : (sub ? sub.path : GROWTH_PAYLOAD);
      },
      selectGrowthRepo(repo){
        if (this.growthRepo === repo) return;
        this.growthRepo = repo;
        this.growthSeen = true;
      },

      async loadDocsReg(){
        if (this.docsReg || this.docsLoading) return;
        this.docsLoading = true;
        this.docsErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          const raw = (await gh.get(DOCS_MANIFEST)).text;
          const parsed = { documents: window.Csv.rows(raw).map(d => ({ ...d, words: +d.words || 0 })) };
          if (!parsed.documents.length) throw new Error('no documents table');
          window.SourcePeek?.seed(this.peek(DOCS_MANIFEST), raw);
          this.docsReg = parsed;
          // Non-fatal on its own: the registry is the tab, and the trend is a
          // column on it. A missing or stale payload costs the sparklines and
          // nothing else, so it must not take the tab down with it.
          try {
            const g = JSON.parse((await gh.get(GROWTH_PAYLOAD)).text);
            const byPath = new Map();
            for (const f of g.files) {
              const w = f.w.filter(v => v != null);
              if (w.length < 2) continue;
              byPath.set(f.p, { w, delta: w[w.length - 1] - w[0], from: g.frames[f.born] || g.frames[0] });
            }
            this.docGrowth = byPath;
          } catch { this.docGrowth = null; }
        } catch (e) {
          this.docsErr = 'Docs registry load failed: ' + (e?.message || e);
        } finally { this.docsLoading = false; }
        this.loadDocReads();
      },


      // ── Registries ────────────────────────────────────────────────────────
      // The declaration table. Same lazy shape as every other tab.
      async loadPropsReg(){
        if (this.propsReg || this.propsLoading) return;
        this.propsLoading = true;
        this.propsErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          const [rawReg, rawProp, rawVocab, rawText] = await Promise.all([
            gh.get(PROPS_MANIFEST).then(r => r.text),
            gh.get(PROPS_DECLS).then(r => r.text),
            gh.get(PROPS_VOCAB).then(r => r.text),
            gh.get(TEXT_FIELDS).then(r => r.text),
          ]);
          const registries = window.Csv.rows(rawReg).map(r => ({
            ...r,
            // Every registry is now one CSV, so the carrier path is the whole
            // of `path`; `file` stays as its name for a consumer asking which
            // file to open.
            file: r.path,
            renders_in: window.Csv.list(r.renders_in),
          }));
          const properties = window.Csv.rows(rawProp).map(p => ({
            ...p, values: p.values ? window.Csv.list(p.values) : null,
          }));
          const vocab = window.Csv.rows(rawVocab);
          // name -> the prose kind it is, whether it IS the sanctioned name or
          // an alias the vocabulary accounts for. Both conform; the tab shows
          // the kind and never the distinction, since the distinction is a
          // naming history rather than a fact about the column.
          const kinds = new Map();
          for (const t of window.Csv.rows(rawText)) {
            kinds.set(t.field, { kind: t.field, gloss: t.gloss });
            for (const a of (t.instead_of || '').split(','))
              if (a.trim() && !kinds.has(a.trim()))
                kinds.set(a.trim(), { kind: t.field, gloss: t.gloss });
          }
          if (!registries.length) throw new Error('no registries table');
          window.SourcePeek?.seed(this.peek(PROPS_MANIFEST), rawReg);
          window.SourcePeek?.seed(this.peek(PROPS_DECLS), rawProp);
          window.SourcePeek?.seed(this.peek(PROPS_VOCAB), rawVocab);
          window.SourcePeek?.seed(this.peek(TEXT_FIELDS), rawText);
          this.propsReg = { registries, properties, vocab, kinds };
        } catch (e) {
          this.propsErr = 'Registries load failed: ' + (e?.message || e);
        } finally { this.propsLoading = false; }
      },

      // Property definitions grouped under the registry they govern, so the page reads
      // the way the model does: a registry, then what it asserts. The counts
      // beside each grade are the enforcement story, which is the thing worth
      // seeing at a glance and the thing that was wrong twice this month.
      get registryRows(){
        const r = this.propsReg;
        if (!r) return [];
        const byReg = new Map();
        for (const d of r.properties) {
          if (!byReg.has(d.registry)) byReg.set(d.registry, []);
          byReg.get(d.registry).push(d);
        }
        return r.registries.map(reg => {
          const decls = byReg.get(reg.id) || [];
          const kinds = this.propsReg?.kinds;
          return {
            ...reg,
            decls: decls.map(d => ({ ...d, textKind: kinds?.get(d.property)?.kind || '' })),
            nClosed: decls.filter(d => Array.isArray(d.values)).length,
            nValue: decls.filter(d => d.required === 'value').length,
            nCounted: decls.filter(d => d.required === 'counted').length,
            nComputed: decls.filter(d => d.mode === 'computed').length,
          };
        });
      },
      // The tab's own columns, defined from the registry pair rather than from
      // a paragraph. Two legends, because the cards show two grains: a registry
      // row (what registries.csv records about a registry) and a property chip
      // (what properties.csv records about one of its columns).
      //
      // This getter is the argument of the 2026-08-19 pass in one place.
      // registries.md carried a fifteen-row Vocabulary table, and eight of its
      // rows glossed a column whose gloss was already committed in
      // properties.csv; the prose copy is the one that goes stale, and it did.
      // A definition that is data should be rendered, not restated. What could
      // not be derived, the model and the reasons, stayed in the document.
      legendFor(registryId){
        const r = this.propsReg;
        if (!r) return [];
        const vocab = r.vocab || [];
        return r.properties.filter(p => p.registry === registryId).map(p => ({
          ...p,
          // A domain's values carry their own glosses where one is worth
          // writing; where none is, the bare value is the whole definition and
          // rendering it alone is honest rather than thin.
          domain: (p.values || []).map(v => {
            const row = vocab.find(x => x.registry === registryId && x.property === p.property && x.value === v);
            return { value: v, label: row?.label || v, gloss: row?.gloss || '' };
          }),
        }));
      },
      get registryLegend(){ return this.legendFor('registries'); },
      get propertyLegend(){ return this.legendFor('properties'); },

      // Two areas, split by one question. The rule is the point: without one,
      // every added registry re-litigates the grouping. `area` is a declared
      // field on the registry row and gated, so this reads the data rather than
      // holding a list of its own.
      get registryAreas(){
        const AREAS = [
          ['files', 'Files', 'Does the target have a path in this tree?'],
          ['names', 'Names', 'Everything else: a name something declared, and the registry is what declares it.'],
        ];
        const rows = this.registryRows;
        return AREAS.map(([key, label, rule]) => ({
          key, label, rule,
          rows: rows.filter(r => r.area === key),
        })).filter(a => a.rows.length);
      },
      // One reading of the gate column, so the badge and the ledger figure
      // cannot disagree about what its none token means.
      hasGate(r){ return !!r.gate && r.gate !== 'none'; },
      get registryTotals(){
        const rows = this.registryRows;
        return {
          registries: rows.length,
          // Two independent facts, and they used to be one `kind` column whose
          // three values answered two questions: `crosswalk` had to be unioned
          // back into `catalog` here to count correctly, and then counted again
          // on its own. Split 2026-08-18 into `membership`, which says whether
          // the row set can be recomputed, and `inherits`, which names the
          // registry whose descriptions this one borrows.
          computed: rows.filter(r => r.membership === 'computed').length,
          curated: rows.filter(r => r.membership === 'curated').length,
          inheriting: rows.filter(r => r.inherits).length,
          decls: rows.reduce((n, r) => n + r.decls.length, 0),
          closed: rows.reduce((n, r) => n + r.nClosed, 0),
          // `none` is the token for "nothing holds this"; a blank cell in CSV
          // could only mean not asserted, so the two readings need two spellings.
          gated: rows.filter(r => this.hasGate(r)).length,
          // `span` is the typed sibling of `scope`, added 2026-08-20. The
          // distinction lived inside twenty-two prose sentences, so nothing
          // could group or count it, and the question "what does the hub know
          // about the rest of the estate" had no answer a surface could show.
          estate: rows.filter(r => r.span === 'estate').length,
          // The headline the tab was missing: carriers nothing in the app
          // reads. Same role as the Docs tab's orphan count.
          unrendered: rows.filter(r => !(r.renders_in || []).length).length,
        };
      },

      // ── Owners ────────────────────────────────────────────────────────────
      // Its own fetch since the table moved out of docs.json. Same lazy shape;
      // the two tabs no longer share a load, which is the point of the split.
      async loadOwnersReg(){
        if (this.ownersReg || this.ownersLoading) return;
        this.ownersLoading = true;
        this.ownersErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          // Its own two files and nothing else. The tab used to pull the
          // registry pair as a third fetch, for this registry's scope alone;
          // that line came off the header on 2026-08-26 and the scope is read
          // on the Registries tab, where every registry's is.
          const [rawOwn, rawRep] = await Promise.all([
            gh.get(OWNERS_MANIFEST).then(r => r.text),
            gh.get(OWNERS_REPS).then(r => r.text),
          ]);
          const reps = window.Csv.rows(rawRep);
          const owners = window.Csv.rows(rawOwn).map(r => ({
            ...r, repetitions: reps.filter(p => p.subject === r.subject),
          }));
          if (!owners.length) throw new Error('no owners table');
          window.SourcePeek?.seed(this.peek(OWNERS_MANIFEST), rawOwn);
          window.SourcePeek?.seed(this.peek(OWNERS_REPS), rawRep);
          this.ownersReg = { owners };
        } catch (e) {
          this.ownersErr = 'Owners registry load failed: ' + (e?.message || e);
        } finally { this.ownersLoading = false; }
      },

      // ── Themes ────────────────────────────────────────────────────────────
      // docs/themes.json is a measurement, not a registry: no rule decides
      // membership, the shingle pass does. So it carries no registry chip, the
      // same standing as docs/injection.json on the Injection tab.
      async loadThemes(){
        if (this.themeGraph || this.themesLoading) return;
        this.themesLoading = true;
        this.themesErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          const raw = await gh.get(THEMES_GRAPH).then(r => r.text);
          window.SourcePeek?.seed(this.peek(THEMES_GRAPH), raw);
          const g = JSON.parse(raw);
          if (!g.edges?.length) throw new Error('no edges');
          this.themeGraph = g;
        } catch (e) {
          this.themesErr = 'Theme graph load failed: ' + (e?.message || e);
        } finally { this.themesLoading = false; }
      },

      // Every file the owners registry names anywhere, pulled out of prose
      // locators the same way owners-registry.test.mjs does. Membership stays
      // owners.csv's to say: the graph carries no copy of it, so this join is
      // the only place the two meet.
      get themeListed(){
        const out = new Set();
        const paths = /[\w./-]+\.(?:md|csv|json|js|mjs|html|sh|py)/g;
        for (const o of (this.ownersReg?.owners || [])) {
          for (const m of (o.authoritative || '').matchAll(paths)) out.add(m[0]);
          for (const r of (o.repetitions || []))
            for (const m of (r.where || '').matchAll(paths)) out.add(m[0]);
        }
        return out;
      },
      // An edge is listed when the registry names BOTH of its files, meaning
      // somebody has at least looked at what each one repeats. Naming one and
      // not the other is not an account of the pair.
      themeListedEdge(e){ const L = this.themeListed; return L.has(e.a) && L.has(e.b); },

      // Whether a file leaves this repository. docs/portable.csv curates the
      // to-go set and the plugin ships skills/ wholesale, so those two are the
      // whole answer. Read here rather than baked into the payload for the same
      // reason membership is: what travels is portable.csv's to say.
      get themeTravelling(){
        return new Set((this.manifest?.items || []).map(r => r.path).filter(Boolean));
      },
      themeTravels(p){
        return p.startsWith('skills/') || p.startsWith('.claude/skills/') || this.themeTravelling.has(p);
      },
      // The pair worth reviewing first: the shared text states a rule AND both
      // copies leave the repo, so no single reader ever sees them disagree.
      // Either half alone is weaker. A rule repeated in two files a reader has
      // side by side is visible; a description repeated anywhere only goes
      // stale.
      themeReview(e){ return !!e.rule && this.themeTravels(e.a) && this.themeTravels(e.b); },
      // What the accent means right now, which is whatever concern is selected.
      themeMarked(e){
        return this.themeConcern === 'review' ? this.themeReview(e) : !this.themeListedEdge(e);
      },

      get themeEdges(){
        return (this.themeGraph?.edges || [])
          .filter(e => e.w >= this.themeTh)
          .slice().sort((x, y) => y.w - x.w);
      },
      // Every count, so each segment carries its own definition and no legend
      // has to say what one of them selects.
      get themeTally(){
        const all = this.themeEdges;
        return {
          all: all.length,
          unlisted: all.filter(e => !this.themeListedEdge(e)).length,
          review: all.filter(e => this.themeReview(e)).length,
        };
      },

      // Union-find over whatever survives the threshold. A cluster is what the
      // dial makes, which is why the dial is the first control on the tab.
      get themeClusters(){
        const p = {};
        const find = (x) => { if (p[x] == null) p[x] = x; while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
        const edges = this.themeEdges;
        for (const e of edges) { const a = find(e.a), b = find(e.b); if (a !== b) p[a] = b; }
        const by = {};
        for (const e of edges) {
          const g = (by[find(e.a)] ||= { files: new Set(), edges: [] });
          g.files.add(e.a); g.files.add(e.b); g.edges.push(e);
        }
        return Object.values(by)
          .map(g => ({ files: [...g.files].sort(), edges: g.edges }))
          .sort((x, y) => y.files.length - x.files.length || y.edges[0].w - x.edges[0].w);
      },
      // Cluster order, so arcs bundle and the matrix shows blocks on the
      // diagonal rather than scatter.
      get themeOrdered(){ return this.themeClusters.flatMap(c => c.files); },

      get themeCells(){
        const o = this.themeOrdered, ix = {};
        o.forEach((f, i) => { ix[f] = i; });
        const m = {};
        for (const e of this.themeEdges) { m[ix[e.a] + ':' + ix[e.b]] = e; m[ix[e.b] + ':' + ix[e.a]] = e; }
        const out = [];
        for (let r = 0; r < o.length; r++)
          for (let c = 0; c < o.length; c++)
            out.push({ e: m[r + ':' + c] || null, diag: r === c, row: o[r], col: o[c] });
        return out;
      },

      // Built as a string, not an x-for: Alpine clones a <template> into the
      // HTML namespace, so a <path> inside <svg> parses as an unknown HTML
      // element and never draws. x-html lets the parser switch namespace.
      themeArcs(){
        const o = this.themeOrdered, R = 30, G = 108, H = Math.max(o.length * R, 1);
        const y = {};
        o.forEach((f, i) => { y[f] = i * R + R / 2; });
        const paths = this.themeEdges.map(e => {
          const bx = Math.min(G - 4, 16 + Math.abs(y[e.b] - y[e.a]) * 0.42);
          const hot = this.themeMarked(e);
          return `<path d="M ${G},${y[e.a]} C ${G - bx},${y[e.a]} ${G - bx},${y[e.b]} ${G},${y[e.b]}"`
               + ` fill="none" stroke-linecap="round" stroke="${hot ? 'var(--color-primary)' : 'currentColor'}"`
               + ` stroke-opacity="${hot ? 0.75 : 0.2}"`
               + ` stroke-width="${(1 + 4 * (e.w / this.themeMaxW)).toFixed(2)}"/>`;
        }).join('');
        return `<svg width="${G}" height="${H}" viewBox="0 0 ${G} ${H}">${paths}</svg>`;
      },
      get themeMaxW(){ return Math.max(1, ...(this.themeGraph?.edges || []).map(e => e.w)); },
      themeDir(p){ const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); },
      themeBase(p){ return p.slice(p.lastIndexOf('/') + 1); },
      // Never empty: the heaviest visible pair stands in until one is picked,
      // so the matrix always has a worked example of what a cell is.
      get themeShown(){ return this.themePick || this.themeEdges[0] || null; },

      // ── Readership ────────────────────────────────────────────────────────
      // Which documents sessions actually open, from the private registry's
      // sessions cache (state/sessions.json, docAttention). The registry says
      // what a doc is and reach says who CAN get to it; this says who did.
      //
      // A separate, token-gated fetch after the registry lands, never blocking
      // it: docs.csv is public and this tab must render for a reader with no
      // token, minus this column. It is a plain read of a committed aggregate,
      // so the crawl that refreshes it stays where it belongs, on the Sessions
      // pane; opening a docs tab should not go walking a private store.
      docReads: null,
      async loadDocReads(){
        if (this.docReads || !this.hasToken()) return;
        try {
          const S = window.RepoSessionsCache;
          const path = S?.CACHE_PATH || 'state/sessions.json';
          const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
          const cache = JSON.parse((await reg.get(path)).text);
          const by = {};
          for (const a of (cache.docAttention || [])) by[a.path] = a;
          this.docReads = by;
          // Presence, folded separately from access and never summed with it.
          // Absent until the crawl re-summarizes under record schema 6, which
          // is why every reader below falls back rather than showing a zero.
          const pres = {};
          for (const a of (cache.startupAttention || [])) pres[a.path] = a;
          this.docStartup = Object.keys(pres).length ? pres : null;
          // Invocation, for the Skills tab. Keyed by skill NAME, not by path:
          // a skill's body never passes through a file tool, so the readership
          // fold above cannot see one fire. Absent until the crawl re-summarizes
          // under row version 15, and null rather than empty so a skill reads
          // "not measured" instead of "never used" in the meantime.
          const uses = {};
          for (const a of (cache.skillAttention || [])) uses[a.path] = a;
          this.skillUses = Object.keys(uses).length ? uses : null;
          this.docReadsSessions = cache.count || 0;
        } catch {
          // A missing or unreadable cache leaves the column absent rather than
          // showing an error: the registry is not this tab's subject.
          this.docReads = null;
        }
      },
      docReadsSessions: 0,
      docPhantomsOpen: false,
      // path -> {sessions, receipt, reconstructed, last}; null while the cache
      // predates the field.
      docStartup: null,
      // skill name -> {count, sessions, last}; null while the cache predates it.
      skillUses: null,
      skillUse(name){ return this.skillUses?.[String(name || '').split(':').pop()] || null; },
      // The tail on a skill row. Silent when the fold is absent, and explicit
      // when it is present and the skill is not in it: those are "not measured"
      // and "never fired", and a blank for both would collapse the one number
      // this tab exists to show. A skill nobody invokes is the finding.
      skillUseLabel(name){
        if (!this.skillUses) return '';
        const u = this.skillUse(name);
        return u ? u.sessions + (u.sessions === 1 ? ' session' : ' sessions') : 'never fired';
      },
      skillUseHint(name){
        if (!this.skillUses) return '';
        const u = this.skillUse(name);
        if (!u) return 'Never invoked in any of the ' + this.docReadsSessions
          + ' recorded sessions. Counts the Skill tool call, so a skill whose file was '
          + 'merely opened does not appear here and one that fired does.';
        return 'Invoked in ' + u.sessions + ' of ' + this.docReadsSessions
          + ' recorded sessions (' + u.count + (u.count === 1 ? ' call' : ' calls')
          + '), last ' + (u.last || '').slice(0, 10)
          + '. Counts the Skill tool call, not a read of the file: a skill is loaded by the '
          + 'harness on invocation and never passes through a file tool. A plugin skill and '
          + 'its local twin (portable:tasks, tasks) count as one.';
      },
      docPresent(d){ return this.docStartup?.[this.docReadKey(d.path)] || null; },
      // The cache keys a file by repo-qualified path (`web-tools/docs/x.md`),
      // since a session spans repositories and `docs/README.md` alone would
      // collide across them. The registry rows are hub-relative, so qualify
      // before looking up rather than storing the same string twice.
      docReadKey(path){ return this.hub().split('/').pop() + '/' + path; },
      // A row's `formerly` names the paths the same document carried before a
      // rename (docs.json became docs.csv, and so on), so a read of an old path
      // is a read of this row: folded here, and excluded from the phantoms.
      docReadKeys(d){
        return [d.path, ...(d.formerly || '').split(';').filter(Boolean)].map(p => this.docReadKey(p));
      },
      docRead(d){
        if (!this.docReads) return null;
        const hits = this.docReadKeys(d).map(k => this.docReads[k]).filter(Boolean);
        if (!hits.length) return null;
        return hits.reduce((a, b) => ({ path: a.path, count: a.count + b.count,
          sessions: a.sessions + b.sessions, last: a.last > b.last ? a.last : b.last }));
      },
      // What the italic tail says, and the honest empty. A never-opened doc
      // shows nothing rather than a dash, since an absence needs no ornament,
      // and the caveats the column used to state in a standing paragraph live
      // in the per-row title.
      //
      // TWO FACTS, SIDE BY SIDE, NEVER ADDED. Presence in context and being
      // opened by a tool are different things, and a document present in forty
      // sessions and opened in three has not been read forty-three times.
      // Until 2026-08-27 this rendered that difference as the literal word
      // "injected" on the two rows tagged that way, because a count would have
      // ranked the estate's two most-read files last. The record now carries
      // startup context as data, so the word is the fallback for a cache older
      // than the field rather than the only answer available.
      //
      // The "injected" label used to close with "not measurable here, and not
      // zero", which was two claims: the first true, the second an assumption
      // about a delivery path nothing was checking. It was wrong on 2026-08-26,
      // when the hook carrying both documents turned out to have been truncated
      // to a 2 KB preview since 2026-08-07. That is the strongest argument for
      // the receipts behind this column: a receipt states the BYTE COUNT the
      // hook actually supplied, so the same nineteen-day silence would now show
      // as a number that moved rather than as a label nobody could check.
      docReadLabel(d){
        const p = this.docPresent(d), a = this.docRead(d);
        if (!p && !a) return d.reach === 'injected' ? 'injected' : '';
        const parts = [];
        if (p) parts.push(p.sessions + ' in context');
        if (a) parts.push(a.sessions + (a.sessions === 1 ? ' read' : ' reads'));
        return parts.join(' \u00b7 ');
      },
      docReadHint(d){
        const p = this.docPresent(d), a = this.docRead(d);
        if (!p && !a) {
          // The pre-receipt answer, kept for a cache older than the field.
          return d.reach === 'injected' ? 'Arrives in every session\'s context by injection, which no file tool records, so this column cannot measure it. Injection is a delivery path with its own failure modes, not a guarantee the text arrived: measured 2026-08-26, the hook carrying these two had been delivering the first 2 KB of 36 for nineteen days.' : '';
        }
        const out = [];
        if (p) {
          // Where the number came from is part of the number. A receipt is the
          // injecting hook naming what it supplied; a reconstruction is a
          // static walk standing in for a loader with no hook to observe it,
          // since Claude Code has no InstructionsLoaded event and its memory
          // loader logs a file count rather than the paths.
          const how = p.receipt && p.reconstructed ? 'by receipt and reconstruction'
            : p.receipt ? 'by receipt from the injecting hook, which states the bytes it supplied'
            : 'by reconstruction from the filesystem, not observed';
          out.push('In context at the start of ' + p.sessions + ' of '
            + this.docReadsSessions + ' recorded sessions, ' + how + '.');
        }
        if (a) {
          out.push('Opened in ' + a.sessions + ' of ' + this.docReadsSessions + ' recorded sessions ('
            + a.count + ' accesses), last ' + (a.last || '').slice(0, 10)
            + '. Counts the file tools and shell reads (cat, sed, grep) in recorded '
            + 'sessions; a bare path in a session spanning several checkouts is not '
            + 'attributed.');
        }
        if (p && a) out.push('The two are separate facts and are not added together.');
        return out.join(' ');
      },
      // The rail's selection.
      docDir: 'docs',
      // The rail: every directory in the registry plus its ancestors, in DFS
      // order (lexicographic gives it, since every path shares the docs/
      // root), rolled up so a folder's count and words include everything
      // below it. Structure comes from the full registry, so the tree never
      // changes shape under a reach filter; only the counts move, and a
      // folder filtered to nothing dims rather than vanishing.
      get docFolders(){
        const agg = new Map();
        for (const d of (this.docsReg?.documents || [])) {
          const hit = !this.docReach || d.reach === this.docReach;
          let dir = d.path.slice(0, d.path.lastIndexOf('/'));
          while (dir) {
            if (!agg.has(dir)) agg.set(dir, { n: 0, words: 0 });
            if (hit) { const a = agg.get(dir); a.n++; a.words += d.words || 0; }
            dir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
          }
        }
        return [...agg.entries()].sort(([a], [b]) => a.localeCompare(b))
          .map(([dir, a]) => ({
            dir, ...a,
            name: dir.slice(dir.lastIndexOf('/') + 1),
            depth: dir.split('/').length - 1,
          }));
      },
      // The selected folder's DIRECT files, filter applied; subfolder contents
      // stay behind their own rail rows.
      //
      // Registry order is the default and stays the default: it is the order
      // the folder actually has, and a reader looking for a known file finds it
      // there. The sort is the other question, "what is nobody opening", which
      // registry order answers only by making someone read every row.
      //
      // An injected doc sorts by its own channel, not by a zero. Nothing reads
      // it with a file tool by construction, so ranking it on reads would put
      // the estate's two most-delivered documents at the cold end, which is the
      // failure the readership column already refuses to make on a single row.
      get docDirFiles(){
        const rows = (this.docsReg?.documents || []).filter(d =>
          (!this.docReach || d.reach === this.docReach) &&
          d.path.slice(0, d.path.lastIndexOf('/')) === this.docDir);
        if (!this.docSort || !this.docReads) return rows;
        const rank = (d) => {
          const a = this.docRead(d), p = this.docPresent(d);
          return Math.max(a ? a.sessions : 0, p ? p.sessions : 0);
        };
        const dir = this.docSort === 'cold' ? -1 : 1;
        return [...rows].sort((x, y) =>
          dir * (rank(y) - rank(x)) || x.path.localeCompare(y.path));
      },
      // '' registry order, 'hot' most-opened first, 'cold' least. Cold is the
      // one worth having; hot is its inverse and costs one more state.
      docSort: '',
      cycleDocSort(){
        this.docSort = this.docSort === '' ? 'cold' : this.docSort === 'cold' ? 'hot' : '';
      },
      docSortLabel(){
        return this.docSort === 'cold' ? 'Coldest first'
          : this.docSort === 'hot' ? 'Most opened first' : 'Registry order';
      },

      // Reads that resolved to nothing: a path some session opened under this
      // hub's docs/ that the registry does not carry. Two causes and the
      // registry cannot tell them apart, so neither can this: a doc that has
      // since been deleted or renamed, and a path that never existed because a
      // session guessed it. The second is the one worth surfacing, and it is
      // the only direct evidence the estate holds that a document could not be
      // found by the name someone reached for. Measured 2026-08-30: five such
      // rows, among them docs/html-style.md, lowercase, for a file that is
      // HTML-STYLE.md, and three paths cut short of their .md.
      get docPhantoms(){
        if (!this.docReads || !this.docsReg) return [];
        const have = new Set((this.docsReg.documents || []).flatMap(d => this.docReadKeys(d)));
        const prefix = this.hub().split('/').pop() + '/docs/';
        return Object.values(this.docReads)
          .filter(a => a.path.startsWith(prefix) && !have.has(a.path))
          .sort((a, b) => (b.sessions - a.sessions) || a.path.localeCompare(b.path));
      },
      // The folder's README subject doubles as the folder's description; a
      // folder without one shows nothing, which is itself information.
      get docDirGloss(){
        const row = (this.docsReg?.documents || []).find(d => d.path === this.docDir + '/README.md');
        return row ? row.subject : '';
      },
      folderGh(dir){ return 'https://github.com/' + this.hub() + '/tree/' + useRef() + '/' + dir; },
      fmtWords(n){ return kw(n); },
      // The counted half of swipeDeck.entry's title, spelled the way every
      // other template-driven door spells it (branch-brief owns the original).
      plural(n, noun){ return n + ' ' + noun + (n === 1 ? '' : 's'); },
      docTitle(d){ return d.path.slice(d.path.lastIndexOf('/') + 1); },

      // Reading a doc: the house swipe deck, opened on the tapped row and
      // paging the selected folder's files as they are currently filtered.
      // Fetched full rather than excerpted (the peek is the glance, this is
      // the read), cached per ref:path so swiping back costs nothing. The
      // whole surface is imperative DOM: swipe-deck is framework-free, which
      // is also what keeps Alpine's moved-node hazards out of it.
      docDetails: false,
      _deck: null,
      _deckKey: '',
      // docDeckRead, not docRead: the readership column's per-row accessor
      // (main's parallel work, merged 2026-08-07) already owns that name, and
      // a duplicate object key would shadow it silently.
      async docDeckText(path){
        const key = useRef() + ':' + path;
        if (!docCache.has(key)) {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          docCache.set(key, (await gh.get(path)).text);
        }
        return docCache.get(key);
      },
      // The address a copied SECTION carries, assembled here because this is
      // the only place that knows all four parts: which repo the deck reads,
      // which ref it is pinned at, which file the slide is, and the blob URL a
      // person rather than a tool would open. mdDoc adds the line span.
      docDeckAddr(path){
        return { repo: this.hub(), ref: useRef(), path, url: this.hubUrl(path) };
      },
      async docDeckRead(host, path){
        const text = await this.docDeckText(path);
        return renderDoc(host, path, text, this.docDeckAddr(path));
      },
      // THE SLIDE IS THE DOCUMENT, and nothing above it. It used to lead with a
      // strip carrying the path, a GitHub mark and a "files view" button, which
      // named the file a THIRD time (the header's title and subtitle are the
      // other two, each elided a different way) and put two doors inside the
      // reading surface. kits/file-deck.js had already made this call for the
      // changeset deck and written down why; this half of the estate had not
      // followed. Both doors moved into the header, where the kit owns a `link`
      // slot and an actions row and the reader finds them in the same place on
      // every deck.
      // On the component only so the gate can reach it: the conversion is a
      // module-level pure function and renderDoc calls it directly, but a rule
      // about what a cell may not be reinterpreted as is worth holding, and
      // map-view.test.mjs mounts the component rather than the module.
      csvToMarkdown,
      //
      // IT RECORDS WHEN IT IS DONE, because a caller that wants to point INSIDE
      // a slide has to wait for three async steps it cannot see: the fetch,
      // marked, and md-doc. showPrimitive below is that caller, and without
      // this it scrolled an empty box. Keyed by path rather than by index,
      // since the index is the deck's and the path is the file's.
      _slideReady: null,
      renderDocSlide(d, slide){
        slide.innerHTML =
          '<div data-deck-content><div class="flex justify-center py-10">' +
          '<span class="loading loading-dots loading-md opacity-30"></span></div></div>';
        const box = slide.querySelector('[data-deck-content]');
        const done = this.docDeckRead(box, d.path)
          .catch(e => {
            box.innerHTML = '<div class="text-base text-error font-mono py-4">Load failed: '
              + esc(e?.message || e) + '</div>';
          })
          .then(() => box);
        (this._slideReady ||= new Map()).set(d.path, done);
        return done;
      },
      // ONE DECK FOR BOTH LISTS, and that is the point of the shape rather
      // than a saving. The Docs tab read a row here; the Portable tab reached
      // its file by NAVIGATING to the Files view, which is a route change and
      // not an overlay, so the list the reader was working through was gone and
      // the way back was the browser's. Two tabs in one view answered the same
      // tap two different ways. The deck is the better answer, because it keeps
      // the set, the reader's place in it, and the return path.
      //
      // A slide needs only `.path` (renderDoc decides the rendition by
      // extension and drops to a <pre> for source), so one renderer serves a
      // doc, a SKILL.md and a .py script alike. Kept as ONE function rather
      // than one per tab, since two would be two reading experiences a month
      // from now and nothing would report the drift.
      //
      // `start` is clamped here rather than at each call site: a findIndex miss
      // returns -1, and a deck opened at -1 is a blank first slide with the
      // pager already wrong.
      //
      // ONE LABELER, TWO READERS, which is what keeps the header and the
      // contents list from describing the same row two ways. `label(row)`
      // answers {title, subtitle, icon}; the HEADER takes the title and pairs
      // it with the locating half (the caller's context plus this file's
      // folder), and the CONTENTS list takes the title and the subtitle, which
      // is the gloss. The split is deliberate: a header answers "where am I"
      // and has one line to do it in, while a list is being scanned for "which
      // one did I want" and the subject is what answers that.
      // RE-AIM RATHER THAN STACK. Docked, the list stays on screen and stays
      // clickable, so a second tap is the ordinary case rather than the odd one,
      // and opening a second deck over the first would bury the reader one Back
      // press deeper for every row they looked at. Same list and a deck already
      // open: go to that slide. `key` is what "same list" means, since the two
      // tabs hand in different sets and the Docs tab a different one per folder.
      // A different key closes and reopens, which is the honest answer: the
      // pager, the title and the swipe range all belong to the old set.
      async openFileDeck(files, start, o){
        if (!files?.length) return;
        const { icon, key, context = '', label } = o || {};
        start = Math.max(0, Math.min(start, files.length - 1));
        if (this._deck && this._deckKey === key) return this._deck.deck.go(start);
        this._deck?.close();
        if (!window.swipeDeck && window.gh?.load) {
          try { await window.gh.load('kits/swipe-deck.js'); } catch { /* fall through */ }
        }
        if (!window.swipeDeck) return this.openHubFile(files[start].path);
        const at = (i) => files[i] || {};
        const lab = (i) => (label ? label(at(i), i) : null) || {};
        const dirOf = (i) => {
          const path = at(i).path || '';
          const j = path.lastIndexOf('/');
          return j < 0 ? '' : path.slice(0, j);
        };
        const crumb = (i) => [context, dirOf(i)].filter(Boolean).join(' · ');
        // Named rather than "Open": where a link goes is worth saying, which is
        // the same reason the kit lets a link carry its own mark.
        const ghAt = (i) => ({ href: this.hubUrl(at(i).path || ''), icon: 'ph-github-logo',
                               title: 'Open ' + (at(i).path || '') + ' on GitHub' });
        this._deckKey = key;
        this._deck = window.swipeDeck.open({
          count: files.length,
          start,
          title: lab(start).title || this.docTitle(at(start)),
          subtitle: crumb(start),
          icon,
          link: ghAt(start),
          index: (i) => ({ title: lab(i).title || this.docTitle(at(i)),
                           subtitle: lab(i).subtitle || '', icon: lab(i).icon || '' }),
          actions: [{ icon: 'ph-dots-three-vertical', title: 'Reference and actions',
                      onClick: (_deck, btn) => this.openDeckMenu(btn) }],
          render: (i, slide) => this.renderDocSlide(files[i], slide),
          onSlide: (i) => {
            this.closeDeckMenu();
            const h = this._deck;
            if (!h) return;
            h.setTitle(lab(i).title || this.docTitle(at(i)));
            h.setSubtitle(crumb(i));
            h.setLink(ghAt(i));
          },
          onClose: () => { this.closeDeckMenu(); this._deck = null; this._deckKey = ''; this._deckFiles = null; },
        });
        this._deckFiles = files;
      },

      // ── The reference menu ────────────────────────────────────────────────
      //
      // What the slide's old strip did, in the one place a phone has room for
      // it. Four of the five rows answer the same question the strip never
      // asked: how does a reader take this file WITH them. The estate has one
      // spelling for that, `owner/repo[@ref]:path`, which a toss, a stage and a
      // data view all read, so "copy address" hands over the qualified form
      // rather than a path that means nothing outside this repo. Copying the
      // contents costs no fetch: the slide already read the file into docCache,
      // keyed by the same ref this menu quotes.
      //
      // The fifth row is the strip's "files view" door, and it keeps its words.
      // As a bare icon in the header it would promise a direction and name no
      // destination, which on a surface with no tooltips is a worse trade than
      // one extra row in a menu the reader opened on purpose.
      _deckMenu: null,
      deckPath(){
        const i = this._deck?.deck?.active?.() ?? 0;
        return this._deckFiles?.[i]?.path || '';
      },
      deckAddress(path){ return this.hub() + '@' + useRef() + ':' + path; },
      // The address as a HINT, which is a different job from the address. The
      // row still copies all forty characters of the SHA, the one place the
      // conventions call being approximately right being wrong; this line only
      // has to let a reader recognize what they are about to copy.
      //
      // So it is budgeted from the RIGHT, which is kits/file-deck.js's lesson
      // about a deep path in the other carrier: CSS truncates from the right,
      // so the untouched address spent its whole width on `owner/repo@` plus
      // thirty-three characters of hex and dropped `:docs/APP.md`, the only
      // part that says WHICH FILE. Shortening the SHA was not enough on a
      // phone; the owner and repo had to go too, and they are the third a
      // reader of this menu already knows, since every row in the deck is this
      // hub's. The leading ellipsis says the copied value is longer.
      deckAddressHint(path){
        const ref = useRef();
        return '…@' + (/^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref) + ':' + path;
      },
      async deckCopy(text, said){
        const toast = window.Alpine?.store?.('toast');
        try {
          await navigator.clipboard.writeText(text);
          toast?.('check', said, 'alert-success', 2000);
        } catch (e) {
          toast?.('warning', 'Could not copy: ' + (e?.message || e), 'alert-error', 4000);
        }
      },
      closeDeckMenu(){
        if (!this._deckMenu) return;
        this._deckMenu.destroy();
        this._deckMenu = null;
      },
      openDeckMenu(btn){
        if (this._deckMenu) return this.closeDeckMenu();   // the button toggles
        const host = this._deck?.el;
        const path = this.deckPath();
        if (!host || !path) return;
        const rows = [
          { icon: 'ph-at', label: 'Copy address', hint: this.deckAddressHint(path),
            full: this.deckAddress(path),
            run: () => this.deckCopy(this.deckAddress(path), 'Address copied') },
          { icon: 'ph-file-text', label: 'Copy path', hint: path,
            run: () => this.deckCopy(path, 'Path copied') },
          { icon: 'ph-link-simple', label: 'Copy GitHub link',
            hint: 'the blob at ' + (/^[0-9a-f]{40}$/.test(useRef()) ? useRef().slice(0, 7) : useRef()),
            run: () => this.deckCopy(this.hubUrl(path), 'Link copied') },
          { icon: 'ph-clipboard-text', label: 'Copy contents', hint: 'the file as it reads here',
            run: async () => {
              await this.deckCopy(await this.docDeckText(path) || '', 'Contents copied');
            } },
          { icon: 'ph-arrow-square-out', label: 'Open in the files view',
            hint: 'for history and editing', sep: true,
            run: () => { this._deck?.close(); this.openHubFile(path); } },
        ];
        const menu = document.createElement('div');
        menu.className = 'absolute z-30 w-64 max-w-[calc(100%-1rem)] overflow-hidden rounded-xl '
          + 'border border-base-300 bg-base-100 shadow-xl';
        // IT HANGS OFF ITS OWN BUTTON. Pinned to the panel's right edge it
        // dropped from under the counter pill, two controls away from the thing
        // that opened it, which reads as a panel that arrived on its own. The
        // kit hands an action its button for exactly this. Falling back to the
        // header's measured height keeps it sane if a caller ever fires the
        // action from somewhere other than the header.
        const box = host.getBoundingClientRect();
        const r = btn?.getBoundingClientRect?.();
        menu.style.top = ((r ? r.bottom - box.top : (host.querySelector('.sd-header')?.offsetHeight || 56)) + 4) + 'px';
        menu.style.right = Math.max(8, r ? box.right - r.right : 8) + 'px';
        for (const r of rows) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-base-200/70 '
            + (r.sep ? 'border-t border-base-300' : '');
          // The elided hint in full, for a reader with a pointer. A phone gets
          // nothing from this and loses nothing by it.
          if (r.full) b.title = r.full;
          b.innerHTML = '<i class="ph ' + r.icon + ' mt-0.5 shrink-0 text-base text-base-content/50"></i>'
            + '<span class="min-w-0 flex-1"><span class="block text-sm">' + esc(r.label) + '</span>'
            + '<span class="block truncate text-xs text-base-content/50">' + esc(r.hint || '') + '</span></span>';
          b.addEventListener('click', () => { this.closeDeckMenu(); r.run(); });
          menu.append(b);
        }
        // Dismissal, and the Escape half is not decoration: the deck listens for
        // Escape on the window to close itself, so without a capture-phase
        // listener here the key would take the whole takeover down while a menu
        // was the only thing the reader meant to shut.
        const away = (e) => { if (!menu.contains(e.target)) this.closeDeckMenu(); };
        const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.closeDeckMenu(); } };
        this._deckMenu = {
          el: menu,
          destroy(){
            document.removeEventListener('pointerdown', away, true);
            document.removeEventListener('keydown', key, true);
            menu.remove();
          },
        };
        host.append(menu);
        // Next frame, so the click that opened this does not immediately close it.
        requestAnimationFrame(() => {
          document.addEventListener('pointerdown', away, true);
          document.addEventListener('keydown', key, true);
        });
      },
      openDocDeck(d){
        const files = this.docDirFiles;
        return this.openFileDeck(files, files.findIndex(f => f.path === d.path), {
          icon: 'ph-books', key: 'docs:' + this.docDir,
          // No context: the folder alone says which set this is, and repeating
          // "docs/" beside it would spend the crumb on nothing.
          label: (d2) => ({ title: this.docTitle(d2), subtitle: d2.subject || '' }),
        });
      },

      // Reach: the derived channel by which a reader gets to a doc. The counts
      // are the tab's headline because they are the one number here that moves
      // when the estate improves: point a skill or a page at an orphan and it
      // leaves the orphan column. Tapping a count filters the registry to it, so
      // "which 18 are orphans" is one tap rather than a scan.
      docReach: '',
      get docReachCounts(){
        const out = REACH_ORDER.map(key => ({ key, ...REACH[key], n: 0, words: 0 }));
        for (const d of (this.docsReg?.documents || [])) {
          const row = out.find(r => r.key === d.reach);
          if (row) { row.n++; row.words += (d.words || 0); }
        }
        const total = this.docWordTotal || 1;
        for (const r of out) r.share = Math.round(r.words / total * 100);
        return out;
      },
      // Mass, alongside the counts. A channel's file count says how many docs
      // sit there; its share says how much of the folder they are. The two
      // point in different directions here, which is the reason both render.
      get docWordTotal(){
        return (this.docsReg?.documents || []).reduce((s, d) => s + (d.words || 0), 0);
      },
      docSize(d){ return kw(d.words || 0); },
      docShare(d){
        const total = this.docWordTotal || 1;
        return Math.round((d.words || 0) / total * 100);
      },
      reachMeta(key){ return REACH[key] || { label: key, tone: 'badge-ghost' }; },

      // ── Skills ────────────────────────────────────────────────────────────
      // Two authored columns and nothing else, so the tab earns its place on
      // one affordance rather than on richness: the description IS the trigger
      // text a session matches against, so searching it answers "is there a
      // skill for this?", which 35 SKILL.md files and no index could not.
      skillsReg: null,
      skillsLoading: false,
      skillsErr: '',
      skillQ: '',
      async loadSkillsReg(){
        if (this.skillsReg || this.skillsLoading) return;
        this.skillsLoading = true;
        this.skillsErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          const [raw] = await Promise.all([
            gh.get(SKILLS_MANIFEST).then(r => r.text),
            this.loadPropsReg(),   // idempotent; carries the group vocabulary
          ]);
          const rows = window.Csv.rows(raw);
          if (!rows.length) throw new Error('no skills manifest');
          window.SourcePeek?.seed(this.peek(SKILLS_MANIFEST), raw);
          this.skillsReg = rows;
        } catch (e) {
          this.skillsErr = 'Skills load failed: ' + (e?.message || e);
        } finally { this.skillsLoading = false; }
      },
      // Name and description both, because a reader searching for a capability
      // has the words of the task, not the slug. Matching the description is
      // the whole point of holding it here.
      // ── The estate's own skills ───────────────────────────────────────────
      // The library above is the hub's. This is every OTHER repo's committed
      // .claude/skills/, read from the same crawled config cache the Repos
      // cards use, so the tab answers "is there a skill for this?" across the
      // estate rather than across one folder. Fifteen of them existed with no
      // surface anywhere until 2026-08-20, home's ten among them.
      //
      // Token-gated and silent on failure, like the Docs tab's readership: the
      // library is public and must render for a reader with no token, minus
      // this section. A repo that declares nothing contributes no group, which
      // is the ordinary case rather than a gap.
      estateSkills: null,
      async loadEstateSkills(){
        if (this.estateSkills || !this.hasToken()) return;
        try {
          const path = window.RepoConfigCache?.CACHE_PATH || 'state/configs.json';
          const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
          const cache = JSON.parse((await reg.get(path)).text);
          const groups = [];
          for (const [repo, e] of Object.entries(cache?.repos || {})) {
            if (repo === this.hub()) continue;   // the hub's own set IS the plugin
            const raw = e?.align?.skills || e?.config?.skills || [];
            if (!Array.isArray(raw) || !raw.length) continue;
            const skills = raw
              .map(s => (typeof s === 'string' ? { name: s } : s))
              .filter(s => s && s.name)
              .map(s => ({ name: String(s.name),
                           origin: s.origin === 'forked' ? 'forked' : 'local', repo }))
              .sort((a, b) => a.name.localeCompare(b.name));
            if (skills.length) groups.push({ repo, short: repo.split('/').pop(), skills });
          }
          groups.sort((a, b) => a.short.localeCompare(b.short));
          this.estateSkills = groups;
        } catch { this.estateSkills = null; }
      },
      // One query filters both halves, since a reader asking "is there a skill
      // for X" does not care which repo answers.
      get estateSkillGroups(){
        const q = this.skillQ.trim().toLowerCase();
        const groups = this.estateSkills || [];
        if (!q) return groups;
        return groups
          .map(g => ({ ...g, skills: g.skills.filter(s => s.name.toLowerCase().includes(q)) }))
          .filter(g => g.skills.length);
      },
      get estateSkillTotals(){
        const groups = this.estateSkills || [];
        return {
          repos: groups.length,
          skills: groups.reduce((n, g) => n + g.skills.length, 0),
          forked: groups.reduce((n, g) => n + g.skills.filter(s => s.origin === 'forked').length, 0),
        };
      },

      get skillRows(){
        const q = this.skillQ.trim().toLowerCase();
        let rows = this.skillsReg || [];
        if (this.skillGroup) rows = rows.filter(r => r.group === this.skillGroup);
        if (!q) return rows;
        return rows.filter(r =>
          r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));
      },
      // ── Grouping ──────────────────────────────────────────────────────────
      // Thirty-five rows alphabetical is a list you scroll, not one you browse:
      // docx sits next to doc-coauthoring and neither is near pdf. `group` is
      // the authored subject axis on skills/manifest.csv, and it is authored
      // because nothing on disk carries one. The strip cuts and the headers
      // orient, the same two-layer pattern the Harness tab runs on invocation.
      skillGroup: '',
      // Order is a reading order, not a count order: what the skill acts ON,
      // widening from the text to the file to the page, then the two platform
      // constraints, then the session itself.
      get skillGroupOrder(){ return ['prose','documents','web','device','windows','session']; },
      // docs/vocabularies.csv owns every label and gloss below. Reading it here
      // rather than inlining the six keeps the tab from carrying a second copy
      // of a table the Registries tab already renders; loadSkillsReg pulls the
      // pair in, idempotently, the same way loadOwnersReg does for scope.
      skillGroupVocab(value, field){
        const row = (this.propsReg?.vocab || []).find(
          x => x.registry === 'skills' && x.property === 'group' && x.value === value);
        return row?.[field] || (field === 'label' ? value : '');
      },
      get skillGroupCounts(){
        const all = this.skillsReg || [];
        const q = this.skillQ.trim().toLowerCase();
        const matching = q
          ? all.filter(r => r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))
          : all;
        const by = {};
        for (const r of matching) by[r.group] = (by[r.group] || 0) + 1;
        return this.skillGroupOrder
          .map(g => ({ key: g, label: this.skillGroupVocab(g, 'label'),
                       gloss: this.skillGroupVocab(g, 'gloss'), n: by[g] || 0 }));
      },
      // ── The three sets, as one axis ───────────────────────────────────────
      // A skill reaches a session three ways, and the tab used to render them
      // as two stacked lists plus a paragraph explaining that a third existed
      // on another tab. The distinction is real and load-bearing (it decides
      // whether a skill fires by itself, waits to be asked for, or is one
      // repo's own), so it is a control now, and each set states its own rule
      // where it is selected. The paragraph is gone: it was describing the
      // structure instead of being it.
      //
      // Plugin rows come from the Portable tab's manifest, already in hand
      // (load() fetches it on mount), so the third set costs no fetch.
      skillSet: '',
      get skillSetOrder(){ return ['plugin', 'library', 'estate']; },
      showSkillSet(key){ return !this.skillSet || this.skillSet === key; },
      // The registry chip follows the selection, since Plugin is the one set
      // this tab renders from a carrier other than the skills manifest.
      get skillManifestPath(){
        return this.skillSet === 'plugin' ? SET_MANIFEST : SKILLS_MANIFEST;
      },
      skillSetLabel(key){
        return { plugin: 'Plugin', library: 'Library', estate: 'Estate' }[key] || key;
      },
      // One line per set, carrying the rule rather than the history: what
      // installs it, and what that costs.
      skillSetGloss(key){
        return {
          plugin: 'Installed in every session by the portable plugin, and auto-firing: anything under .claude/skills/ registers that way, which is what the library exists to avoid.',
          library: 'Loaded on request with /load-skill. One row per directory under skills/, carrying the model-facing trigger description its own SKILL.md owns.',
          estate: 'What a repo committed under its own .claude/skills/, declared in its own manifest and collected by the crawl. The hub aggregates; it does not go reading trees.',
        }[key] || 'Three sets, one search: the plugin installs in every session, the library waits to be asked for, and the estate is what one repo grew for itself.';
      },
      // The plugin's own skills, matched on the same two fields the library is:
      // the name a reader would type and the sentence saying what it does.
      get pluginSkillRows(){
        const q = this.skillQ.trim().toLowerCase();
        const rows = (this.manifest?.items || []).filter(i => i.kind === 'skill');
        if (!q) return rows;
        return rows.filter(r => (r.title || '').toLowerCase().includes(q) ||
                                (r.command || '').toLowerCase().includes(q) ||
                                (this.setRole(r) || '').toLowerCase().includes(q));
      },
      // Counts re-weight under the query, the same as the group strip's, so a
      // search says WHERE its matches live before the reader opens one. A set
      // at nought dims rather than disappearing: a strip that reflows is a
      // moving target to tap at.
      get skillSetCounts(){
        const q = this.skillQ.trim().toLowerCase();
        const lib = q
          ? (this.skillsReg || []).filter(r => r.name.toLowerCase().includes(q) ||
                                               (r.description || '').toLowerCase().includes(q))
          : (this.skillsReg || []);
        return [
          { key: 'plugin',  n: this.pluginSkillRows.length },
          { key: 'library', n: lib.length },
          { key: 'estate',  n: this.estateSkillGroups.reduce((t, g) => t + g.skills.length, 0) },
        ].map(x => ({ ...x, label: this.skillSetLabel(x.key), gloss: this.skillSetGloss(x.key) }));
      },
      // The headline: what the query found across the sets in view, over what
      // is there to find. Both move with the set control, so the two numbers
      // are always about the same corpus.
      get skillTally(){
        const counts = Object.fromEntries(this.skillSetCounts.map(c => [c.key, c.n]));
        const all = { plugin: (this.manifest?.items || []).filter(i => i.kind === 'skill').length,
                      library: (this.skillsReg || []).length,
                      estate: (this.estateSkills || []).reduce((t, g) => t + g.skills.length, 0) };
        const keys = this.skillSetOrder.filter(k => this.showSkillSet(k));
        return { shown: keys.reduce((t, k) => t + counts[k], 0),
                 total: keys.reduce((t, k) => t + all[k], 0) };
      },

      // Sections, in the reading order, carrying only what survived the query.
      get skillSections(){
        const rows = this.skillRows;
        return this.skillGroupOrder
          .map(g => ({ key: g, label: this.skillGroupVocab(g, 'label'),
                       gloss: this.skillGroupVocab(g, 'gloss'),
                       rows: rows.filter(r => r.group === g) }))
          .filter(s => s.rows.length);
      },

      // ── Tests ─────────────────────────────────────────────────────────────
      testsReg: null,
      testsLoading: false,
      toolsReg: null,
      toolsLoading: false,
      toolsErr: '',
      harnessDir: 'tools',
      harnessInvoke: '',
      testsErr: '',
      testNames: false,
      async loadTestsReg(){
        if (this.testsReg || this.testsLoading) return;
        this.testsLoading = true;
        this.testsErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          const raw = (await gh.get(TESTS_MANIFEST)).text;
          // Blank is not-asserted: a browser check reports no assertion count
          // because test() is not its unit, which is a different claim from a
          // suite that ran zero. boot_smoke follows it, being dependent.
          const parsed = { tests: window.Csv.rows(raw).map(t => ({
            ...t,
            assertions: t.assertions === '' ? null : +t.assertions,
            boot_smoke: t.assertions === '' ? null : window.Csv.list(t.boot_smoke).map(Number),
            assertion_names: t.assertions === '' ? null : window.Csv.list(t.assertion_names),
          })) };
          if (!parsed.tests.length) throw new Error('no tests block');
          window.SourcePeek?.seed(this.peek(TESTS_MANIFEST), raw);
          this.testsReg = parsed;
        } catch (e) {
          this.testsErr = 'Test registry load failed: ' + (e?.message || e);
        } finally { this.testsLoading = false; }
      },
      // Browser checks are counted as files and excluded from the assertion
      // total rather than folded in as zero, so the headline never implies
      // they contribute nothing.
      get testTotals(){
        const rows = this.testsReg?.tests || [];
        return {
          files: rows.length,
          assertions: rows.reduce((s, t) => s + (t.assertions || 0), 0),
          smoke: rows.reduce((s, t) => s + (t.boot_smoke?.length || 0), 0),
          browser: rows.filter(t => t.assertions === null).length,
        };
      },
      // A qualification a row carries, filtered as a SECOND axis rather than
      // folded into the kind strip: a boot check and a browser check are not
      // genres of test, they are things true about a row of any genre. Same
      // shape as the harness registry's invocation pills over its layer rail.
      // These two used to be a sentence under the totals, which stated in prose
      // what the rows already render (the smoke badge, the browser icon) and
      // gave a 1.3% figure the same weight as the headline. A chip says the
      // number and shows you which files it means.
      // One labeled row per dimension, each row's chips carrying files and, where
      // the unit applies, assertions. A browser check reports no assertion count,
      // so its chip shows files alone rather than folding a null into a total.
      get testDimensions(){
        const rows = this.testsReg?.tests || [];
        return DIMENSIONS.map(d => ({
          ...d,
          chips: d.values
            .map(v => {
              const hit = rows.filter(t => d.of(t) === v);
              return {
                value: v,
                files: hit.length,
                assertions: hit.reduce((s, t) => s + (t.assertions || 0), 0),
                counted: hit.some(t => t.assertions !== null),
                hint: d.hint(v, this.testsReg),
                dot: d.dot ? (KIND_TONE[v] || 'badge-ghost').replace('badge-', 'bg-') : '',
              };
            })
            .filter(c => c.files),
        }));
      },
      // One selection per dimension, so the three compose as an AND.
      testPick: {},
      toggleDim(dim, value){
        this.testPick = { ...this.testPick, [dim]: this.testPick[dim] === value ? '' : value };
      },
      get testPicked(){ return DIMENSIONS.filter(d => this.testPick[d.key]); },
      clearDims(){ this.testPick = {}; },
      // Which of a row's assertions are boot checks, as a Set for the list to
      // mark. Indices, because that is the level the property lives at.
      smokeSet(t){ return new Set(t.boot_smoke || []); },
      get testGroups(){
        const groups = new Map();
        for (const t of (this.testsReg?.tests || [])) {
          if (DIMENSIONS.some(d => this.testPick[d.key] && d.of(t) !== this.testPick[d.key])) continue;
          if (!groups.has(t.method)) groups.set(t.method, []);
          groups.get(t.method).push(t);
        }
        return METHOD_ORDER.filter(m => groups.has(m))
          .map(method => ({ method, hint: METHOD_HINT[method] || '', tests: groups.get(method) }));
      },
      testTitle(t){ return t.path.replace('tools/test/', '').replace(/\.(test\.)?mjs$/, ''); },
      // The suite as the strip has cut it, flattened out of its groups. The
      // deck pages what the reader is looking at, so a filter narrows the deck
      // with it; the order is the groups' order, which is the order on screen.
      get testShown(){ return this.testGroups.flatMap(g => g.tests); },
      // A CHECK IS A DOCUMENT HERE, which is the whole reason the row moved off
      // openHubFile: the Tests tab's subject is what each check protects, and
      // the answer is prose at the top of the file. The Files view is where you
      // work on one; this is where you read them.
      //
      // `key` carries the filter, since two different cuts are two different
      // sets and a deck reopened on the same key would page the old one.
      openTestDeck(t){
        const files = this.testShown;
        return this.openFileDeck(files, files.findIndex(f => f.path === t.path), {
          icon: 'ph-flask', key: 'tests:' + JSON.stringify(this.testPick),
          context: 'Tests',
          label: (x) => ({ title: this.testTitle(x), subtitle: x.protects || '' }),
        });
      },
      kindTone(k){ return KIND_TONE[k] || 'badge-ghost'; },
      async loadToolsReg(){
        if (this.toolsReg || this.toolsLoading) return;
        this.toolsLoading = true;
        this.toolsErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          const raw = (await gh.get(TOOLS_MANIFEST)).text;
          const parsed = { tools: window.Csv.rows(raw).map(t => ({
            ...t, lines: +t.lines || 0,
            emits: t.emits === 'yes', named: t.named === 'yes', tested: t.tested === 'yes',
          })) };
          if (!parsed.tools.length) throw new Error('no tools block');
          window.SourcePeek?.seed(this.peek(TOOLS_MANIFEST), raw);
          this.toolsReg = parsed;
        } catch (e) {
          this.toolsErr = 'Harness registry load failed: ' + (e?.message || e);
        } finally { this.toolsLoading = false; }
      },
      // The rail: every folder that holds a registry row, counts rolled up to
      // ancestors the same way the Docs rail rolls words, with the blank-role
      // count as the second figure. The invocation filter re-weights it.
      get harnessFolders(){
        const agg = new Map();
        for (const t of (this.toolsReg?.tools || [])) {
          const hit = this.harnessHit(t);
          let dir = t.layer;
          while (dir) {
            if (!agg.has(dir)) agg.set(dir, { n: 0, blank: 0 });
            if (hit) { const a = agg.get(dir); a.n++; if (!t.role) a.blank++; }
            dir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
          }
        }
        return [...agg.entries()].sort(([a], [b]) => a.localeCompare(b))
          .map(([dir, a]) => ({
            dir, ...a,
            name: dir.slice(dir.lastIndexOf('/') + 1),
            depth: dir.split('/').length - 1,
          }));
      },
      harnessHit(t){
        if (!this.harnessInvoke) return true;
        return this.harnessInvoke === 'npm'
          ? t.invocation.startsWith('npm:') : t.invocation === this.harnessInvoke;
      },
      get harnessInvokeCounts(){
        const rows = this.toolsReg?.tools || [];
        const gloss = {
          npm: 'a package.json script invokes it',
          driver: 'passed by path to npm run shot --script; named nowhere is its normal state',
          imported: 'another node file imports it',
          argv: 'carries a shebang; run by hand',
          'none found': 'no route the derivation can see, the warning state',
        };
        return ['npm', 'driver', 'imported', 'argv', 'none found'].map(key => ({
          key,
          tone: INVOKE_TONE[key] || 'badge-ghost',
          gloss: gloss[key],
          n: rows.filter(t => key === 'npm' ? t.invocation.startsWith('npm:') : t.invocation === key).length,
        })).filter(r => r.n);
      },
      get harnessDirFiles(){
        return (this.toolsReg?.tools || []).filter(t =>
          this.harnessHit(t) && t.layer === this.harnessDir);
      },
      get harnessDirGloss(){
        return this.toolsReg?.layers?.[this.harnessDir] || '';
      },
      get toolTotals(){
        const rows = this.toolsReg?.tools || [];
        return {
          files: rows.length,
          named: rows.filter(t => t.named).length,
          tested: rows.filter(t => t.tested).length,
          blank: rows.filter(t => !t.role).length,
        };
      },
      toggleHarnessInvoke(key){ this.harnessInvoke = this.harnessInvoke === key ? '' : key; },
      // The Harness tab's door, the Docs tab's shape: a folder rail, a selected
      // folder, its direct files as filtered.
      openHarnessDeck(t){
        const files = this.harnessDirFiles;
        return this.openFileDeck(files, files.findIndex(f => f.path === t.path), {
          icon: 'ph-wrench', key: 'harness:' + this.harnessDir,
          label: (x) => ({ title: this.toolTitle(x), subtitle: x.role || '' }),
        });
      },
      toolTitle(t){ return t.path.split('/').pop(); },
      invokeTone(inv){ return INVOKE_TONE[inv.startsWith('npm:') ? 'npm' : inv] || 'badge-ghost'; },
      toggleToolLayer(key){ this.toolLayer = this.toolLayer === key ? '' : key; },
      toggleReach(key){ this.docReach = this.docReach === key ? '' : key; },
      // An unchecked copy or paraphrase is the fact this tab exists to show,
      // so it renders in the warning tone; a pointer or live read needs no
      // check and stays neutral.
      checkText(r){
        if (r.check) return r.check;
        return (r.relation === 'pointer' || r.relation === 'live read') ? 'no check needed' : 'unchecked';
      },
      checkTone(r){
        const fine = r.relation === 'pointer' || r.relation === 'live read';
        const held = r.check && !/^none/i.test(r.check);
        return 'text-sm ' + (fine || held ? 'text-base-content/40' : 'text-warning');
      },

    };
  });
});
