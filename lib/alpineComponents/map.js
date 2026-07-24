document.addEventListener('alpine:init', function() {
  Alpine.data('map', function() {
    // The Map view: the estate's coordination layer made inspectable. It is the
    // operational face of the constellation doctrine (home's
    // created/2026-06-27-constellation-architecture.md, kernel at the hub's
    // docs/CONSTELLATION.md), in three parts.
    //   The set   — the portable to-go bag from the hub's committed manifest
    //               (docs/portable.json, prose parent docs/PORTABLE.md): plugin
    //               skills, docs, scripts, each opening in the shell's own
    //               viewer. The doctrine kernel rides here as a doc, so the
    //               theory of what-goes-where sits beside the conventions it
    //               governs.
    //   Scope     — per repo, the repo's own account of what it holds and why,
    //               read live from its .web-tools.json `scope` field. The repo
    //               owns the story; the estate only stacks the statements, so
    //               the cross-repo picture is a view, never an authored list.
    //   Adoption  — per repo, how far it carries the set: the marketplace
    //               subscription and plugins in .claude/settings.json, a
    //               conventions-wired CLAUDE.md, a .web-tools.json. Graded by
    //               lib/portable-align.js (pure, tested).
    // Scope and Adoption share one per-repo card, since they are two facets of
    // one object. The set is public (the hub repo is public); the per-repo half
    // needs the token (it reads private repos' settings). Probes are live per
    // view open with an in-memory cache and a Refresh; persisting them as a
    // registry crawl cache (state/alignment.json) is a named follow-up.
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
    const VERDICT = {
      source:    { cls: 'badge-info',    note: 'the source of the set' },
      registry:  { cls: 'badge-info',    note: 'private registry: roster, caches, lists' },
      aligned:   { cls: 'badge-success', note: '' },
      partial:   { cls: 'badge-warning', note: '' },
      optout:    { cls: 'badge-neutral', note: 'deliberately not adopting' },
      unaligned: { cls: 'badge-ghost',   note: '' },
    };
    // The doctrine's portable kernel, opened in the shell viewer from the set
    // header. The full home-specific doctrine is linked from that doc.
    const DOCTRINE_PATH = 'docs/CONSTELLATION.md';

    return {
      description: 'Map view: the coordination layer made inspectable. The portable set (docs/portable.json, each row openable in the shell viewer), and a per-repo card carrying the repo-owned scope story plus a live adoption read (marketplace, plugins, CLAUDE.md wiring, config). The operational face of the constellation doctrine.',

      template: `
        <div class="w-full">
          <!-- Two tabs: the portable set, and per-repo scope + adoption. -->
          <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 mb-6 w-fit" role="tablist">
            <button role="tab" @click="mapTab='set'"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="mapTab==='set' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-package text-lg"></i>The set</button>
            <button role="tab" @click="mapTab='adoption'"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="mapTab==='adoption' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-git-fork text-lg"></i>Scope &amp; adoption</button>
          </div>
          <!-- ── The set ─────────────────────────────────────────────────── -->
          <section x-show="mapTab==='set'">
            <!-- No section title: the "The set" tab already names this. -->
            <div class="flex items-center gap-2 mb-4 flex-wrap">
              <code class="text-sm text-base-content/50">/plugin install portable@web-tools</code>
              <a :href="hubUrl('docs/PORTABLE.md')" target="_blank" rel="noopener"
                 class="text-base-content/40 hover:text-primary" title="docs/PORTABLE.md on GitHub">
                <i class="ph ph-github-logo"></i></a>
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
                        <a :href="itemGh(it)" target="_blank" rel="noopener" title="Open on GitHub"
                           class="opacity-0 group-hover:opacity-100 text-base-content/30 hover:text-primary transition-opacity shrink-0 mt-1">
                          <i class="ph ph-github-logo"></i></a>
                      </div>
                    </template>
                  </div>
                </div>
              </template>
            </div>
            <div x-show="setErr" class="text-base text-error font-mono" x-text="setErr"></div>
          </section>

          <!-- ── Scope and adoption (per repo) ───────────────────────────── -->
          <section x-show="mapTab==='adoption'">
            <!-- No section title: the "Scope & adoption" tab already names this. -->
            <div class="flex items-center gap-2 mb-4" :class="!authed && 'hidden'">
              <div class="grow"></div>
              <button x-show="authed" @click="refreshAdoption()" :disabled="adoptLoading"
                      class="flex items-center gap-1.5 text-base text-base-content/60 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors">
                <i class="ph ph-arrows-clockwise" :class="adoptLoading && 'animate-spin'"></i>
                <span x-text="adoptLoading ? 'Probing…' : 'Refresh'"></span>
              </button>
            </div>
            <p x-show="!authed" class="text-base text-base-content/60">
              Set a token (header shield) to read each repo's scope and adoption.
            </p>
            <template x-if="authed">
              <div class="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                <div x-show="adoptLoading && !rows.length" class="flex justify-center py-10 lg:col-span-2 xl:col-span-3">
                  <span class="loading loading-dots loading-md opacity-30"></span>
                </div>
                <template x-for="r in rows" :key="r.repo">
                  <div class="flex flex-col gap-2 px-3 py-2.5 rounded-lg border border-base-300/60 bg-base-100">
                    <div class="flex items-center gap-2 flex-wrap">
                      <button type="button" class="text-base font-medium hover:text-primary"
                              @click="openRepo(r.repo)" x-text="r.repo"></button>
                      <span class="badge badge-sm" :class="verdictCls(r)" x-text="r.verdict"></span>
                      <div class="grow"></div>
                      <button type="button" @click="openConfig(r.repo)" title="Edit this repo's .web-tools.json"
                              class="text-base-content/30 hover:text-primary shrink-0"><i class="ph ph-gear-six"></i></button>
                    </div>
                    <p x-show="scopeText(r)" class="text-base text-base-content/80" x-text="scopeText(r)"></p>
                    <p x-show="scopeFile(r)" class="text-base">
                      <a :href="scopeFileGh(r)" target="_blank" rel="noopener"
                         class="text-primary hover:underline inline-flex items-center gap-1">
                        <i class="ph ph-book-open"></i><span x-text="scopeFile(r)"></span></a>
                    </p>
                    <p x-show="!scopeText(r) && !scopeFile(r) && !r.loading" class="text-sm text-base-content/40 italic">
                      No scope declared. <span x-show="verdictNote(r)" x-text="verdictNote(r)"></span>
                    </p>
                    <div x-show="!r.role && !r.loading" class="flex items-center gap-1.5 flex-wrap">
                      <span class="badge badge-sm" :class="chipCls(r.marketplace)">
                        <i class="ph text-xs" :class="r.marketplace ? 'ph-check' : 'ph-x'"></i>marketplace</span>
                      <template x-for="p in r.plugins" :key="p">
                        <span class="badge badge-sm badge-outline"><i class="ph ph-check text-xs"></i><span x-text="p"></span></span>
                      </template>
                      <span x-show="!r.plugins.length" class="badge badge-sm" :class="chipCls(false)">
                        <i class="ph ph-x text-xs"></i>plugins</span>
                      <span class="badge badge-sm" :class="chipCls(r.conventionsWired)"
                            :title="r.hasClaudeMd && !r.conventionsWired ? 'CLAUDE.md present, conventions not wired in' : ''">
                        <i class="ph text-xs" :class="r.conventionsWired ? 'ph-check' : 'ph-x'"></i>conventions</span>
                      <span class="badge badge-sm" :class="chipCls(r.hasConfig)">
                        <i class="ph text-xs" :class="r.hasConfig ? 'ph-check' : 'ph-x'"></i>config</span>
                      <span x-show="r.hookEvents.length" class="badge badge-sm badge-ghost text-base-content/50"
                            x-text="'hooks: ' + r.hookEvents.join(', ')"></span>
                    </div>
                    <div x-show="r.loading"><span class="loading loading-dots loading-xs opacity-30"></span></div>
                  </div>
                </template>
                <div x-show="adoptErr" class="text-base text-error font-mono lg:col-span-2 xl:col-span-3" x-text="adoptErr"></div>
              </div>
            </template>
          </section>
        </div>
      `,

      authed: false,
      mapTab: 'set',
      manifest: null,
      setLoading: false,
      setErr: '',
      rows: [],
      adoptLoading: false,
      adoptErr: '',
      _probed: false,

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
      hubUrl(path){ return 'https://github.com/' + this.hub() + '/blob/main/' + path; },
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
        if (this.authed && !this._probed) this.refreshAdoption();
      },

      // ── The set ──────────────────────────────────────────────────────────
      async loadManifest(){
        this.setLoading = true;
        this.setErr = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.hub(), ref: 'main' });
          this.manifest = JSON.parse((await gh.get('docs/portable.json')).text);
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
        return 'https://github.com/' + this.hub() + '/' + (it.kind === 'dir' ? 'tree' : 'blob') + '/main/' + it.path;
      },
      async openItem(it){
        if (!window.__shell) return;
        await window.__shell.ensureBrowser(this.hub(), '');
        if (it.kind === 'dir') await window.__shell.openFolder(it.path);
        else await window.__shell.openFile(it.path);
      },
      async openDoctrine(){
        if (!window.__shell) return;
        await window.__shell.ensureBrowser(this.hub(), '');
        await window.__shell.openFile(DOCTRINE_PATH);
      },
      async openRepo(repo){ await window.__shell?.openPinned(repo); },

      // ── Scope and adoption ────────────────────────────────────────────────
      // A repo's `scope` field is either inline prose (rendered as the card's
      // headline) or a file pointer (a repo path ending in .md, linked to its
      // blob). The repo owns the story either way; this only displays it.
      scopeIsFile(s){ return typeof s === 'string' && /^[\w./-]+\.md$/.test(s.trim()); },
      scopeText(r){ return (r.scope && !this.scopeIsFile(r.scope)) ? r.scope : ''; },
      scopeFile(r){ return this.scopeIsFile(r.scope) ? r.scope.trim() : ''; },
      scopeFileGh(r){ return 'https://github.com/' + r.repo + '/blob/HEAD/' + this.scopeFile(r); },

      // Roster: hub, registry, then the registry manifest's repos in their
      // curated order. Each repo is probed with three parallel reads on its
      // default branch (empty ref falls through on the contents API).
      async roster(){
        const out = [this.hub(), this.registry()];
        try {
          const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
          const cfg = JSON.parse((await reg.get('.web-tools.json')).text);
          for (const r of (cfg.repos || [])) {
            if (r?.repo && !out.includes(r.repo)) out.push(r.repo);
          }
        } catch {}
        return out;
      },
      async probe(repo){
        const gh = new window.GH({ token: window.TOKEN, repo, ref: '' });
        const grab = async (path, parse) => {
          try { const t = (await gh.get(path)).text; return parse ? JSON.parse(t) : t; }
          catch { return null; }
        };
        const [settings, claudeMd, config] = await Promise.all([
          grab('.claude/settings.json', true),
          grab('CLAUDE.md', false),
          grab('.web-tools.json', true),
        ]);
        const role = repo === this.hub() ? 'hub' : repo === this.registry() ? 'registry' : null;
        const row = window.PortableAlign.assess({ repo, role, settings, claudeMd, config });
        // The scope story is the repo's own; carry it onto the row for the card.
        row.scope = (config && typeof config.scope === 'string') ? config.scope : '';
        return row;
      },
      async refreshAdoption(){
        if (!this.hasToken() || !window.PortableAlign) return;
        this.adoptLoading = true;
        this.adoptErr = '';
        this._probed = true;
        try {
          const repos = await this.roster();
          this.rows = repos.map(repo => ({ repo, loading: true, verdict: '…', role: null,
                                           plugins: [], hookEvents: [], scope: '' }));
          await Promise.all(repos.map(async (repo, i) => {
            try { this.rows[i] = { ...await this.probe(repo), loading: false }; }
            catch (e) { this.rows[i] = { repo, loading: false, verdict: 'error', role: null,
                                         plugins: [], hookEvents: [], scope: '', err: String(e?.message || e) }; }
          }));
        } catch (e) {
          this.adoptErr = 'Probe failed: ' + (e?.message || e);
        } finally { this.adoptLoading = false; }
      },
      verdictCls(r){ return (VERDICT[r.verdict] || { cls: 'badge-ghost' }).cls; },
      verdictNote(r){ return (VERDICT[r.verdict] || {}).note || ''; },
      chipCls(on){ return on ? 'badge-outline' : 'badge-ghost text-base-content/35'; },
    };
  });
});
