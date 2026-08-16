// Public browse: a no-token file browser for any PUBLIC GitHub repo, read
// entirely through jsDelivr (GH.flatTree for the listing, GH.rawUrl for a
// file's bytes). This is the intentional non-auth capability of show-repo: the
// authenticated GitHub API is rate-capped to 60 req/hr/IP without a token and
// recentFiles alone can spend that, whereas jsDelivr serves public repos from
// its CDN with no token and no GitHub quota. It works signed in too (a
// rate-safe listing), but earns its place in the public case. Limits are
// honest: public repos only, and the listing is jsDelivr's cache of a ref, so a
// brand-new push can lag ~12h. Registered as Alpine.data('publicBrowse').
document.addEventListener('alpine:init', function() {
  Alpine.data('publicBrowse', function() {

    // Text this pane will inline-preview: a small extension whitelist and a size
    // cap, so we never pull a multi-MB binary into a <pre>. Anything else gets a
    // "open raw / on GitHub" card instead of an inline body.
    const TEXT_EXT = /\.(md|markdown|txt|json|jsonc|js|mjs|cjs|ts|tsx|jsx|css|scss|html|htm|xml|svg|yml|yaml|toml|ini|cfg|conf|sh|bash|zsh|py|rb|go|rs|c|h|cpp|java|php|sql|csv|tsv|lock|gitignore|env|map)$/i;
    const PREVIEW_MAX = 256 * 1024;

    return {
      description: 'No-token public-repo file browser, read through jsDelivr (listing + raw content), the rate-safe non-auth capability of show-repo',

      input: '',
      repo: '',
      ref: 'main',
      files: [],
      filter: '',
      loading: false,
      error: '',
      sel: '',
      preview: { path: '', text: '', size: 0, loading: false, error: '', binary: false },

      template: `
        <div class="mx-auto max-w-5xl px-1">
          <div class="mb-4">
            <h1 class="text-lg font-semibold flex items-center gap-2">
              <i class="ph ph-cloud-arrow-down text-primary"></i>Public browse
            </h1>
            <p class="text-base text-base-content/60 mt-1">
              Public repos only. Fresh pushes may lag a few hours.
            </p>
          </div>

          <div class="flex items-center gap-2 mb-4">
            <label class="input input-bordered flex items-center gap-2 flex-1 font-mono text-base">
              <i class="ph ph-git-branch text-base-content/40"></i>
              <input type="text" x-model="input" @keyup.enter="browse()"
                     placeholder="owner/repo or owner/repo@ref" class="grow" />
            </label>
            <button @click="browse()" :disabled="loading" class="btn btn-primary gap-1">
              <i class="ph" :class="loading ? 'ph-circle-notch animate-spin' : 'ph-magnifying-glass'"></i>
              Browse
            </button>
          </div>

          <div x-show="error" class="alert alert-warning py-2 px-3 text-base mb-4">
            <i class="ph ph-warning shrink-0"></i><span x-text="error"></span>
          </div>

          <template x-if="!error && files.length">
            <div>
              <div class="flex items-center gap-3 text-base text-base-content/50 mb-2">
                <span class="font-mono font-semibold text-base-content/70" x-text="repo + '@' + ref"></span>
                <span x-text="files.length + ' files'"></span>
                <span x-text="fmtSize(totalSize)"></span>
                <a :href="'https://github.com/' + repo + '/tree/' + ref" target="_blank"
                   class="ml-auto link link-hover flex items-center gap-1">
                  <i class="ph ph-github-logo"></i>GitHub</a>
              </div>

              <div class="grid gap-3 md:grid-cols-2">
                <!-- File list -->
                <div class="border border-base-300 rounded-lg overflow-hidden flex flex-col min-h-0" style="max-height:32rem">
                  <div class="p-2 border-b border-base-200 shrink-0">
                    <label class="input input-bordered flex items-center gap-2 font-mono">
                      <i class="ph ph-funnel text-base-content/40"></i>
                      <input type="text" x-model="filter" placeholder="filter paths" class="grow" />
                    </label>
                  </div>
                  <div class="overflow-y-auto flex-1">
                    <template x-for="f in filtered" :key="f.path">
                      <button @click="open(f.path)"
                              class="w-full flex items-center gap-2 px-2 py-1 text-left hover:bg-base-200 transition-colors"
                              :class="sel === f.path ? 'bg-primary/10' : ''">
                        <i class="ph ph-file text-base text-base-content/40 shrink-0"></i>
                        <span class="font-mono text-base truncate flex-1" :title="f.path" x-text="f.path"></span>
                        <span class="text-base text-base-content/40 shrink-0 font-mono" x-text="fmtSize(f.size)"></span>
                      </button>
                    </template>
                    <div x-show="!filtered.length" class="text-base text-base-content/40 p-3 text-center">
                      No paths match "<span x-text="filter"></span>".
                    </div>
                  </div>
                </div>

                <!-- Preview -->
                <div class="border border-base-300 rounded-lg overflow-hidden flex flex-col min-h-0" style="max-height:32rem">
                  <template x-if="!sel">
                    <div class="flex-1 flex items-center justify-center text-base text-base-content/40 p-6 text-center">
                      Pick a file to preview it. Text opens inline; anything larger or binary gets links.
                    </div>
                  </template>
                  <template x-if="sel">
                    <div class="flex flex-col min-h-0 flex-1">
                      <div class="flex items-center gap-2 p-2 border-b border-base-200 shrink-0">
                        <span class="font-mono text-base truncate flex-1" :title="sel" x-text="sel"></span>
                        <a :href="rawHref(sel)" target="_blank" class="btn btn-ghost btn-square tooltip tooltip-bottom" data-tip="Raw (CDN)">
                          <i class="ph ph-cloud-arrow-down text-base"></i></a>
                        <a :href="'https://github.com/' + repo + '/blob/' + ref + '/' + sel" target="_blank"
                           class="btn btn-ghost btn-square tooltip tooltip-bottom" data-tip="On GitHub">
                          <i class="ph ph-github-logo text-base"></i></a>
                      </div>
                      <div x-show="preview.loading" class="flex justify-center py-10">
                        <span class="loading loading-dots loading-md opacity-30"></span>
                      </div>
                      <div x-show="!preview.loading && preview.error" class="text-base text-warning p-3" x-text="preview.error"></div>
                      <div x-show="!preview.loading && preview.binary" class="text-base text-base-content/50 p-4 flex flex-col gap-2">
                        <span>Not previewed inline (<span x-text="fmtSize(preview.size)"></span>, or a binary type).</span>
                        <a :href="rawHref(sel)" target="_blank" class="link link-primary flex items-center gap-1 w-fit">
                          <i class="ph ph-cloud-arrow-down"></i>Open the raw file</a>
                      </div>
                      <pre x-show="!preview.loading && !preview.error && !preview.binary"
                           class="overflow-auto flex-1 text-base leading-snug p-3 font-mono whitespace-pre"><code x-text="preview.text"></code></pre>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </template>

          <div x-show="!error && !files.length && !loading" class="text-base text-base-content/40 py-10 text-center">
            Enter a public <span class="font-mono">owner/repo</span> and press Browse.
          </div>
        </div>`,

      init() {
        this.$el.innerHTML = this.template;
        this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });
        // Seed from a repo an estate card asked to open (publicSeed), else the
        // open repo, else the public default, so a signed-out visitor lands on
        // something rather than a blank box.
        const seed = window.__shell?.publicSeed || Alpine.store('browser')?.repo || window.__shell?.DEFAULT_REPO || '';
        if (seed) { this.input = seed; this.browse(); }
        // A card tapped while this is already mounted just changes publicSeed;
        // re-browse to it.
        this.$watch(() => window.__shell?.publicSeed, (v) => {
          if (v && v !== this.parse(this.input).repo) { this.input = v; this.browse(); }
        });
      },

      get filtered() {
        const q = this.filter.trim().toLowerCase();
        return q ? this.files.filter(f => f.path.toLowerCase().includes(q)) : this.files;
      },
      get totalSize() { return this.files.reduce((s, f) => s + (f.size || 0), 0); },

      // Parse "owner/repo" or "owner/repo@ref"; tolerate a full GitHub URL paste.
      parse(s) {
        let t = (s || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
        let ref = 'main';
        const at = t.indexOf('@');
        if (at > -1) { ref = t.slice(at + 1) || 'main'; t = t.slice(0, at); }
        const parts = t.split('/').filter(Boolean);
        return { repo: parts.length >= 2 ? parts[0] + '/' + parts[1] : '', ref };
      },

      async browse() {
        const { repo, ref } = this.parse(this.input);
        if (!repo) { this.error = 'Enter a repo as owner/repo (optionally owner/repo@ref).'; return; }
        this.loading = true; this.error = ''; this.sel = ''; this.files = [];
        this.preview = { path: '', text: '', size: 0, loading: false, error: '', binary: false };
        try {
          const files = await window.GH.flatTree(repo, ref);
          this.repo = repo; this.ref = ref;
          this.files = files.sort((a, b) => a.path.localeCompare(b.path));
          if (!files.length) this.error = 'jsDelivr returned no files for ' + repo + '@' + ref + '. The ref may be empty.';
        } catch (e) {
          // Specific over vague: name why jsDelivr has nothing, and what to do.
          if (e.status === 404) {
            this.error = 'jsDelivr has no cache for ' + repo + '@' + ref + '. It serves public repos only, '
              + 'so a private repo, a wrong name, or a ref/branch it has never fetched all look like this. '
              + 'Check the name, or sign in (shield icon) to browse private repos through the GitHub API.';
          } else {
            this.error = 'Could not reach jsDelivr for ' + repo + '@' + ref + ' (' + (e.message || e) + ').';
          }
        } finally {
          this.loading = false;
        }
      },

      rawHref(path) { return new window.GH({ repo: this.repo, ref: this.ref }).rawUrl(path); },

      async open(path) {
        this.sel = path;
        const f = this.files.find(x => x.path === path);
        const size = f?.size || 0;
        if (!TEXT_EXT.test(path) || size > PREVIEW_MAX) {
          this.preview = { path, text: '', size, loading: false, error: '', binary: true };
          return;
        }
        this.preview = { path, text: '', size, loading: true, error: '', binary: false };
        try {
          const res = await fetch(this.rawHref(path));
          if (!res.ok) throw new Error('CDN ' + res.status);
          const text = await res.text();
          if (this.sel !== path) return; // a newer selection won the race
          this.preview = { path, text, size, loading: false, error: '', binary: false };
        } catch (e) {
          if (this.sel !== path) return;
          this.preview = { path, text: '', size, loading: false, error: 'Could not fetch this file from the CDN (' + (e.message || e) + ').', binary: false };
        }
      },

      fmtSize(n) {
        if (!n) return '0 B';
        const u = ['B', 'KB', 'MB', 'GB'];
        const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
        return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
      },
    };
  });
});
