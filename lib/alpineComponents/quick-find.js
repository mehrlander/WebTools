// alpineComponents/quick-find.js — the sidebar's always-ready finder.
//
// One input at the top of the sidebar, sitting ready on desktop and one drawer
// tap away on a phone. It is a DISPATCHER over what the app already holds, not
// a search engine: every lane resolves from client-side state or one cached
// read, and nothing is indexed or committed anywhere. The query's shape picks
// the lane:
//
//   #123 or 123          an open PR, estate-wide (the activity cache's openPRs);
//                        `#` alone lists them all. Opens the branch-detail
//                        takeover, the same reader an Open row's name opens.
//   repo@branch          a branch by address; the repo half accepts the short
//   @branch              name when exactly one estate repo matches, and a bare
//                        @ searches branch names across the estate, the open
//                        repo's first.
//   owner/repo[@ref]:path  the estate's one address grammar (RepoAddress), so
//                        anything that addresses a file elsewhere pastes here
//                        and opens. Short-repo expansion applies before the
//                        colon too.
//   anything else        substring match over estate repos, the app's nav
//                        (estateNav + appNav), branch names, and PR titles.
//
// The last row is always "Jot this" (token-gated): a query that found nothing
// is usually an idea, and the pile (lists/jots.json in the registry) is where
// an idea waits. That makes the box's contract total: what you type is either
// found or kept.
//
// PR and branch rows resolve through the activity cache (state/activity.json,
// lib/repo-activity-cache.js), read lazily ONCE on first focus and re-read on
// web-tools:activity-refreshed. No fanout: this is the same single-file read
// the estate's Open list renders from. Opening a hit dispatches
// web-tools:open-branch-detail, which the estate consumes exactly like a
// &detail= deep link: switch to the Open list, open the takeover, tolerate a
// row the cache does not carry (a list of one).
//
// `/` focuses the input from anywhere a hardware keyboard is typing that is
// not already a field. Results are a flat keyboard list (down/up/enter,
// escape clears then closes) because groups would make arrow travel a
// two-level affair for a panel that rarely exceeds a dozen rows.
//
// Reads the shell through window.__shell (raw, untracked — fine here, since
// every render is driven by the local `q` and `act`, both reactive) and mounts
// by the crumb-bar idiom: template injected in init, then Alpine.initTree.

document.addEventListener('alpine:init', function () {
  Alpine.data('quickFind', function () {
    const JOTS_PATH = 'lists/jots.json';
    const CAP = 8;                    // rows per lane, so the panel stays a panel
    const short = (repo) => String(repo || '').split('/')[1] || repo;

    return {
      description: 'Sidebar finder: #PR, @branch, owner/repo[@ref]:path addresses, repos, views, with a Jot-this fallback',

      template: `
        <div class="relative" @click.outside="open = false">
          <div class="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-base-300 bg-base-200/50 focus-within:border-primary/50 focus-within:bg-base-100 transition-colors">
            <i class="ph ph-magnifying-glass text-base leading-none text-base-content/40 shrink-0"></i>
            <input x-ref="box" x-model="q" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
                   placeholder="Find: repo, view, #PR, @branch"
                   aria-label="Find" role="combobox" :aria-expanded="open" aria-controls="quick-find-results"
                   class="grow min-w-0 bg-transparent outline-none text-base placeholder:text-base-content/35"
                   @focus="onFocus()" @input="onInput()"
                   @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)"
                   @keydown.enter.prevent="go()" @keydown.escape="onEscape($event)">
            <kbd x-show="!q" class="kbd kbd-xs hidden lg:inline-flex opacity-50">/</kbd>
            <button type="button" x-show="q" @click="q = ''; $refs.box.focus()" tabindex="-1"
                    class="shrink-0 text-base-content/35 hover:text-base-content/70 transition-colors" title="Clear">
              <i class="ph ph-x text-sm leading-none"></i>
            </button>
          </div>
          <section x-cloak x-show="open && rows.length" x-transition.opacity.duration.120ms
                   id="quick-find-results" role="listbox"
                   class="absolute inset-x-0 top-full z-40 mt-1 max-h-[60vh] overflow-y-auto rounded-box border border-base-300 bg-base-100 shadow-xl">
            <div class="flex flex-col py-1">
              <template x-for="(r, i) in rows" :key="r.key">
                <button type="button" role="option" :aria-selected="active === i"
                        @click="act(r)" @mouseenter="active = i"
                        class="w-full min-h-10 flex items-center gap-2.5 px-3 text-left text-base transition-colors"
                        :class="active === i ? 'bg-base-200' : ''">
                  <i class="ph shrink-0 text-lg text-base-content/50" :class="r.icon"></i>
                  <span class="min-w-0 flex-1 truncate" :class="r.mono && 'font-mono'" x-text="r.label"></span>
                  <span x-show="r.sub" class="shrink-0 max-w-[45%] truncate text-sm text-base-content/40" x-text="r.sub"></span>
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

      init() {
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        this.$watch('q', () => { this.active = 0; this.open = !!this.q.trim(); });
        // The crawl commits a fresh cache and announces it; re-read so PR and
        // branch rows track the estate rather than the first read of the day.
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
      onInput() { this.ensureActivity(); },
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
      // repo/view lanes and simply has no PR or branch rows to match.
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

      // Flat projections of the cache, shaped for matching. A PR row knows its
      // head so a hit can open as a branch; a branch row knows its PR so the
      // sub-label can say so.
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
      get branchRows() {
        const out = [];
        for (const [repo, e] of Object.entries(this.act_)) {
          const def = e.defaultBranch || 'main';
          const prByHead = new Map((e.openPRs || []).filter(p => p.head).map(p => [p.head, p]));
          const seen = new Set();
          for (const b of (e.survey?.branches || [])) {
            if (b.name === def) continue;
            seen.add(b.name);
            out.push({ repo, name: b.name, pr: prByHead.get(b.name) || null });
          }
          for (const p of (e.openPRs || [])) {
            if (p.head && p.head !== def && !seen.has(p.head)) out.push({ repo, name: p.head, pr: p });
          }
        }
        return out;
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
        const brRow = (b) => ({
          key: 'b:' + b.repo + '@' + b.name, icon: 'ph-git-branch', mono: true,
          label: short(b.repo) + '@' + b.name, sub: b.pr ? '#' + b.pr.number : 'branch',
          kind: 'branch', repo: b.repo, name: b.name,
        });
        // Open-repo hits first; within a rank, the caller's order stands.
        const homeFirst = (list, repoOf) =>
          [...list].sort((a, b) => (repoOf(a) === openRepo ? 0 : 1) - (repoOf(b) === openRepo ? 0 : 1));

        // ── #123 / 123: a PR number, estate-wide ──────────────────────────
        const dm = q.match(/^#(\d*)$|^(\d+)$/);
        if (dm) {
          const digits = dm[1] ?? dm[2] ?? '';
          const hits = this.prRows.filter(p => String(p.number).startsWith(digits));
          out.push(...homeFirst(hits, p => p.repo).slice(0, CAP).map(prRow));
        } else if (/[@:]/.test(q)) {
          // ── The address grammar ─────────────────────────────────────────
          // Expand a short repo head ("home@x", "wt:lib/…") to owner/name when
          // exactly one estate repo matches; a full owner/repo passes through.
          const em = q.match(/^([\w.-]+)([@:].*)$/);
          const expandable = em && !q.startsWith('@') && !/^[\w.-]+\/[\w.-]+[@:]/.test(q);
          let eq = q;
          if (expandable) {
            const m = (S.estateRepos || []).filter(r => short(r.repo).toLowerCase() === em[1].toLowerCase());
            if (m.length === 1) eq = m[0].repo + em[2];
          }
          const addr = window.RepoAddress?.parse(eq);
          if (addr) {
            out.push({ key: 'a:' + eq, icon: 'ph-file-code', mono: true,
                       label: window.RepoAddress.fmt(addr), sub: 'open file',
                       kind: 'addr', addr });
          } else {
            const bm = eq.match(/^([\w.-]+\/[\w.-]+)@(.*)$/);
            if (bm) {
              // repo@fragment: that repo's branches; a name the cache knows
              // nothing about still opens (a fresh push the crawl has not
              // seen), but only when nothing matched, so the floor is a
              // fallback rather than noise beside real hits.
              const [, repo, frag] = bm;
              const fl = frag.toLowerCase();
              const hits = this.branchRows.filter(b => b.repo === repo && b.name.toLowerCase().includes(fl));
              out.push(...hits.slice(0, CAP).map(brRow));
              if (frag && !hits.length) {
                out.push({ key: 'b!:' + repo + '@' + frag, icon: 'ph-git-branch', mono: true,
                           label: short(repo) + '@' + frag, sub: 'open anyway',
                           kind: 'branch', repo, name: frag });
              }
            } else if (q.startsWith('@')) {
              // @fragment: branch names across the estate, open repo's first.
              const fl = q.slice(1).toLowerCase();
              const hits = this.branchRows.filter(b => b.name.toLowerCase().includes(fl));
              out.push(...homeFirst(hits, b => b.repo).slice(0, CAP).map(brRow));
            }
          }
        } else {
          // ── Plain text: repos, views, then branches and PR titles ───────
          const pre = (s) => (s.toLowerCase().startsWith(ql) ? 0 : 1);
          const repos = (S.estateRepos || [])
            .filter(r => r.repo.toLowerCase().includes(ql))
            .sort((a, b) => pre(short(a.repo)) - pre(short(b.repo)));
          out.push(...repos.slice(0, CAP).map(r => ({
            key: 'r:' + r.repo, icon: r.icon || 'ph-folder', mono: true,
            label: short(r.repo), sub: 'repo', kind: 'repo', repo: r.repo,
          })));
          const views = [...(S.estateNav || []), ...(S.appNav || [])]
            .filter(v => (v.label || '').toLowerCase().includes(ql));
          out.push(...views.slice(0, CAP).map(v => ({
            key: 'v:' + (v.key || v.view) + ':' + v.label, icon: v.icon || 'ph-square',
            label: v.label, sub: 'view', kind: 'view', go: v.go,
          })));
          const brs = this.branchRows.filter(b => b.name.toLowerCase().includes(ql));
          out.push(...homeFirst(brs, b => b.repo).slice(0, 5).map(brRow));
          const prs = this.prRows.filter(p => p.title.toLowerCase().includes(ql));
          out.push(...homeFirst(prs, p => p.repo).slice(0, 5).map(prRow));
        }

        // ── The floor: nothing typed here is lost ─────────────────────────
        if (S.hasToken?.()) {
          out.push({ key: 'jot', icon: 'ph-note-pencil',
                     label: 'Jot this: "' + q + '"', sub: 'save to the pile', kind: 'jot', text: q });
        }
        return out;
      },

      act(r) {
        const S = window.__shell;
        this.q = '';
        this.open = false;
        if (r.kind === 'repo') S?.openPinned?.(r.repo);
        else if (r.kind === 'view') r.go?.();
        else if (r.kind === 'branch') {
          document.dispatchEvent(new CustomEvent('web-tools:open-branch-detail',
            { detail: { repo: r.repo, name: r.name } }));
        }
        else if (r.kind === 'addr') this.openAddr(r.addr);
        else if (r.kind === 'jot') this.jotThis(r.text);
      },

      // A full address opens the file where the app reads files: browse the
      // repo at the address's ref (unspecified falls through to the default
      // branch, RepoAddress's rule) and open the path.
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
