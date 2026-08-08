// alpineComponents/search-view.js — the parameterized search surface.
//
// The sidebar finder and this view split one job: the finder is for JUMPING
// (few keystrokes, one destination, no controls), this view is for
// INVESTIGATING (parameters, room for many results, iteration). The finder's
// "File contents" gate routes here with the query carried over; the header
// nav's Search entry opens it empty. Config was the precedent: an estate
// concern with too many knobs for a panel gets a view.
//
// Three modes, each a mode pill, all served by lib/kits/estate-search.js (one
// implementation, one cache, shared with the finder):
//
//   File names   substring over repo trees. Takes a REF, since the trees API
//                does: this is the mode that reaches branches. Scope: one
//                estate repo or all of them.
//   Contents     the code-search API. The caveats live HERE, in a facts line
//                under the controls, instead of abbreviated onto a row label:
//                default branches only, indexing can lag a push, files over
//                ~384 KB are not indexed, ten calls a minute. Errors surface
//                whole.
//   Sessions     the captured-records grep (what a record quotes); hits open
//                the Sessions pane's paged reader via web-tools:open-session.
//
// Every run re-executes the search; the caches underneath make re-matching
// cheap, and "Refresh caches" (EstateSearch.reset) is the explicit way to
// force fresh fetches, which is the view-level answer to "the results seem
// cached". Deep-linkable: the shell stamps ?view=search&sq=&smode=&srepo=&sref=
// through searchSeed, so a search is an address like any other view state.
//
// Mounts by the crumb-bar idiom (template injected in init, then initTree);
// lazy (template x-if="searchSeen" in the shell), like Map and Tools.

document.addEventListener('alpine:init', function () {
  Alpine.data('searchView', function () {
    const short = (repo) => String(repo || '').split('/')[1] || repo;

    return {
      description: 'The Search view: file names (any ref), file contents (code-search API), and session records, over one shared search core',

      template: `
        <div class="flex flex-col gap-3 max-w-3xl">
          <div class="flex items-center gap-2">
            <i class="ph ph-magnifying-glass text-xl text-base-content/50"></i>
            <h2 class="text-lg font-semibold">Search</h2>
            <div class="grow"></div>
            <button @click="refreshCaches()" title="Forget fetched trees and session records, so the next run reads fresh"
                    class="btn btn-ghost btn-sm gap-1.5 text-base-content/60">
              <i class="ph ph-arrows-clockwise text-base"></i>Refresh caches</button>
          </div>

          <form @submit.prevent="run()" class="flex gap-2">
            <label class="input input-bordered flex items-center gap-2 grow">
              <i class="ph ph-magnifying-glass opacity-50"></i>
              <input x-model="q" type="text" placeholder="Search…"
                     autocomplete="off" autocapitalize="off" spellcheck="false"
                     class="grow font-mono text-lg sm:text-base">
              <button type="button" x-show="q" @click="q = ''" class="opacity-40 hover:opacity-100 shrink-0" title="Clear">
                <i class="ph ph-x-circle"></i></button>
            </label>
            <button type="submit" class="btn btn-primary shrink-0" :disabled="!q.trim() || busy">
              <span x-show="!busy">Search</span>
              <i x-show="busy" class="ph ph-circle-notch animate-spin text-lg"></i>
            </button>
          </form>

          <div class="flex flex-wrap items-center gap-2">
            <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5" role="tablist">
              <template x-for="m in MODES" :key="m.key">
                <button role="tab" @click="mode = m.key"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                        :class="mode === m.key ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                  <i class="ph text-lg" :class="m.icon"></i><span x-text="m.label"></span>
                </button>
              </template>
            </div>
            <select x-show="mode !== 'sessions'" x-model="repo" class="select select-bordered select-sm font-mono">
              <option value="">all repos</option>
              <template x-for="r in repos()" :key="r.repo">
                <option :value="r.repo" x-text="shortName(r.repo)"></option>
              </template>
            </select>
            <label x-show="mode === 'names'" class="input input-bordered input-sm flex items-center gap-1.5 w-44">
              <i class="ph ph-git-branch opacity-50"></i>
              <input x-model="ref" type="text" placeholder="default branch"
                     autocomplete="off" autocapitalize="off" spellcheck="false" class="grow min-w-0 font-mono">
            </label>
          </div>

          <!-- The facts line: what this mode can and cannot see, stated where
               there is room, instead of abbreviated onto a row label. -->
          <p class="text-sm text-base-content/50" x-text="facts"></p>

          <div x-show="error" class="alert alert-warning items-start text-base">
            <i class="ph ph-warning text-lg shrink-0 mt-0.5"></i>
            <span class="min-w-0 break-words" x-text="error"></span>
          </div>

          <div x-show="ran && !busy && !error" class="flex items-center gap-2 text-base text-base-content/60">
            <span><b x-text="hits.length"></b> <span x-text="hits.length === 1 ? 'hit' : 'hits'"></span>
                  <span x-show="total > hits.length" x-text="'of ' + total"></span></span>
            <span x-show="truncated" class="text-warning" title="A repo tree was too large to list in full">(partial)</span>
            <div class="grow"></div>
            <button x-show="hits.length || ran" @click="clear()" class="btn btn-ghost btn-xs gap-1 text-base-content/50">
              <i class="ph ph-x text-sm"></i>Clear</button>
          </div>

          <div class="flex flex-col">
            <template x-for="h in hits" :key="h.key">
              <button type="button" @click="openHit(h)"
                      class="w-full flex flex-col justify-center px-3 py-2 rounded-lg text-left text-base transition-colors hover:bg-base-200">
                <span class="flex items-center gap-2.5 w-full">
                  <i class="ph shrink-0 text-lg text-base-content/50" :class="h.icon"></i>
                  <span class="min-w-0 flex-1 truncate"
                        :class="[h.mono && 'font-mono', h.tail && '[direction:rtl] text-left']"
                        x-text="h.label"></span>
                  <span x-show="h.sub" class="shrink-0 max-w-[45%] truncate text-sm text-base-content/40" x-text="h.sub"></span>
                </span>
                <span x-show="h.note" class="w-full truncate pl-[1.9rem] text-sm text-base-content/45" x-text="h.note"></span>
              </button>
            </template>
            <p x-show="ran && !busy && !error && !hits.length" class="text-base text-base-content/40 italic px-2 py-6">
              Nothing matched.
            </p>
          </div>
        </div>`,

      MODES: [
        { key: 'names',    label: 'File names', icon: 'ph-file' },
        { key: 'contents', label: 'Contents',   icon: 'ph-file-magnifying-glass' },
        { key: 'sessions', label: 'Sessions',   icon: 'ph-chat-circle-text' },
      ],
      q: '',
      mode: 'names',
      repo: '',      // '' = every estate repo
      ref: '',       // names mode only; '' = default branch
      busy: false,
      error: '',
      ran: false,    // a search has executed (distinguishes "no hits" from "not run")
      hits: [],
      total: 0,
      truncated: false,

      init() {
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        // The seed: goSearch(opts) parked what the caller wanted (the finder's
        // gate, or a deep link's ?sq= family). Consume once; run when a query
        // arrived, since a seeded search is a search someone already asked for.
        const apply = (seed) => {
          if (!seed) return;
          this.q = seed.q || '';
          if (['names', 'contents', 'sessions'].includes(seed.mode)) this.mode = seed.mode;
          this.repo = seed.repo || '';
          this.ref = seed.ref || '';
          if (this.q.trim()) this.run();
        };
        apply(window.__shell?.searchSeed);
        // The component mounts once and persists behind x-show, so a LATER
        // routing (the finder's gate, with the view already open behind the
        // scenes) re-seeds through this event rather than through init.
        document.addEventListener('web-tools:search-seed', (e) => apply(e.detail));
      },

      repos() { return window.__shell?.estateRepos || []; },
      shortName: short,

      get facts() {
        if (this.mode === 'names') {
          return 'File names from the repo tree at the chosen ref; empty means the default branch. This is the mode that reaches branches.';
        }
        if (this.mode === 'contents') {
          return 'Full-text through the GitHub code-search API: default branches only, indexing can lag a recent push, files over ~384 KB are not indexed, ten searches a minute.';
        }
        return 'Greps the captured session records: the opening ask, every stored prompt and reply, and the closing message. Hits open the session’s paged reader.';
      },

      async run() {
        const q = this.q.trim();
        const S = window.__shell;
        const ES = window.EstateSearch;
        if (!q || this.busy || !ES || !S?.hasToken?.()) return;
        this.busy = true; this.error = ''; this.hits = []; this.total = 0; this.truncated = false;
        try {
          if (this.mode === 'names') {
            const repos = (this.repo ? [{ repo: this.repo }] : this.repos().map(r => ({ repo: r.repo })))
              .map(r => ({ ...r, ref: this.ref.trim() }));
            const res = await ES.names({ q, repos, token: window.TOKEN });
            this.truncated = res.truncated;
            if (res.errors.length) this.error = 'Some trees could not be read: ' + res.errors.join('; ');
            this.hits = res.hits.map(h => ({
              key: 'n:' + h.repo + '@' + h.ref + ':' + h.path, icon: 'ph-file', mono: true, tail: true,
              label: h.path, sub: short(h.repo) + (h.ref ? '@' + h.ref : ''),
              kind: 'file', repo: h.repo, ref: h.ref, path: h.path,
            }));
            this.total = res.total;
          } else if (this.mode === 'contents') {
            const owner = (S.estateRepos?.[0]?.repo || S.REGISTRY_REPO || '').split('/')[0];
            const scope = this.repo ? 'repo:' + this.repo : 'user:' + owner;
            const res = await ES.code({ q, scope, token: window.TOKEN });
            this.hits = res.hits.map(h => ({
              key: 'c:' + h.repo + ':' + h.path, icon: 'ph-file-magnifying-glass', mono: true, tail: true,
              label: h.path, sub: short(h.repo), note: h.frag,
              kind: 'file', repo: h.repo, ref: '', path: h.path,
            }));
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
          // The address follows the search, so this screen can be shared.
          if (S) { S.searchSeed = { q, mode: this.mode, repo: this.repo, ref: this.ref.trim() }; S.syncUrl?.(); }
        } catch (e) { this.error = String(e?.message || e); this.ran = true; }
        finally { this.busy = false; }
      },

      clear() {
        this.hits = []; this.total = 0; this.error = ''; this.ran = false; this.truncated = false;
        const S = window.__shell;
        if (S) { S.searchSeed = null; S.syncUrl?.(); }
      },
      refreshCaches() {
        window.EstateSearch?.reset?.();
        if (this.ran && this.q.trim()) this.run();
      },

      openHit(h) {
        const S = window.__shell;
        if (h.kind === 'file') {
          // A names hit opens at the ref it was found on; '' falls through to
          // the default branch (RepoAddress's rule: resolve late).
          (async () => {
            await S?.ensureBrowser?.(h.repo, h.ref || undefined);
            S?.openFile?.(h.path);
          })();
        } else if (h.kind === 'session') {
          document.dispatchEvent(new CustomEvent('web-tools:open-session',
            { detail: { id: h.id, day: h.day } }));
        }
      },
    };
  });
});
