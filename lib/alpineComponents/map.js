document.addEventListener('alpine:init', function() {
  Alpine.data('map', function() {
    // The Map view: the estate's coordination layer made inspectable. It is the
    // operational face of the constellation doctrine (home's
    // created/2026-06-27-constellation-architecture.md, kernel at the hub's
    // docs/CONSTELLATION.md), in two parts across two tabs.
    //   Portable    the to-go bag from the hub's committed manifest
    //               (docs/portable.json, prose parent docs/PORTABLE.md): plugin
    //               skills, docs, scripts, each opening in the shell's own
    //               viewer. The doctrine kernel rides here as a doc, so the
    //               theory of what-goes-where sits beside the conventions it
    //               governs. Labelled "The set" until 2026-08-07; renamed to
    //               the word the estate already uses (PORTABLE.md, the
    //               portable plugin). The URL key stays `set`, so old
    //               ?tab=set links keep resolving.
    //   Surfacing   the primitives that make session work visible in chat,
    //               indexed from docs/surfacing.json. Ownership runs the other
    //               way from every other tab: SURFACING.md is authoritative
    //               (sessions load and follow the prose) and the manifest is
    //               its gated index (membership two-way,
    //               surfacing-manifest.test.mjs). Surfacing decides what to
    //               hand over; Showing is what makes it openable.
    //   Showing     how content moves, renders, and gets looked at, read from
    //               the hub's docs/routes.json: the Showing table (which link
    //               reaches which kind of change), the shared
    //               owner/repo[@ref]:path address grammar, the delivery modes
    //               toss-render accepts (inline payload versus fetched
    //               reference, and the trust posture each one buys), and the
    //               toss routes mapping a content type to its renderer page.
    //               Named Transport until 2026-08-04; renamed because
    //               SURFACING.md already uses "transport" for the stage link,
    //               and the lead section here was titled Showing all along.
    //   Docs        the documentation registry, read from the hub's
    //               docs/docs.json: every doc's subject, status (living claims
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
    const SET_MANIFEST = 'docs/portable.json';
    const ROUTES_MANIFEST = 'docs/routes.json';
    const DOCS_MANIFEST = 'docs/docs.json';
    // The Showing tab's prose frame: the argument behind the manifest, linked
    // from the tab header the way the set header links the doctrine.
    const SHOWING_FRAME = 'docs/showing.md';
    // Surfacing inverts the ownership: SURFACING.md is authoritative (it is
    // what sessions load and follow) and the manifest is its gated index, so
    // the header leads with the doc and the Curate link edits the index.
    const SURF_MANIFEST = 'docs/surfacing.json';
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
    // The Tests tab. Same shape as Docs one axis over: the census says what
    // each check is and what it protects, and the counts are derived.
    const TESTS_MANIFEST = 'docs/tests.json';
    const TESTS_BUILDER = 'tools/build/tests-index.mjs';
    // Ordered by how much a passing assertion is worth, strongest first. A
    // gate or a lockstep failing means a committed claim is false; a boot
    // smoke check passing means the component still mounts. Both are worth
    // having and they are not the same evidence, which is the whole reason
    // this tab cuts the total by kind instead of reporting it.
    const KIND_ORDER = ['gate', 'lockstep', 'tool', 'kit', 'behavior', 'component', 'guard'];
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
      description: 'Map view: the coordination layer made inspectable, in five tabs. Portable (docs/portable.json, the to-go set, each row openable in the shell viewer); Surfacing (docs/surfacing.json, the gated index of SURFACING.md\'s primitives, the prose staying authoritative); Showing (docs/routes.json): which link reaches which kind of change and what each one misses, then the address grammar, toss-render\'s delivery modes and their trust postures, and the toss routes; and Docs (docs/docs.json): the documentation registry, every doc\'s subject, status (living, record, or measured), reach (injected, in context, by a skill, by the app, or orphan; derived from the repo and filterable from the strip at the top), size in words with its share of the folder, and maintenance behind one details toggle for the whole census, all navigated from a folder rail whose rows roll up counts and words and carry their own GitHub links; a row\'s title opens the document in a fullscreen swipe deck paging the folder\'s files, while its GitHub icon, inline with the badges, carries the source peek; plus the shared-claims table with per-repetition checks. Reach counts files and words weighs them, and the strip shows both because on this folder they disagree: the orphans are the larger count and the smaller mass. And Tests (docs/tests.json): the same census pointed at the suite, every check\'s kind (gate, lockstep, tool, kit, behavior, component, guard) and what breaks if it is deleted, with assertions, method, runner and boot-smoke count derived from the files and gated against the registry. The strip cuts the total by kind, since a pass count cannot tell a boot check from an adversarial gate; a browser check reports no assertion count rather than zero, because test() is not its unit. Per-repo scope and adoption live on the Repos cards. The operational face of the constellation doctrine.',

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
            <button role="tab" @click="setTab('tests')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="mapTab==='tests' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-flask text-lg"></i>Tests</button>
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
            <div class="grid gap-x-8 gap-y-6 lg:grid-cols-2 xl:grid-cols-3">
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
                          </div>
                          <p class="text-base text-base-content/60" x-text="it.role"></p>
                        </div>
                        <a :href="itemGh(it)" :data-peek="it.kind === 'dir' ? null : peek(it.path)"
                           target="_blank" rel="noopener" title="Open on GitHub"
                           class="opacity-0 group-hover:opacity-100 focus:opacity-100 text-base-content/30 hover:text-primary transition-opacity shrink-0 mt-1">
                          <i class="ph ph-github-logo"></i></a>
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
                     rows are read from docs/routes.json, so the reference and
                     the router cannot drift, and the doc points here rather
                     than restating it. -->
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

          <!-- ── Docs: the documentation registry ─────────────────────────── -->
          <!-- Two tables from docs/docs.json. Documents: what each file under
               docs/ is (subject, living/record, maintenance), complete by
               construction (the census test), laid out as a folder rail
               beside the selected folder's files so the hierarchy reads as
               one. Claims: statements living in more than one place, each
               with one authoritative carrier and typed repetitions; an absent
               check renders as visibly absent, because an unchecked copy
               should look unchecked every time this tab is opened. -->
          <section x-show="mapTab==='docs'">
            <div class="flex items-center gap-2 mb-5 flex-wrap">
              <span class="text-sm font-semibold uppercase tracking-wide text-base-content/40">Registry</span>
              <code class="text-sm text-base-content/50" x-text="DOCS_MANIFEST"></code>
              <div class="grow"></div>
              <a :href="hubUrl(REACH_BUILDER)" :data-peek="peek(REACH_BUILDER)" target="_blank" rel="noopener"
                 class="flex items-center gap-1.5 text-sm text-base-content/40 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors"
                 title="Reach is derived from the repo and gated against the registry; it is the one field here that is not hand-edited">
                <i class="ph ph-function"></i><span>reach is derived</span></a>
              <a :href="hubUrl(DOCS_MANIFEST)" :data-peek="peek(DOCS_MANIFEST)" target="_blank" rel="noopener"
                 class="flex items-center gap-1.5 text-base text-base-content/50 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors"
                 :title="'Curate the registry (' + DOCS_MANIFEST + ')'">
                <i class="ph ph-github-logo"></i><span>Curate</span></a>
            </div>
            <!-- The scope, said once: what a reader is and is not looking at.
                 The census test is what makes the first clause a claim rather
                 than an aspiration. -->
            <p class="text-sm text-base-content/50 -mt-3 mb-4 max-w-4xl">
              Every .md and .json under docs/, one row each, held complete by the census test;
              reach and words are derived from the repo, the rest is authored. Documentation
              living outside docs/ is out of scope here.</p>
            <div x-show="docsLoading" class="flex justify-center py-10">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <div x-show="docsErr" class="text-base text-error font-mono" x-text="docsErr"></div>
            <template x-if="docsReg">
              <div class="flex flex-col gap-8">

                <!-- Reach strip: the five channels with their counts, each a
                     filter. The census answers what a doc is; this answers
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
                    <!-- One toggle for the whole census, not a per-row
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
                            <p class="text-base text-base-content/60" x-text="d.subject"></p>
                            <p x-show="docDetails" class="text-sm text-base-content/40" x-text="d.maintenance"></p>
                          </div>
                        </div>
                      </template>
                    </div>
                    <p x-show="!docDirFiles.length" class="text-base text-base-content/50 py-4">
                      No files in this folder match the selected reach filter.</p>
                  </div>
                </div>

                <div class="max-w-4xl">
                  <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-2">Shared claims</h3>
                  <p class="text-base text-base-content/60 mb-3">Statements that live in more than one place. One authoritative carrier each; every repetition says how it relates and what holds it, and an absent check says so.</p>
                  <div class="flex flex-col gap-2">
                    <template x-for="c in (docsReg.claims || [])" :key="c.claim || c.family">
                      <div class="border border-base-300 rounded-lg p-3 bg-base-100">
                        <div class="flex items-baseline gap-2 flex-wrap">
                          <span class="font-semibold" x-text="c.claim || c.family"></span>
                          <span x-show="c.family" class="badge badge-ghost badge-sm" :title="c.applies_to">family rule</span>
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

          <!-- ── Tests ───────────────────────────────────────────────────────
               The documents census pointed at the suite. The runner reports a
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
              <code class="text-sm text-base-content/50" x-text="TESTS_MANIFEST"></code>
              <div class="grow"></div>
              <a :href="hubUrl(TESTS_BUILDER)" :data-peek="peek(TESTS_BUILDER)" target="_blank" rel="noopener"
                 class="flex items-center gap-1.5 text-sm text-base-content/40 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors"
                 title="assertions, method, runner and boot_smoke are derived from the files and gated against this registry">
                <i class="ph ph-function"></i><span>counts are derived</span></a>
              <a :href="hubUrl(TESTS_MANIFEST)" :data-peek="peek(TESTS_MANIFEST)" target="_blank" rel="noopener"
                 class="flex items-center gap-1.5 text-base text-base-content/50 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors"
                 :title="'Curate the registry (' + TESTS_MANIFEST + ')'">
                <i class="ph ph-github-logo"></i><span>Curate</span></a>
            </div>
            <div x-show="testsLoading" class="flex justify-center py-10">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <div x-show="testsErr" class="text-base text-error font-mono" x-text="testsErr"></div>
            <template x-if="testsReg">
              <div class="flex flex-col gap-8">

                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <template x-for="r in testKindCounts" :key="r.key">
                      <button type="button" @click="toggleKind(r.key)" :title="r.gloss"
                              class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors"
                              :class="testKind === r.key ? 'border-primary bg-primary/10' : 'border-base-300 hover:bg-base-200'">
                        <span class="badge badge-sm" :class="r.tone" x-text="r.files"></span>
                        <span class="text-base" x-text="r.key"></span>
                        <span class="text-sm text-base-content/40 tabular-nums" x-text="r.assertions"></span>
                      </button>
                    </template>
                    <button type="button" x-show="testKind" @click="testKind = ''"
                            class="text-sm text-base-content/50 hover:text-primary px-2 py-1">show all</button>
                    <div class="grow"></div>
                    <span class="text-sm text-base-content/40 tabular-nums"
                          :title="'Top-level test() calls across the suite. Browser checks are excluded: they assert with their own harness, so test() is not their unit.'"
                          x-text="testTotals.assertions.toLocaleString() + ' assertions · ' + testTotals.files + ' files'"></span>
                  </div>
                  <p x-show="testKind" class="text-sm text-base-content/50 mt-2 max-w-4xl"
                     x-text="testsReg.kinds[testKind]"></p>
                  <p x-show="!testKind" class="text-sm text-base-content/50 mt-2 max-w-4xl">
                    <span x-text="testTotals.smoke"></span> of those only check that a component mounts without
                    warnings, and <span x-text="testTotals.browser"></span> browser checks are skipped by
                    <code>node --test</code> entirely, so the suite's own pass count never speaks for them.
                  </p>
                </div>

                <div class="grid gap-x-8 gap-y-6 lg:grid-cols-2">
                  <template x-for="grp in testGroups" :key="grp.method">
                    <div>
                      <h3 class="text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-2">
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
                                <span x-show="t.boot_smoke" class="text-sm text-warning/70 tabular-nums"
                                      :title="'assertions that only check the component mounts'"
                                      x-text="t.boot_smoke + ' smoke'"></span>
                              </div>
                              <p class="text-base text-base-content/60" x-text="t.protects"></p>
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
        </div>
      `,

      SET_MANIFEST,
      ROUTES_MANIFEST,
      DOCS_MANIFEST,
      SHOWING_FRAME,
      SURF_MANIFEST,
      SURF_DOC,
      REACH_BUILDER,
      TESTS_MANIFEST,
      TESTS_BUILDER,
      authed: false,
      // The open tab, rendered from here and OWNED by the shell (its `mapTab`,
      // stamped as ?tab=). This copy is seeded from the shell at mount so a deep
      // link opens on the tab it names, and re-seeded by the watch in init() so
      // back and forward walk the tabs.
      mapTab: (window.__shell?.mapTab || 'set'),
      manifest: null,
      setLoading: false,
      setErr: '',
      routes: null,
      routesLoading: false,
      routesErr: '',
      docsReg: null,
      docsLoading: false,
      docsErr: '',
      surf: null,
      surfLoading: false,
      surfErr: '',

      init(){
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
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
        else if (tab === 'tests') this.loadTestsReg();
      },

      hub(){ return window.PortableAlign?.HUB || 'mehrlander/web-tools'; },
      registry(){ return window.__shell?.REGISTRY_REPO || 'mehrlander/web-tools-private'; },
      hasToken(){ return !!window.__shell?.hasToken?.(); },
      // A hub link follows the ref the manifests were READ at, for the same
      // reason loadManifest does: under ?use= a jump-over pinned to main opens a
      // different file than the one on screen.
      hubUrl(path){ return 'https://github.com/' + this.hub() + '/blob/' + useRef() + '/' + path; },
      // The peek address for a hub file, and for a route's renderer in whatever
      // repo it lives (lib/source-peek.js reads it off data-peek). Exact files
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
      },

      // ── The set ──────────────────────────────────────────────────────────
      async loadManifest(){
        this.setLoading = true;
        this.setErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          const raw = (await gh.get(SET_MANIFEST)).text;
          // The header's own peek reads these bytes rather than fetching them
          // again: the view has them, and a peek at the file a view is a
          // projection of should not be a second round trip.
          window.SourcePeek?.seed(this.peek(SET_MANIFEST), raw);
          this.manifest = JSON.parse(raw);
        } catch (e) {
          this.setErr = 'Manifest load failed: ' + (e?.message || e);
        } finally { this.setLoading = false; }
      },
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
      async openItem(it){
        if (!window.__shell) return;
        await window.__shell.ensureBrowser(this.hub(), '');
        if (it.kind === 'dir') await window.__shell.openFolder(it.path);
        else await window.__shell.openFile(it.path);
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
          const raw = (await gh.get(ROUTES_MANIFEST)).text;
          const parsed = JSON.parse(raw);
          if (!parsed || !Array.isArray(parsed.routes)) throw new Error('no routes block');
          window.SourcePeek?.seed(this.peek(ROUTES_MANIFEST), raw);
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
          const parsed = JSON.parse(raw);
          if (!parsed || !Array.isArray(parsed.primitives)) throw new Error('no primitives block');
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
          const parsed = JSON.parse(raw);
          if (!parsed || !Array.isArray(parsed.documents)) throw new Error('no documents table');
          window.SourcePeek?.seed(this.peek(DOCS_MANIFEST), raw);
          this.docsReg = parsed;
        } catch (e) {
          this.docsErr = 'Docs registry load failed: ' + (e?.message || e);
        } finally { this.docsLoading = false; }
      },
      // The rail's selection.
      docDir: 'docs',
      // The rail: every directory in the registry plus its ancestors, in DFS
      // order (lexicographic gives it, since every path shares the docs/
      // root), rolled up so a folder's count and words include everything
      // below it. Structure comes from the full census, so the tree never
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
      _docDeck: null,
      async docRead(path){
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
          this._docDeck?.close();
          this.openHubFile(d.path);
        });
        const box = slide.querySelector('[data-deck-content]');
        this.docRead(d.path)
          .then(html => { box.innerHTML = html; })
          .catch(e => {
            box.innerHTML = '<div class="text-base text-error font-mono py-4">Load failed: '
              + escHtml(e?.message || e) + '</div>';
          });
      },
      async openDocDeck(d){
        if (!window.swipeDeck && window.gh?.load) {
          try { await window.gh.load('swipe-deck.js'); } catch { /* fall through */ }
        }
        if (!window.swipeDeck) return this.openHubFile(d.path);
        const files = this.docDirFiles;
        const start = Math.max(0, files.findIndex(f => f.path === d.path));
        this._docDeck = window.swipeDeck.open({
          count: files.length,
          start,
          title: this.docDir + '/',
          subtitle: files[start]?.path || '',
          icon: 'ph-books',
          render: (i, slide) => this.renderDocSlide(files[i], slide),
          onSlide: (i) => { this._docDeck?.setSubtitle(files[i]?.path || ''); },
          onClose: () => { this._docDeck = null; },
        });
      },

      // Reach: the derived channel by which a reader gets to a doc. The counts
      // are the tab's headline because they are the one number here that moves
      // when the estate improves: point a skill or a page at an orphan and it
      // leaves the orphan column. Tapping a count filters the census to it, so
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

      // ── Tests ─────────────────────────────────────────────────────────────
      testsReg: null,
      testsLoading: false,
      testsErr: '',
      testKind: '',
      async loadTestsReg(){
        if (this.testsReg || this.testsLoading) return;
        this.testsLoading = true;
        this.testsErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: useRef() });
          const raw = (await gh.get(TESTS_MANIFEST)).text;
          const parsed = JSON.parse(raw);
          if (!parsed || !Array.isArray(parsed.tests)) throw new Error('no tests block');
          window.SourcePeek?.seed(this.peek(TESTS_MANIFEST), raw);
          this.testsReg = parsed;
        } catch (e) {
          this.testsErr = 'Test registry load failed: ' + (e?.message || e);
        } finally { this.testsLoading = false; }
      },
      get testKindCounts(){
        const rows = this.testsReg?.tests || [];
        return KIND_ORDER
          .map(key => ({
            key,
            tone: KIND_TONE[key] || 'badge-ghost',
            gloss: this.testsReg?.kinds?.[key] || '',
            files: rows.filter(t => t.kind === key).length,
            assertions: rows.filter(t => t.kind === key).reduce((s, t) => s + (t.assertions || 0), 0),
          }))
          .filter(r => r.files);
      },
      // Browser checks are counted as files and excluded from the assertion
      // total rather than folded in as zero, so the headline never implies
      // they contribute nothing.
      get testTotals(){
        const rows = this.testsReg?.tests || [];
        return {
          files: rows.length,
          assertions: rows.reduce((s, t) => s + (t.assertions || 0), 0),
          smoke: rows.reduce((s, t) => s + (t.boot_smoke || 0), 0),
          browser: rows.filter(t => t.assertions === null).length,
        };
      },
      get testGroups(){
        const groups = new Map();
        for (const t of (this.testsReg?.tests || [])) {
          if (this.testKind && t.kind !== this.testKind) continue;
          if (!groups.has(t.method)) groups.set(t.method, []);
          groups.get(t.method).push(t);
        }
        return METHOD_ORDER.filter(m => groups.has(m))
          .map(method => ({ method, hint: METHOD_HINT[method] || '', tests: groups.get(method) }));
      },
      testTitle(t){ return t.path.replace('tools/test/', '').replace(/\.(test\.)?mjs$/, ''); },
      kindTone(k){ return KIND_TONE[k] || 'badge-ghost'; },
      toggleKind(key){ this.testKind = this.testKind === key ? '' : key; },
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
