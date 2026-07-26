// alpineComponents/branch-brief.js — the branch page's view.
//
// Renders what kits/branch-brief.js assembles: a derived layer that reloads
// from the API every visit, and an optional authored layer laid over it. The
// model does the thinking; this file is markup and three pieces of formatting.
//
// Mounted by pages/branch.html. The per-file diff cards are fileReview
// (alpineComponents/file-review.js), the same dossier pages/review.html uses,
// so a file reads identically in both places.
// Registration is defensive rather than a bare `alpine:init` listener: this
// component arrives at the end of a gh.load chain, which can finish after
// Alpine has already started, and a missed event leaves the page rendering
// "branchBrief is not defined". Same idiom lib/alpine-bundle.js uses for the
// same race.
(function () {
  const register = function () {
  Alpine.data('branchBrief', function (opts) {
    const o = opts || {};

    const fmtDate = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      return isNaN(d) ? '' : d.toISOString().slice(0, 10);
    };
    const days = (a, b) => {
      if (!a || !b) return null;
      const n = Math.round((new Date(b) - new Date(a)) / 86400000);
      return isNaN(n) ? null : n;
    };

    return {
      description: 'One branch as a page: derived state from the API, plus an optional authored layer',

      repo: o.repo || '', branch: o.branch || '', base: o.base || '',
      brief: null, loading: true, error: '', showFiles: false,

      template: `
        <div class="max-w-4xl mx-auto p-4 flex flex-col gap-4">

          <div x-show="loading" class="flex justify-center py-16">
            <span class="loading loading-spinner loading-lg text-primary"></span>
          </div>
          <div x-show="error" class="alert alert-warning" x-text="error"></div>

          <template x-if="brief && !loading">
            <div class="flex flex-col gap-4">

              <!-- Identity. The state chip is the one thing to read first: a
                   branch that is landed or on an unrelated line cannot be in
                   flight, whatever its name or date suggests. -->
              <div class="flex flex-col gap-2">
                <div class="flex items-baseline gap-2 flex-wrap">
                  <span class="badge" :class="stateClass" x-text="brief.state"></span>
                  <span class="font-mono text-lg font-medium break-all" x-text="brief.branch"></span>
                </div>
                <div class="text-sm opacity-70 font-mono flex items-center gap-2 flex-wrap">
                  <span x-text="brief.repo"></span>
                  <span>vs</span>
                  <span x-text="brief.base"></span>
                </div>
              </div>

              <!-- The derived facts, each one free from the compare. -->
              <div class="stats stats-vertical sm:stats-horizontal shadow-sm border border-base-300 bg-base-100">
                <div class="stat py-3 px-4">
                  <div class="stat-title text-xs">Ahead / behind</div>
                  <div class="stat-value text-xl font-mono">
                    <span class="text-success" x-text="brief.ahead ?? '?'"></span>
                    <span class="opacity-40 text-base">/</span>
                    <span class="text-warning" x-text="brief.behind ?? '?'"></span>
                  </div>
                </div>
                <div class="stat py-3 px-4">
                  <div class="stat-title text-xs">Lifespan</div>
                  <div class="stat-value text-xl font-mono" x-text="lifespan"></div>
                  <div class="stat-desc text-xs" x-text="lifespanRange"></div>
                </div>
                <div class="stat py-3 px-4">
                  <div class="stat-title text-xs">Files</div>
                  <div class="stat-value text-xl font-mono" x-text="brief.files.length"></div>
                  <div class="stat-desc text-xs" x-show="!brief.complete">of a capped list</div>
                </div>
              </div>

              <!-- Where to go: the PR, the sessions that wrote it, GitHub. The
                   session mark is the route back to the conversation that
                   produced the branch, read from the commit trailer. -->
              <div class="flex flex-wrap items-center gap-2">
                <a x-show="brief.pr" :href="prUrl" target="_blank" class="btn btn-sm gap-1"
                   :class="brief.pr && brief.pr.draft ? 'btn-outline' : 'btn-primary'">
                  <i class="ph ph-git-pull-request"></i>
                  <span x-text="brief.pr ? ('#' + brief.pr.number + (brief.pr.draft ? ' draft' : '')) : ''"></span>
                </a>
                <template x-for="(s, i) in brief.sessions" :key="s">
                  <a :href="s" target="_blank" class="btn btn-sm btn-ghost gap-1"
                     :title="brief.sessionsExact ? 'The session that authored this branch'
                                                 : 'Approximate: read from the branch tip'">
                    <svg viewBox="0 0 24 24" class="w-4 h-4 shrink-0" style="stroke:#d97757" stroke-width="2.2"
                         stroke-linecap="round" fill="none" aria-hidden="true"><path d="M12,12 L12.0,1.6 M12,12 L17.62,3.25 M12,12 L21.46,7.68 M12,12 L22.29,13.48 M12,12 L19.86,18.81 M12,12 L14.93,21.98 M12,12 L9.07,21.98 M12,12 L4.14,18.81 M12,12 L1.71,13.48 M12,12 L2.54,7.68 M12,12 L6.38,3.25"/></svg>
                    <span x-text="brief.sessions.length > 1 ? ('session ' + (i + 1)) : 'session'"></span>
                  </a>
                </template>
                <a :href="treeUrl" target="_blank" class="btn btn-sm btn-ghost gap-1">
                  <i class="ph ph-git-branch"></i>tree</a>
                <a :href="compareUrl" target="_blank" class="btn btn-sm btn-ghost gap-1">
                  <i class="ph ph-git-diff"></i>compare</a>
              </div>

              <!-- The authored layer. Absent for most branches, and the page is
                   complete without it: it adds judgment the API cannot know. -->
              <template x-if="brief.authored">
                <div class="card border border-base-300 bg-base-100">
                  <div class="card-body p-4 gap-3">
                    <div x-show="brief.authored.intent" class="prose prose-sm max-w-none">
                      <p class="whitespace-pre-line m-0" x-text="brief.authored.intent"></p>
                    </div>
                    <div x-show="brief.authored.open.length">
                      <div class="text-xs uppercase tracking-wide opacity-60 mb-1">Open</div>
                      <ul class="list-disc list-inside text-sm flex flex-col gap-0.5">
                        <template x-for="t in brief.authored.open" :key="t"><li x-text="t"></li></template>
                      </ul>
                    </div>
                    <div x-show="brief.authored.omitted.length">
                      <div class="text-xs uppercase tracking-wide opacity-60 mb-1">Left out</div>
                      <ul class="list-disc list-inside text-sm opacity-70 flex flex-col gap-0.5">
                        <template x-for="t in brief.authored.omitted" :key="t"><li x-text="t"></li></template>
                      </ul>
                    </div>
                    <div x-show="brief.authored.notes" class="text-sm opacity-80 whitespace-pre-line"
                         x-text="brief.authored.notes"></div>
                  </div>
                </div>
              </template>

              <!-- Commits, newest first. -->
              <div x-show="brief.commits.length" class="flex flex-col gap-1">
                <div class="text-xs uppercase tracking-wide opacity-60">
                  <span x-text="plural(brief.commitCount, 'commit')"></span>
                </div>
                <template x-for="c in brief.commits.slice(0, 12)" :key="c.sha">
                  <div class="flex items-baseline gap-2 text-sm border-b border-base-200 py-1">
                    <a :href="'https://github.com/' + brief.repo + '/commit/' + c.sha" target="_blank"
                       class="font-mono text-xs opacity-50 hover:text-primary shrink-0"
                       x-text="c.sha.slice(0, 7)"></a>
                    <span class="truncate" x-text="c.subject"></span>
                  </div>
                </template>
              </div>

              <!-- The diff, the same per-file dossier the review page renders.
                   Collapsed by default: each card fetches its own content when
                   opened, so an unopened file costs nothing. -->
              <div x-show="brief.files.length" class="flex flex-col gap-2">
                <button @click="showFiles = !showFiles"
                        class="flex items-center gap-2 text-xs uppercase tracking-wide opacity-60 hover:opacity-100">
                  <i class="ph" :class="showFiles ? 'ph-caret-down' : 'ph-caret-right'"></i>
                  <span x-text="plural(brief.files.length, 'changed file')"></span>
                </button>
                <div x-show="showFiles" class="flex flex-col gap-2">
                  <template x-for="f in brief.files" :key="f.path">
                    <div>
                      <div x-show="fileNote(f.path)" class="text-xs opacity-70 pl-6 pb-1" x-text="fileNote(f.path)"></div>
                      <div x-data="fileReview(cardOpts(f))"></div>
                    </div>
                  </template>
                </div>
              </div>

            </div>
          </template>
        </div>
      `,

      init() {
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        this.load();
      },

      async load() {
        this.loading = true; this.error = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.repo, ref: this.branch });
          const { compare, pull } = await window.BranchBrief.fetchBrief(gh, {
            repo: this.repo, branch: this.branch, base: this.base,
          });
          this.brief = window.BranchBrief.assemble({
            repo: this.repo, branch: this.branch, base: this.base,
            compare, pull, authored: o.authored || null,
          });
        } catch (e) {
          this.error = 'Could not read ' + this.repo + '@' + this.branch + ': ' + (e?.message || e);
        } finally { this.loading = false; }
      },

      get stateClass() {
        return { live: 'badge-success', landed: 'badge-ghost', unrelated: 'badge-warning' }[this.brief?.state]
               || 'badge-ghost';
      },
      get lifespan() {
        const n = days(this.brief?.firstDate, this.brief?.lastDate);
        return n === null ? '?' : (n === 0 ? 'same day' : n + 'd');
      },
      get lifespanRange() {
        const a = fmtDate(this.brief?.firstDate), b = fmtDate(this.brief?.lastDate);
        return a && b ? (a === b ? a : a + ' to ' + b) : '';
      },
      get prUrl() { return 'https://github.com/' + this.repo + '/pull/' + (this.brief?.pr?.number || ''); },
      get treeUrl() { return 'https://github.com/' + this.repo + '/tree/' + this.branch; },
      get compareUrl() {
        return 'https://github.com/' + this.repo + '/compare/' + this.base + '...' + this.branch;
      },

      // One binding for count-plus-noun. A trailing <span>s</span> renders a
      // space before the plural ("3 changed file s").
      plural(n, noun) { return n + ' ' + noun + (n === 1 ? '' : 's'); },
      fileNote(path) { return this.brief?.authored?.files?.[path] || ''; },
      cardOpts(f) {
        return { repo: this.repo, ref: this.branch, baseName: this.base, path: f.path,
                 prevPath: f.previousPath, status: f.status,
                 additions: f.additions, deletions: f.deletions, patch: f.patch, open: false };
      },
    };
  });
  };
  if (window.Alpine?.directive) register();
  else document.addEventListener('alpine:init', register);
})();
