// alpineComponents/ref-picker.js — pick a ref OF A GIVEN REPO.
//
// The estate already had three branch lists and none of them fit a fourth
// caller, for one reason each:
//
//   explorer.js's dropdown   bound to the browser store, so it can only ever
//   repo.js's refDropdown    offer refs of the ONE repo the shell is browsing.
//                            They are markup siblings of each other and say so.
//   ref-switch.js            answers a different question entirely: which ref
//                            the PAGE is running from. It navigates.
//
// A view that scopes to any repo, the Search view being the first, needs the
// list without either constraint: a repo handed in, and a picked ref handed
// back, with no navigation and no store. That is the whole of this component.
//
// PICKING IS THE VERB, typing is the fallback, which is the inverse of
// ref-switch's arrangement and deliberate. There the box is the primary control
// because the state it serves best is the default branch, where you know the
// name of where you are going. Here you are reading files and choosing among
// what exists, so the list leads and the box above it filters. A name that is
// not in the list (a tag, a sha, a branch past the scan's reach) is still
// reachable: the box offers to take it as typed, which is what keeps this a
// picker with a paste in it rather than a picker instead of one.
//
// Options (each may be a value or a function, read fresh on every open, since a
// host's scope changes under a mounted picker):
//   repo        'owner/name'. Empty disables the trigger: there is no branch
//               list for "no repo", and offering one would be a lie.
//   ref         the ref currently chosen; '' means the default branch, which
//               is the honest empty (RepoAddress's rule: resolve late)
//   defaultRef  the repo's default branch, when the host knows it
//   onPick      (ref) => void. '' is handed back for the default branch, never
//               the branch's name, so the host keeps the late-resolving form
//   gh          a GH instance or a factory; defaults to the browser store's,
//               re-pointed at `repo`
//
// The scan runs ON DEMAND (hover, focus, or open) and once per repo: a view
// nobody opens the control on pays nothing, and switching repos and back does
// not re-fetch. branchesDated gives dates and the newest-first order that makes
// the list worth reading; a tokenless or GraphQL-less caller degrades to the
// REST list, undated and alphabetical, which is stated rather than hidden.
//
// The instance publishes itself on its root element as __refPicker.

document.addEventListener('alpine:init', function () {
  Alpine.data('refPicker', function (opts) {
    const cfg = opts || {};
    const read = (v) => (typeof v === 'function' ? v() : v);

    return {
      description: 'Pick a ref of a given repo: a dated, newest-first branch list with a filter box that doubles as the way to a tag or a sha. Hands the ref back; navigates nothing.',

      open: false,
      typed: '',
      rows: [],
      loadedFor: '',   // the repo the rows describe, so a repo switch re-scans
      loading: false,
      error: '',
      dated: true,     // false once a scan has degraded to the REST list

      template: `
        <div class="relative" @click.outside="open = false" @keydown.escape="open = false">
          <button type="button" @click="toggle()" @pointerenter="load()" :disabled="!repo"
                  :title="repo ? ('Ref of ' + repo + ': ' + label) : 'Pick a repo first'"
                  class="input input-bordered input-sm flex items-center gap-1.5 w-full min-w-0 font-mono transition-colors disabled:opacity-40"
                  :class="offDefault ? 'border-warning text-warning bg-warning/10' : ''">
            <i class="ph ph-git-branch shrink-0 opacity-60"></i>
            <span class="min-w-0 flex-1 truncate text-left" :class="!ref && 'opacity-50'" x-text="label"></span>
            <i class="ph shrink-0 text-base opacity-40" :class="open ? 'ph-caret-up' : 'ph-caret-down'"></i>
          </button>

          <div x-show="open" x-cloak x-transition.opacity.duration.120ms
               class="absolute left-0 top-full z-40 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-box border border-base-300 bg-base-100 shadow-xl">
            <div class="px-3 pt-2.5 pb-1.5 border-b border-base-300">
              <div class="text-sm font-mono uppercase tracking-widest text-base-content/40">Read files from</div>
              <div class="truncate font-mono text-sm text-base-content/70" x-text="repo"></div>
            </div>

            <!-- The box FILTERS. It is not the way in, it is the way past a
                 list that is long or that does not hold what you want. -->
            <div class="border-b border-base-300 px-3 py-2">
              <label class="input input-sm input-bordered flex items-center gap-1.5 w-full font-mono text-sm">
                <i class="ph ph-funnel shrink-0 opacity-50"></i>
                <input x-model="typed" x-ref="box" type="text" spellcheck="false"
                       autocapitalize="off" autocorrect="off" placeholder="filter, or paste a tag or sha"
                       @keydown.enter.prevent="pick(matches.length === 1 ? matches[0].name : typed.trim())"
                       class="grow min-w-0">
                <button type="button" x-show="typed" @click="typed = ''" class="opacity-40 hover:opacity-100 shrink-0">
                  <i class="ph ph-x-circle"></i></button>
              </label>
            </div>

            <!-- Offered only for something the list does not already hold, so
                 it never competes with a row one line below it. -->
            <div x-show="typedIsNew" class="border-b border-base-300 px-3 py-2">
              <button type="button" @click="pick(typed.trim())" class="btn btn-sm btn-primary btn-block gap-1.5">
                <span class="font-mono normal-case truncate" x-text="'Use ' + typed.trim()"></span>
              </button>
            </div>

            <div x-show="error" class="px-3 py-2 text-sm text-error" x-text="error"></div>
            <div x-show="loading" class="flex justify-center py-4">
              <span class="loading loading-spinner loading-sm text-base-content/30"></span>
            </div>

            <div x-show="!loading" class="max-h-72 overflow-y-auto py-1">
              <!-- The default branch, as itself. It is picked as '' rather than
                   by name, so a scope that means "whatever this repo calls its
                   default" keeps meaning that when the repo changes. -->
              <button type="button" @click="pick('')"
                      class="w-full min-h-9 flex items-center gap-2 px-3 text-left transition-colors hover:bg-base-200">
                <i class="ph ph-house-line shrink-0 text-base opacity-50"></i>
                <span class="min-w-0 flex-1 truncate font-mono text-sm" :class="!ref && 'font-semibold'"
                      x-text="defaultRef || 'default branch'"></span>
                <span class="shrink-0 text-sm text-base-content/35">default</span>
              </button>
              <template x-for="b in matches" :key="b.name">
                <button type="button" @click="pick(b.name)"
                        class="w-full min-h-9 flex items-center gap-2 px-3 text-left transition-colors hover:bg-base-200">
                  <span class="min-w-0 flex-1 truncate font-mono text-sm"
                        :class="b.name === ref ? 'text-warning font-semibold' : 'text-base-content/80'"
                        :title="b.subject || b.name">
                    <span x-show="prefix(b.name)" class="opacity-40" x-text="prefix(b.name)"></span><span x-text="tail(b.name)"></span>
                  </span>
                  <span class="shrink-0 text-sm text-base-content/35 tabular-nums" x-text="b.ago"></span>
                </button>
              </template>
              <p x-show="!matches.length && !error" class="px-3 py-2 text-sm text-base-content/50"
                 x-text="typed.trim() ? 'No branch matches. Enter still takes a tag or a sha.' : 'No other branches.'"></p>
              <p x-show="!dated && matches.length" class="px-3 pt-1 pb-2 text-sm text-base-content/40">
                Undated and alphabetical: this scan fell back to the REST list.
              </p>
            </div>
          </div>
        </div>`,

      init() {
        this.$root.__refPicker = this;
        this.$el.innerHTML = this.template;
        this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });
      },

      get repo() { return read(cfg.repo) || ''; },
      get ref() { return read(cfg.ref) || ''; },
      get defaultRef() { return read(cfg.defaultRef) || ''; },
      // The trigger reads as the answer to "which ref", so an unset ref shows
      // what unset MEANS rather than showing nothing.
      get label() { return this.ref || this.defaultRef || 'default branch'; },
      get offDefault() { return !!(this.ref && this.ref !== this.defaultRef); },
      get matches() {
        const q = this.typed.trim().toLowerCase();
        const rows = this.rows.filter(b => b.name !== this.defaultRef);
        return q ? rows.filter(b => b.name.toLowerCase().includes(q)) : rows;
      },
      // A typed value worth offering: only when the list has nothing to give
      // you. While anything still matches, the rows ARE the answer, and a "Use
      // newer" button one line above a `claude/newer` row is two ways to say
      // one thing where only the row is certainly a real ref. So the fallback
      // appears exactly where a picker runs out: a sha, a tag, a branch past
      // the scan's reach.
      get typedIsNew() {
        const t = this.typed.trim();
        return !!t && t !== this.ref && !this.matches.length && !this.rows.some(b => b.name === t);
      },
      // Two branches can share a tail, so the prefix stays, dimmed, rather than
      // being dropped: ref-switch's treatment, for the same reason.
      prefix(name) {
        const i = String(name).lastIndexOf('/');
        return i < 0 ? '' : String(name).slice(0, i + 1);
      },
      tail(name) {
        const i = String(name).lastIndexOf('/');
        return i < 0 ? String(name) : String(name).slice(i + 1);
      },

      toggle() {
        if (!this.repo) return;
        this.open = !this.open;
        if (this.open) { this.typed = ''; this.load(); this.$nextTick(() => this.$refs.box?.focus()); }
      },
      pick(ref) {
        const v = String(ref || '').trim();
        this.open = false; this.typed = '';
        cfg.onPick?.(v === this.defaultRef ? '' : v);
      },

      ghFor(repo) {
        if (cfg.gh) {
          const g = read(cfg.gh);
          if (g) { g.repo = repo; return g; }
        }
        const base = Alpine.store('browser')?.gh;
        if (!base) return null;
        const inst = new base.constructor({ token: base.token, repo });
        inst.ref = '';
        return inst;
      },

      async load() {
        const repo = this.repo;
        if (!repo || this.loading || this.loadedFor === repo) return;
        this.loading = true; this.error = '';
        try {
          const gh = this.ghFor(repo);
          if (!gh) throw new Error('no GitHub client available');
          let rows = null;
          if (typeof gh.branchesDated === 'function') {
            // A GraphQL failure is not a dead end here, only a poorer list, so
            // it degrades rather than reporting. What is NOT hidden is that it
            // degraded: the panel says so under the rows.
            try { rows = await gh.branchesDated(); this.dated = true; } catch { rows = null; }
          }
          if (!rows) {
            const list = await gh.branches();
            rows = (list || []).map(b => ({ name: b.name, ago: '', subject: '' }));
            this.dated = false;
          }
          this.rows = rows;
          this.loadedFor = repo;
        } catch (e) {
          this.error = 'Could not list branches: ' + (e?.message || e);
        } finally { this.loading = false; }
      },
    };
  });
});
