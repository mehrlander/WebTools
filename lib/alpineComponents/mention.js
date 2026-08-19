document.addEventListener('alpine:init', function() {
  Alpine.data('mention', function(opts) {
    const cfg = opts || {};
    return {
      description: 'In-textarea @-mention picker: type @ to browse the open repo\'s file tree (path-following + fuzzy) and insert an @path reference',

      // bare: drop the demo chrome (heading, helper, last-inserted panel) so the
      // picker embeds inside another component as a pure path designator.
      bare: !!cfg.bare,
      placeholder: cfg.placeholder || '',

      // roots: optional [{repo, ref?, label?}] (a bare "owner/repo" string is
      // accepted too). When present the picker opens one level up, at a choice
      // of repository: the chosen repo is the first path segment, so a single @
      // designates a fully-qualified path across repos. The mention-select
      // detail always carries repo/ref/path split apart, whatever the mode.
      // Absent: the picker follows the open repo through the shared browser
      // store, as before. Both are the same mechanism, one layer taller.
      roots: (cfg.roots && cfg.roots.length)
        ? cfg.roots.map(r => typeof r === 'string'
            ? { repo: r, ref: '', label: r }
            : { repo: r.repo, ref: r.ref || '', label: r.label || (r.repo + (r.ref ? '@' + r.ref : '')) })
        : null,

      template: `
        <div>
          <div class="mb-3" x-show="!bare">
            <h2 class="text-lg font-semibold flex items-center gap-2">
              <i class="ph ph-at"></i>Mention picker
            </h2>
            <p class="mt-1 text-sm text-base-content/60">
              Type <kbd class="kbd kbd-sm">@</kbd> in the box, then type or follow the tree to insert a file reference.
              <span x-show="repo" class="font-mono text-xs opacity-70" x-text="'Tree from ' + repo + (ref ? ('@' + ref) : '')"></span>
            </p>
            <div x-show="truncated" class="text-xs text-warning mt-1 flex items-center gap-1">
              <i class="ph ph-warning"></i>Tree truncated by GitHub; deep paths may be missing.
            </div>
            <div x-show="error" class="text-xs text-error mt-1 flex items-center gap-1">
              <i class="ph ph-x-circle"></i><span x-text="error"></span>
            </div>
          </div>

          <div class="relative" @click.outside="open = false">
            <textarea
              x-ref="box"
              x-model="text"
              rows="6"
              autocomplete="off" autocapitalize="off" spellcheck="false"
              aria-label="Message" aria-controls="mention-options" :aria-expanded="open"
              @input="sync($event)" @focus="sync($event)" @click="sync($event)"
              @keyup.left="sync($event)" @keyup.right="sync($event)"
              @keyup.home="sync($event)" @keyup.end="sync($event)"
              @keydown.down="navigate($event, 1)" @keydown.up="navigate($event, -1)"
              @keydown.enter="accept($event)" @keydown.escape="close($event)"
              class="textarea textarea-bordered w-full resize-none bg-base-100 p-4 text-base leading-relaxed shadow-sm focus:outline-2"
              :placeholder="phText"></textarea>

            <section
              x-cloak x-show="open"
              x-transition:enter="transition duration-150 ease-out"
              x-transition:enter-start="translate-y-2 opacity-0 sm:-translate-y-1"
              x-transition:enter-end="translate-y-0 opacity-100"
              x-transition:leave="transition duration-100 ease-in"
              x-transition:leave-start="translate-y-0 opacity-100"
              x-transition:leave-end="translate-y-2 opacity-0 sm:-translate-y-1"
              class="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-50 flex max-h-[58dvh] flex-col overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-2xl sm:absolute sm:inset-x-0 sm:bottom-auto sm:top-full sm:mt-2 sm:max-h-none sm:shadow-xl">

              <header class="flex min-h-12 shrink-0 items-center gap-2 border-b border-base-300 px-2">
                <button type="button" class="btn btn-ghost btn-sm shrink-0" :disabled="!scope.length"
                  aria-label="Go up one level" @pointerdown.prevent="up()">
                  <i class="ph ph-caret-left" aria-hidden="true"></i>
                  <span class="hidden sm:inline">Back</span>
                </button>

                <nav aria-label="Current path"
                  class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button type="button" class="btn btn-ghost btn-xs shrink-0 font-normal"
                    :class="!scope.length && 'bg-base-200 font-medium'" @pointerdown.prevent="jump(0)"
                    x-text="repoShort"></button>
                  <template x-for="(node, index) in scope" :key="index + ':' + node.name">
                    <span class="contents">
                      <span class="shrink-0 text-base-content/30">/</span>
                      <button type="button" class="btn btn-ghost btn-xs shrink-0 font-normal"
                        :class="index === scope.length - 1 && 'bg-base-200 font-medium'"
                        @pointerdown.prevent="jump(index + 1)" x-text="node.name"></button>
                    </span>
                  </template>
                </nav>

                <button type="button" class="btn btn-ghost btn-sm btn-square shrink-0"
                  aria-label="Close picker" @pointerdown.prevent="open = false">
                  <i class="ph ph-x"></i>
                </button>
              </header>

              <div id="mention-options" x-ref="options" role="listbox"
                class="min-h-0 flex-1 overscroll-contain overflow-y-auto p-1 sm:max-h-80">

                <div x-show="loading" class="grid min-h-28 place-items-center">
                  <span class="loading loading-dots loading-sm opacity-30"></span>
                </div>

                <template x-for="(node, index) in (loading ? [] : matches())" :key="index + ':' + node.name">
                  <button type="button" role="option" :data-index="index" :aria-selected="active === index"
                    class="flex min-h-12 w-full touch-manipulation items-center gap-3 rounded-field px-3 py-2 text-left transition-colors"
                    :class="active === index ? 'bg-primary/10 text-primary' : 'hover:bg-base-200'"
                    @mouseenter="active = index" @pointerdown.prevent="choose(node)">
                    <span class="grid size-7 shrink-0 place-items-center rounded-md bg-base-200" aria-hidden="true">
                      <i class="ph" :class="node.kind === 'repo' ? 'ph-git-repository text-primary' : node.children ? 'ph-folder text-warning' : 'ph-file text-info'"></i>
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-medium" x-text="node.name"></span>
                      <span class="block text-xs opacity-50" x-text="kindLabel(node)"></span>
                    </span>
                    <span x-show="node.children" class="badge badge-ghost badge-sm shrink-0" x-text="node.children?.length"></span>
                    <span x-show="node.children" class="shrink-0 text-base-content/30" aria-hidden="true">
                      <i class="ph ph-caret-right"></i>
                    </span>
                  </button>
                </template>

                <div x-show="!loading && !matches().length" class="grid min-h-28 place-items-center px-4 text-center">
                  <div>
                    <p class="font-medium" x-text="(roots || repo) ? 'No matching children' : 'No repo selected'"></p>
                    <p class="mt-1 text-sm text-base-content/50"
                      x-text="(roots || repo) ? (query ? ('Nothing here matches &quot;' + query + '&quot;.') : '') : 'Use the repo picker above.'"></p>
                  </div>
                </div>
              </div>

              <footer class="shrink-0 border-t border-base-300 px-3 py-2 text-xs text-base-content/40">
                <span class="sm:hidden">Tap a folder to continue or a file to insert the reference.</span>
                <span class="hidden sm:inline">↑↓ navigate · Enter select · Esc close</span>
              </footer>
            </section>
          </div>

          <div x-show="lastInserted && !bare" class="mt-3 rounded-box border border-base-300 bg-base-100 p-3 text-sm">
            <span class="opacity-60">Last inserted:</span>
            <span class="font-mono text-primary" x-text="lastInserted"></span>
          </div>
        </div>`,

      text: '',
      open: false,
      start: 0,
      caret: 0,
      query: '',
      active: 0,
      scope: [],
      tree: [],
      loading: false,
      error: '',
      truncated: false,
      lastInserted: '',

      init() {
        this.$root.__mention = this;
        this.$el.innerHTML = this.template;
        this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });
        if (this.roots) {
          // Repo-first: the root set is an explicit, mount-time argument, so the
          // picker does not follow the shared browser store.
          this.reload();
        } else {
          // Re-fetch the tree whenever the shared browser store points at a
          // different repo or ref, mirroring navigator/explorer/pages.
          this.$watch(() => Alpine.store('browser').repo, () => this.reload());
          this.$watch(() => Alpine.store('browser').ref, () => this.reload());
          if (this.repo) this.reload();
        }
      },

      get gh() { return Alpine.store('browser').gh; },
      get repo() { return Alpine.store('browser').repo; },
      get ref() { return Alpine.store('browser').ref; },
      get repoShort() { return this.roots ? 'Repos' : ((this.repo || '').split('/').pop() || 'Repo'); },
      get phText() {
        if (this.placeholder) return this.placeholder;
        if (this.roots) return 'Type @ to pick a repo, then a file';
        return this.repo ? ('Reference a file in ' + this.repo + ' with @') : 'Pick a repo above, then type @';
      },

      // One recursive tree call per (repo, ref), the same primitive the Files
      // view uses, folded into the nested {name, children} shape the picker
      // walks.
      async reload() {
        if (this.roots) return this.reloadRoots();
        if (!this.gh || !this.repo) return;
        this.loading = true;
        this.error = '';
        this.truncated = false;
        this.open = false;
        this.scope = [];
        this.query = '';
        this.active = 0;
        try {
          const res = await this.gh.req('git/trees/' + encodeURIComponent(this.ref || 'HEAD') + '?recursive=1');
          this.truncated = !!res.truncated;
          this.tree = this.buildTree(res.tree || []);
        } catch (e) {
          this.tree = [];
          this.error = 'Could not load tree: ' + ((e && e.message) || String(e));
        }
        this.loading = false;
      },

      // Repo-first load: fetch each root repo's tree and present the set as the
      // top level, each repo a folder-shaped node ({kind:'repo', repo, ref})
      // whose children are that repo's own tree. Eager (one recursive tree call
      // per root) so typed and clicked navigation both resolve without a
      // mid-descent fetch; the root set is small (the open repo plus configured
      // targets). A root that fails to load still appears, empty.
      async reloadRoots() {
        const base = this.gh;
        if (!base) return;
        this.loading = true;
        this.error = '';
        this.truncated = false;
        this.open = false;
        this.scope = [];
        this.query = '';
        this.active = 0;
        const nodes = [];
        for (const r of this.roots) {
          const inst = new base.constructor({ token: base.token, repo: r.repo });
          inst.ref = r.ref || '';
          let children = [];
          try {
            const res = await inst.req('git/trees/' + encodeURIComponent(r.ref || 'HEAD') + '?recursive=1');
            if (res.truncated) this.truncated = true;
            children = this.buildTree(res.tree || []);
          } catch (e) {
            children = [];
          }
          nodes.push({ name: r.label || r.repo, kind: 'repo', repo: r.repo, ref: r.ref || '', children });
        }
        nodes.sort((a, b) => a.name.localeCompare(b.name));
        this.tree = nodes;
        this.loading = false;
      },

      // Flat git-tree entries ({path, type:'blob'|'tree'}) → nested nodes.
      // Folders carry a children[]; files do not. Parent dirs are created on
      // demand so entry order does not matter.
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

      sync(event) {
        const box = event.currentTarget || this.$refs.box;
        this.text = box.value;
        this.caret = box.selectionStart ?? this.text.length;

        const left = this.text.slice(0, this.caret);
        const match = left.match(/@([^\s@]*)$/);
        if (!match) {
          this.open = false;
          this.scope = [];
          this.query = '';
          return;
        }

        this.start = this.caret - match[0].length;
        const resolved = this.resolve(match[1]);
        const oldPath = this.path();
        const newPath = resolved.scope.map(node => node.name).join('/');
        const changed = resolved.query !== this.query || oldPath !== newPath;

        this.scope = resolved.scope;
        this.query = resolved.query;
        this.open = true;
        if (changed) { this.active = 0; this.resetScroll(); }
      },

      resolve(raw) {
        let nodes = this.tree;
        let rest = raw;
        const scope = [];
        while (true) {
          const next = nodes
            .filter(node => node.children)
            .sort((a, b) => b.name.length - a.name.length)
            .find(node => rest.startsWith(node.name + '/'));
          if (!next) break;
          scope.push(next);
          rest = rest.slice(next.name.length + 1);
          nodes = next.children;
        }
        return { scope, query: rest };
      },

      children() {
        return this.scope.length
          ? this.scope[this.scope.length - 1].children
          : this.tree;
      },

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
            return { node, order, score, container: node.children ? 0 : 1 };
          })
          .filter(item => item.score < 99)
          .sort((a, b) => a.score - b.score || a.container - b.container || a.order - b.order)
          .map(item => item.node);
      },

      path(nodes = this.scope) {
        return nodes.map(node => node.name).join('/');
      },

      choose(node) {
        if (!node) return;
        if (node.children) {
          this.scope = [...this.scope, node];
          this.query = '';
          this.active = 0;
          this.write('@' + this.path() + '/');
          this.open = true;
          this.resetScroll();
          return;
        }
        const token = '@' + this.path([...this.scope, node]);
        const detail = this.selection(node);
        this.write(token + ' ');
        this.lastInserted = token;
        this.open = false;
        this.scope = [];
        this.query = '';
        // Notify a host page that a reference was committed.
        this.$root.dispatchEvent(new CustomEvent('mention-select', {
          bubbles: true,
          detail
        }));
      },

      // The chosen file as {repo, ref, path}. In repo-first mode the scope's
      // first node is the repo, so split it off: repo/ref come from that node
      // and path is the remainder. Otherwise the whole scope lives within the
      // open repo (the shared store's repo/ref).
      selection(fileNode) {
        const full = [...this.scope, fileNode];
        const head = full[0];
        if (this.roots && head && head.kind === 'repo') {
          return { repo: head.repo, ref: head.ref || '', path: full.slice(1).map(node => node.name).join('/') };
        }
        return { repo: this.repo, ref: this.ref, path: this.path(full) };
      },

      jump(depth) {
        this.scope = this.scope.slice(0, depth);
        this.query = '';
        this.active = 0;
        const path = this.path();
        this.write('@' + path + (path ? '/' : ''));
        this.open = true;
        this.resetScroll();
      },

      up() { this.jump(Math.max(0, this.scope.length - 1)); },

      navigate(event, amount) {
        if (!this.open) return;
        const count = this.matches().length;
        if (!count) return;
        event.preventDefault();
        this.active = (this.active + amount + count) % count;
        this.scrollActive();
      },

      accept(event) {
        if (!this.open) return;
        const node = this.matches()[this.active];
        if (!node) return;
        event.preventDefault();
        this.choose(node);
      },

      close(event) {
        if (!this.open) return;
        event.preventDefault();
        this.open = false;
      },

      write(token) {
        const before = this.text.slice(0, this.start);
        const after = this.text.slice(this.caret);
        this.text = before + token + after;
        this.caret = before.length + token.length;
        this.start = before.length;
        this.$nextTick(() => {
          const box = this.$refs.box;
          box.focus();
          box.setSelectionRange(this.caret, this.caret);
        });
      },

      resetScroll() {
        this.$nextTick(() => { if (this.$refs.options) this.$refs.options.scrollTop = 0; });
      },

      scrollActive() {
        this.$nextTick(() => {
          this.$refs.options
            ?.querySelector('[data-index="' + this.active + '"]')
            ?.scrollIntoView({ block: 'nearest' });
        });
      },

      kindLabel(node) { return node.kind === 'repo' ? 'Repository' : node.children ? 'Folder' : 'File'; }
    };
  });
});
