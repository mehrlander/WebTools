// A tap-through repo/path selector: a button-shaped trigger opens a navigable
// tree panel right below (repos, then folders, then files), and selection is
// taps all the way down — crumbs jump back up, "Here" commits a folder. Where
// mention embeds a path inside prose (type @ mid-text), this component is for
// the case where the path is the whole point. Anchored to the trigger rather
// than a bottom sheet, so it stays inside the mobile viewport with visible
// boundaries.
//
// NO TEXT INPUT OF ITS OWN, which is not the same as no filtering. An input
// here would invite the keyboard and iOS's focus zoom for what is mostly
// navigation, and where a host already has a field (an address box the user is
// typing in), a second one is worse than none. So the component owns `query`
// and `active` but never renders a box: a host feeds keystrokes in through
// setQuery/move/commitActive, and a host without a field just taps. The
// scoring, the containers-first ordering, and the always-set active row are
// mention's, deliberately, so the two pickers filter the same way.
//
// Options:
//   mode: 'file' (default) — choosing a file emits it and stays open for the
//         next grab; 'dir' — the target is a folder: "Here" commits the
//         current folder, and a file tap commits its containing folder.
//   roots: [{repo, ref?, label?}], or a function returning them, or an async
//         function, awaited lazily at first open (roots often resolve after
//         mount: config, quick links, or a token-gated repo listing).
//   placeholder, value: the trigger's idle label and initial committed label.
//   trigger: false — render the PANEL ONLY and let the host own the opener.
//         The built-in trigger is a btn-block, right where the path IS the
//         control; a host whose chrome already names the path (the fab's render
//         tab, where it sits in a compact row beside a menu) would otherwise
//         have to show that path twice. The instance publishes itself on its
//         root element as __pathPicker, so the host's own control calls
//         toggle() on it.
//   dense: true — tighter rows and smaller type, for a host with a narrow
//         panel (the fab's drawer). Every row keeps a title with its full name,
//         dense or not, since truncation is what a narrow panel buys.
//   gh: a GH instance, or a function returning one. The component's one hidden
//         dependency used to be Alpine's `browser` store, which exists on
//         show-repo and nowhere else; that quietly limited a general picker to
//         one page. The store is still the default, so no existing caller
//         changes.
//
// A repo's tree loads when it is ENTERED, not at first open. It used to be the
// other way round, on the reasoning that the root set was small and descent
// should never pause. That reasoning inverted the moment a caller wanted to
// offer every repo a token can see: one recursive tree call per root, up the
// front, for the ninety-nine repos you were not going to open. Now the root
// list costs nothing to show and one call to enter, so a roots list can be as
// long as the caller likes.
//
// Host-driven filtering (all no-ops for a host that does not use them):
//   setQuery(text)   filter the current level; resets the active row to the top
//   move(delta)      move the active row, wrapping
//   commitActive()   choose the active row: descend a container, emit a file
//   query, active    read them to render a hint or mirror state
//
// Events (bubbling, from $root):
//   path-pick — file mode: {repo, ref, path}; dir mode: {repo, ref, dir, spec}
//   path-descend — after entering a container, so a host can clear its query

document.addEventListener('alpine:init', function() {
  Alpine.data('pathPicker', function(opts) {
    const cfg = opts || {};
    return {
      mode: cfg.mode === 'dir' ? 'dir' : 'file',
      // A host that owns its own opener passes trigger:false; the panel then
      // anchors to whatever wrapper the host put this mount in.
      showTrigger: cfg.trigger !== false,
      // Row density. The default is sized for touch in a full-width form, which
      // is where this picker started; dropped into a 22rem drawer those rows
      // eat the panel and truncate every name. `dense` is a host declaring it
      // has less width to give, not a preference: the tap target stays a row,
      // it just stops being 40 px tall.
      dense: cfg.dense === true,
      placeholder: cfg.placeholder || 'Pick a file',
      label: cfg.value || '',
      open: false,
      scope: [],
      tree: [],
      loading: false,
      truncated: false,
      error: '',
      query: '',
      // Always a real row, so Tab and Enter always have something to commit.
      active: 0,
      _loaded: false,

      template: `
        <div class="relative" @click.outside="open = false">
          <!-- The trigger is a button, not an input: no keyboard, no iOS
               focus zoom. It shows the last committed pick, else the idle
               label. -->
          <button x-show="showTrigger" type="button" @click="toggle()" :aria-expanded="open"
                  class="btn btn-block justify-start gap-2 border-base-300 bg-base-100 font-normal hover:bg-base-200">
            <i class="ph shrink-0 opacity-60" :class="mode === 'dir' ? 'ph-crosshair-simple' : 'ph-hand-grabbing'"></i>
            <span class="min-w-0 truncate font-mono text-sm" :class="!label && 'opacity-50'"
                  x-text="label || placeholder"></span>
            <!-- Two glyphs, not one rotated: a utility that only ever arrives by
                 toggling a class is never generated by Tailwind's browser build,
                 so this caret silently never turned. -->
            <i x-show="!open" class="ph ph-caret-down ml-auto shrink-0 opacity-40"></i>
            <i x-show="open" class="ph ph-caret-up ml-auto shrink-0 opacity-40"></i>
          </button>

          <section x-cloak x-show="open"
                   class="absolute inset-x-0 top-full z-40 mt-1 flex max-h-[50vh] flex-col overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-xl">
            <!-- Compact crumb row: a repo crumb shows its short name (full
                 name in the tooltip) so deep paths fit a phone width. Actions
                 bind to click, not pointerdown, so a touch that starts a
                 scroll never triggers them. -->
            <header class="flex min-h-8 shrink-0 items-center gap-0.5 border-b border-base-300 px-1">
              <button type="button" class="btn btn-ghost btn-xs btn-square shrink-0" :disabled="!scope.length"
                      aria-label="Go up one level" @click="up()">
                <i class="ph ph-caret-left"></i>
              </button>
              <nav aria-label="Current path"
                   class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button type="button" class="shrink-0 rounded px-1 py-0.5 text-sm hover:bg-base-200"
                        :class="!scope.length && 'bg-base-200 font-medium'" @click="jump(0)">Repos</button>
                <template x-for="(node, index) in scope" :key="index + ':' + node.name">
                  <span class="contents">
                    <span class="shrink-0 text-base-content/30 text-sm">/</span>
                    <button type="button" class="max-w-[9rem] truncate shrink-0 rounded px-1 py-0.5 font-mono text-sm hover:bg-base-200"
                            :class="index === scope.length - 1 && 'bg-base-200 font-medium'"
                            :title="node.name" @click="jump(index + 1)"
                            x-text="node.kind === 'repo' ? node.name.split('/').pop() : node.name"></button>
                  </span>
                </template>
              </nav>
              <button x-show="mode === 'dir'" type="button" :disabled="!dirSpec()"
                      class="btn btn-primary btn-xs shrink-0 gap-1" @click="pickDir()">
                <i class="ph ph-check"></i>Here
              </button>
              <button type="button" class="btn btn-ghost btn-xs btn-square shrink-0"
                      aria-label="Close" @click="open = false">
                <i class="ph ph-x"></i>
              </button>
            </header>

            <div x-ref="options" role="listbox" class="min-h-0 flex-1 overscroll-contain overflow-y-auto p-1">
              <div x-show="loading" class="grid min-h-20 place-items-center">
                <span class="loading loading-dots loading-md opacity-30"></span>
              </div>
              <template x-for="(node, index) in (loading ? [] : matches())" :key="index + ':' + node.name">
                <button type="button" role="option" :data-index="index" :aria-selected="active === index"
                        :title="node.name"
                        class="flex w-full touch-manipulation items-center rounded-field text-left transition-colors"
                        :class="[active === index ? 'bg-primary/10 text-primary' : 'hover:bg-base-200',
                                 dense ? 'min-h-8 gap-2 px-2 py-0.5' : 'min-h-10 gap-2.5 px-2.5 py-1.5']"
                        @mouseenter="active = index" @click="choose(node)">
                  <i class="ph shrink-0" :class="[dense && 'text-sm',
                     node.kind === 'repo' ? 'ph-git-repository text-primary' : node.children ? 'ph-folder text-warning' : 'ph-file text-info']"></i>
                  <span class="min-w-0 flex-1 truncate font-mono" :class="dense ? 'text-sm' : 'text-base'"
                        x-text="node.name"></span>
                  <!-- The count needs a loaded array; the caret only needs the
                       row to be enterable, which a repo is before it loads. -->
                  <span x-show="Array.isArray(node.children)" class="badge badge-ghost badge-xs shrink-0"
                        x-text="node.children?.length"></span>
                  <span x-show="node.kind === 'repo' || node.children"
                        class="shrink-0 text-base-content/35"><i class="ph ph-caret-right text-sm"></i></span>
                </button>
              </template>
              <div x-show="!loading && !matches().length"
                   class="grid min-h-20 place-items-center px-3 text-center text-base text-base-content/50">
                <span x-text="query ? ('Nothing here matches \u201c' + query + '\u201d.') : 'Empty.'"></span>
              </div>
            </div>
            <div x-show="truncated" class="shrink-0 border-t border-base-300 px-3 py-1 text-sm text-warning">
              Tree truncated by GitHub; deep paths may be missing.
            </div>
            <div x-show="error" class="shrink-0 border-t border-base-300 px-3 py-1 text-sm text-error" x-text="error"></div>
            <!-- Shown only when a host is driving from a field: with taps alone
                 there are no keys to advertise. -->
            <div x-show="query !== ''" class="shrink-0 border-t border-base-300 px-3 py-1 text-sm opacity-50">
              &uarr;&darr; navigate &middot; Tab or Enter select &middot; Esc close
            </div>
          </section>
        </div>`,

      init() {
        this.$root.__pathPicker = this;
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
      },

      get gh() {
        if (cfg.gh) {
          const g = typeof cfg.gh === 'function' ? cfg.gh() : cfg.gh;
          if (g) return g;
        }
        try { return Alpine.store('browser').gh; } catch (e) { return null; }
      },

      // Roots resolve lazily at first open, so sets that arrive after mount are
      // seen: config, quick links, or an awaited repo listing. A root node
      // starts with children === null, meaning "not loaded yet"; entering it
      // fills them in (see loadRepo).
      async ensureTree() {
        if (this._loaded) return;
        this._loaded = true;
        let roots = [];
        try {
          roots = (await (typeof cfg.roots === 'function' ? cfg.roots() : cfg.roots)) || [];
        } catch (e) { this.error = 'Could not list repositories: ' + (e.message || e); }
        if (!this.gh || !roots.length) return;
        this.tree = roots.map(raw => {
          const r = typeof raw === 'string' ? { repo: raw, ref: '' } : raw;
          return {
            name: r.label || (r.repo + (r.ref ? '@' + r.ref : '')),
            kind: 'repo', repo: r.repo, ref: r.ref || '', children: null,
          };
        });
      },

      // One repo's tree, on entry. Failure leaves an empty repo rather than a
      // broken picker: the row above it still reads, and the panel says Empty.
      async loadRepo(node) {
        const base = this.gh;
        if (!base) { node.children = []; return; }
        this.loading = true;
        try {
          const inst = new base.constructor({ token: base.token, repo: node.repo });
          inst.ref = node.ref || '';
          const res = await inst.req('git/trees/' + encodeURIComponent(node.ref || 'HEAD') + '?recursive=1');
          if (res.truncated) this.truncated = true;
          node.children = this.buildTree(res.tree || []);
        } catch (e) {
          node.children = [];
          this.error = 'Could not read ' + node.repo + ': ' + (e.message || e);
        }
        this.loading = false;
      },

      buildTree(flat) {
        const root = [];
        const dirs = new Map([['', root]]);
        const ensureDir = key => {
          if (dirs.has(key)) return dirs.get(key);
          const cut = key.lastIndexOf('/');
          const parent = cut === -1 ? '' : key.slice(0, cut);
          const name = cut === -1 ? key : key.slice(cut + 1);
          const siblings = ensureDir(parent);
          let node = siblings.find(n => n.children && n.name === name);
          if (!node) { node = { name, kind: 'folder', children: [] }; siblings.push(node); }
          dirs.set(key, node.children);
          return node.children;
        };
        for (const e of flat) {
          if (!e || !e.path) continue;
          if (e.type === 'tree') { ensureDir(e.path); continue; }
          if (e.type === 'blob') {
            const cut = e.path.lastIndexOf('/');
            const parent = cut === -1 ? '' : e.path.slice(0, cut);
            const name = cut === -1 ? e.path : e.path.slice(cut + 1);
            ensureDir(parent).push({ name, kind: 'file' });
          }
        }
        const sort = nodes => {
          nodes.sort((a, b) =>
            (a.children ? 0 : 1) - (b.children ? 0 : 1) ||
            a.name.localeCompare(b.name));
          nodes.forEach(n => n.children && sort(n.children));
          return nodes;
        };
        return sort(root);
      },

      toggle() {
        this.open = !this.open;
        if (this.open) this.ensureTree();
        else this.setQuery('');
      },

      children() {
        if (!this.scope.length) return this.tree;
        return this.scope[this.scope.length - 1].children || [];
      },

      // The current level, filtered and ranked. Same scoring as mention:
      // exact, then prefix, then substring, containers before leaves, original
      // order breaking ties. An unranked substring match is what makes typing a
      // filename work without knowing where it sits in the list.
      matches() {
        const query = this.query.trim().toLocaleLowerCase();
        return this.children()
          .map((node, order) => {
            const name = node.name.toLocaleLowerCase();
            const score =
              !query ? 0 :
              name === query ? 0 :
              name.startsWith(query) ? 1 :
              name.includes(query) ? 2 : 99;
            return { node, order, score, container: node.children || node.kind === 'repo' ? 0 : 1 };
          })
          .filter(item => item.score < 99)
          .sort((a, b) => a.score - b.score || a.container - b.container || a.order - b.order)
          .map(item => item.node);
      },

      // ── host-driven filtering ───────────────────────────────────────────
      // The component keeps no input of its own; a host with a field pushes
      // keystrokes in here. Any query change puts the active row back at the
      // top, so the highlighted row is always the best current match.
      setQuery(text) {
        const next = String(text == null ? '' : text);
        if (next === this.query) return;
        this.query = next;
        this.active = 0;
        this.resetScroll();
      },

      move(delta) {
        const n = this.matches().length;
        if (!n) { this.active = 0; return; }
        this.active = ((this.active + delta) % n + n) % n;
        this.scrollActiveIntoView();
      },

      commitActive() {
        const node = this.matches()[this.active];
        if (!node) return false;
        this.choose(node);
        return true;
      },

      scrollActiveIntoView() {
        const box = this.$refs.options;
        const row = box && box.querySelector('[data-index="' + this.active + '"]');
        if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
      },
      path(nodes = this.scope) { return nodes.map(node => node.name).join('/'); },

      // The current scope as a destination: null until a repo is entered.
      dirSpec() {
        const head = this.scope[0];
        if (!head || head.kind !== 'repo') return null;
        const dir = this.scope.slice(1).map(n => n.name).join('/');
        return { repo: head.repo, ref: head.ref || '', dir,
                 spec: head.repo + (head.ref ? '@' + head.ref : '') + (dir ? ':' + dir : '') };
      },

      async choose(node) {
        if (!node) return;
        // An unentered repo loads here. Nothing is awaited for a node that is
        // already loaded, so descent stays synchronous in the common case.
        if (node.kind === 'repo' && !Array.isArray(node.children)) await this.loadRepo(node);
        if (node.children) {
          this.scope = [...this.scope, node];
          // A new level starts unfiltered, with the top row active. The event
          // lets a host reset its own field to match.
          this.query = '';
          this.active = 0;
          this.resetScroll();
          this.$root.dispatchEvent(new CustomEvent('path-descend', {
            bubbles: true, detail: { scope: this.scope.map(n => n.name) },
          }));
          return;
        }
        if (this.mode === 'dir') {
          // A file names its folder: the current scope is the destination.
          this.pickDir();
          return;
        }
        // File mode: emit the pick, stay open in place for the next grab.
        const head = this.scope[0];
        if (!head || head.kind !== 'repo') return;
        const detail = { repo: head.repo, ref: head.ref || '', path: [...this.scope.slice(1), node].map(n => n.name).join('/') };
        this.label = detail.path;
        this.$root.dispatchEvent(new CustomEvent('path-pick', { bubbles: true, detail }));
      },

      pickDir() {
        const d = this.dirSpec();
        if (!d) return;
        this.label = d.spec;
        this.$root.dispatchEvent(new CustomEvent('path-pick', { bubbles: true, detail: d }));
        this.open = false;
      },

      // Walking back up is a level change like descending, so the filter and the
      // active row reset with it. Otherwise a query typed three folders down
      // silently keeps filtering the level you just returned to.
      jump(depth) {
        this.scope = this.scope.slice(0, depth);
        this.query = '';
        this.active = 0;
        this.resetScroll();
      },
      up() { this.jump(Math.max(0, this.scope.length - 1)); },

      resetScroll() {
        this.$nextTick(() => { if (this.$refs.options) this.$refs.options.scrollTop = 0; });
      }
    };
  });
});
