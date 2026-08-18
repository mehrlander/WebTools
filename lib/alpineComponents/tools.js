document.addEventListener('alpine:init', function() {
  Alpine.data('tools', function() {
    // The Tools view: a curated gallery of the utility pages the owner reaches
    // for (the text-diff tool, the transform/compress round-trip, and so on),
    // an estate-level peer of Repos / Surfaces / Stage / Map. It reuses the same
    // card grid the pages catalog uses (thumbnail or live preview, an open link,
    // a source link), but fed from a hand-curated manifest rather than a repo
    // scan.
    //
    // The list is authored, cross-repo by nature (each entry carries its own
    // origin), and lives in the hub's committed docs/tools.csv. The hub is
    // public, so the whole view needs no token: thumbnails come from jsDelivr,
    // the render link is the hosted github.io URL, the source link is the blob.
    // A future private tool would ride a token-gated toss-render #gh= render the
    // same way the pages catalog handles an off-default ref.
    //
    // Manifest entry: { path, icon }. `path` is a bare repo path
    // ("pages/diff-tool.html", the hub at main) or a qualified cross-repo ref
    // ("owner/repo[@ref]:path"), the same grammar as a pages catalog entry and
    // stage.files.
    //
    // The title and the description are NOT in that entry. docs/tools.csv is a
    // CROSSWALK over the page gallery: it asserts only which pages are shelved
    // here and what icon each gets, and the page's own identity is joined from
    // pages/pages.csv at load. It used to carry its own copies, and they
    // drifted (measured 2026-08-13: the description differed on all four rows,
    // the title on one, with no consistent direction, so neither copy was the
    // considered one). Two registries asserting one property about one target
    // is the invalid configuration docs/registries.md names, and
    // tools/test/properties-registry.test.mjs now gates it, along with a check
    // that every row here still resolves to a page.
    const HUB = 'mehrlander/web-tools';

    return {
      description: 'Tools view: a curated gallery of utility pages (docs/tools.csv in the hub), rendered as cards with a thumbnail/live toggle, an open link, and a source link. Estate-level, public, no token needed.',

      template: `
        <div class="w-full">
          <div class="flex items-center gap-2 mb-4">
            <h2 class="text-lg font-semibold">Tools</h2>
            <span x-show="items.length" class="badge badge-ghost badge-sm font-mono" x-text="items.length"></span>
            <div class="grow"></div>
            <a :href="manifestGh()" target="_blank" rel="noopener"
               class="flex items-center gap-1.5 text-base text-base-content/50 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors"
               title="Edit the curated list (docs/tools.csv)">
              <i class="ph ph-github-logo"></i><span>Curate</span>
            </a>
          </div>

          <div x-show="loading" class="flex justify-center py-12">
            <span class="loading loading-dots loading-md opacity-30"></span>
          </div>
          <div x-show="err" class="text-base text-error font-mono" x-text="err"></div>
          <div x-show="!loading && !err && !items.length" class="text-base text-base-content/50 italic py-8">
            No tools curated yet. Add entries to docs/tools.csv.
          </div>

          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <template x-for="p in cards" :key="p.path">
              <div class="card bg-base-100 border border-base-300 shadow-sm overflow-hidden">
                <div class="relative bg-base-200/40 border-b border-base-300 aspect-[16/10] overflow-hidden">
                  <a :href="p.renderUrl" target="_blank" x-show="p.view==='shot'" class="block w-full h-full">
                    <img x-show="p.thumb && !p.thumbMissing" :src="p.thumb" :alt="p.title" loading="lazy"
                         class="w-full h-full object-cover object-top" @error="p.thumbMissing = true">
                    <div x-show="!p.thumb || p.thumbMissing"
                         class="w-full h-full flex items-center justify-center text-base-content/30 gap-1">
                      <i class="ph text-3xl" :class="p.icon || 'ph-wrench'"></i>
                    </div>
                  </a>
                  <template x-if="p.view==='live'">
                    <iframe :src="p.renderUrl" loading="lazy"
                            sandbox="allow-scripts allow-same-origin allow-popups"
                            class="w-full h-full bg-base-100"></iframe>
                  </template>
                  <div class="join absolute top-1 right-1 shadow">
                    <button class="btn btn-xs join-item" :class="p.view==='shot' && 'btn-primary btn-active'"
                            @click="p.view='shot'" title="Thumbnail"><i class="ph ph-image"></i></button>
                    <button class="btn btn-xs join-item" :class="p.view==='live' && 'btn-primary btn-active'"
                            @click="p.view='live'" title="Live preview"><i class="ph ph-play"></i></button>
                  </div>
                </div>
                <div class="card-body p-2.5 gap-0.5">
                  <div class="flex items-baseline justify-between gap-2">
                    <a :href="p.renderUrl" target="_blank"
                       class="font-semibold text-base hover:text-primary transition-colors truncate inline-flex items-center gap-1.5">
                      <i class="ph shrink-0 text-base-content/50" :class="p.icon || 'ph-wrench'"></i>
                      <span x-text="p.title"></span></a>
                    <a :href="p.codeUrl" target="_blank" title="Source on GitHub"
                       class="text-base-content/30 hover:text-base-content/60 shrink-0">
                      <i class="ph ph-code"></i></a>
                  </div>
                  <p class="text-sm text-base-content/50" x-text="p.note || p.path"></p>
                </div>
              </div>
            </template>
          </div>
        </div>`,

      loading: false,
      err: '',
      items: [],
      // href -> { title, note } from the hub's pages catalog, the owner of both.
      pageIdentity: {},

      init(){
        this.$el.innerHTML = this.template;
        this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });
        this.load();
      },

      hub(){ return HUB; },
      manifestGh(){ return 'https://github.com/' + HUB + '/blob/main/docs/tools.csv'; },

      // Resolve a manifest path into { repo, ref, path }. Bare paths mean the hub
      // at main; a qualified "owner/repo[@ref]:path" overrides both.
      resolve(rawPath){
        const m = String(rawPath || '').match(/^([\w.-]+\/[\w.-]+)(?:@([\w./-]+))?:(.+)$/);
        if (m) return { repo: m[1], ref: m[2] || 'main', path: m[3] };
        return { repo: HUB, ref: 'main', path: rawPath };
      },
      renderUrl(rawPath){
        const { repo, ref, path } = this.resolve(rawPath);
        const [owner, name] = repo.split('/');
        const base = 'https://' + owner + '.github.io/' + name + '/' + path;
        if (ref === 'main') return base;
        if (owner === 'mehrlander') {
          return 'https://mehrlander.github.io/web-tools/pages/toss-render.html#gh=' +
            repo + '@' + ref + ':' + path;
        }
        return base + '?use=' + encodeURIComponent(ref);
      },
      thumbUrl(rawPath){
        const { repo, ref, path } = this.resolve(rawPath);
        if (!path.startsWith('pages/') || path.startsWith('pages/thumbs/')) return '';
        const rel = path.slice('pages/'.length).replace(/\.html$/, '.png');
        return 'https://cdn.jsdelivr.net/gh/' + repo + '@' + ref + '/pages/thumbs/' + rel;
      },
      codeUrl(rawPath){
        const { repo, ref, path } = this.resolve(rawPath);
        return 'https://github.com/' + repo + '/blob/' + ref + '/' + path;
      },
      // The page owns its title and description; a shelved row inherits both.
      // A cross-repo ref has no row in the hub's catalog, so it falls back to
      // the filename, which is the same fallback a hub page would get if the
      // catalog were unreachable. The gate keeps that from silently covering a
      // hub path whose page is gone.
      identity(rawPath){
        const { repo, path } = this.resolve(rawPath);
        const hit = repo === HUB ? this.pageIdentity[path] : null;
        return {
          title: hit?.title || path.split('/').pop().replace(/\.html$/, ''),
          note: hit?.note || '',
        };
      },
      get cards(){
        return this.items.map(it => ({
          path: it.path,
          ...this.identity(it.path),
          icon: it.icon || 'ph-wrench',
          renderUrl: this.renderUrl(it.path),
          codeUrl: this.codeUrl(it.path),
          thumb: this.thumbUrl(it.path),
          thumbMissing: false,
          view: 'shot',
        }));
      },

      async load(){
        this.loading = true;
        this.err = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: HUB, ref: 'main' });
          // Both carriers, in parallel: the shelf and the identities it joins.
          // A page catalog that fails to load costs the titles, not the view.
          const [shelf, pages] = await Promise.all([
            gh.get('docs/tools.csv'),
            gh.get('pages/pages.csv').catch(() => null),
          ]);
          // Both are CSVs. The shelf was JSON with an `items` key and the
          // catalog was a bare array of groups until 2026-08-16; reading either
          // with JSON.parse now throws and takes the whole view with it, which
          // is what the catch below was quietly turning into an error banner.
          this.items = window.Csv.rows(shelf.text);
          this.pageIdentity = pages ? Object.fromEntries(
            window.Csv.rows(pages.text).map(
              p => ['pages/' + p.href, { title: p.title, note: p.note }])) : {};
        } catch (e) {
          this.err = 'Could not load the tools list: ' + (e?.message || e);
        } finally { this.loading = false; }
      },
    };
  });
});
