// alpineComponents/search-view.js — the central file surface.
//
// It began as a search results list and is now the place files are READ, which
// is the same move made twice. The sidebar finder and this view split one job:
// the finder is for JUMPING (few keystrokes, one destination, no controls),
// this view is for INVESTIGATING (parameters, room for many results,
// iteration). The finder's "File contents" gate routes here with the query
// carried over; the header nav's Search entry opens it empty.
//
// WHY THE FILE OPENS HERE. Every repo carried its own Files view (the
// explorer's breadcrumb walk plus the shared viewer), so reading a file meant
// first choosing a repository and then walking a tree, and a hit found here
// bounced into that per-repo surface to be read. But a file is rarely wanted
// as a position in a tree; it is wanted by name, by folder, or by what is
// inside it, none of which a tree navigator answers and all three of which
// this view already does. So the search IS the browse: a query, a repo, a ref,
// and a folder scope are four filters over one list, and the list opens its
// own file. `?view=files` stays exactly as it was for the tree walk that
// wants it.
//
// Three modes, each a mode pill, all served by lib/kits/estate-search.js (one
// implementation, one cache, shared with the finder):
//
//   Files        substring over repo trees, scoped to a folder. Takes a REF,
//                since the trees API does: this is the mode that reaches
//                branches. Scope: one estate repo or all of them. An EMPTY
//                query is a listing rather than a miss, which is what makes
//                this mode a browser as well as a search.
//   Contents     the code-search API. The caveats live HERE, in a facts line
//                under the controls, instead of abbreviated onto a row label:
//                default branches only, indexing can lag a push, files over
//                ~384 KB are not indexed, ten calls a minute. Errors surface
//                whole. A folder scope rides as its `path:` qualifier.
//   Sessions     the captured-records grep (what a record quotes); hits open
//                the Sessions pane's paged reader via web-tools:open-session.
//
// Every run re-executes the search; the caches underneath make re-matching
// cheap, and "Refresh caches" (EstateSearch.reset) is the explicit way to
// force fresh fetches, which is the view-level answer to "the results seem
// cached". Deep-linkable: the shell stamps
// ?view=search&sq=&smode=&srepo=&sref=&spath=&sfile= through searchSeed, so a
// search AND the file open in it are an address like any other view state.
//
// Mounts by the crumb-bar idiom (template injected in init, then initTree);
// lazy (template x-if="searchSeen" in the shell), like Map and Tools. The
// reader is the shared viewer (viewer.js) embedded with bindStore:false, the
// same way the stage previews a staged file: this view holds cross-repo hits,
// so binding it to the browsed repo's activeFile would be the wrong subject.

document.addEventListener('alpine:init', function () {
  Alpine.data('searchView', function () {
    const short = (repo) => String(repo || '').split('/')[1] || repo;
    // The explorer's tab expansion, so a file reads the same here as there.
    const fmt = (t) => String(t == null ? '' : t).replace(/ {4}/g, '  ');
    const dirOf = (p) => String(p || '').split('/').slice(0, -1).join('/');

    return {
      description: 'The central file surface: file names (any ref, any folder), file contents (code-search API), and session records over one shared search core, with the shared viewer reading a hit in place',

      template: `
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-2 max-w-3xl">
            <i class="ph ph-magnifying-glass text-xl text-base-content/50"></i>
            <h2 class="text-lg font-semibold">Search</h2>
            <div class="grow"></div>
            <button @click="refreshCaches()" title="Forget fetched trees and session records, so the next run reads fresh"
                    class="btn btn-ghost btn-sm gap-1.5 text-base-content/60">
              <i class="ph ph-arrows-clockwise text-base"></i>Refresh caches</button>
          </div>

          <form @submit.prevent="run()" class="flex gap-2 max-w-3xl">
            <label class="input input-bordered flex items-center gap-2 grow">
              <i class="ph ph-magnifying-glass opacity-50"></i>
              <input x-model="q" type="text" :placeholder="queryPlaceholder"
                     autocomplete="off" autocapitalize="off" spellcheck="false"
                     class="grow font-mono text-lg sm:text-base">
              <button type="button" x-show="q" @click="q = ''" class="opacity-40 hover:opacity-100 shrink-0" title="Clear">
                <i class="ph ph-x-circle"></i></button>
            </label>
            <button type="submit" class="btn btn-primary shrink-0" :disabled="!canRun || busy">
              <span x-show="!busy" x-text="q.trim() ? 'Search' : 'List'"></span>
              <i x-show="busy" class="ph ph-circle-notch animate-spin text-lg"></i>
            </button>
          </form>

          <div class="flex flex-wrap items-center gap-2 max-w-3xl">
            <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5" role="tablist">
              <template x-for="m in MODES" :key="m.key">
                <button role="tab" @click="setMode(m.key)"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                        :class="mode === m.key ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                  <i class="ph text-lg" :class="m.icon"></i><span x-text="m.label"></span>
                </button>
              </template>
            </div>
            <select x-show="mode !== 'sessions'" x-model="repo" @change="rerun()" class="select select-bordered select-sm font-mono">
              <option value="">all repos</option>
              <template x-for="r in repos()" :key="r.repo">
                <option :value="r.repo" x-text="shortName(r.repo)"></option>
              </template>
            </select>
            <label x-show="mode === 'names'" class="input input-bordered input-sm flex items-center gap-1.5 w-44">
              <i class="ph ph-git-branch opacity-50"></i>
              <input x-model="ref" type="text" placeholder="default branch" @change="rerun()"
                     autocomplete="off" autocapitalize="off" spellcheck="false" class="grow min-w-0 font-mono">
            </label>
            <label x-show="mode !== 'sessions'" class="input input-bordered input-sm flex items-center gap-1.5 w-52">
              <i class="ph ph-folder opacity-50"></i>
              <input x-model="path" type="text" placeholder="whole repo" @change="rerun()"
                     autocomplete="off" autocapitalize="off" spellcheck="false" class="grow min-w-0 font-mono">
            </label>
          </div>

          <!-- The scope, as a walkable trail. A folder is reached by tapping one
               on a result row, so the way back out has to be as cheap as the way
               in; typing into the box above is the other half of the same
               control, not a substitute for it. -->
          <div x-show="mode !== 'sessions' && path" class="flex items-center gap-1 flex-wrap font-mono text-sm max-w-3xl">
            <span class="text-base-content/40">under</span>
            <button @click="scopeTo('')" class="text-base-content/60 hover:text-primary">all</button>
            <template x-for="c in scopeCrumbs" :key="c.path">
              <span class="flex items-center gap-1">
                <span class="text-base-content/25">/</span>
                <button @click="scopeTo(c.path)" class="hover:text-primary"
                        :class="c.path === scope ? 'text-primary font-semibold' : 'text-base-content/60'"
                        x-text="c.name"></button>
              </span>
            </template>
            <button @click="scopeTo('')" class="ml-1 text-base-content/30 hover:text-error" title="Clear the folder scope">
              <i class="ph ph-x-circle"></i></button>
          </div>

          <!-- The facts line: what this mode can and cannot see, stated where
               there is room, instead of abbreviated onto a row label. It steps
               aside on a phone once a file is open, where the reader has the
               single column and three lines of preamble above it is three lines
               of the file gone. -->
          <p class="text-sm text-base-content/50 max-w-3xl" :class="open && 'hidden lg:block'" x-text="facts"></p>

          <div x-show="error" class="alert alert-warning items-start text-base max-w-3xl">
            <i class="ph ph-warning text-lg shrink-0 mt-0.5"></i>
            <span class="min-w-0 break-words" x-text="error"></span>
          </div>

          <div x-show="ran && !busy && !error" class="flex items-center gap-2 text-base text-base-content/60 max-w-3xl">
            <span><b x-text="hits.length"></b> <span x-text="hits.length === 1 ? 'hit' : 'hits'"></span>
                  <span x-show="total > hits.length" x-text="'of ' + total"></span></span>
            <span x-show="truncated" class="text-warning" title="A repo tree was too large to list in full">(partial)</span>
            <div class="grow"></div>
            <button x-show="hits.length || ran" @click="clear()" class="btn btn-ghost btn-xs gap-1 text-base-content/50">
              <i class="ph ph-x text-sm"></i>Clear</button>
          </div>

          <!-- Results and reader, side by side where there is room. Below lg
               they are one column and the open file takes it, with a labelled
               way back to the list: a phone showing a 40-row list above a file
               is showing neither. -->
          <div class="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
            <div class="flex flex-col min-w-0" :class="open && 'hidden lg:flex lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto'">
              <template x-for="(h, i) in hits" :key="h.key">
                <div class="group flex items-stretch rounded-lg transition-colors"
                     :class="isOpen(h) ? 'bg-primary/10' : 'hover:bg-base-200'">
                  <button type="button" @click="openHit(h)"
                          class="min-w-0 flex-1 flex flex-col justify-center px-3 py-2 text-left text-base">
                    <span class="flex items-center gap-2.5 w-full">
                      <i class="ph shrink-0 text-lg" :class="[h.icon, isOpen(h) ? 'text-primary' : 'text-base-content/50']"></i>
                      <span class="min-w-0 flex-1 truncate"
                            :class="[h.mono && 'font-mono', h.tail && '[direction:rtl] text-left', isOpen(h) && 'text-primary font-semibold']"
                            x-text="h.label"></span>
                      <span x-show="h.sub" class="shrink-0 max-w-[45%] truncate text-sm text-base-content/40" x-text="h.sub"></span>
                    </span>
                    <span x-show="h.note" class="w-full truncate pl-[1.9rem] text-sm text-base-content/45" x-text="h.note"></span>
                  </button>
                  <!-- Scoping down is one tap from the row that revealed the
                       folder, which is where the reader is already looking. It
                       is shown at rest rather than on hover: a phone has no
                       hover, and this is an action, not a decoration. It
                       appears only where it would go somewhere, so a row sitting
                       directly in the current scope carries none. -->
                  <button type="button" x-show="h.dir" @click.stop="scopeTo(h.dir)"
                          class="px-2 shrink-0 text-base-content/25 hover:text-primary transition-colors"
                          :title="'Scope to ' + h.dir">
                    <i class="ph ph-folder-open"></i></button>
                </div>
              </template>
              <p x-show="ran && !busy && !error && !hits.length" class="text-base text-base-content/40 italic px-2 py-6">
                Nothing matched.
              </p>
              <button x-show="canShowMore" @click="more()" :disabled="busy"
                      class="btn btn-ghost btn-sm self-start mt-1 gap-1 text-base-content/60">
                <i class="ph ph-caret-down"></i>
                <span x-text="'Show more (' + (total - hits.length) + ' left)'"></span>
              </button>
            </div>

            <!-- The reader. The shared viewer carries the file's own chrome
                 (name, size, mode switch, GitHub / Raw / CDN / toss links), so
                 this bar holds only what the viewer cannot know: where in the
                 result set this file is, and the routes out. -->
            <div x-show="open" x-cloak class="min-w-0 flex flex-col gap-2">
              <div class="flex items-center gap-1 flex-wrap text-base">
                <button @click="closeFile()" class="btn btn-ghost btn-sm gap-1 lg:hidden">
                  <i class="ph ph-arrow-left"></i>
                  <span x-text="hits.length + ' results'"></span>
                </button>
                <span class="font-mono text-sm text-base-content/50 truncate" x-text="openSub"></span>
                <div class="grow"></div>
                <template x-if="fileHits.length > 1">
                  <span class="flex items-center gap-0.5">
                    <button @click="step(-1)" :disabled="openIndex <= 0"
                            class="btn btn-ghost btn-square btn-sm opacity-60 hover:opacity-100 disabled:opacity-20" title="Previous result">
                      <i class="ph ph-caret-left text-lg"></i></button>
                    <span class="font-mono text-sm opacity-50 tabular-nums"
                          x-text="(openIndex + 1) + ' / ' + fileHits.length"></span>
                    <button @click="step(1)" :disabled="openIndex >= fileHits.length - 1"
                            class="btn btn-ghost btn-square btn-sm opacity-60 hover:opacity-100 disabled:opacity-20" title="Next result">
                      <i class="ph ph-caret-right text-lg"></i></button>
                  </span>
                </template>
                <button @click="openInFiles()" class="btn btn-ghost btn-square btn-sm opacity-60 hover:opacity-100"
                        title="Open this file in its repo's Files view, to walk the tree around it">
                  <i class="ph ph-folders text-lg"></i></button>
                <button @click="closeFile()" class="btn btn-ghost btn-square btn-sm opacity-60 hover:opacity-100 hidden lg:inline-flex" title="Close">
                  <i class="ph ph-x text-lg"></i></button>
              </div>
              <div x-show="openBusy" class="flex justify-center py-20">
                <span class="loading loading-spinner loading-lg text-primary"></span>
              </div>
              <div x-show="openNote" class="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <i class="ph ph-file-dashed text-4xl opacity-25"></i>
                <p class="text-base text-base-content/60" x-text="openNote"></p>
              </div>
              <div x-show="!openBusy && !openNote" id="search-file-viewer" x-data="viewer({ bindStore: false })"></div>
            </div>
          </div>
        </div>`,

      MODES: [
        { key: 'names',    label: 'Files',     icon: 'ph-file' },
        { key: 'contents', label: 'Contents',  icon: 'ph-file-magnifying-glass' },
        { key: 'sessions', label: 'Sessions',  icon: 'ph-chat-circle-text' },
      ],
      CAP_STEP: 50,
      q: '',
      mode: 'names',
      repo: '',      // '' = every estate repo
      ref: '',       // names mode only; '' = default branch
      path: '',      // folder scope; '' = the whole repo
      cap: 50,       // how many hits the list holds; `more()` raises it
      busy: false,
      error: '',
      ran: false,    // a search has executed (distinguishes "no hits" from "not run")
      hits: [],
      total: 0,
      truncated: false,
      // The file being read: { repo, ref, path } or null. Held apart from the
      // hit list because it outlives it: a re-run that drops the file from the
      // results should not yank it off the screen mid-read.
      open: null,
      openBusy: false,
      openNote: '',

      init() {
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        // The seed: goSearch(opts) parked what the caller wanted (the finder's
        // gate, the explorer's hand-off, or a deep link's ?sq= family). Consume
        // once; run when there is something to run, since a seeded search is a
        // search someone already asked for. A seeded FILE opens after the run,
        // so a shared address lands on the file, not merely near it.
        const apply = (seed) => {
          if (!seed) return;
          this.q = seed.q || '';
          if (['names', 'contents', 'sessions'].includes(seed.mode)) this.mode = seed.mode;
          this.repo = seed.repo || '';
          this.ref = seed.ref || '';
          this.path = seed.path || '';
          this.cap = this.CAP_STEP;
          const file = seed.file ? window.RepoAddress?.parse?.(seed.file) : null;
          const done = this.canRun ? this.run() : Promise.resolve();
          if (file) done.then(() => this.showFile(file));
        };
        apply(window.__shell?.searchSeed);
        // The component mounts once and persists behind x-show, so a LATER
        // routing (the finder's gate, with the view already open behind the
        // scenes) re-seeds through this event rather than through init.
        document.addEventListener('web-tools:search-seed', (e) => apply(e.detail));
      },

      repos() { return window.__shell?.estateRepos || []; },
      shortName: short,

      // A run needs a query, EXCEPT in files mode, where a repo or a folder is
      // enough: that is the listing, and it is the browse half of this view.
      // Nothing narrows an all-repos listing of everything, so that one case
      // still asks for a query rather than reading every tree the token can see.
      get canRun() {
        if (this.q.trim()) return true;
        return this.mode === 'names' && !!(this.repo || this.scope);
      },
      get queryPlaceholder() {
        if (this.mode === 'sessions') return 'Search sessions…';
        if (this.mode === 'contents') return 'Search file contents…';
        return this.repo || this.scope ? 'Filter these files…' : 'Search file names…';
      },
      // The folder scope, normalized once. The box is forgiving about slashes
      // because a pasted path routinely carries them; everything downstream
      // (the crumbs, the run, the address) reads this rather than the raw box.
      get scope() { return this.path.replace(/^\/+|\/+$/g, ''); },
      get scopeCrumbs() {
        const segs = this.scope.split('/').filter(Boolean);
        return segs.map((name, i) => ({ name, path: segs.slice(0, i + 1).join('/') }));
      },
      // Whether raising the cap can actually yield more. The names lane holds
      // the whole match set in memory, so it always can; the code-search API
      // pages at 100 and this view reads one page, so past that the button
      // would promise what it cannot deliver. Sessions returns everything, so
      // total never exceeds the list.
      get canShowMore() {
        if (this.busy || this.total <= this.hits.length) return false;
        return this.mode !== 'contents' || this.hits.length < 100;
      },
      // Only file hits are readable here, so the position and the arrows count
      // those; a sessions run leaves the reader alone entirely.
      get fileHits() { return this.hits.filter(h => h.kind === 'file'); },
      get openIndex() {
        if (!this.open) return -1;
        return this.fileHits.findIndex(h => this.sameFile(h, this.open));
      },
      // The bar over the reader names the file and where it came from. The
      // viewer's own header carries the full path, but it is the first thing to
      // lose its width on a phone, which is exactly where the list is hidden
      // and this bar is the only label left.
      get openSub() {
        if (!this.open) return '';
        return this.open.path.split('/').pop() + ' · ' + short(this.open.repo)
             + (this.open.ref ? '@' + this.open.ref : '');
      },

      // One file hit's row, from either lane. Two things are dropped as
      // redundant, because a scoped listing otherwise repeats its own scope on
      // every line and truncates the only part that differs: the label is
      // RELATIVE to the folder scope, and the repo badge is dropped when a
      // single repo is the scope, since the control above already names it.
      // The full path stays on the hit for opening it and for the folder chip.
      fileRow(h, extra) {
        const under = this.scope;
        const rel = under && h.path.startsWith(under + '/') ? h.path.slice(under.length + 1) : h.path;
        const dir = dirOf(h.path);
        return {
          key: (extra?.key || '') + h.repo + '@' + (h.ref || '') + ':' + h.path,
          icon: extra?.icon || 'ph-file', mono: true, tail: true,
          label: rel, note: extra?.note || '',
          sub: (this.repo ? '' : short(h.repo)) + (h.ref ? '@' + h.ref : ''),
          dir: dir && dir !== under ? dir : '',
          kind: 'file', repo: h.repo, ref: h.ref || '', path: h.path,
        };
      },

      get facts() {
        if (this.mode === 'names') {
          return 'File names from the repo tree at the chosen ref; empty means the default branch. This is the mode that reaches branches, and an empty query under a repo or a folder lists it rather than searching it.';
        }
        if (this.mode === 'contents') {
          return 'Full-text through the GitHub code-search API: default branches only, indexing can lag a recent push, files over ~384 KB are not indexed, ten searches a minute.';
        }
        return 'Greps the captured session records: the opening ask, every stored prompt and reply, and the closing message. Hits open the session’s paged reader.';
      },

      sameFile(a, b) {
        return !!a && !!b && a.repo === b.repo && (a.ref || '') === (b.ref || '') && a.path === b.path;
      },
      isOpen(h) { return h.kind === 'file' && this.sameFile(h, this.open); },

      setMode(m) {
        if (this.mode === m) return;
        this.mode = m;
        this.rerun();
      },
      // A scope change is a new question, so the cap resets with it: carrying a
      // raised cap into a narrower scope would show a fuller list than the one
      // that was asked for and read as the scope not having taken.
      scopeTo(p) {
        const next = String(p || '').replace(/^\/+|\/+$/g, '');
        if (next === this.scope) return;
        this.path = next;
        this.rerun();
      },
      // Re-run only once something has been run: a control touched before the
      // first search is being set up, not re-asked.
      rerun() {
        this.cap = this.CAP_STEP;
        if (this.ran && this.canRun) this.run();
      },
      more() {
        this.cap += this.CAP_STEP;
        if (this.canRun) this.run();
      },

      async run() {
        const q = this.q.trim();
        const S = window.__shell;
        const ES = window.EstateSearch;
        if (!this.canRun || this.busy || !ES || !S?.hasToken?.()) return;
        const under = this.scope;
        this.busy = true; this.error = ''; this.hits = []; this.total = 0; this.truncated = false;
        try {
          if (this.mode === 'names') {
            const repos = (this.repo ? [{ repo: this.repo }] : this.repos().map(r => ({ repo: r.repo })))
              .map(r => ({ ...r, ref: this.ref.trim() }));
            const res = await ES.names({ q, repos, token: window.TOKEN, cap: this.cap, under });
            this.truncated = res.truncated;
            if (res.errors.length) this.error = 'Some trees could not be read: ' + res.errors.join('; ');
            this.hits = res.hits.map(h => this.fileRow(h, { key: 'n:' }));
            this.total = res.total;
          } else if (this.mode === 'contents') {
            const owner = (S.estateRepos?.[0]?.repo || S.REGISTRY_REPO || '').split('/')[0];
            // The folder scope is the API's own `path:` qualifier, so scoping
            // narrows the search rather than the results it already paid for.
            const scope = (this.repo ? 'repo:' + this.repo : 'user:' + owner) + (under ? ' path:' + under : '');
            const res = await ES.code({ q, scope, token: window.TOKEN, perPage: Math.min(this.cap, 100) });
            this.hits = res.hits.map(h => this.fileRow(h,
              { key: 'c:', icon: 'ph-file-magnifying-glass', note: h.frag }));
            this.total = res.total;
          } else {
            const res = await ES.sessions({ q, registry: S.REGISTRY_REPO, token: window.TOKEN });
            this.hits = res.hits.map(h => ({
              key: 's:' + h.id, icon: 'ph-chat-circle-text',
              label: h.ask ? String(h.ask).replace(/\s+/g, ' ').slice(0, 100) : h.id,
              sub: h.day, note: h.frag,
              kind: 'session', id: h.id, day: h.day,
            }));
            this.total = res.total;
          }
          this.ran = true;
          this.stamp();
        } catch (e) { this.error = String(e?.message || e); this.ran = true; }
        finally { this.busy = false; }
      },

      // The address follows the search AND the open file, so this screen can be
      // shared as what is on it rather than as the query behind it.
      stamp() {
        const S = window.__shell;
        if (!S) return;
        S.searchSeed = {
          q: this.q.trim(), mode: this.mode, repo: this.repo, ref: this.ref.trim(),
          path: this.scope,
          file: this.open ? window.RepoAddress?.fmt?.(this.open) || '' : '',
        };
        S.syncUrl?.();
      },

      clear() {
        this.hits = []; this.total = 0; this.error = ''; this.ran = false; this.truncated = false;
        this.cap = this.CAP_STEP;
        this.open = null; this.openNote = '';
        const S = window.__shell;
        if (S) { S.searchSeed = null; S.syncUrl?.(); }
      },
      refreshCaches() {
        window.EstateSearch?.reset?.();
        if (this.ran && this.canRun) this.run();
      },

      openHit(h) {
        if (h.kind === 'file') return this.showFile(h);
        if (h.kind === 'session') {
          document.dispatchEvent(new CustomEvent('web-tools:open-session',
            { detail: { id: h.id, day: h.day } }));
        }
      },

      // Read a file in place. `ref` '' rides through to the repo's default
      // branch (RepoAddress's rule: parse honestly, resolve late), which is
      // what a contents hit always carries. Every outcome shows something: a
      // failed fetch renders its reason where the file would be, so the
      // position counter never points at a blank pane.
      async showFile(f) {
        if (!f?.repo || !f?.path) return;
        this.open = { repo: f.repo, ref: f.ref || '', path: f.path };
        this.openNote = ''; this.openBusy = true;
        this.stamp();
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: f.repo });
          gh.ref = f.ref || '';
          const res = await gh.get(f.path);
          this.openBusy = false;
          this.$nextTick(() => document.getElementById('search-file-viewer')?.__viewer
            ?.show(f.path, fmt(res.text), { repo: f.repo, ref: f.ref || '' }));
        } catch (e) {
          this.openBusy = false;
          this.openNote = 'Could not load it: ' + (e?.message || e);
        }
      },
      step(dir) {
        const i = this.openIndex + dir;
        const next = this.fileHits[i];
        if (next) this.showFile(next);
      },
      closeFile() {
        this.open = null; this.openNote = ''; this.openBusy = false;
        this.stamp();
      },
      // The one route back to the per-repo tree walk, for when the question is
      // where a file SITS rather than what it says.
      openInFiles() {
        const f = this.open;
        const S = window.__shell;
        if (!f || !S) return;
        (async () => {
          await S.ensureBrowser?.(f.repo, f.ref || undefined);
          S.openFile?.(f.path);
        })();
      },
    };
  });
});
