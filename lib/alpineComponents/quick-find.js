// alpineComponents/quick-find.js — the sidebar's always-ready finder.
//
// One input at the top of the sidebar, sitting ready on desktop and one drawer
// tap away on a phone. It is a DISPATCHER over what the app already holds, not
// a search engine: every lane resolves from client-side state or a cached
// read, and nothing is indexed or committed anywhere. The query's shape picks
// the lane:
//
//   #123 or 123     an open PR, estate-wide (the activity cache's openPRs);
//                   `#` alone lists them all. Opens the branch-detail
//                   takeover, the same reader an Open row's name opens.
//   @               repo-then-file NAVIGATION, the mention picker's reading
//                   of the trigger: `@` lists the estate repos, picking one
//                   completes to `@repo/` and lists that repo's root, folders
//                   complete deeper, a file opens. Typing past the slash
//                   filters the current folder AND fuzzy-matches the whole
//                   tree, so `@web-tools/ghapi` lands on lib/gh-api.js
//                   without walking. One recursive tree call per repo, cached
//                   (the stage's Browse/Search share this economy).
//   owner/repo[@ref]:path   a pasted address (RepoAddress, the estate's one
//                   grammar) opens the file; the repo half accepts the short
//                   name when exactly one estate repo matches. `repo@branch`
//                   opens that branch's takeover. PASTE-ONLY lanes: they
//                   resolve exactly and suggest nothing, because nobody types
//                   a branch name from memory hoping for IntelliSense
//                   (measured: the suggestion lists were noise).
//   +idea           an explicit jot: the one row is "Jot this", Enter files it.
//   anything else   substring match over estate repos, the app's nav
//                   (estateNav + appNav), FILE NAMES from every tree already
//                   cached (the open repo's loads on first use), and open PR
//                   titles. A "search every repo" row loads the remaining
//                   estate trees on tap, the stage's loadAllTrees economy, so
//                   the estate-wide pass costs a tap rather than a keystroke.
//                   Two DEEPER passes ride the same tap gate. "File
//                   contents" ROUTES to the Search view (shell.goSearch) with
//                   the query carried over: a content search wants parameters
//                   and room for results, which a panel does not have, and
//                   its caveats (default branches, indexing lag) live there.
//                   "Sessions" greps the captured records in place
//                   (EstateSearch.sessions: search.py's --grep in the
//                   browser, hits opening the Sessions pane's reader via
//                   web-tools:open-session). A ran search's rows replace the
//                   lanes while the query stays put, under a clear row that
//                   dismisses them; editing a character falls back. Every
//                   fetch and cache is lib/kits/estate-search.js, shared with the
//                   Search view, so neither surface pays twice.
//
// The last row is always "Jot this" (token-gated): a query that found nothing
// is usually an idea, and the pile (lists/jots.json in the registry) is where
// an idea waits. That makes the box's contract total: what you type is either
// found or kept.
//
// PR rows resolve through the activity cache (state/activity.json,
// lib/kits/repo-activity-cache.js), read lazily ONCE on first focus and re-read on
// web-tools:activity-refreshed. Opening a branch dispatches
// web-tools:open-branch-detail, which the estate consumes exactly like a
// &detail= deep link: switch to the Open list, open the takeover, tolerate a
// row the cache does not carry.
//
// `/` focuses the input from anywhere a hardware keyboard is typing that is
// not already a field. Results are a flat keyboard list (down/up/enter,
// escape clears then closes); completion rows rewrite the input and keep
// focus instead of acting, which is what makes the @ walk a walk.
//
// Reads the shell through window.__shell (raw, untracked — fine here, since
// every render is driven by the local `q`, `act_`, and `trees_`, all
// reactive) and mounts by the crumb-bar idiom: template injected in init,
// then Alpine.initTree.

document.addEventListener('alpine:init', function () {
  Alpine.data('quickFind', function () {
    const JOTS_PATH = 'lists/jots.json';
    const CAP = 8;                    // rows per lane, so the panel stays a panel
    const short = (repo) => String(repo || '').split('/')[1] || repo;

    return {
      description: 'Sidebar finder: #PR, @ repo-then-file navigation, pasted addresses, file-name search over cached trees, with a Jot-this fallback',

      template: `
        <div class="relative" @click.outside="open = false">
          <div class="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-base-300 bg-base-200/50 focus-within:border-primary/50 focus-within:bg-base-100 transition-colors">
            <i class="ph ph-magnifying-glass text-base leading-none text-base-content/40 shrink-0"></i>
            <input x-ref="box" x-model="q" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
                   placeholder="Find: #PR, @repo/file, name"
                   aria-label="Find" role="combobox" :aria-expanded="open" aria-controls="quick-find-results"
                   class="grow min-w-0 appearance-none border-0 bg-transparent outline-none text-base placeholder:text-base-content/35"
                   @focus="onFocus()" @input="onInput()"
                   @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)"
                   @keydown.enter.prevent="go()" @keydown.escape="onEscape($event)">
            <kbd x-show="!q" class="kbd kbd-xs hidden lg:inline-flex opacity-50">/</kbd>
            <button type="button" x-show="q" @click="q = ''; $refs.box.focus()" tabindex="-1"
                    class="shrink-0 text-base-content/35 hover:text-base-content/70 transition-colors" title="Clear">
              <i class="ph ph-x text-sm leading-none"></i>
            </button>
          </div>
          <!-- No transition: the panel opens per keystroke, and Alpine rejects
               a cancelled transition's promise, which a fast open/close toggle
               (typing) does routinely. Instant is also the right feel here. -->
          <section x-cloak x-show="open && rows.length"
                   id="quick-find-results" role="listbox"
                   class="absolute inset-x-0 top-full z-40 mt-1 max-h-[60vh] overflow-y-auto rounded-box border border-base-300 bg-base-100 shadow-xl">
            <div class="flex flex-col py-1">
              <template x-for="(r, i) in rows" :key="r.key">
                <button type="button" role="option" :aria-selected="active === i"
                        @click="act(r)" @mouseenter="active = i"
                        class="w-full min-h-10 flex flex-col justify-center px-3 py-1.5 text-left text-base transition-colors"
                        :class="active === i ? 'bg-base-200' : ''">
                  <span class="flex items-center gap-2.5 w-full">
                    <i class="ph shrink-0 text-lg text-base-content/50"
                       :class="[r.icon, r.spin && 'animate-spin']"></i>
                    <!-- A tail-marked label (a path) truncates from the LEFT:
                         the filename is the informative end, and clipping from
                         the right on a phone left every path reading the same.
                         (No backticks in this comment: the markup is a JS
                         template literal.) -->
                    <span class="min-w-0 flex-1 truncate"
                          :class="[r.mono && 'font-mono', r.tail && '[direction:rtl] text-left']"
                          x-text="r.label"></span>
                    <span x-show="r.sub" class="shrink-0 max-w-[45%] truncate text-sm text-base-content/40" x-text="r.sub"></span>
                  </span>
                  <!-- The matched fragment, when a row carries one (a content
                       or session hit): one dim line under the label. -->
                  <span x-show="r.note" class="w-full truncate pl-[1.9rem] text-sm text-base-content/45" x-text="r.note"></span>
                </button>
              </template>
            </div>
          </section>
        </div>`,

      q: '',
      open: false,
      active: 0,
      act_: {},            // activity cache, repos map; reactive so rows recompute when it lands
      _actLoaded: false,
      trees_: {},          // repo -> { paths: [blob paths], truncated }; the walk and file lanes
      _treeLoading: {},
      deepLoading: false,
      sess_: null,         // { q, hits, loading, error }: the last session search

      init() {
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        this.$watch('q', () => { this.active = 0; this.open = !!this.q.trim(); });
        // The crawl commits a fresh cache and announces it; re-read so PR rows
        // track the estate rather than the first read of the day.
        this._refreshed = () => { this._actLoaded = false; this.ensureActivity(); };
        document.addEventListener('web-tools:activity-refreshed', this._refreshed);
        // `/` reaches the box from anywhere that is not already a field.
        this._slash = (e) => {
          if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
          const t = e.target;
          if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
          e.preventDefault();
          this.$refs.box?.focus();
        };
        window.addEventListener('keydown', this._slash);
      },
      destroy() {
        window.removeEventListener('keydown', this._slash);
        document.removeEventListener('web-tools:activity-refreshed', this._refreshed);
      },

      onFocus() { this.ensureActivity(); this.open = !!this.q.trim(); },
      // The fetch side-effects live here, not in the rows getter: a getter
      // runs on every render and must stay pure. Each is one-shot per key and
      // cheap to re-request.
      onInput() {
        this.ensureActivity();
        const q = this.q.trim();
        const walk = this.parseWalk(q);
        if (walk?.repo) this.ensureTree(walk.repo);
        else if (!/^[#+@]/.test(q) && q.length >= 2) {
          const open = window.Alpine?.store?.('browser')?.repo;
          if (open) this.ensureTree(open);
        }
      },
      onEscape(e) {
        if (this.q) { this.q = ''; e.stopPropagation(); }
        else { this.open = false; this.$refs.box?.blur(); }
      },
      move(d) {
        const n = this.rows.length;
        if (!n) return;
        this.active = ((this.active + d) % n + n) % n;
      },
      go() {
        const r = this.rows[this.active];
        if (r) this.act(r);
      },

      // One read of the registry's activity cache, the same file the estate's
      // Open list renders from. Token-gated; a signed-out viewer keeps the
      // repo/view lanes and simply has no PR rows to match.
      async ensureActivity() {
        const S = window.__shell;
        if (this._actLoaded || !S?.hasToken?.()) return;
        this._actLoaded = true;
        try {
          const reg = new window.GH({ token: window.TOKEN, repo: S.REGISTRY_REPO, ref: 'main' });
          const path = window.RepoActivityCache?.CACHE_PATH || 'state/activity.json';
          this.act_ = JSON.parse((await reg.get(path)).text).repos || {};
        } catch { this.act_ = {}; }
      },

      // One recursive tree call per repo, from the shared cache
      // (EstateSearch.tree; the stage's Browse/Search economy). The result is
      // copied into local reactive state so the rows getter recomputes; a
      // FAILED fetch caches nothing here, so the lane recovers after the
      // core's brief backoff instead of staying dead until reload.
      async ensureTree(repo) {
        if (!repo || this.trees_[repo] || this._treeLoading[repo]) return;
        if (!window.__shell?.hasToken?.()) return;
        this._treeLoading[repo] = true;
        try { this.trees_[repo] = await window.EstateSearch.tree(repo, 'HEAD', window.TOKEN); }
        catch { /* the core remembers the failure briefly; retry is free */ }
        finally { this._treeLoading[repo] = false; }
      },
      // The estate-wide pass, gated behind a tap (the "search every repo" row):
      // load whatever trees are still missing, then the file lane simply sees
      // more. The stage's loadAllTrees is this same move.
      async loadAllTrees() {
        const S = window.__shell;
        if (this.deepLoading || !S?.hasToken?.()) return;
        this.deepLoading = true;
        try { await Promise.all((S.estateRepos || []).map(r => this.ensureTree(r.repo))); }
        finally { this.deepLoading = false; }
      },
      get treesMissing() {
        return (window.__shell?.estateRepos || []).some(r => !this.trees_[r.repo]);
      },

      clipAround(text, q) { return window.EstateSearch?.clip?.(text, q) ?? String(text || ''); },

      // ── Session search: the shared core's grep, kept in-panel ────────────
      // The corpus is small and the reader (the Sessions pane's paged
      // conversation) is one event away, so this pass pays off without a
      // parameter surface. Contents search is the one that routed out.
      async searchSessions(q) {
        if (this.sess_?.loading) return;
        this.sess_ = { q, hits: [], loading: true, error: '' };
        try {
          const S = window.__shell;
          const { hits } = await window.EstateSearch.sessions(
            { q, registry: S.REGISTRY_REPO, token: window.TOKEN });
          this.sess_ = { q, hits, loading: false, error: '' };
        } catch (e) { this.sess_ = { q, hits: [], loading: false, error: String(e?.message || e) }; }
      },

      get prRows() {
        const out = [];
        for (const [repo, e] of Object.entries(this.act_)) {
          for (const p of (e.openPRs || [])) {
            if (!p.head) continue;
            out.push({ repo, number: p.number, title: p.title || '', draft: !!p.draft, head: p.head });
          }
        }
        return out;
      },

      // `@…` split into { repoFrag } (still choosing a repo) or { repo, path }
      // (inside one). The first slash is the boundary; repo is matched on the
      // estate short name, exactly, so the walk never guesses.
      parseWalk(q) {
        if (!q.startsWith('@')) return null;
        const rest = q.slice(1);
        const i = rest.indexOf('/');
        if (i < 0) return { repoFrag: rest };
        const frag = rest.slice(0, i).toLowerCase();
        const hit = (window.__shell?.estateRepos || []).find(r => short(r.repo).toLowerCase() === frag);
        return hit ? { repo: hit.repo, path: rest.slice(i + 1) } : { repoFrag: frag };
      },
      // The immediate children of `dir` in a flat path list: folders first.
      listDir(paths, dir) {
        const seen = new Map();
        const p = dir ? dir + '/' : '';
        for (const path of paths) {
          if (!path.startsWith(p)) continue;
          const rest = path.slice(p.length);
          const i = rest.indexOf('/');
          if (i < 0) seen.set(rest, false);
          else if (!seen.has(rest.slice(0, i))) seen.set(rest.slice(0, i), true);
        }
        return [...seen.entries()].map(([name, isDir]) => ({ name, isDir }))
          .sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name));
      },

      // The dispatcher. Lanes are exclusive by query shape; the Jot fallback
      // rides every non-empty query.
      get rows() {
        const S = window.__shell;
        const q = this.q.trim();
        if (!S || !q) return [];
        const ql = q.toLowerCase();
        const openRepo = window.Alpine?.store?.('browser')?.repo || '';
        const out = [];

        const prRow = (p) => ({
          key: 'p:' + p.repo + '#' + p.number, icon: 'ph-git-pull-request',
          label: '#' + p.number + ' ' + p.title, sub: short(p.repo) + (p.draft ? ' · draft' : ' · ready'),
          kind: 'branch', repo: p.repo, name: p.head,
        });
        // `tail` marks a label whose informative end is its END (a path), so
        // the template truncates it from the left and the filename survives a
        // phone's width.
        const fileRow = (repo, path, sub, label) => ({
          key: 'f:' + repo + ':' + path, icon: 'ph-file', mono: true, tail: !label,
          label: label || path, sub: sub ?? short(repo), kind: 'file', repo, path,
        });
        const repoWalkRow = (r) => ({
          key: 'wr:' + r.repo, icon: r.icon || 'ph-folder', mono: true,
          label: short(r.repo), sub: 'open ▸', kind: 'complete', to: '@' + short(r.repo) + '/',
        });
        // Open-repo hits first; within a rank, the caller's order stands.
        const homeFirst = (list, repoOf) =>
          [...list].sort((a, b) => (repoOf(a) === openRepo ? 0 : 1) - (repoOf(b) === openRepo ? 0 : 1));

        // ── +idea: an explicit jot, the one-row lane ──────────────────────
        if (q.startsWith('+')) {
          const text = q.slice(1).trim();
          if (text && S.hasToken?.()) {
            out.push({ key: 'jot', icon: 'ph-note-pencil',
                       label: 'Jot this: "' + text + '"', sub: 'save to the pile', kind: 'jot', text });
          }
          return out;
        }

        // ── #123 / 123: a PR number, estate-wide ──────────────────────────
        const dm = q.match(/^#(\d*)$|^(\d+)$/);
        if (dm) {
          const digits = dm[1] ?? dm[2] ?? '';
          const hits = this.prRows.filter(p => String(p.number).startsWith(digits));
          out.push(...homeFirst(hits, p => p.repo).slice(0, CAP).map(prRow));
        } else if (q.startsWith('@')) {
          // ── @: repo-then-file navigation ──────────────────────────────
          const w = this.parseWalk(q);
          if (w.repo == null) {
            // Still choosing the repository.
            const fl = (w.repoFrag || '').toLowerCase();
            const repos = (S.estateRepos || []).filter(r => short(r.repo).toLowerCase().includes(fl));
            out.push(...repos.slice(0, CAP).map(repoWalkRow));
          } else if (!this.trees_[w.repo]) {
            out.push({ key: 'load:' + w.repo, icon: 'ph-circle-notch', kind: 'noop', spin: true,
                       label: 'Loading ' + short(w.repo) + ' tree…' });
          } else {
            const { paths, truncated } = this.trees_[w.repo];
            const cut = w.path.lastIndexOf('/');
            const dir = cut < 0 ? '' : w.path.slice(0, cut);
            const rem = (cut < 0 ? w.path : w.path.slice(cut + 1)).toLowerCase();
            const base = '@' + short(w.repo) + '/' + (dir ? dir + '/' : '');
            for (const e of this.listDir(paths, dir).filter(e => e.name.toLowerCase().includes(rem)).slice(0, CAP)) {
              out.push(e.isDir
                ? { key: 'wd:' + w.repo + ':' + dir + '/' + e.name, icon: 'ph-folder', mono: true,
                    label: e.name + '/', sub: 'open ▸', kind: 'complete', to: base + e.name + '/' }
                : fileRow(w.repo, (dir ? dir + '/' : '') + e.name, '', e.name));
            }
            // The fuzzy layer: the whole tree, so a fragment lands without a
            // walk. Skipped for hits the listing already shows.
            if (rem.length >= 2) {
              const listed = new Set(out.map(r => r.path));
              const frag = w.path.toLowerCase();
              const fz = paths.filter(p => p.toLowerCase().includes(frag) && !listed.has(p));
              out.push(...fz.slice(0, CAP).map(p => fileRow(w.repo, p, '')));
            }
            if (truncated) out.push({ key: 'trunc', icon: 'ph-warning', kind: 'noop',
                                      label: 'Tree truncated by GitHub; deep paths may be missing' });
          }
        } else if (/[@:]/.test(q)) {
          // ── A pasted address: resolve exactly, suggest nothing ──────────
          // Expand a short repo head ("home@x", "wt:lib/…") to owner/name when
          // exactly one estate repo matches; a full owner/repo passes through.
          const em = q.match(/^([\w.-]+)([@:].*)$/);
          let eq = q;
          if (em && !/^[\w.-]+\/[\w.-]+[@:]/.test(q)) {
            const m = (S.estateRepos || []).filter(r => short(r.repo).toLowerCase() === em[1].toLowerCase());
            if (m.length === 1) eq = m[0].repo + em[2];
          }
          const addr = window.RepoAddress?.parse(eq);
          if (addr) {
            out.push({ key: 'a:' + eq, icon: 'ph-file-code', mono: true, tail: true,
                       label: window.RepoAddress.fmt(addr), sub: 'open file',
                       kind: 'addr', addr });
          } else {
            const bm = eq.match(/^([\w.-]+\/[\w.-]+)@(.+)$/);
            if (bm) out.push({ key: 'b:' + bm[1] + '@' + bm[2], icon: 'ph-git-branch', mono: true,
                               label: short(bm[1]) + '@' + bm[2], sub: 'open branch',
                               kind: 'branch', repo: bm[1], name: bm[2] });
          }
        } else if (this.sess_ && this.sess_.q === q) {
          // ── Results mode: a ran session search for THIS query replaces the
          // lanes until the query changes or the clear row dismisses it.
          // Editing a character falls back; retyping the query returns the
          // cached hits, which is why the clear row exists.
          const slot = this.sess_;
          if (slot.loading) {
            out.push({ key: 'sess:load', icon: 'ph-circle-notch', kind: 'noop', spin: true,
                       label: 'Searching sessions…' });
          } else if (slot.error) {
            // The full error rides the fragment line, where there is room: a
            // truncated error is the one row that cannot be allowed to clip.
            out.push({ key: 'sess:err', icon: 'ph-warning', kind: 'clear',
                       label: 'Session search failed', sub: 'clear', note: slot.error });
          } else {
            out.push({ key: 'sess:head', icon: 'ph-x-circle', kind: 'clear',
                       label: slot.hits.length + ' session ' + (slot.hits.length === 1 ? 'hit' : 'hits'),
                       sub: 'clear' });
            out.push(...slot.hits.map(h => ({
              key: 's:' + h.id, icon: 'ph-chat-circle-text',
              label: h.ask ? String(h.ask).replace(/\s+/g, ' ').slice(0, 80) : h.id,
              sub: h.day, note: h.frag,
              kind: 'session', id: h.id, day: h.day,
            })));
          }
        } else {
          // ── Plain text: repos, views, file names, then PR titles ────────
          const pre = (s) => (s.toLowerCase().startsWith(ql) ? 0 : 1);
          const repos = (S.estateRepos || [])
            .filter(r => r.repo.toLowerCase().includes(ql))
            .sort((a, b) => pre(short(a.repo)) - pre(short(b.repo)));
          out.push(...repos.slice(0, 4).map(r => ({
            key: 'r:' + r.repo, icon: r.icon || 'ph-folder', mono: true,
            label: short(r.repo), sub: 'repo', kind: 'repo', repo: r.repo,
          })));
          const views = [...(S.estateNav || []), ...(S.appNav || [])]
            .filter(v => (v.label || '').toLowerCase().includes(ql));
          out.push(...views.slice(0, 4).map(v => ({
            key: 'v:' + (v.key || v.view) + ':' + v.label, icon: v.icon || 'ph-square',
            label: v.label, sub: 'view', kind: 'view', go: v.go,
          })));
          // File names, from every tree in the cache: the open repo's arrives
          // on first use (onInput), the rest after the "search every repo" tap.
          if (ql.length >= 2) {
            const files = [];
            for (const [repo, t] of Object.entries(this.trees_)) {
              for (const p of t.paths) if (p.toLowerCase().includes(ql)) files.push({ repo, path: p });
            }
            const ranked = files.sort((a, b) =>
                 (a.repo === openRepo ? 0 : 1) - (b.repo === openRepo ? 0 : 1)
              || pre(a.path.split('/').pop()) - pre(b.path.split('/').pop()));
            out.push(...ranked.slice(0, CAP).map(f => fileRow(f.repo, f.path)));
            if (S.hasToken?.() && this.treesMissing) {
              out.push({ key: 'deep', icon: this.deepLoading ? 'ph-circle-notch' : 'ph-binoculars',
                         kind: this.deepLoading ? 'noop' : 'deep', spin: this.deepLoading,
                         label: this.deepLoading ? 'Loading estate trees…' : 'File names, every repo' });
            }
          }
          // The two deeper passes, each behind a tap: file CONTENTS through
          // the code-search API, and the captured SESSION records greped
          // client-side. Three characters before either offers, since a
          // shorter needle matches everything. NO gate repeats the query: it
          // is sitting in the input directly above, and on a phone the
          // repetition truncated every label to the same word (measured: four
          // rows all reading "Search…", indistinguishable). The label leads
          // with what is DIFFERENT about each pass.
          if (S.hasToken?.() && ql.length >= 3) {
            out.push({ key: 'code-gate', icon: 'ph-file-magnifying-glass', kind: 'code-gate',
                       label: 'File contents', sub: 'Search →' });
            out.push({ key: 'sess-gate', icon: 'ph-chat-circle-text', kind: 'sess-gate',
                       label: 'Sessions', sub: 'captured records' });
          }
          const prs = this.prRows.filter(p => p.title.toLowerCase().includes(ql));
          out.push(...homeFirst(prs, p => p.repo).slice(0, 3).map(prRow));
        }

        // ── The floor: nothing typed here is lost ─────────────────────────
        // Plain text and #digits only: a walk in progress or a pasted address
        // is never an idea, so offering to jot it mid-walk is noise. Like the
        // gates, it does not repeat the query.
        if (S.hasToken?.() && !q.startsWith('@') && !/[@:]/.test(q)) {
          out.push({ key: 'jot', icon: 'ph-note-pencil',
                     label: 'Jot this', sub: 'to the pile', kind: 'jot', text: q });
        }
        return out;
      },

      act(r) {
        const S = window.__shell;
        if (r.kind === 'noop') return;
        // Completion rows rewrite the input and keep the walk going; every
        // other kind acts and clears.
        if (r.kind === 'complete') {
          this.q = r.to;
          this.active = 0;
          this.$refs.box?.focus();
          const w = this.parseWalk(r.to);
          if (w?.repo) this.ensureTree(w.repo);
          return;
        }
        if (r.kind === 'deep') { this.loadAllTrees(); this.$refs.box?.focus(); return; }
        if (r.kind === 'sess-gate') { this.searchSessions(this.q.trim()); this.$refs.box?.focus(); return; }
        if (r.kind === 'clear') { this.sess_ = null; this.$refs.box?.focus(); return; }
        if (r.kind === 'code-gate') {
          const q = this.q.trim();
          this.q = ''; this.open = false;
          S?.goSearch?.({ q, mode: 'contents' });
          return;
        }
        this.q = '';
        this.open = false;
        if (r.kind === 'repo') S?.openPinned?.(r.repo);
        else if (r.kind === 'view') r.go?.();
        else if (r.kind === 'branch') {
          document.dispatchEvent(new CustomEvent('web-tools:open-branch-detail',
            { detail: { repo: r.repo, name: r.name } }));
        }
        else if (r.kind === 'session') {
          document.dispatchEvent(new CustomEvent('web-tools:open-session',
            { detail: { id: r.id, day: r.day } }));
        }
        else if (r.kind === 'file') this.openAddr({ repo: r.repo, ref: '', path: r.path });
        else if (r.kind === 'addr') this.openAddr(r.addr);
        else if (r.kind === 'jot') this.jotThis(r.text);
      },

      // A file opens where the app reads files: browse the repo at the
      // address's ref (unspecified falls through to the default branch,
      // RepoAddress's rule) and open the path.
      async openAddr(addr) {
        const S = window.__shell;
        if (!S) return;
        await S.ensureBrowser?.(addr.repo, addr.ref || undefined);
        S.openFile?.(addr.path);
      },

      // Append to the pile. Reads the file fresh rather than trusting a copy,
      // since the Lists pane is a second writer; same shape and commit-message
      // idiom as the estate's addJot.
      async jotThis(text) {
        const S = window.__shell;
        if (!text || !S?.hasToken?.()) return;
        const toast = window.Alpine?.store?.('toast');
        try {
          const reg = new window.GH({ token: window.TOKEN, repo: S.REGISTRY_REPO, ref: 'main' });
          if (typeof reg.save !== 'function' && window.gh?.load) await window.gh.load('gh-store.js');
          let items = [];
          try {
            const raw = JSON.parse((await reg.get(JOTS_PATH)).text);
            items = Array.isArray(raw.items) ? raw.items : [];
          } catch {}
          items.push({ id: 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                       text, created_at: new Date().toISOString() });
          const clip = text.length > 40 ? text.slice(0, 40) + '…' : text;
          await reg.save(JOTS_PATH, { items }, 'Jot "' + clip + '" via show-repo');
          toast?.('note-pencil', 'Jotted', 'alert-success', 2200);
        } catch (e) {
          toast?.('warning', 'Jot failed: ' + (e?.message || e), 'alert-error', 5600);
        }
      },
    };
  });
});
