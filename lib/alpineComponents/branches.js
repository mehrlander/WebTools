document.addEventListener('alpine:init', function() {
  Alpine.data('branches', function() {
    // The branch-review view: every branch of the open repo, split across three
    // tabs on the content-level landed/stranded signal (the browser port of
    // home's tools/branch-survey.sh). Advisory and read-only: it frames the
    // per-branch reconcile judgment (delete / rescue / leave) and decides
    // nothing; every row keeps one-tap routes to GitHub's tree and compare
    // views, and the header links GitHub's branches UI, where the delete
    // action itself lives.
    //
    // COST DISCIPLINE (the reason for the tabs). A big repo has hundreds of
    // branches, and the content survey costs ~2 calls per branch (a compare and
    // a tree), so surveying every branch on every visit is a flood. Three levers
    // keep the default cheap:
    //   1. The Recent tab is date-only. Recently-active branches are 'active'
    //      regardless of content, so they never need a survey; they come
    //      straight from the branch list (one call) and are the default tab.
    //   2. Only OLDER branches (the landed/stranded candidates) are surveyed,
    //      and only SURVEY_CAP of them (most-recent-first) by default. "Survey
    //      all" lifts the cap for the full reconcile pass.
    //   3. Cache-first: with a token, the Landed/Stranded tabs render from the
    //      private activity cache (state/activity.json), the throttled crawl's
    //      stored survey, instead of any live fanout. The per-visit survey runs
    //      only when there is no cache coverage, or on an explicit live Refresh.
    //      Same shared math either way (lib/kits/branch-survey.js surveyBranchLive).
    //
    // The signal, per older branch: which of its uniquely-touched paths hold, at
    // the branch tip, bytes that exist on the default branch right now (same
    // path or moved anywhere). Squashes and history rewrites make ref-level
    // "unmerged" unreliable, so DO NOT key on ahead_by. The math lives in
    // lib/kits/branch-survey.js (unit-tested, checked against the CLI by
    // scripts/check-branch-survey.mjs); this component is the fetch plumbing and
    // the render.
    const TAB_META = {
      active: {
        title: 'Recent', icon: 'ph-pulse',
        note: 'Commits in the last 14 days. Date-only, not surveyed: judge nothing yet.',
      },
      landed: {
        title: 'Landed', icon: 'ph-check-circle',
        note: 'Older branches whose content is on the default branch (nothing missing, or 80%+ of touched paths match byte-for-byte). Squashes hide ref-level merges; these are likely history.',
      },
      stranded: {
        title: 'Stranded', icon: 'ph-warning-circle',
        note: 'Older branches holding content that exists nowhere on the default branch. Honest limit: files that landed and then kept evolving still read stranded; the compare link is ground truth.',
      },
    };
    const SURVEY_CAP = 30;   // older branches surveyed by default
    const COMMIT_CAP = 50;   // history reach for orphaned branches, like the CLI
    const POOL = 4;          // concurrent per-branch surveys

    return {
      description: 'Branch-review view: tabbed recent / landed / stranded rollup with a capped content survey, ported from home’s branch-survey.sh',

      template: `
        <div>
          <div class="flex items-center gap-2 mb-3">
            <h1 class="text-2xl font-bold tracking-tight">Branches</h1>
            <a :href="'https://github.com/' + repo + '/branches'" target="_blank"
               class="text-base-content/30 hover:text-base-content/70 transition-colors"
               title="Manage branches on GitHub (delete lives there)">
              <i class="ph ph-github-logo text-lg leading-none"></i>
            </a>
            <span x-show="!loading" class="text-base text-base-content/40 font-mono" x-text="list.length + ' total'"></span>
            <span x-show="surveying" class="flex items-center gap-1.5 text-base text-base-content/40 font-mono">
              <span class="loading loading-spinner loading-md"></span>
              <span x-text="'surveying ' + surveyedCount + '/' + surveyTarget"></span>
            </span>
            <span x-show="fromCache && !surveying" class="text-base text-base-content/40 flex items-center gap-1"
                  :title="'Landed / Stranded rendered from the activity cache' + (cacheAt ? ' (surveyed ' + cacheAt + ')' : '') + '. Refresh re-surveys live.'">
              <i class="ph ph-database"></i>cached
            </span>
            <div class="grow"></div>
            <button @click="reload()" :disabled="surveying || loading" class="btn btn-ghost gap-1"
                    title="Re-survey live (bypass the cache) and re-run the capped survey">
              <i class="ph ph-arrows-clockwise" :class="surveying && 'animate-spin'"></i>Refresh
            </button>
          </div>

          <div x-show="loading" class="flex justify-center py-16">
            <span class="loading loading-dots loading-md opacity-30"></span>
          </div>
          <div x-show="error" class="alert alert-error py-2 px-3 text-base" x-text="error"></div>
          <p x-show="!loading && !error && !list.length" class="text-base-content/40 italic text-base py-8">
            No branches beside the default branch.
          </p>

          <div x-show="!loading && !error && list.length">
            <!-- Tabs: one table at a time. Each carries its own count and a
                 tooltip definition, so no prose sits on the page. -->
            <div role="tablist" class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 w-fit mb-4">
              <template x-for="t in tabList" :key="t.key">
                <button role="tab" @click="activeTab=t.key" :title="t.note"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                        :class="t.key===activeTab ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                  <i class="ph text-lg" :class="t.icon"></i>
                  <span x-text="t.title"></span>
                  <span class="badge badge-ghost badge-sm" x-text="t.count"></span>
                </button>
              </template>
            </div>

            <p x-show="activeTab!=='active' && !surveying && !surveyStarted" class="text-base text-base-content/40 italic py-6">
              Nothing surveyed yet.
            </p>

            <!-- The table is its own bounded scroll region so the header pins
                 within it (a sticky thead needs its scroll container to be the
                 nearest overflow ancestor; the outer shell scroll is too far). -->
            <div x-show="rows.length" class="border border-base-300 rounded-lg bg-base-100 overflow-y-auto max-h-[70vh]">
              <table class="table table-sm table-fixed w-full">
                <thead>
                  <tr class="sticky top-0 z-10 bg-base-100 text-base-content/50 [&>th]:border-b [&>th]:border-base-300">
                    <th>Branch</th>
                    <th x-show="activeTab!=='active'" class="text-right whitespace-nowrap w-24"
                        title="Touched paths present on the default branch / total, then any missing">Content</th>
                    <th class="text-right w-16">Age</th>
                    <th class="text-right w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  <template x-for="r in rows" :key="r.name">
                    <tr class="hover:bg-base-200/40 align-top">
                      <td>
                        <button @click="openBranch(r)" :title="'Browse ' + r.name + ' here'"
                                class="font-mono text-base font-medium hover:text-primary transition-colors cursor-pointer text-left flex items-center gap-1 max-w-full">
                          <span class="truncate" x-text="r.name"></span>
                          <span x-show="r.noBase" class="text-warning shrink-0"
                                title="No shared ancestor with the default branch: content counts span the whole line">*</span>
                        </button>
                        <span class="text-base text-base-content/50 truncate block" :title="r.subject" x-text="r.subject"></span>
                      </td>
                      <td x-show="activeTab!=='active'" class="text-right whitespace-nowrap font-mono text-base align-middle">
                        <span x-show="r.state==='pending'" class="loading loading-dots loading-md opacity-30"></span>
                        <span x-show="r.state==='error'" class="text-error" :title="r.err">failed</span>
                        <template x-if="r.state==='done'">
                          <span>
                            <span :class="r.nMissing ? 'text-base-content/50' : 'text-success'"
                                  :title="r.nLanded + ' of ' + r.nUnique + ' touched paths present on the default branch'"
                                  x-text="r.nLanded + '/' + r.nUnique"></span>
                            <span x-show="r.nMissing" class="text-warning font-semibold block leading-tight"
                                  :title="r.missingPaths.slice(0, 12).join('\\n')"><span x-text="r.nMissing"></span> missing</span>
                          </span>
                        </template>
                      </td>
                      <!-- The branch's LIFESPAN where the survey knows it, in
                           the Open view's form ("5d → 2h") and with its
                           collapse rules (BranchSurvey.lifespanStart): the
                           start drops when unknowable or when it rounds to the
                           tip's label. Recent rows are date-only and never
                           surveyed, so they show the tip age alone, as before. -->
                      <td class="text-right whitespace-nowrap text-base text-base-content/40 align-middle tabular-nums"
                          :title="spanTitle(r)">
                        <template x-if="spanStart(r)">
                          <span class="inline-flex items-center gap-1 text-base-content/35">
                            <span x-text="spanStart(r)"></span>
                            <i class="ph ph-arrow-right text-xs opacity-70"></i>
                          </span>
                        </template>
                        <span x-text="r.date ? agoShort(r.date) : r.ago"></span>
                      </td>
                      <td class="text-right whitespace-nowrap align-middle">
                        <div class="flex items-center gap-1.5 text-base justify-end">
                          <button @click="openCompare(r)" class="text-base-content/30 hover:text-primary transition-colors"
                                  :title="'Compare ' + defaultRef + '...' + r.name + ' here'">
                            <i class="ph ph-git-pull-request"></i></button>
                          <a :href="'https://github.com/' + repo + '/tree/' + encodeURIComponent(r.name)" target="_blank"
                             class="text-base-content/30 hover:text-base-content/70 transition-colors" title="Branch tree on GitHub">
                            <i class="ph ph-github-logo"></i></a>
                          <a :href="'https://github.com/' + repo + '/compare/' + encodeURIComponent(defaultRef) + '...' + encodeURIComponent(r.name)"
                             target="_blank" class="text-base-content/30 hover:text-primary transition-colors"
                             title="Compare on GitHub (ground truth)">
                            <i class="ph ph-arrow-square-out"></i></a>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>

            <!-- Cap notice: how many older branches remain unsurveyed, and the
                 opt-in to the full pass. Only on the surveyed tabs. -->
            <div x-show="activeTab!=='active' && unsurveyed > 0" class="flex items-center gap-2 mt-3 px-1 text-base text-base-content/50">
              <span x-text="'Surveyed ' + surveyedCount + ' of ' + older.length + ' older branches.'"></span>
              <button @click="surveyAll()" :disabled="surveying" class="btn btn-ghost gap-1 text-primary">
                <i class="ph ph-magnifying-glass"></i>Survey all
              </button>
            </div>

            <p x-show="treeTruncated" class="text-base text-warning flex items-center gap-1.5 mt-3 px-1">
              <i class="ph ph-warning"></i>
              Default-branch tree truncated by the API; counts may undercount.
            </p>
          </div>
        </div>`,

      loading: true,
      surveying: false,
      surveyStarted: false,
      error: '',
      activeTab: 'active',
      list: [],           // every non-default branch: {name, date, ago, sha, subject, daysAgo}
      recent: [],         // list where daysAgo <= RECENT_DAYS (date-only, never surveyed)
      older: [],          // survey candidates: {...branch, state, noBase, nUnique, nLanded, nMissing, missingPaths, group, err}
      surveyCap: SURVEY_CAP,
      treeTruncated: false,
      fromCache: false,   // older tabs came from the activity cache, not a live survey
      cacheAt: '',        // when that cached survey was taken
      _forceLive: false,  // the header Refresh bypasses the cache for a live re-survey
      _main: null,        // cached default-branch treeSets
      _runKey: '',

      init(){
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        this.load();
        // A ref switch doesn't re-key (the survey always reads against the
        // default branch); a repo switch reloads.
        this.$watch(() => Alpine.store('browser').repo, () => this.load());
      },

      get gh(){ return Alpine.store('browser').gh; },
      get repo(){ return Alpine.store('browser').repo; },
      get defaultRef(){ return Alpine.store('browser').defaultRef || 'main'; },

      // ── Tab plumbing ─────────────────────────────────────────────────────────
      get rows(){
        if (this.activeTab === 'active') return this.recent;
        return this.older
          .filter(r => r.group === this.activeTab)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      },
      get tabList(){
        return ['active', 'landed', 'stranded'].map(key => ({
          key, ...TAB_META[key],
          icon: TAB_META[key].icon + (key === this.activeTab ? ' text-primary' : ''),
          count: key === 'active' ? this.recent.length : this.older.filter(r => r.group === key).length,
        }));
      },
      get surveyedCount(){ return this.older.filter(r => r.state === 'done' || r.state === 'error').length; },
      get unsurveyed(){ return this.older.filter(r => r.state === 'idle').length; },
      // The count the current survey pass is driving toward (for the header).
      get surveyTarget(){ return Math.min(this.surveyCap, this.older.length); },

      // The header Refresh forces a live re-survey (bypassing the cache), the
      // one place the per-visit fanout is intended.
      async reload(){ this.surveyCap = SURVEY_CAP; this._forceLive = true; await this.load(); },

      async load(){
        const gh = this.gh, repo = this.repo;
        if (!gh || !repo) return;
        const key = repo + '#' + (this._runSeq = (this._runSeq || 0) + 1);
        this._runKey = key;
        this.loading = true; this.error = ''; this.list = []; this.recent = []; this.older = [];
        this.treeTruncated = false; this.surveyStarted = false; this._main = null;
        this.fromCache = false; this.cacheAt = '';
        try {
          const B = window.BranchSurvey;
          if (!B) throw new Error('kits/branch-survey.js not loaded');

          // Branch list: GraphQL (dates + tips in one call) when a token is
          // present; REST fallback otherwise. This single call is the whole cost
          // of the default Recent tab.
          let list;
          try { list = await gh.branchesDated(); }
          catch { list = (await gh.branches()).map(b => ({ name: b.name, date: '', ago: '', sha: b.commit?.sha || '', subject: '' })); }
          if (this._runKey !== key) return;

          const def = this.defaultRef, now = Date.now();
          this.list = list.filter(b => b.name !== def).map(b => ({
            ...b, daysAgo: b.date ? B.daysAgo(b.date, now) : Infinity,
          }));
          this.recent = this.list
            .filter(b => b.daysAgo <= B.RECENT_DAYS)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          this.older = this.list
            .filter(b => b.daysAgo > B.RECENT_DAYS)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
            .map(b => ({ ...b, state: 'idle', noBase: false, nUnique: 0, nLanded: 0, nMissing: 0, missingPaths: [], group: null, err: '' }));
          this.loading = false;

          // Cache-first: with a token, render the Landed/Stranded tabs from the
          // private activity cache (state/activity.json) instead of a live
          // fanout. Only a live Refresh (or no cache coverage) falls through to
          // the capped survey. The Recent tab is date-only and always live.
          if (this.older.length){
            const usedCache = (window.TOKEN && !this._forceLive) ? await this.applyCachedSurvey(key) : false;
            this._forceLive = false;
            if (this._runKey !== key) return;
            if (!usedCache) this.runSurvey(key, B);
          }
        } catch (e) {
          if (this._runKey === key) { this.error = 'Branch load failed: ' + (e?.message || e); this.loading = false; }
        }
      },

      // Survey the idle older branches up to surveyCap, most-recent-first,
      // through a small pool. Fetches the default-branch tree once and caches it.
      async runSurvey(key, B){
        B = B || window.BranchSurvey;
        this.surveyStarted = true;
        this.surveying = true;
        try {
          if (!this._main){
            const { sets, truncated } = await B.defaultTree(this.gh, this.defaultRef);
            if (this._runKey !== key) return;
            this.treeTruncated = truncated;
            this._main = sets;
          }
          const queue = this.older.filter(r => r.state === 'idle').slice(0, this.surveyCap - this.surveyedCount);
          queue.forEach(r => { r.state = 'pending'; });
          let i = 0;
          const next = async () => {
            while (i < queue.length){
              const r = queue[i++];
              if (this._runKey !== key) return;
              try { await this.surveyBranch(r, this._main, B); }
              catch (e) { r.state = 'error'; r.err = e?.message || String(e); }
            }
          };
          await Promise.all(Array.from({ length: Math.min(POOL, queue.length) }, next));
        } finally {
          if (this._runKey === key) this.surveying = false;
        }
      },

      // Lift the cap and survey the rest of the older branches. A live pass, so
      // it also supersedes any cached rendering.
      async surveyAll(){
        this.surveyCap = this.older.length;
        this.fromCache = false;
        await this.runSurvey(this._runKey);
      },

      // Read this repo's stored survey from the private activity cache
      // (state/activity.json), the crawl's output. Returns null on any miss (no
      // token, no cache, repo not covered), so the caller falls through to a live
      // survey. See lib/kits/repo-activity-cache.js and show-repo's refreshActivityCache.
      async readCachedSurvey(){
        try {
          const A = window.RepoActivityCache;
          const reg = new window.GH({ token: window.TOKEN,
            repo: window.__shell?.REGISTRY_REPO || 'mehrlander/web-tools-private', ref: 'main' });
          const cache = JSON.parse((await reg.get(A?.CACHE_PATH || 'state/activity.json')).text);
          const survey = cache.repos?.[this.repo]?.survey;
          if (!survey?.branches?.length) return null;
          return survey;
        } catch { return null; }
      },

      // Map the cached survey onto the idle older rows by name. Returns true when
      // it covered at least one row (so the caller skips the live fanout), false
      // to fall through. Rows the cache doesn't cover (new branches, or beyond
      // the crawl's cap) stay idle and are named by the "unsurveyed" notice, where
      // Survey all runs them live.
      async applyCachedSurvey(key){
        const survey = await this.readCachedSurvey();
        if (this._runKey !== key) return true;   // superseded; nothing more to do
        if (!survey) return false;
        const byName = new Map(
          survey.branches.filter(b => b.group === 'landed' || b.group === 'stranded').map(b => [b.name, b]));
        let covered = 0;
        for (const r of this.older){
          const c = byName.get(r.name);
          if (!c) continue;
          r.group = c.group; r.noBase = !!c.noBase;
          r.nUnique = c.nUnique || 0; r.nLanded = c.nLanded || 0; r.nMissing = c.nMissing || 0;
          r.missingPaths = c.missingPaths || [];
          // The crawl stores the branch's first-commit date, so the cached
          // render states the lifespan the same as a live survey would.
          r.firstDate = c.firstDate || '';
          if (!r.subject && c.subject) r.subject = c.subject;
          r.state = 'done';
          covered++;
        }
        if (!covered) return false;
        this.fromCache = true;
        this.cacheAt = survey.surveyedAt || '';
        this.treeTruncated = !!survey.truncated;
        return true;
      },

      // One older branch, through the shared orchestrator (lib/kits/branch-survey.js
      // surveyBranchLive): its uniquely-touched paths (compare against the
      // default branch; on a no-merge-base 404 the diff across its newest
      // COMMIT_CAP commits), its tip tree, then the pure signal and its
      // landed/stranded classification. Assigning the plain result onto the
      // reactive row keeps the incremental render; the crawl shares the same call.
      async surveyBranch(r, main, B){
        const res = await B.surveyBranchLive(this.gh, r, main, { defaultRef: this.defaultRef, commitCap: COMMIT_CAP });
        Object.assign(r, res);
        r.state = 'done';
      },

      // Lifespan formatting, the estate Open view's helpers reached through the
      // shared rules in lib/kits/branch-survey.js so the two surfaces cannot drift.
      agoOf(iso){ try { return iso ? (this.__ago ||= new window.GH({})).ago(iso) : ''; } catch { return ''; } },
      agoShort(iso){ return this.agoOf(iso).replace(' ago', '').replace('just now', 'now'); },
      spanStart(r){ return window.BranchSurvey.lifespanStart(r.firstDate, r.date, iso => this.agoShort(iso)); },
      spanTitle(r){ return window.BranchSurvey.lifespanTitle(r.firstDate, r.date, iso => this.agoOf(iso)); },

      // In-shell drill-ins: browse the branch (switch the open ref), or open the
      // ref-compare (mounted below this view by the shell) pre-run on
      // default...branch.
      async openBranch(r){
        if (!window.__shell) return;
        await window.__shell.ensureBrowser(this.repo, r.name);
        window.__shell.goFiles();
      },
      openCompare(r){
        const c = document.getElementById('compare')?.__compare;
        if (c) c.openWith(this.defaultRef, r.name);
      },
    };
  });
});
