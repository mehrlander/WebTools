document.addEventListener('alpine:init', function() {
  Alpine.data('explorer', function() {
    const fmt = t => t.replace(/ {4}/g, '  ');
    const kb = n => n >= 1024 ? (n / 1024).toFixed(n >= 10240 ? 0 : 1) + ' KB' : n + ' B';

    return {
      description: 'Main-area repo file browser: breadcrumb + folder listing with a ref picker (branch selection is a file-viewing concern, so it lives here, not the header); selects files into the shared viewer, stages files for transfer',

      template: `
        <div>
          <div class="flex items-center gap-1 font-mono text-base flex-wrap min-h-8">
            <button @click="load('')" class="flex items-center gap-1.5 hover:text-primary cursor-pointer"
                    :class="!path && 'font-semibold'">
              <i class="ph ph-folder-notch-open text-warning"></i><span x-text="repoShort"></span>
            </button>
            <template x-for="c in crumbs" :key="c.path">
              <div class="flex items-center gap-1">
                <span class="opacity-40">/</span>
                <button @click="load(c.path)" class="hover:text-primary cursor-pointer"
                        :class="c.path===path && 'font-semibold'" x-text="c.name"></button>
              </div>
            </template>
            <div class="grow"></div>
            <!-- Which ref this file browser reads. Scoped to the Files view on
                 purpose: it does not re-render landings or the atlas (rendering
                 at a ref is the FAB's Render tab / a toss).
                 It was a hand-rolled dropdown over the browser store's branch
                 list until 2026-08-14, and a markup sibling of repo.js's, which
                 still has its own. The shared refPicker replaces it and brings
                 what the store's list could not: the store's ensureBranches
                 calls gh.branches(), which is one uncapped-at-100 REST page in
                 alphabetical order, so a repo past a hundred branches was
                 SILENTLY missing rows and the newest was rarely near the top.
                 The picker surveys with branchesDated, paginated, newest first,
                 with each row's age. -->
            <div class="w-44 shrink-0" x-data="refPicker(refCfg)"></div>
            <!-- Out to the central file surface, carrying where you are: this
                 repo, this ref, this folder. The tree walk answers where a file
                 SITS; the Search view answers what it is called, what is in it,
                 and the same question across every repo at once, so the walk
                 needs a one-tap route to it rather than a re-entered scope. -->
            <button @click="searchHere()" class="opacity-30 hover:opacity-70 transition-opacity"
                    title="Search and read these files in the central Search view">
              <i class="ph ph-magnifying-glass"></i></button>
            <a :href="ghFolderUrl" target="_blank" class="opacity-30 hover:opacity-70 transition-opacity"
               title="Open this folder on GitHub"><i class="ph ph-github-logo"></i></a>
          </div>

          <div class="border border-base-300 rounded-lg bg-base-100 overflow-hidden mt-2">
            <div x-show="loading" class="flex justify-center py-10">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <div x-show="!loading" class="max-h-[60vh] overflow-y-auto p-1">
              <div x-show="path" @click="load(parentPath)"
                   class="px-2 py-1.5 rounded hover:bg-base-200 cursor-pointer font-mono text-base opacity-50">..</div>
              <template x-for="f in tree" :key="f.path">
                <div @click="f.type==='dir' ? load(f.path) : sel(f.path)"
                     class="group flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-base-200 cursor-pointer text-base"
                     :class="activeFile===f.path && 'bg-primary/10 text-primary font-semibold'">
                  <div class="flex items-center gap-2 min-w-0">
                    <i class="ph shrink-0" :class="f.type==='dir' ? 'ph-folder text-warning' : 'ph-file text-info'"></i>
                    <span class="truncate font-mono" x-text="f.name"></span>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <span x-show="f.type!=='dir'" class="text-base font-mono text-base-content/40 hidden sm:inline"
                          x-text="f.size ? fmtSize(f.size) : ''"></span>
                    <button x-show="f.type!=='dir'" @click.stop="stageToggle(f.path)"
                            class="btn btn-ghost w-6 h-6 p-0"
                            :class="isStaged(f.path) ? 'text-success opacity-100' : 'opacity-30 group-hover:opacity-70 hover:!opacity-100 hover:text-success'"
                            :title="isStaged(f.path) ? 'Remove from stage' : 'Add to stage'">
                      <i class="ph text-base" :class="isStaged(f.path) ? 'ph-check-circle' : 'ph-plus-circle'"></i>
                    </button>
                  </div>
                </div>
              </template>
              <div x-show="!tree.length" class="px-2 py-4 text-base opacity-40 font-mono">empty</div>
            </div>
          </div>
        </div>`,

      path: '',
      tree: [],
      loading: false,
      // True once any directory listing has completed (ok or not): the
      // "listing has had its first paint" signal show-repo's Recent panel
      // defers behind, so its fetches never contend with the listing's.
      loadedOnce: false,

      // The ref picker's config, built HERE rather than in its own x-data.
      // Alpine evaluates an x-data expression with every registered component
      // name in scope, and `repo` is one of this estate's components, so a
      // config naming host state there can silently read the wrong thing
      // (docs/SNAGS.md, x-data-scope-shadows-component-names). init() runs in
      // the ordinary component scope, where the injection is gone.
      refCfg: null,

      init() {
        this.$root.__explorer = this;
        this.$el.innerHTML = this.template;
        const self = this;
        this.refCfg = {
          repo: () => Alpine.store('browser').repo,
          ref: () => Alpine.store('browser').ref || '',
          defaultRef: () => Alpine.store('browser').defaultRef || '',
          onPick: (r) => self.applyRef(r),
        };
        this.$nextTick(() => Alpine.initTree(this.$el));
        this.$watch(
          () => Alpine.store('browser').ref,
          () => { if (this.gh && Alpine.store('browser').repo) this.reloadForRef(); }
        );
      },

      get gh() {
        return Alpine.store('browser').gh;
      },
      get activeFile() {
        return Alpine.store('browser').activeFile?.path;
      },
      get parentPath() {
        return this.path.split('/').slice(0, -1).join('/');
      },
      get crumbs() {
        const segs = this.path ? this.path.split('/') : [];
        return segs.map((name, i) => ({ name, path: segs.slice(0, i + 1).join('/') }));
      },
      get repoShort() {
        return (Alpine.store('browser').repo || '').split('/').pop() || 'repo';
      },
      // The current folder on GitHub: the breadcrumb's jump-over to the same
      // place in the GitHub presentation.
      get ghFolderUrl() {
        const s = Alpine.store('browser');
        const ref = s.ref || s.defaultRef || 'main';
        return 'https://github.com/' + s.repo + '/tree/' + ref + (this.path ? '/' + this.path : '');
      },

      fmtSize: kb,

      // Hand the current position to the Search view: repo, ref (only when it
      // is off the default, since '' there means "the default branch" and is
      // the honest thing to carry), and the folder as its scope. No query, so
      // it opens as a listing of exactly what is on screen here.
      searchHere() {
        const s = Alpine.store('browser');
        window.__shell?.goSearch?.({
          mode: 'names', repo: s.repo, ref: this.normRef(), path: this.path,
        });
      },

      // ── Ref picker plumbing ───────────────────────────────────────────────
      // The readout and the off-default tint moved into refPicker, which draws
      // both from the config above; what stays here is the store's side of the
      // switch.
      // Route through the repo component when one is mounted so its mirrored
      // ref state stays honest; the store's setRef is the actual switch either
      // way (this component's own reload rides its store.ref watcher).
      pickRef(ref) {
        const rc = document.getElementById('repo')?.__repo;
        if (rc) rc.setRef(ref); else Alpine.store('browser').setRef(ref);
      },
      // What the picker hands back, on the way to the store. Two things the
      // picker itself has no business knowing survive here:
      //
      //   a pasted GitHub URL resolves to its ref, and one pointing at ANOTHER
      //   repo says so rather than being read as a branch name. That check
      //   needs the browsed repo, which is this component's context, not the
      //   picker's contract.
      //
      //   '' means "the default branch" to the picker (parse honestly, resolve
      //   late), while this store has always held the default branch BY NAME
      //   and the shell's ?ref= stamp compares against it. So the resolve
      //   happens on this side of the boundary and the store keeps its shape.
      applyRef(v) {
        const s = Alpine.store('browser');
        const val = String(v || '').trim();
        if (val.startsWith('http')) {
          const parsed = s.gh && s.gh.parseUrl ? s.gh.parseUrl(val) : null;
          if (parsed && parsed.repo === s.repo) this.pickRef(parsed.ref || s.defaultRef || 'main');
          else if (parsed) {
            Alpine.store('toast')('warning',
              'URL points to ' + parsed.repo + ', current repo is ' + s.repo, 'alert-warning', 4000);
          }
          return;
        }
        this.pickRef(val || s.defaultRef || 'main');
      },

      async load(p, silent) {
        this.path = p;
        Alpine.store('browser').path = p;
        this.loading = true;
        try { this.tree = await this.gh.ls(p); } catch { this.tree = []; }
        this.loading = false;
        this.loadedOnce = true;
        if (!silent) this.persist();
      },

      async reset() {
        this.path = '';
        this.tree = [];
        await this.load('', true);
      },

      async reloadForRef() {
        this.gh.ref = Alpine.store('browser').ref;
        const currentPath = this.path;
        const active = Alpine.store('browser').activeFile?.path;
        await this.load(currentPath, true);
        if (active) await this.sel(active, true);
      },

      async sel(p, silent) {
        try {
          const res = await this.gh.get(p);
          Alpine.store('browser').activeFile = { path: p, content: fmt(res.text) };
        } catch(e) {
          Alpine.store('browser').activeFile = { path: p, content: '// Error: ' + e.message };
        }
        if (!silent) this.persist();
      },

      persist() {
        const store = Alpine.store('browser');
        if (!store.save) return;
        store.save({
          repo: store.repo,
          ref: store.ref || '',
          path: this.path,
          file: store.activeFile?.path || ''
        });
      },

      // ── Staging: "+" on a file row adds it to the shared cross-repo stage ──
      // Items carry their origin ({ repo, ref, path }, ref '' = the source's
      // default branch), so the stage survives repo switches and mixes sources.
      normRef() {
        const s = Alpine.store('browser');
        return s.ref && s.ref !== s.defaultRef ? s.ref : '';
      },
      isStaged(p) {
        const s = Alpine.store('browser');
        const ref = this.normRef();
        return (s.stage || []).some(it => it.path === p && it.repo === s.repo && (it.ref || '') === ref);
      },
      stageToggle(p) {
        const s = Alpine.store('browser');
        const ref = this.normRef();
        if (this.isStaged(p)) {
          s.stage = s.stage.filter(it => !(it.path === p && it.repo === s.repo && (it.ref || '') === ref));
        } else {
          s.stage.push({ repo: s.repo, ref, path: p });
          Alpine.store('toast')('plus-circle', 'Staged ' + p.split('/').pop(), 'alert-success', 2000);
        }
      }
    };
  });
});
