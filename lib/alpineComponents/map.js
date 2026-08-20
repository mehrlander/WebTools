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
    //   Docs        the documentation registry, read from the hub's
    //               docs/docs.csv: every doc's subject, status (living claims
    //               current truth, record preserves a moment, measured carries
    //               dated observations and is corrected by re-probing), reach,
    //               and maintenance, plus the shared-claims table (each
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
    //               two no file tool can count, so they say "injected" instead
    //               of the zero that would rank them last.
    // Scope and adoption were a third tab here until 2026-08-03. They are facts
    // about a REPO, and the estate's Repos cards are where a repo is described,
    // so a second grid of the same repos with different columns was a copy of
    // the roster. They moved onto the card (alpineComponents/estate.js), which
    // also ended the drift this view suffered from keeping its own roster: a
    // repo joined the estate and never reached the Map's list. What is left
    // here is what belongs to no single repo.
    // All three halves are public (the hub repo is public).
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
    const SET_MANIFEST = 'docs/portable.csv';
    // Four carriers, assembled into the one object the Showing tab renders.
    // The three tables are their own CSV registries; routes.json keeps only
    // what is not a table (the grammar, the precedence, the showing frame), so
    // the header's curate link still has one file to open.
    const ROUTES_MANIFEST = 'docs/routes.json';
    const ROUTES_MODES = 'docs/routes-modes.csv';
    const ROUTES_ROUTES = 'docs/routes-routes.csv';
    const SHOWING_MECHANISMS = 'docs/showing-mechanisms.csv';
    const DOCS_MANIFEST = 'docs/docs.csv';
    // The Owners tab. Its own carrier since 2026-08-09: the table used to be a
    // second `claims` block inside docs/docs.csv, which the registry model
    // forbids (a registry does not live inside another registry's carrier), and
    // "claim" was spending a word the estate already uses three other ways. The
    // ?tab=claims URL key is unchanged, the way ?tab=set outlived "The set".
    // Two files since 2026-08-16: a repetition is a different target from the
    // statement it repeats, so it is its own registry. The tab rejoins them.
    const OWNERS_MANIFEST = 'docs/owners.csv';
    const OWNERS_REPS = 'docs/repetitions.csv';
    // The Showing tab's prose frame: the argument behind the manifest, linked
    // from the tab header the way the set header links the doctrine.
    const SHOWING_FRAME = 'docs/showing.md';
    // Surfacing inverts the ownership: SURFACING.md is authoritative (it is
    // what sessions load and follow) and the manifest is its gated index, so
    // the header leads with the doc and the Curate link edits the index.
    const SURF_MANIFEST = 'docs/surfacing.csv';
    const SURF_DOC = 'docs/SURFACING.md';
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
    // gate or a lockstep failing means a committed claim is false; a boot
    // smoke check passing means the component still mounts. Both are worth
    // having and they are not the same evidence, which is the whole reason
    // this tab cuts the total by kind instead of reporting it.
    const KIND_ORDER = ['gate', 'lockstep', 'tool', 'kit', 'behavior', 'component', 'guard'];
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
    const TOOLS_BUILDER = 'tools/build/tools-index.mjs';
    // How a harness file gets run. The axis decides whether "nothing names
    // it" matters: a driver is passed by path to npm run shot --script, so no
    // other route will ever name one, while "none found" is a file with no
    // visible way to run at all, which is the warning state.
    const INVOKE_TONE = {
      npm: 'badge-success', driver: 'badge-info', imported: 'badge-secondary',
      argv: 'badge-primary', 'none found': 'badge-warning',
    };
    const KIND_TONE = {
      gate: 'badge-success', lockstep: 'badge-success', tool: 'badge-info',
      kit: 'badge-info', behavior: 'badge-secondary', component: 'badge-primary',
      guard: 'badge-warning',
    };
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
      // kind and nothing else. It has to be a dimension-level opt-in rather than
      // a lookup per value, since `kit` is both a kind and a method and a bare
      // KIND_TONE hit would tint the method chip with a meaning it does not have.
      { key: 'kind', label: 'kind', question: 'what genre of check is this', dot: true,
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
    const escHtml = s => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let sheetMarkedP = null;
    const sheetMarked = () => sheetMarkedP ||= window.marked ? Promise.resolve() :
      new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js';
        s.onload = res; s.onerror = () => rej(new Error('marked failed to load'));
        document.head.appendChild(s);
      });
    async function renderDoc(path, text){
      const sp = window.SourcePeek;
      const kind = sp?.kindOf ? sp.kindOf(path)
        : (/\.(md|markdown)$/i.test(path) ? 'markdown' : /\.json$/i.test(path) ? 'json' : 'source');
      if (kind === 'markdown') {
        try {
          await sheetMarked();
          const fenced = sp?.fenceFrontmatter ? sp.fenceFrontmatter(text) : text;
          return '<div class="prose prose-sm !max-w-none prose-pre:bg-base-200 prose-pre:text-base-content">' + window.marked.parse(fenced) + '</div>';
        } catch { /* marked unavailable: fall through to source */ }
      }
      const body = (kind === 'json' && sp?.jsonText) ? sp.jsonText(text) : text;
      return '<pre class="text-sm font-mono whitespace-pre-wrap m-0">' + escHtml(body) + '</pre>';
    }

    return {
      description: 'Map view: the coordination layer made inspectable, in eight tabs. Portable (docs/portable.csv, the to-go set; a row\'s title opens the file in the same swipe deck the Docs tab uses, paging the whole set, while a `dir` row still opens its folder and every row\'s GitHub icon, inline with the badges, carries the source peek); Surfacing (docs/surfacing.csv, the gated index of SURFACING.md\'s primitives, the prose staying authoritative); Showing (docs/routes.json): which link reaches which kind of change and what each one misses, then the address grammar, toss-render\'s delivery modes and their trust postures, and the toss routes; and Docs (docs/docs.csv): the documentation registry, every doc\'s subject, status (living, record, or measured), reach (injected, in context, by a skill, by the app, or orphan; derived from the repo and filterable from the strip at the top), size in words with its share of the folder, readership (distinct sessions that opened the file, from the private registry\'s sessions cache; token-gated, and an injected doc says so rather than reading the zero no file tool can avoid giving it), and maintenance behind one details toggle for the whole registry, all navigated from a folder rail whose rows roll up counts and words and carry their own GitHub links; a row\'s title opens the document in a fullscreen swipe deck paging the folder\'s files, while its GitHub icon, inline with the badges, carries the source peek. Owners (docs/owners.csv, ?tab=claims): for a statement the coordination layer repeats, its one authoritative carrier, typed repetitions, and per-repetition checks, with an absent check rendered in the warning tone rather than omitted, under the registry\'s own written scope. Named Claims until 2026-08-09, when the registry reconciliation moved it out of docs/docs.csv and off a word the estate spends three other ways. Reach counts files and words weighs them, and the strip shows both because on this folder they disagree: the orphans are the larger count and the smaller mass; readership is the third of that set, since reach says who can get to a doc and readership says who did. And Tests (docs/tests.csv): the same registry pointed at the suite, every check\'s kind (gate, lockstep, tool, kit, behavior, component, guard) and what breaks if it is deleted, with assertions, method, runner and boot-smoke count derived from the files and gated against the registry. The strip cuts the total by kind, since a pass count cannot tell a boot check from an adversarial gate; a browser check reports no assertion count rather than zero, because test() is not its unit. And Harness (docs/harness.csv): the harness registry, one row per code file under tools/ and scripts/ (tools/test/ excluded; the Tests registry owns it), each row an authored role plus derived layer, lines, invocation route (npm script, scenario driver, imported helper, argv, or none found, the warning state), whether it writes files, whether prose names it and a test exercises it; navigated from the same folder rail as Docs (the tree as it exists on disk, counts and blank-role figures rolled up to ancestors), with the invocation pills as a separate filter layer that re-weights the rail. And Registries (docs/registries.csv): the declaration table the other seven tabs hang off, one card per registry (title, gloss, kind, carrier, gate, target grain, scope, per-declaration chips), grouped by area (files or names), with derived totals rather than prose-carried counts, and per row the derived renders_in list: the app files that name the carrier in code, each a peekable link, with a warning badge and a strip figure for carriers no app surface reads, since an unread claim is where the registry audits keep finding rot. Per-repo scope and adoption live on the Repos cards. The operational face of the constellation doctrine.',

      template: `
        <div class="w-full">
          <!-- The tab strip. Who carries what is a property of each repo, so
               that lives on the Repos cards, not here. -->
          <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 mb-6 w-fit flex-wrap" role="tablist">
            <button role="tab" @click="setTab('set')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="mapTab==='set' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-package text-lg"></i>Portable</button>
            <button role="tab" @click="setTab('surfacing')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="mapTab==='surfacing' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-megaphone text-lg"></i>Surfacing</button>
            <button role="tab" @click="setTab('showing')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="mapTab==='showing' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-paper-plane-tilt text-lg"></i>Showing</button>
            <button role="tab" @click="setTab('docs')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="mapTab==='docs' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-books text-lg"></i>Docs</button>
            <button role="tab" @click="setTab('claims')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="mapTab==='claims' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-key text-lg"></i>Owners</button>
            <button role="tab" @click="setTab('tests')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="mapTab==='tests' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-flask text-lg"></i>Tests</button>
            <button role="tab" @click="setTab('harness')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="mapTab==='harness' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-wrench text-lg"></i>Harness</button>
            <button role="tab" @click="setTab('skills')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="mapTab==='skills' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-sparkle text-lg"></i>Skills</button>
            <button role="tab" @click="setTab('registries')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="mapTab==='registries' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-stack text-lg"></i>Registries</button>
          </div>
          <!-- ── Portable ────────────────────────────────────────────────── -->
          <section x-show="mapTab==='set'">
            <!-- No section title: the Portable tab already names this. -->
            <div class="flex items-center gap-2 mb-4 flex-wrap">
              <code class="text-sm text-base-content/50">/plugin install portable@web-tools</code>
              <div class="grow"></div>
              <!-- The manifest THIS TAB READS, labelled, since a bare icon in a
                   header reads as pointing at whatever it sits beside. -->
              <a :href="hubUrl(SET_MANIFEST)" :data-peek="peek(SET_MANIFEST)" target="_blank" rel="noopener"
                 class="flex items-center gap-1.5 text-base text-base-content/50 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors"
                 :title="'Curate the set (' + SET_MANIFEST + ')'">
                <i class="ph ph-github-logo"></i><span>Curate</span></a>
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
            <div class="flex items-center gap-2 mb-5 flex-wrap">
              <span class="text-sm font-semibold uppercase tracking-wide text-base-content/40">The doc (authoritative)</span>
              <code class="text-sm text-base-content/50" x-text="SURF_DOC"></code>
              <a :href="hubUrl(SURF_DOC)" :data-peek="peek(SURF_DOC)" target="_blank" rel="noopener"
                 class="text-base-content/40 hover:text-primary" :title="SURF_DOC + ' on GitHub'">
                <i class="ph ph-github-logo"></i></a>
              <button type="button" @click="openHubFile(SURF_DOC)"
                      class="flex items-center gap-1.5 text-base text-base-content/60 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors"
                      title="Read it rendered, in the shell viewer">
                <i class="ph ph-book-open"></i><span>Read</span>
              </button>
              <div class="grow"></div>
              <a :href="hubUrl(SURF_MANIFEST)" :data-peek="peek(SURF_MANIFEST)" target="_blank" rel="noopener"
                 class="flex items-center gap-1.5 text-base text-base-content/50 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors"
                 :title="'Curate the index (' + SURF_MANIFEST + '); membership is test-gated to the doc'">
                <i class="ph ph-github-logo"></i><span>Curate</span></a>
            </div>
            <p class="text-base text-base-content/60 mb-4 max-w-4xl">The primitives that make session work visible in chat. Surfacing decides what to hand over; Showing (next tab) is what makes it openable. These cards index the doc, which stays authoritative.</p>
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
                      <span class="font-semibold" x-text="p.title"></span>
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
            <!-- Two files meet in this header and the reader has to be able to
                 tell them apart: the RENDERER is the runtime the tab describes,
                 the MANIFEST is what supplies the description. A bare icon
                 between them read as belonging to the renderer's filename while
                 pointing at the manifest, so each now says which it is: the
                 renderer under a label with its own jump, the manifest labelled
                 Curate and pushed to the far edge, as in the Tools view. -->
            <div class="flex items-center gap-2 mb-5 flex-wrap">
              <span class="text-sm font-semibold uppercase tracking-wide text-base-content/40">Renderer</span>
              <code class="text-sm text-base-content/50" x-text="rendererPath"></code>
              <a :href="hubUrl(rendererPath)" :data-peek="peek(rendererPath)" target="_blank" rel="noopener"
                 class="text-base-content/40 hover:text-primary" :title="rendererPath + ' on GitHub'">
                <i class="ph ph-github-logo"></i></a>
              <div class="grow"></div>
              <a :href="hubUrl(ROUTES_MANIFEST)" :data-peek="peek(ROUTES_MANIFEST)" target="_blank" rel="noopener"
                 class="flex items-center gap-1.5 text-base text-base-content/50 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors"
                 :title="'Curate the manifest (' + ROUTES_MANIFEST + ')'">
                <i class="ph ph-github-logo"></i><span>Curate</span></a>
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
              <div class="flex flex-col gap-8 max-w-4xl">

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

              </div>
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
              <span class="text-sm font-semibold uppercase tracking-wide text-base-content/40">Registry</span>
              <!-- The registry named as a first-class thing: the filename is
                   the link, and it carries the source peek (JSON pretty-
                   printed) like any exact-file GitHub jump-over. -->
              <a :href="hubUrl(DOCS_MANIFEST)" :data-peek="peek(DOCS_MANIFEST)" target="_blank" rel="noopener"
                 class="inline-flex items-center gap-1.5 font-mono text-sm text-base-content/60 hover:text-primary"
                 :title="'The registry this tab renders (' + DOCS_MANIFEST + ')'">
                <span x-text="DOCS_MANIFEST"></span><i class="ph ph-github-logo"></i></a>
              <a :href="hubUrl(REACH_BUILDER)" :data-peek="peek(REACH_BUILDER)" target="_blank" rel="noopener"
                 class="text-base-content/30 hover:text-primary"
                 title="tools/build/docs-reach.mjs stamps reach and words; every other field is authored">
                <i class="ph ph-function"></i></a>
            </div>
            <div x-show="docsLoading" class="flex justify-center py-10">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <div x-show="docsErr" class="text-base text-error font-mono" x-text="docsErr"></div>
            <template x-if="docsReg">
              <div class="flex flex-col gap-8">

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
                    <!-- One toggle for the whole registry, not a per-row
                         disclosure: maintenance is either the question you are
                         asking (show it everywhere) or noise (show it nowhere). -->
                    <button type="button" @click="docDetails = !docDetails"
                            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors text-base"
                            :class="docDetails ? 'border-primary bg-primary/10' : 'border-base-300 hover:bg-base-200'"
                            title="Show each row's maintenance: who regenerates or edits the file">
                      <i class="ph ph-info"></i><span>details</span></button>
                  </div>
                  <p x-show="docReach" class="text-sm text-base-content/50 mt-2 max-w-4xl"
                     x-text="reachMeta(docReach).hint"></p>
                </div>

                <div class="flex flex-col lg:flex-row gap-x-8 gap-y-4">
                  <!-- Folder rail: the registry's directories as a tree, rolled
                       up (a folder's count and words include everything below
                       it). Always expanded: seven folders do not earn collapse
                       state. The GitHub icon stays visible rather than
                       hover-revealed, because hover drops on touch and the
                       folder link is a first-class destination here. -->
                  <nav class="lg:w-80 shrink-0" aria-label="docs folders">
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
                    </div>
                    <p x-show="docDirGloss" class="text-base text-base-content/60 mb-3" x-text="docDirGloss"></p>
                    <!-- Two columns above xl so a wide screen is used rather
                         than left as a gutter; one column below it. -->
                    <div class="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-1">
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
                              <span class="text-sm tabular-nums"
                                    :class="docShare(d) >= 5 ? 'text-warning' : 'text-base-content/40'"
                                    :title="d.words.toLocaleString() + ' words, ' + docShare(d) + '% of docs/'"
                                    x-text="docSize(d)"></span>
                              <!-- Inline with the badges, always visible: this
                                   icon carries the source peek, and parked at
                                   the row's far edge it read as furniture. -->
                              <a :href="hubUrl(d.path)" :data-peek="peek(d.path)"
                                 target="_blank" rel="noopener" title="Open on GitHub"
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

          <!-- ── Owners: who owns a statement that lives in several places ─── -->
          <!-- Its own tab (2026-08-07): it keys on STATEMENTS, not files, so it
               trailed the registry as an appendix nobody scrolled to, first
               open, then folded. A tab keeps the registry on one viewport and
               gives the table a viewport of its own. An absent check renders in
               the warning tone rather than being omitted, because an unchecked
               copy should look unchecked every time this tab is opened.
               Its own carrier and its own name since 2026-08-09 (the registry
               reconciliation); ?tab=claims still resolves here. The scope line
               under the heading is the reason eleven rows is a population and
               not a sample, and it is read from the carrier rather than written
               here, so the tab cannot disagree with the registry about what the
               registry covers. -->
          <section x-show="mapTab==='claims'">
            <div class="flex items-center gap-2 mb-5 flex-wrap">
              <span class="text-sm font-semibold uppercase tracking-wide text-base-content/40">Registry</span>
              <a :href="hubUrl(OWNERS_MANIFEST)" :data-peek="peek(OWNERS_MANIFEST)" target="_blank" rel="noopener"
                 class="inline-flex items-center gap-1.5 font-mono text-sm text-base-content/60 hover:text-primary"
                 :title="'The registry this tab renders (' + OWNERS_MANIFEST + ')'">
                <span x-text="OWNERS_MANIFEST"></span><i class="ph ph-github-logo"></i></a>
              <div class="grow"></div>
              <a :href="hubUrl(OWNERS_MANIFEST)" :data-peek="peek(OWNERS_MANIFEST)" target="_blank" rel="noopener"
                 class="flex items-center gap-1.5 text-base text-base-content/50 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors"
                 :title="'Curate the registry (' + OWNERS_MANIFEST + ')'">
                <i class="ph ph-github-logo"></i><span>Curate</span></a>
            </div>
            <div x-show="ownersLoading" class="flex justify-center py-10">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <div x-show="ownersErr" class="text-base text-error font-mono" x-text="ownersErr"></div>
            <template x-if="ownersReg">
              <div class="max-w-4xl">
                <p class="text-base text-base-content/60 mb-1">Statements that live in more than one place. One authoritative carrier each; every repetition says how it relates and what holds it, and an absent check says so.</p>
                <p class="text-sm text-base-content/40 mb-3"><span class="font-semibold uppercase tracking-wide">scope</span> <span x-text="ownersReg.scope"></span></p>
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
                            <span class="badge badge-ghost badge-sm shrink-0" x-text="r.relation + (r.kept ? ', kept ' + r.kept : '')"></span>
                            <span class="text-base-content/70" x-text="r.where"></span>
                            <span :class="checkTone(r)" x-text="checkText(r)"></span>
                          </div>
                        </template>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </template>
          </section>


          <!-- ── Skills: the on-demand library ──────────────────────────────
               The one registry whose absence was mistaken for coverage: the
               Portable tab shows the plugin's 16 skills and this shows a
               DISJOINT library of 35, so "the plugin section covers skills"
               was true of a set this one does not contain.

               Two columns, so the tab is a search rather than a table. The
               description is the model-facing trigger text, which makes it the
               right thing to match on: a reader looking for a capability has
               the words of the task and not the slug. -->
          <section x-show="mapTab==='skills'">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="text-sm font-semibold uppercase tracking-wide text-base-content/40">Skills</span>
              <a :href="hubUrl(SKILLS_MANIFEST)" :data-peek="peek(SKILLS_MANIFEST)" target="_blank" rel="noopener"
                 class="inline-flex items-center gap-1.5 font-mono text-sm text-base-content/60 hover:text-primary"
                 :title="'The registry this tab renders (' + SKILLS_MANIFEST + ')'">
                <span x-text="SKILLS_MANIFEST"></span><i class="ph ph-github-logo"></i></a>
            </div>
            <p class="text-sm text-base-content/50 mb-3 max-w-4xl">
              The library a session loads on demand, one row per directory under skills/. Not the
              plugin's skills, which install in every session and are on the Portable tab: the two
              sets share no member, because anything under .claude/skills/ registers as auto-fire
              and the library exists to avoid exactly that. Each row carries the trigger description
              its own SKILL.md owns, so searching here searches what a session matches on.
            </p>

            <div x-show="skillsLoading" class="flex justify-center py-10">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <div x-show="skillsErr" class="text-base text-error font-mono" x-text="skillsErr"></div>

            <template x-if="skillsReg">
              <div class="max-w-4xl">
                <div class="flex items-center gap-3 flex-wrap mb-4">
                  <label class="input input-sm input-bordered flex items-center gap-2 grow max-w-md">
                    <i class="ph ph-magnifying-glass opacity-40"></i>
                    <input type="search" class="grow" placeholder="search name and trigger text"
                           x-model="skillQ">
                  </label>
                  <span class="text-sm">
                    <span class="font-semibold text-lg" x-text="skillRows.length"></span>
                    <span class="text-base-content/50"
                          x-text="skillRows.length === skillsReg.length ? ' skills' : ' of ' + skillsReg.length + ' skills'"></span>
                  </span>
                </div>

                <div x-show="!skillRows.length" class="text-base text-base-content/40 py-6">
                  Nothing matches. The trigger text is what a session reads, so a miss here is a
                  real gap rather than a naming problem.
                </div>

                <div class="flex flex-col gap-2">
                  <template x-for="s in skillRows" :key="s.name">
                    <div class="border border-base-300 rounded-lg p-3 bg-base-100">
                      <div class="flex items-baseline gap-2 flex-wrap">
                        <a :href="hubUrl('skills/' + s.name + '/SKILL.md')"
                           :data-peek="peek('skills/' + s.name + '/SKILL.md')" target="_blank" rel="noopener"
                           class="font-mono font-semibold hover:text-primary" x-text="s.name"></a>
                        <span class="grow"></span>
                        <code class="text-sm text-primary/80" x-text="'/load-skill ' + s.name"></code>
                      </div>
                      <p class="text-base text-base-content/60 mt-1" x-text="s.description"></p>
                    </div>
                  </template>
                </div>
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
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="text-sm font-semibold uppercase tracking-wide text-base-content/40">Registries</span>
              <a :href="hubUrl(PROPS_MANIFEST)" :data-peek="peek(PROPS_MANIFEST)" target="_blank" rel="noopener"
                 class="inline-flex items-center gap-1.5 font-mono text-sm text-base-content/60 hover:text-primary"
                 :title="'The registry table this tab renders (' + PROPS_MANIFEST + '); edit it there'">
                <span x-text="PROPS_MANIFEST"></span><i class="ph ph-github-logo"></i></a>
              <a :href="hubUrl(PROPS_DECLS)" :data-peek="peek(PROPS_DECLS)" target="_blank" rel="noopener"
                 class="text-[11px] font-mono opacity-40 hover:opacity-80 inline-flex items-center gap-1"
                 :title="'One row per column of every registry (' + PROPS_DECLS + ')'">
                <span x-text="PROPS_DECLS"></span><i class="ph ph-github-logo"></i></a>
              <a :href="hubUrl(PROPS_VOCAB)" :data-peek="peek(PROPS_VOCAB)" target="_blank" rel="noopener"
                 class="text-[11px] font-mono opacity-40 hover:opacity-80 inline-flex items-center gap-1"
                 :title="'What each value of a closed domain means (' + PROPS_VOCAB + ')'">
                <span x-text="PROPS_VOCAB"></span><i class="ph ph-github-logo"></i></a>
              <a :href="hubUrl(PROPS_DOC)" :data-peek="peek(PROPS_DOC)" target="_blank" rel="noopener"
                 class="text-base-content/30 hover:text-primary"
                 title="docs/registries.md: the model, and what reconciliation found">
                <i class="ph ph-book-open-text"></i></a>
            </div>
            <p class="text-sm text-base-content/50 mb-3 max-w-4xl">
              What the repo records about itself, grouped by what each record is about. A registry
              is one committed file holding a row per thing it describes, and one property about
              one thing answers to exactly one registry. Every field below defines itself: the
              index governs its own carriers, so what a column means and what it may hold are rows
              here rather than prose somewhere else.
            </p>

            <!-- The legend, and the reason it is a component rather than a
                 paragraph: every line of it is committed data with a gate
                 behind it. A prose version was maintained in registries.md and
                 its rows duplicated glosses committed in the pair, which is the
                 copy that drifts. Closed by default on both grains, since a
                 reader who knows the model should meet the cards first. -->
            <div class="flex flex-col gap-1 mb-5 max-w-4xl">
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
              <div class="max-w-4xl">
                <div class="flex items-center gap-4 flex-wrap mb-5 text-sm">
                  <span><span class="font-semibold text-lg" x-text="registryTotals.registries"></span> registries</span>
                  <span class="text-base-content/50"><span x-text="registryTotals.computed"></span> computed / <span x-text="registryTotals.curated"></span> curated</span>
                  <span x-show="registryTotals.inheriting" class="text-base-content/50"><span x-text="registryTotals.inheriting"></span> inheriting</span>
                  <span class="text-base-content/50"><span x-text="registryTotals.gated"></span> gated</span>
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
                            <a x-show="hasGate(r)" :href="hubUrl(r.gate)" :data-peek="peek(r.gate)" target="_blank" rel="noopener"
                               class="text-base-content/30 hover:text-primary" :title="'Gated by ' + r.gate">
                              <i class="ph ph-shield-check text-lg"></i></a>
                            <span x-show="!hasGate(r)" class="badge badge-warning badge-sm"
                                  title="Nothing fails when this registry and the repo disagree">no gate</span>
                          </div>
                          <p class="text-base text-base-content/70 mt-1" x-text="r.gloss"></p>
                          <div class="flex items-baseline gap-2 flex-wrap mt-2">
                            <span class="font-mono text-sm text-base-content/30" x-text="r.id"></span>
                            <a :href="hubUrl(r.file)" :data-peek="peek(r.file)" target="_blank" rel="noopener"
                               class="font-mono text-sm text-base-content/60 hover:text-primary" x-text="r.file"></a>
                          </div>
                          <!-- The identity line: which column names a row, and
                               which name space that column resolves into. It is
                               here because the ownership rule is only checkable
                               with it (the same page is annotate.html to the
                               page gallery and pages/annotate.html to the tools
                               shelf), and a card showing that rule's warnings
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
                              <a :href="hubUrl(f)" :data-peek="peek(f)" target="_blank" rel="noopener"
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
              <span class="text-sm font-semibold uppercase tracking-wide text-base-content/40">Suite</span>
              <a :href="hubUrl(TESTS_MANIFEST)" :data-peek="peek(TESTS_MANIFEST)" target="_blank" rel="noopener"
                 class="inline-flex items-center gap-1.5 font-mono text-sm text-base-content/60 hover:text-primary"
                 :title="'The registry this tab renders (' + TESTS_MANIFEST + '); edit it there'">
                <span x-text="TESTS_MANIFEST"></span><i class="ph ph-github-logo"></i></a>
              <a :href="hubUrl(TESTS_BUILDER)" :data-peek="peek(TESTS_BUILDER)" target="_blank" rel="noopener"
                 class="text-base-content/30 hover:text-primary"
                 title="tools/build/tests-index.mjs stamps assertions, method, runner and boot_smoke; kind and protects are authored">
                <i class="ph ph-function"></i></a>
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
                    <p class="text-sm text-base-content/50 max-w-4xl">
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
                                        @click="openHubFile(t.path)" x-text="testTitle(t)"></button>
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
                            <a :href="hubUrl(t.path)" :data-peek="peek(t.path)"
                               target="_blank" rel="noopener" title="Open on GitHub"
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
               The harness registry. Same shape as Tests one shelf over: role is
               the authored judgment, the counts are derived, and a blank role
               renders in the warning tone rather than being hidden, because
               the ledger of unaccounted files is the number this tab exists
               to show. No backticks anywhere in this template. -->
          <section x-show="mapTab==='harness'">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="text-sm font-semibold uppercase tracking-wide text-base-content/40">Harness</span>
              <!-- The registry named as a first-class thing, the Docs idiom: the
                   filename is the link and carries the source peek. The one
                   icon beside it opens the generator that stamps every field
                   but role. No "Curate" twin: the filename already goes there. -->
              <a :href="hubUrl(TOOLS_MANIFEST)" :data-peek="peek(TOOLS_MANIFEST)" target="_blank" rel="noopener"
                 class="inline-flex items-center gap-1.5 font-mono text-sm text-base-content/60 hover:text-primary"
                 :title="'The registry this tab renders (' + TOOLS_MANIFEST + '); edit it there'">
                <span x-text="TOOLS_MANIFEST"></span><i class="ph ph-github-logo"></i></a>
              <a :href="hubUrl(TOOLS_BUILDER)" :data-peek="peek(TOOLS_BUILDER)" target="_blank" rel="noopener"
                 class="text-base-content/30 hover:text-primary"
                 title="tools/build/tools-index.mjs stamps every field but role from the tree">
                <i class="ph ph-function"></i></a>
            </div>
            <p class="text-sm text-base-content/50 mb-5 max-w-4xl">
              What each file under tools/ and scripts/ is for and how it runs.
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
                                      @click="openHubFile(t.path)" x-text="toolTitle(t)"></button>
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
                          <a :href="hubUrl(t.path)" :data-peek="peek(t.path)"
                             target="_blank" rel="noopener" title="Open on GitHub"
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
        </div>
      `,

      SET_MANIFEST,
      ROUTES_MANIFEST,
      DOCS_MANIFEST,
      OWNERS_MANIFEST,
      OWNERS_REPS,
      PROPS_MANIFEST,
      PROPS_DECLS,
      PROPS_VOCAB,
      TEXT_FIELDS,
      SKILLS_MANIFEST,
      PROPS_DOC,
      SHOWING_FRAME,
      SURF_MANIFEST,
      SURF_DOC,
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
      propsReg: null,
      propsLoading: false,
      propsErr: '',
      docsReg: null,
      docsLoading: false,
      docsErr: '',
      ownersReg: null,
      ownersLoading: false,
      ownersErr: '',
      surf: null,
      surfLoading: false,
      surfErr: '',

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
        if (tab === 'surfacing') this.loadSurf();
        else if (tab === 'showing') this.loadRoutes();
        else if (tab === 'docs') this.loadDocsReg();
        else if (tab === 'claims') this.loadOwnersReg();
        else if (tab === 'tests') this.loadTestsReg();
        else if (tab === 'harness') this.loadToolsReg();
        else if (tab === 'registries') this.loadPropsReg();
        else if (tab === 'skills') this.loadSkillsReg();
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
        // Auth resolves after boot, so a Docs tab opened tokenless renders its
        // registry and picks the readership column up here when the token lands.
        if (this.docsReg) this.loadDocReads();
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
        return this.openFileDeck(files, files.findIndex(f => f.path === it.path),
                                 'Portable', 'ph-package', 'set');
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
      async loadRoutes(){
        if (this.routes || this.routesLoading) return;
        this.routesLoading = true;
        this.routesErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          const [raw, modes, routes, mechanisms] = await Promise.all(
            [ROUTES_MANIFEST, ROUTES_MODES, ROUTES_ROUTES, SHOWING_MECHANISMS]
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
      async loadSurf(){
        if (this.surf || this.surfLoading) return;
        this.surfLoading = true;
        this.surfErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          const raw = (await gh.get(SURF_MANIFEST)).text;
          const parsed = { primitives: window.Csv.rows(raw) };
          if (!parsed.primitives.length) throw new Error('no primitives in the index');
          window.SourcePeek?.seed(this.peek(SURF_MANIFEST), raw);
          this.surf = parsed;
        } catch (e) {
          this.surfErr = 'Surfacing manifest load failed: ' + (e?.message || e);
        } finally { this.surfLoading = false; }
      },

      // ── Docs ──────────────────────────────────────────────────────────────
      // Same lazy shape as loadRoutes: fetched on first open of the tab.
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
          // The registry pair carries this registry's scope, so it has to be in
          // hand even when a reader opens Owners without touching Registries.
          // Idempotent: it returns immediately once loaded.
          const [rawOwn, rawRep] = await Promise.all([
            gh.get(OWNERS_MANIFEST).then(r => r.text),
            gh.get(OWNERS_REPS).then(r => r.text),
            this.loadPropsReg(),
          ]);
          const reps = window.Csv.rows(rawRep);
          const owners = window.Csv.rows(rawOwn).map(r => ({
            ...r, repetitions: reps.filter(p => p.subject === r.subject),
          }));
          if (!owners.length) throw new Error('no owners table');
          window.SourcePeek?.seed(this.peek(OWNERS_MANIFEST), rawOwn);
          window.SourcePeek?.seed(this.peek(OWNERS_REPS), rawRep);
          // scope moved to the registry row, which is where every other
          // registry's scope already lived.
          const scope = this.propsReg?.registries?.find(r => r.id === 'owners')?.scope || '';
          this.ownersReg = { owners, scope };
        } catch (e) {
          this.ownersErr = 'Owners registry load failed: ' + (e?.message || e);
        } finally { this.ownersLoading = false; }
      },

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
          this.docReadsSessions = cache.count || 0;
        } catch {
          // A missing or unreadable cache leaves the column absent rather than
          // showing an error: the registry is not this tab's subject.
          this.docReads = null;
        }
      },
      docReadsSessions: 0,
      // The cache keys a file by repo-qualified path (`web-tools/docs/x.md`),
      // since a session spans repositories and `docs/README.md` alone would
      // collide across them. The registry rows are hub-relative, so qualify
      // before looking up rather than storing the same string twice.
      docReadKey(path){ return this.hub().split('/').pop() + '/' + path; },
      docRead(d){ return this.docReads?.[this.docReadKey(d.path)] || null; },
      // What the italic tail says, and the honest empty. An injected doc reads
      // zero by construction: it arrives in a session's context without a file
      // tool ever opening it, so a count would rank the two most-read files in
      // the estate last; it says "injected" instead. A never-opened doc shows
      // nothing rather than a dash, since an absence needs no ornament. The
      // caveats the column used to state in a standing paragraph live in the
      // per-row title now.
      docReadLabel(d){
        if (d.reach === 'injected') return 'injected';
        const a = this.docRead(d);
        if (!a) return '';
        return a.sessions + (a.sessions === 1 ? ' read' : ' reads');
      },
      docReadHint(d){
        if (d.reach === 'injected') return 'Arrives in every session\'s context by injection, which no file tool records. Not measurable here, and not zero.';
        const a = this.docRead(d);
        if (!a) return '';
        return 'Opened in ' + a.sessions + ' of ' + this.docReadsSessions + ' recorded sessions ('
          + a.count + ' accesses), last ' + (a.last || '').slice(0, 10)
          + '. Counts the file tools only (Read, Edit, Write, NotebookEdit) in recorded sessions.';
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
      get docDirFiles(){
        return (this.docsReg?.documents || []).filter(d =>
          (!this.docReach || d.reach === this.docReach) &&
          d.path.slice(0, d.path.lastIndexOf('/')) === this.docDir);
      },
      // The folder's README subject doubles as the folder's description; a
      // folder without one shows nothing, which is itself information.
      get docDirGloss(){
        const row = (this.docsReg?.documents || []).find(d => d.path === this.docDir + '/README.md');
        return row ? row.subject : '';
      },
      folderGh(dir){ return 'https://github.com/' + this.hub() + '/tree/' + useRef() + '/' + dir; },
      fmtWords(n){ return kw(n); },
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
      async docDeckRead(path){
        const key = useRef() + ':' + path;
        if (!docCache.has(key)) {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          docCache.set(key, (await gh.get(path)).text);
        }
        return renderDoc(path, docCache.get(key));
      },
      renderDocSlide(d, slide){
        const gh = this.hubUrl(d.path);
        slide.innerHTML =
          '<div class="flex items-center gap-2 flex-wrap pb-3">' +
            '<code class="text-sm text-base-content/50">' + d.path + '</code>' +
            '<a href="' + gh + '" target="_blank" rel="noopener" title="Open on GitHub"' +
            ' class="text-base-content/40 hover:text-primary"><i class="ph ph-github-logo"></i></a>' +
            '<div class="grow"></div>' +
            '<button type="button" data-deck-files title="Open in the files view, for history and editing"' +
            ' class="flex items-center gap-1.5 text-sm text-base-content/50 hover:text-primary">' +
            '<i class="ph ph-arrow-square-out"></i><span>files view</span></button>' +
          '</div>' +
          '<div data-deck-content><div class="flex justify-center py-10">' +
          '<span class="loading loading-dots loading-md opacity-30"></span></div></div>';
        slide.querySelector('[data-deck-files]').addEventListener('click', () => {
          this._deck?.close();
          this.openHubFile(d.path);
        });
        const box = slide.querySelector('[data-deck-content]');
        this.docDeckRead(d.path)
          .then(html => { box.innerHTML = html; })
          .catch(e => {
            box.innerHTML = '<div class="text-base text-error font-mono py-4">Load failed: '
              + escHtml(e?.message || e) + '</div>';
          });
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
      // RE-AIM RATHER THAN STACK. Docked, the list stays on screen and stays
      // clickable, so a second tap is the ordinary case rather than the odd one,
      // and opening a second deck over the first would bury the reader one Back
      // press deeper for every row they looked at. Same list and a deck already
      // open: go to that slide. `key` is what "same list" means, since the two
      // tabs hand in different sets and the Docs tab a different one per folder.
      // A different key closes and reopens, which is the honest answer: the
      // pager, the title and the swipe range all belong to the old set.
      async openFileDeck(files, start, title, icon, key){
        if (!files?.length) return;
        start = Math.max(0, Math.min(start, files.length - 1));
        if (this._deck && this._deckKey === key) return this._deck.deck.go(start);
        this._deck?.close();
        if (!window.swipeDeck && window.gh?.load) {
          try { await window.gh.load('kits/swipe-deck.js'); } catch { /* fall through */ }
        }
        if (!window.swipeDeck) return this.openHubFile(files[start].path);
        this._deckKey = key;
        this._deck = window.swipeDeck.open({
          count: files.length,
          start,
          title,
          subtitle: files[start]?.path || '',
          icon,
          render: (i, slide) => this.renderDocSlide(files[i], slide),
          onSlide: (i) => { this._deck?.setSubtitle(files[i]?.path || ''); },
          onClose: () => { this._deck = null; this._deckKey = ''; },
        });
      },
      openDocDeck(d){
        const files = this.docDirFiles;
        return this.openFileDeck(files, files.findIndex(f => f.path === d.path),
                                 this.docDir + '/', 'ph-books', 'docs:' + this.docDir);
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
          const raw = await gh.get(SKILLS_MANIFEST).then(r => r.text);
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
      get skillRows(){
        const q = this.skillQ.trim().toLowerCase();
        const rows = this.skillsReg || [];
        if (!q) return rows;
        return rows.filter(r =>
          r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));
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
