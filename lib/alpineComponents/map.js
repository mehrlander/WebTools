document.addEventListener('alpine:init', function() {
  Alpine.data('map', function() {
    // The Map view: the estate's coordination layer made inspectable. It is the
    // operational face of the constellation doctrine (home's
    // created/2026-06-27-constellation-architecture.md, kernel at the hub's
    // docs/CONSTELLATION.md), in two parts across two tabs.
    //   The set     the portable to-go bag from the hub's committed manifest
    //               (docs/portable.json, prose parent docs/PORTABLE.md): plugin
    //               skills, docs, scripts, each opening in the shell's own
    //               viewer. The doctrine kernel rides here as a doc, so the
    //               theory of what-goes-where sits beside the conventions it
    //               governs.
    //   Transport   how content moves and renders, read from the hub's
    //               docs/routes.json: the shared owner/repo[@ref]:path address
    //               grammar, the delivery modes toss-render accepts (inline
    //               payload versus fetched reference, and the trust posture
    //               each one buys), and the toss routes mapping a content type
    //               to its renderer page. The facts were previously scattered
    //               across three files' source comments, so a reader had to
    //               reconstruct them; the manifest owns them instead.
    // Scope and adoption were a third tab here until 2026-08-03. They are facts
    // about a REPO, and the estate's Repos cards are where a repo is described,
    // so a second grid of the same repos with different columns was a copy of
    // the roster. They moved onto the card (alpineComponents/estate.js), which
    // also ended the drift this view suffered from keeping its own roster: a
    // repo joined the estate and never reached the Map's list. What is left
    // here is what belongs to no single repo, the SET and the TRANSPORT.
    // The set is public (the hub repo is public); Transport is too.
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
    // Transport rows lead with their trust posture: a sandboxed payload cannot
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

    return {
      description: 'Map view: the coordination layer made inspectable, in two tabs. The portable set (docs/portable.json, each row openable in the shell viewer), and Transport (docs/routes.json): Showing, the table of which link reaches which kind of change and what each one misses, then the address grammar, toss-render\'s delivery modes and their trust postures, and the toss routes from a content type to its renderer. Per-repo scope and adoption moved onto the Repos cards. The operational face of the constellation doctrine.',

      template: `
        <div class="w-full">
          <!-- Two tabs: what travels, and how it moves. Who carries it is a
               property of each repo, so it lives on the Repos cards. -->
          <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 mb-6 w-fit flex-wrap" role="tablist">
            <button role="tab" @click="mapTab='set'"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="mapTab==='set' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-package text-lg"></i>The set</button>
            <button role="tab" @click="mapTab='transport'; loadRoutes()"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="mapTab==='transport' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-paper-plane-tilt text-lg"></i>Transport</button>
          </div>
          <!-- ── The set ─────────────────────────────────────────────────── -->
          <section x-show="mapTab==='set'">
            <!-- No section title: the "The set" tab already names this. -->
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

          <!-- ── Transport: how content moves and renders ─────────────────── -->
          <section x-show="mapTab==='transport'">
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
        </div>
      `,

      SET_MANIFEST,
      ROUTES_MANIFEST,
      authed: false,
      mapTab: 'set',
      manifest: null,
      setLoading: false,
      setErr: '',
      routes: null,
      routesLoading: false,
      routesErr: '',

      init(){
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        this.load();
        this.$watch(() => window.__shell && window.__shell._authState, (s) => {
          if (s === 'auth') this.load();
        });
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

      // ── Transport ─────────────────────────────────────────────────────────
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

    };
  });
});
